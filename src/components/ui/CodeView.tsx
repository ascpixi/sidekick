import { useState, useEffect, useMemo, useRef } from "react";
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { githubService, parseGitHubUrl } from "../../services/github";
import type { Heartbeat } from "../../services/hackatime";

const CONTEXT_LINES = 10;

interface CodeViewProps {
  heartbeats: Heartbeat[];
  codeUrl?: string;
}

interface FileGroup {
  entity: string;
  relativePath: string;
  heartbeats: Heartbeat[];
}

function normalizePath(path: string): string[] {
  return path.split(/[/\\]/).filter(Boolean);
}

function findProjectRoot(entities: string[]): string[] {
  if (entities.length === 0) return [];
  if (entities.length === 1) {
    const parts = normalizePath(entities[0]);
    return parts.slice(0, -1);
  }

  const allParts = entities.map(normalizePath);
  
  const dirCounts = new Map<string, number>();
  
  for (const parts of allParts) {
    for (let i = 1; i <= parts.length - 1; i++) {
      const dir = parts.slice(0, i).join("/");
      dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
    }
  }

  let bestRoot: string[] = [];
  let bestScore = 0;

  for (const [dir, count] of dirCounts) {
    if (count < 2) continue;
    
    const parts = dir.split("/");
    const depth = parts.length;
    const score = count * depth;
    
    if (score > bestScore) {
      bestScore = score;
      bestRoot = parts;
    }
  }

  if (bestRoot.length === 0) {
    const first = allParts[0];
    return first.slice(0, Math.max(1, first.length - 1));
  }

  return bestRoot;
}

function getRelativePath(entity: string, root: string[]): string {
  const parts = normalizePath(entity);
  
  let matchLen = 0;
  for (let i = 0; i < Math.min(parts.length, root.length); i++) {
    if (parts[i].toLowerCase() === root[i].toLowerCase()) {
      matchLen = i + 1;
    } else {
      break;
    }
  }

  const relativeParts = parts.slice(matchLen);
  return relativeParts.length > 0 ? relativeParts.join("/") : parts[parts.length - 1];
}

function groupHeartbeatsByFile(heartbeats: Heartbeat[]): { groups: FileGroup[]; projectRoot: string } {
  const entities = heartbeats
    .map((hb) => hb.entity)
    .filter((e): e is string => !!e);
  
  const rootParts = findProjectRoot(entities);
  const projectRoot = rootParts.join("/");

  const groups = new Map<string, Heartbeat[]>();

  for (const hb of heartbeats) {
    if (!hb.entity) continue;
    const existing = groups.get(hb.entity) || [];
    existing.push(hb);
    groups.set(hb.entity, existing);
  }

  const fileGroups = Array.from(groups.entries())
    .map(([entity, hbs]) => ({
      entity,
      relativePath: getRelativePath(entity, rootParts),
      heartbeats: hbs.sort((a, b) => a.time.getTime() - b.time.getTime()),
    }))
    .sort((a, b) => b.heartbeats.length - a.heartbeats.length);

  return { groups: fileGroups, projectRoot };
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return langMap[ext] || "plaintext";
}

export function CodeView({ heartbeats, codeUrl }: CodeViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedFileGroup, setSelectedFileGroup] = useState<FileGroup | null>(
    null
  );
  const [fetchState, setFetchState] = useState<{
    content: string | null;
    isLoading: boolean;
    error: string | null;
    key: string | null;
  }>({ content: null, isLoading: false, error: null, key: null });
  const codeContainerRef = useRef<HTMLPreElement>(null);
  const highlightedLineRef = useRef<HTMLDivElement>(null);

  const gitHubInfo = useMemo(
    () => (codeUrl ? parseGitHubUrl(codeUrl) : null),
    [codeUrl]
  );

  const { groups: fileGroups, projectRoot } = useMemo(
    () => groupHeartbeatsByFile(heartbeats),
    [heartbeats]
  );

  const validSelectedGroup = selectedFileGroup && 
    fileGroups.some(g => g.entity === selectedFileGroup.entity)
    ? selectedFileGroup
    : fileGroups[0] || null;

  if (validSelectedGroup !== selectedFileGroup) {
    setSelectedFileGroup(validSelectedGroup);
    setCurrentIndex(0);
  }

  const fetchKey = selectedFileGroup && gitHubInfo
    ? `${gitHubInfo.owner}/${gitHubInfo.repo}/${selectedFileGroup.relativePath}/${selectedFileGroup.heartbeats[0]?.branch || "main"}`
    : null;

  useEffect(() => {
    if (!selectedFileGroup || !gitHubInfo || !fetchKey) {
      return;
    }

    if (fetchState.key === fetchKey && !fetchState.isLoading) {
      return;
    }

    let cancelled = false;
    const branch = selectedFileGroup.heartbeats[0]?.branch || "main";
    const relativePath = selectedFileGroup.relativePath;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setFetchState({ content: null, isLoading: true, error: null, key: fetchKey });
    });

    githubService
      .getFileAtBranch(gitHubInfo.owner, gitHubInfo.repo, relativePath, branch)
      .then((content) => {
        if (cancelled) return;
        if (content) {
          setFetchState({ content, isLoading: false, error: null, key: fetchKey });
        } else {
          setFetchState({ content: null, isLoading: false, error: `Could not fetch file: ${relativePath}`, key: fetchKey });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchState({ content: null, isLoading: false, error: err.message, key: fetchKey });
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey, selectedFileGroup, gitHubInfo, fetchState.key, fetchState.isLoading]);

  const fileContent = fetchState.key === fetchKey ? fetchState.content : null;
  const isLoadingContent = fetchState.isLoading || (fetchKey !== null && fetchState.key !== fetchKey);
  const loadError = fetchState.key === fetchKey ? fetchState.error : null;

  const currentHeartbeats = selectedFileGroup?.heartbeats || [];
  const currentHeartbeat = currentHeartbeats[currentIndex];

  useEffect(() => {
    if (!isPlaying || currentHeartbeats.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= currentHeartbeats.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, currentHeartbeats.length, playbackSpeed]);

  useEffect(() => {
    if (highlightedLineRef.current && codeContainerRef.current) {
      highlightedLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex, fileContent]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(currentHeartbeats.length - 1, prev + 1));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  const togglePlayback = () => {
    if (currentIndex >= currentHeartbeats.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying((prev) => !prev);
  };

  if (!gitHubInfo) {
    return (
      <div className="flex items-center justify-center h-48 bg-base-200 rounded-lg">
        <p className="text-base-content/60">
          Code View requires a GitHub repository URL
        </p>
      </div>
    );
  }

  if (fileGroups.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-base-200 rounded-lg">
        <p className="text-base-content/60">No file activity in this cluster</p>
      </div>
    );
  }

  const lines = fileContent?.split("\n") || [];
  const targetLine = currentHeartbeat?.lineno || 1;
  const startLine = Math.max(1, targetLine - CONTEXT_LINES);
  const endLine = Math.min(lines.length, targetLine + CONTEXT_LINES);
  const visibleLines = lines.slice(startLine - 1, endLine);
  const language = selectedFileGroup
    ? getLanguageFromPath(selectedFileGroup.relativePath)
    : "plaintext";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <select
          className="select select-sm select-bordered flex-1 min-w-48"
          value={selectedFileGroup?.entity || ""}
          onChange={(e) => {
            const group = fileGroups.find((g) => g.entity === e.target.value);
            setSelectedFileGroup(group || null);
          }}
        >
          {fileGroups.map((group) => (
            <option key={group.entity} value={group.entity}>
              {group.relativePath} ({group.heartbeats.length} heartbeats)
            </option>
          ))}
        </select>

        <div className="badge badge-outline">{language}</div>
      </div>

      {loadError && (
        <div className="alert alert-warning">
          <span>{loadError}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          className="btn btn-sm btn-ghost"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
        >
          <BackwardIcon className="w-4 h-4" />
        </button>

        <button className="btn btn-sm btn-primary" onClick={togglePlayback}>
          {isPlaying ? (
            <PauseIcon className="w-4 h-4" />
          ) : (
            <PlayIcon className="w-4 h-4" />
          )}
        </button>

        <button
          className="btn btn-sm btn-ghost"
          onClick={handleNext}
          disabled={currentIndex >= currentHeartbeats.length - 1}
        >
          <ForwardIcon className="w-4 h-4" />
        </button>

        <input
          type="range"
          min="0"
          max={Math.max(0, currentHeartbeats.length - 1)}
          value={currentIndex}
          onChange={handleSliderChange}
          className="range range-xs range-primary flex-1"
        />

        <span className="text-sm tabular-nums min-w-20 text-right">
          {currentIndex + 1} / {currentHeartbeats.length}
        </span>

        <select
          className="select select-xs select-bordered w-20"
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
        >
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>
      </div>

      {currentHeartbeat && (
        <div className="flex items-center gap-4 text-sm text-base-content/70 flex-wrap">
          <span>
            <strong>Time:</strong> {currentHeartbeat.time.toLocaleTimeString()}
          </span>
          <span>
            <strong>Line:</strong> {currentHeartbeat.lineno}
          </span>
          <span>
            <strong>Cursor:</strong> {currentHeartbeat.cursorpos}
          </span>
          {currentHeartbeat.branch && (
            <span>
              <strong>Branch:</strong> {currentHeartbeat.branch}
            </span>
          )}
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden border border-base-content/10">
        {isLoadingContent ? (
          <div className="flex items-center justify-center h-64 bg-base-200">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : fileContent ? (
          <div className="relative">
            <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-base-content/50">
              <span>
                Lines {startLine}–{endLine} of {lines.length}
              </span>
            </div>
            <pre
              ref={codeContainerRef}
              className="bg-base-300 text-sm overflow-x-auto p-4 pt-8 font-mono leading-relaxed"
            >
              {visibleLines.map((line, idx) => {
                const lineNum = startLine + idx;
                const isHighlighted = lineNum === targetLine;
                const cursorInLine =
                  isHighlighted && currentHeartbeat?.cursorpos;

                return (
                  <div
                    key={lineNum}
                    ref={isHighlighted ? highlightedLineRef : undefined}
                    className={`flex ${
                      isHighlighted
                        ? "bg-primary/20 -mx-4 px-4 border-l-4 border-primary"
                        : ""
                    }`}
                  >
                    <span className="select-none text-base-content/40 w-12 text-right pr-4 flex-shrink-0">
                      {lineNum}
                    </span>
                    <span className="flex-1 whitespace-pre">
                      {cursorInLine ? (
                        <>
                          {line.slice(0, currentHeartbeat.cursorpos)}
                          <span className="bg-warning text-warning-content">
                            {line[currentHeartbeat.cursorpos] || " "}
                          </span>
                          {line.slice(currentHeartbeat.cursorpos + 1)}
                        </>
                      ) : (
                        line || " "
                      )}
                    </span>
                  </div>
                );
              })}
            </pre>
            {startLine > 1 && (
              <button
                className="absolute left-1/2 top-8 -translate-x-1/2 btn btn-xs btn-ghost opacity-60 hover:opacity-100"
                onClick={() => {
                  if (currentHeartbeat) {
                    const newTarget = Math.max(
                      1,
                      currentHeartbeat.lineno - CONTEXT_LINES * 2
                    );
                    const newHbIndex = currentHeartbeats.findIndex(
                      (hb) => Math.abs(hb.lineno - newTarget) <= 1
                    );
                    if (newHbIndex !== -1) setCurrentIndex(newHbIndex);
                  }
                }}
              >
                <ChevronLeftIcon className="w-4 h-4 rotate-90" />
              </button>
            )}
            {endLine < lines.length && (
              <button
                className="absolute left-1/2 bottom-1 -translate-x-1/2 btn btn-xs btn-ghost opacity-60 hover:opacity-100"
                onClick={() => {
                  if (currentHeartbeat) {
                    const newTarget = Math.min(
                      lines.length,
                      currentHeartbeat.lineno + CONTEXT_LINES * 2
                    );
                    const newHbIndex = currentHeartbeats.findIndex(
                      (hb) => Math.abs(hb.lineno - newTarget) <= 1
                    );
                    if (newHbIndex !== -1) setCurrentIndex(newHbIndex);
                  }
                }}
              >
                <ChevronRightIcon className="w-4 h-4 rotate-90" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 bg-base-200">
            <p className="text-base-content/60">
              Unable to load file content from GitHub
            </p>
          </div>
        )}
      </div>

      <div className="text-xs text-base-content/50 flex items-center gap-4">
        <span>
          Fetching from{" "}
          <a
            href={`https://github.com/${gitHubInfo.owner}/${gitHubInfo.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            {gitHubInfo.owner}/{gitHubInfo.repo}
          </a>
        </span>
        {projectRoot && (
          <span className="opacity-70">
            Project root: <code className="font-mono">{projectRoot}</code>
          </span>
        )}
      </div>
    </div>
  );
}
