export type HackatimeTrustLevel =
    "green" | // trusted
    "blue" | // unscored
    "yellow" | // suspected
    "red"; // convicted

export type HackatimeAdminLevel =
    "superadmin" |
    "admin" |
    "viewer";

export interface HackatimeTrustLog {
    id: number;
    previous_trust_level: HackatimeTrustLevel;
    new_trust_level: HackatimeTrustLevel;
    reason: string;
    notes: string;
    created_at: string;
    changed_by: {
        id: number;
        username: string | null;
        display_name: string;
        admin_level: HackatimeAdminLevel;
    };
}

function areTrustLogsEquivalent(a: HackatimeTrustLog, b: HackatimeTrustLog) {
    return (
        (a.notes == b.notes && a.reason == b.reason) ||
        a.created_at == b.created_at
    );
}

export class HackatimeService {
    private apiKey: string;

    constructor (apiKey: string) {
        if (!apiKey.startsWith("hka_"))
            throw new Error("The given API key is not a Hackatime admin key. Ensure it starts with 'hka_'.");
        
        this.apiKey = apiKey;
    }

    private async query<T>(method: "GET" | "POST", endpoint: string, params: object = {}) {
        const req = await fetch(`https://hackatime.hackclub.com/api/${endpoint}`, {
            method,
            body: (method === "GET" || !params) ? undefined : JSON.stringify(params),
            headers: new Headers({
                "Authorization": `Bearer ${this.apiKey}`,
                "User-Agent": "sidekick/0.1.0",
                "Content-Type": "application/json"
            })
        });

        if (!req.ok)
            throw new Error(`Hackatime API request failed with HTTP ${req.status}`);

        return await req.json() as T;
    }

    private async queryDatabase(query: string) {
        return await this.query<{
            success: boolean,
            query: string,
            columns: string[],
            rows: Record<string, [string, unknown]>[],
            row_count: number,
            executed_by: string,
            executed_at: string
        }>(
            "POST", "admin/v1/execute", { query }
        );
    }

    async findIdByEmail(email: string) {
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))
            throw new Error(`"${email}" is not a valid e-mail.`);

        const res = await this.queryDatabase(
            /*sql*/`SELECT users.id FROM users INNER JOIN email_addresses ON users.id=email_addresses.user_id WHERE email_addresses.email = '${email}' LIMIT 1;`
        );

        if (!res.success || res.row_count == 0 || res.rows.length == 0) {
            console.error(`Could not get Hackatime ID for e-mail ${email}.`, res);
            return null;
        }

        const row = res.rows[0];
        if (!("id" in row) || typeof row["id"][1] !== "number") {
            console.error("Malformed response schema for Hackatime SQL query.", res);
            return null;
        }
        
        return row["id"][1];
    }

    async getUserProjects(id: number) {
        return await this.query<{
            user_id: number,
            username: string;
            total_projects: number;
            projects: {
                name: string;
                total_heartbeats: number;
                total_duration: number; // seconds
                first_heartbeat: number;
                last_heartbeat: number;
                languages: string[];
                repo: string | null;
                repo_mapping_id: number | null;
            }[]
        }>(
            "GET", `admin/v1/user/projects?id=${id}`
        );
    }

    async getUserInfo(id: number) {
        const res = await this.query<{
            user: {
                id: number;
                username: string | null;
                display_name: string;
                slack_uid: string;
                slack_username: string;
                github_username: string;
                timezone: string;
                country_code: string | null;
                admin_level: HackatimeAdminLevel;
                trust_level: HackatimeTrustLevel;
                suspected: boolean;
                banned: boolean;
                created_at: string; // ISO date string
                updated_at: string; // ISO date string
                last_heartbeat_at: number; // Unix timestamp
                email_addresses: string[];
                api_keys_count: number;
                stats: {
                    total_heartbeats: number;
                    total_coding_time: number;
                    languages_used: number;
                    projects_worked_on: number;
                    days_active: number;
                }
            }
        }>(
            "GET", `admin/v1/user/info?id=${id}`
        );

        return res.user;
    }

    async getHeartbeatsFor(userId: number, date: Date) {
        const res = await this.query<{
            date: string;
            timezone: string;
            total_duration: number;
            total_heartbeats: number;
            user_id: number;
            username: string;
            heartbeats: {
                branch: string;
                category: string;
                created_at: string;
                cursorpos: number;
                dependencies: string[];
                editor: string;
                entity: string;
                id: number;
                ip_address: string;
                is_write: boolean | null;
                language: string;
                line_additions: number | null;
                line_deletions: number | null;
                lineno: number;
                lines: number;
                machine: string;
                operating_system: string;
                project: string;
                project_root_count: number;
                source_type: "direct_entry" | "wakapi_import" | "test_entry";
                time: string; // date
                type: string;
                user_agent: string;
                ysws_program: string;
            }[];
        }>(
            "GET", `admin/v1/user/stats?id=${userId}&date=${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`
        );

        return res.heartbeats.map(x => ({
            ...x,
            created_at: new Date(x.created_at),
            time: new Date(x.time)
        }));
    }

    async getTrustLogs(userId: number) {
        const res = await this.query<{ trust_logs: HackatimeTrustLog[] }>("GET", `admin/v1/user/trust_logs?id=${userId}`);

        return res.trust_logs
            .filter(
                // We sometimes can have duplicate entries, for some reason...
                (x, i) => res.trust_logs.findIndex(y => areTrustLogsEquivalent(x, y)) == i
            );
    }
}

export interface Heartbeat {
  time: Date;
  created_at: Date;
  project: string;
  branch: string;
  category: string;
  editor: string;
  entity: string;
  language: string;
  machine: string;
  operating_system: string;
  type: string;
  user_agent: string;
  line_additions: number | null;
  line_deletions: number | null;
  lineno: number;
  lines: number;
  cursorpos: number;
  project_root_count: number;
  is_write: boolean | null;
  source_type: string;
  ip_address: string;
}

export interface HeartbeatCluster {
  id: string;
  startTime: Date;
  endTime: Date;
  heartbeats: Heartbeat[];
}

export const CLUSTER_THRESHOLD_MS = 15 * 60 * 1000;

export function clusterHeartbeats(heartbeats: Heartbeat[]): HeartbeatCluster[] {
    if (heartbeats.length === 0)
        return [];

    const sorted = [...heartbeats].sort((a, b) => a.time.getTime() - b.time.getTime());

    const clusters: HeartbeatCluster[] = [];
    let currentCluster: Heartbeat[] = [sorted[0]];
    let lastTime = sorted[0].time.getTime();

    for (let i = 1; i < sorted.length; i++) {
        const currentTime = sorted[i].time.getTime();

        if (currentTime - lastTime <= CLUSTER_THRESHOLD_MS) {
            currentCluster.push(sorted[i]);
        } else {
            if (currentCluster.length > 0) {
                clusters.push({
                    id: `cluster-${clusters.length}`,
                    startTime: currentCluster[0].time,
                    endTime: currentCluster[currentCluster.length - 1].time,
                    heartbeats: currentCluster
                });
            }

            currentCluster = [sorted[i]];
        }

        lastTime = currentTime;
    }

    if (currentCluster.length > 0) {
        clusters.push({
            id: `cluster-${clusters.length}`,
            startTime: currentCluster[0].time,
            endTime: currentCluster[currentCluster.length - 1].time,
            heartbeats: currentCluster
        });
    }

    return clusters;
}