export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export interface GitHubFileContent {
  content: string;
  encoding: string;
  sha: string;
  path: string;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/,
    /github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }
  return null;
}

export class GitHubService {
  private cache = new Map<string, { content: string; timestamp: number }>();
  private commitCache = new Map<string, GitHubCommit[]>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private async fetchWithCache<T>(url: string, cacheKey: string): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "sidekick/0.1.0"
        }
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`GitHub API error: ${response.status}`);
      }

      return await response.json() as T;
    } catch (error) {
      console.error(`GitHub fetch error for ${cacheKey}:`, error);
      return null;
    }
  }

  async getCommitsForFile(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    since?: Date,
    until?: Date
  ): Promise<GitHubCommit[]> {
    const cacheKey = `${owner}/${repo}/${path}/${branch}/${since?.toISOString()}/${until?.toISOString()}`;
    
    if (this.commitCache.has(cacheKey)) {
      return this.commitCache.get(cacheKey)!;
    }

    let url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}`;
    if (since) url += `&since=${since.toISOString()}`;
    if (until) url += `&until=${until.toISOString()}`;

    const commits = await this.fetchWithCache<GitHubCommit[]>(url, cacheKey);
    if (commits) {
      this.commitCache.set(cacheKey, commits);
    }
    return commits || [];
  }

  async getFileAtCommit(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    const cacheKey = `file:${owner}/${repo}/${path}@${ref}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.content;
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    const data = await this.fetchWithCache<GitHubFileContent>(url, cacheKey);
    
    if (!data) return null;

    let content: string;
    if (data.encoding === "base64") {
      content = atob(data.content.replace(/\n/g, ""));
    } else {
      content = data.content;
    }

    this.cache.set(cacheKey, { content, timestamp: Date.now() });
    return content;
  }

  async getFileAtBranch(
    owner: string,
    repo: string,
    path: string,
    branch: string
  ): Promise<string | null> {
    return this.getFileAtCommit(owner, repo, path, branch);
  }

  async findClosestCommit(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    targetTime: Date
  ): Promise<GitHubCommit | null> {
    const since = new Date(targetTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date(targetTime.getTime() + 24 * 60 * 60 * 1000);
    
    const commits = await this.getCommitsForFile(owner, repo, path, branch, since, until);
    
    if (commits.length === 0) return null;

    let closest = commits[0];
    let closestDiff = Math.abs(new Date(closest.commit.author.date).getTime() - targetTime.getTime());

    for (const commit of commits) {
      const diff = Math.abs(new Date(commit.commit.author.date).getTime() - targetTime.getTime());
      if (diff < closestDiff) {
        closest = commit;
        closestDiff = diff;
      }
    }

    return closest;
  }
}

export const githubService = new GitHubService();
