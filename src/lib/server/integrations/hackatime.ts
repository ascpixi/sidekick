import { env } from '$env/dynamic/private';
import { createLogger } from '../logger.js';
import { aggregateByProject } from './hackatime-duration.js';
import { LOOKOUT_TOKEN_REGEX } from './lookout.js';

const log = createLogger('hackatime');
const BASE_URL = 'https://hackatime.hackclub.com';

interface ProjectDetail {
	name: string;
	totalSeconds: number;
}

interface TrustFactor {
	trustLevel: string;
	trustValue: number;
}

export interface UserInfo {
	trustLevel: string;
	timezone: string;
}

export interface TrustLog {
	id: number;
	createdAt: string;
	previousTrustLevel: string;
	newTrustLevel: string;
	reason: string | null;
	changedBy: string | null;
	changedByAvatarUrl: string | null;
}

interface Heartbeat {
	id: string;
	entity: string;
	type: string;
	category: string;
	project: string;
	branch: string;
	language: string;
	is_write: boolean;
	editor: string;
	operating_system: string;
	machine: string;
	user_agent: string;
	time: number;
	created_at: string;
}

interface SummaryResult {
	projects: Array<{ name: string; total_seconds: number }>;
	languages: Array<{ name: string; total_seconds: number }>;
	editors: Array<{ name: string; total_seconds: number }>;
	grand_total: { total_seconds: number; text: string };
}

async function authFetch(path: string, params?: Record<string, string>): Promise<Response> {
	const token = env.HACKATIME_ADMIN_TOKEN;
	if (!token) {
		throw new Error('HACKATIME_ADMIN_TOKEN is not set');
	}

	const url = new URL(path, BASE_URL);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}

	log.trace('authFetch request', { path, params: params ? Object.keys(params).join(',') : undefined });
	const timer = log.time(`authFetch ${path}`);

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json'
		}
	});

	timer.end({ status: response.status });

	if (!response.ok) {
		log.error('authFetch failed', undefined, { path, status: response.status, statusText: response.statusText });
		throw new Error(`Hackatime API error: ${response.status} ${response.statusText}`);
	}

	return response;
}

export function tzDayBounds(dateStr: string, tz: string): { startS: number; endS: number } {
	const noon = new Date(`${dateStr}T12:00:00Z`);
	const utcStr = noon.toLocaleString('en-US', { timeZone: 'UTC' });
	const tzStr = noon.toLocaleString('en-US', { timeZone: tz });
	const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
	const midnight = new Date(`${dateStr}T00:00:00Z`);
	const startS = Math.floor((midnight.getTime() + offsetMs) / 1000);
	return { startS, endS: startS + 86400 - 1 };
}

export function dateInTimezone(timestampS: number, tz: string): string {
	return new Date(timestampS * 1000).toLocaleDateString('sv-SE', { timeZone: tz });
}

function utcDateStr(timestampS: number): string {
	const d = new Date(timestampS * 1000);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Resolves the requested project keys (matched case-insensitively) to the exact
 * project names Hackatime has on record, plus the span of their heartbeats.
 * The exact casing matters: the admin heartbeats endpoint's `project` filter is
 * case-sensitive, so heartbeat fetches must use these names, not the raw keys.
 */
async function getMatchedProjects(
	userId: string,
	projectKeys: string[]
): Promise<{ names: string[]; earliestS: number; latestS: number } | null> {
	const response = await authFetch('/api/admin/v1/user/projects', { id: userId });
	const data = await response.json();
	const keySet = new Set(projectKeys.map((k) => k.toLowerCase()));

	interface AdminProject {
		name: string;
		first_heartbeat: number;
		last_heartbeat: number;
	}

	const matched = (data.projects ?? []).filter(
		(p: AdminProject) => keySet.has(p.name.toLowerCase())
	);
	if (matched.length === 0) {
		log.debug('getMatchedProjects no matching projects', { userId });
		return null;
	}

	let earliest = Infinity;
	let latest = 0;
	for (const p of matched) {
		if (p.first_heartbeat && p.first_heartbeat < earliest) earliest = p.first_heartbeat;
		if (p.last_heartbeat && p.last_heartbeat > latest) latest = p.last_heartbeat;
	}
	if (earliest === Infinity || latest === 0) {
		log.debug('getMatchedProjects no valid timestamps', { userId, matchedCount: matched.length });
		return null;
	}

	return { names: matched.map((p: AdminProject) => p.name), earliestS: earliest, latestS: latest };
}

export async function getProjectDateRange(
	userId: string,
	projectKeys: string[],
	tz?: string
): Promise<{ firstDate: string; lastDate: string } | null> {
	log.debug('getProjectDateRange called', { userId, projectKeys: projectKeys.join(','), tz });
	const matched = await getMatchedProjects(userId, projectKeys);
	if (!matched) return null;

	const fd = new Date(matched.earliestS * 1000);
	const ld = new Date(matched.latestS * 1000);

	const result = tz
		? {
				firstDate: fd.toLocaleDateString('sv-SE', { timeZone: tz }),
				lastDate: ld.toLocaleDateString('sv-SE', { timeZone: tz })
			}
		: {
				firstDate: utcDateStr(matched.earliestS),
				lastDate: utcDateStr(matched.latestS)
			};

	log.debug('getProjectDateRange result', { userId, matchedCount: matched.names.length, firstDate: result.firstDate, lastDate: result.lastDate });
	return result;
}

export interface ProjectHackatimeStats {
	projects: ProjectDetail[];
	/**
	 * Seconds attributable to AI coding, computed as the delta between the full
	 * aggregate and the aggregate with `ai coding` heartbeats removed:
	 * `aggregate(all) - aggregate(excluding "ai coding")`. This matches how
	 * Hackatime would credit the remaining (non-AI) time 1:1, and is robust to
	 * interleaving: a stray AI heartbeat sitting between two human ones no longer
	 * fragments the human session, because removing it re-merges the gap (capped
	 * at the 2-minute timeout). The delta is always >= 0 since dropping interior
	 * heartbeats can only shrink the aggregate.
	 */
	aiSeconds: number;
	/**
	 * Seconds attributable to browser activity, computed the same way as
	 * `aiSeconds` but excluding heartbeats whose editor is one of
	 * {@link BROWSER_EDITORS} (case-insensitive).
	 */
	browserSeconds: number;
	/**
	 * Seconds removed when excluding AI *and* browser heartbeats together. Not
	 * necessarily `aiSeconds + browserSeconds` — removing both sets at once
	 * re-merges gaps differently than removing each on its own. Always >=
	 * max(aiSeconds, browserSeconds).
	 */
	aiAndBrowserSeconds: number;
	/**
	 * Lookout session tokens found among the project's heartbeats (language
	 * "Lookout", entity a 64-hex session token), deduplicated.
	 */
	lookoutTokens: string[];
	/** True if the heartbeat fetch hit the safety cap; totals are lower bounds. */
	truncated: boolean;
}

/** Editors whose heartbeats count as browser activity (compared case-insensitively). */
export const BROWSER_EDITORS = ['chrome', 'firefox', 'edge', 'brave'];

/**
 * Per-project coding totals plus AI-attributed seconds, from one shared
 * heartbeat fetch.
 *
 * The public /users/{id}/projects/details endpoint honors the user's
 * "disable public stats" flag even when queried with the admin token (such
 * users read as 0h), and offers no reliable date window. Reconstruct
 * durations from admin heartbeats instead — same source and session
 * algorithm as Hackatime itself, and immune to the privacy flag.
 */
export async function getProjectHackatimeStats(
	userId: string,
	projectKeys: string[],
	start?: string, // ISO dates (YYYY-MM-DD) — clamp aggregation to this window
	end?: string
): Promise<ProjectHackatimeStats> {
	log.debug('getProjectHackatimeStats called', { userId, projectKeys: projectKeys.join(','), start, end });
	const empty: ProjectHackatimeStats = { projects: [], aiSeconds: 0, browserSeconds: 0, aiAndBrowserSeconds: 0, lookoutTokens: [], truncated: false };
	if (projectKeys.length === 0) return empty;

	const matched = await getMatchedProjects(userId, projectKeys);
	if (!matched) {
		log.debug('getProjectHackatimeStats no matching projects', { userId });
		return empty;
	}
	const range = { firstDate: utcDateStr(matched.earliestS), lastDate: utcDateStr(matched.latestS) };
	if (start && range.lastDate < start) return empty;
	if (end && range.firstDate > end) return empty;
	const firstDate = start && start > range.firstDate ? start : range.firstDate;
	const lastDate = end && end < range.lastDate ? end : range.lastDate;

	const startS = Math.floor(new Date(firstDate + 'T00:00:00Z').getTime() / 1000);
	const endS = Math.floor(new Date(lastDate + 'T23:59:59Z').getTime() / 1000);
	const results = await Promise.all(
		matched.names.map((name) => getRawHeartbeatRange(userId, startS, endS, name))
	);
	const truncated = results.some((r) => r.truncated);
	const scoped = results.flatMap((r) => r.heartbeats);

	// Match case-insensitively but report the caller's casing back.
	const keyByLower = new Map(projectKeys.map((k) => [k.toLowerCase(), k]));
	const byProject = new Map<string, RawHeartbeat[]>();
	for (const hb of scoped) {
		const key = keyByLower.get((hb.project ?? '').toLowerCase());
		if (key === undefined) continue;
		let group = byProject.get(key);
		if (!group) {
			group = [];
			byProject.set(key, group);
		}
		group.push(hb);
	}

	const projects: ProjectDetail[] = [...byProject.entries()].map(([name, hbs]) => ({
		name,
		totalSeconds: aggregateByProject(hbs)
	}));

	const total = aggregateByProject(scoped);
	const nonAi = aggregateByProject(scoped, { excludeCategories: ['ai coding'] });
	const nonBrowser = aggregateByProject(scoped, { excludeEditors: BROWSER_EDITORS });
	const nonAiNonBrowser = aggregateByProject(scoped, {
		excludeCategories: ['ai coding'],
		excludeEditors: BROWSER_EDITORS
	});
	const aiSeconds = Math.max(0, total - nonAi);
	const browserSeconds = Math.max(0, total - nonBrowser);
	const aiAndBrowserSeconds = Math.max(0, total - nonAiNonBrowser);

	const lookoutTokens = [
		...new Set(
			scoped
				.filter(
					(hb) =>
						hb.language?.toLowerCase() === 'lookout' && LOOKOUT_TOKEN_REGEX.test(hb.entity ?? '')
				)
				.map((hb) => hb.entity)
		)
	];

	log.debug('getProjectHackatimeStats result', { userId, projectCount: projects.length, aiSeconds, browserSeconds, lookoutTokenCount: lookoutTokens.length, truncated });
	return { projects, aiSeconds, browserSeconds, aiAndBrowserSeconds, lookoutTokens, truncated };
}

export async function getUserTrustFactor(
	userId: string
): Promise<TrustFactor> {
	log.debug('getUserTrustFactor called', { userId });
	const response = await authFetch('/api/admin/v1/user/info', { id: userId });
	const data = await response.json();

	const result = {
		trustLevel: data.user.trust_level,
		trustValue: 0
	};
	log.debug('getUserTrustFactor result', { userId, trustLevel: result.trustLevel });
	return result;
}

export async function getUserInfo(userId: string): Promise<UserInfo> {
	log.debug('getUserInfo called', { userId });
	const response = await authFetch('/api/admin/v1/user/info', { id: userId });
	const data = await response.json();
	const result = {
		trustLevel: data.user.trust_level ?? 'unknown',
		timezone: data.user.timezone ?? 'UTC'
	};
	log.debug('getUserInfo result', { userId, trustLevel: result.trustLevel, timezone: result.timezone });
	return result;
}

interface RawTrustLog {
	id: number;
	created_at: string;
	previous_trust_level: string;
	new_trust_level: string;
	reason: string | null;
	changed_by: { id: number; display_name: string; username: string } | null;
}

export async function getTrustLogs(userId: string): Promise<TrustLog[]> {
	log.debug('getTrustLogs called', { userId });
	const response = await authFetch('/api/admin/v1/user/trust_logs', { id: userId });
	const data = await response.json();
	const rawLogs: RawTrustLog[] = data.trust_logs ?? [];

	const uniqueUsernames = [...new Set(rawLogs.map((r) => r.changed_by?.username).filter(Boolean))] as string[];
	const avatarMap = new Map<number, string>();
	if (uniqueUsernames.length > 0) {
		const results = await Promise.all(uniqueUsernames.map((u) => searchUsers(u).catch(() => [])));
		for (const users of results) {
			for (const u of users) {
				if (!avatarMap.has(u.id)) {
					const url = u.slackAvatarUrl ?? u.githubAvatarUrl;
					if (url) avatarMap.set(u.id, url);
				}
			}
		}
	}

	const logs: TrustLog[] = rawLogs.map((r) => ({
		id: r.id,
		createdAt: r.created_at,
		previousTrustLevel: r.previous_trust_level,
		newTrustLevel: r.new_trust_level,
		reason: r.reason,
		changedBy: r.changed_by?.display_name ?? r.changed_by?.username ?? null,
		changedByAvatarUrl: r.changed_by ? (avatarMap.get(r.changed_by.id) ?? null) : null
	}));
	log.debug('getTrustLogs result', { userId, logCount: logs.length });
	return logs;
}

export async function getHeartbeatsByUserAgent(
	userId: string,
	segment: string,
	startDate: string,
	endDate: string
): Promise<Heartbeat[]> {
	log.debug('getHeartbeatsByUserAgent called', { userId, segment, startDate, endDate });
	const response = await authFetch('/api/admin/v1/heartbeats/by_user_agent_segment', {
		user_id: userId,
		segment,
		start_date: startDate,
		end_date: endDate
	});
	const data = await response.json();

	const heartbeats = data.heartbeats ?? [];
	log.debug('getHeartbeatsByUserAgent result', { userId, heartbeatCount: heartbeats.length });
	return heartbeats;
}

export async function getUserHeartbeats(
	userId: string,
	date: string
): Promise<Heartbeat[]> {
	log.debug('getUserHeartbeats called', { userId, date });
	const response = await authFetch('/api/admin/v1/user/heartbeats', {
		user_id: userId,
		date
	});
	const data = await response.json();

	const heartbeats = data.heartbeats ?? [];
	log.debug('getUserHeartbeats result', { userId, count: heartbeats.length });
	return heartbeats;
}

export interface RawHeartbeat {
	time: number;
	lineno: number;
	cursorpos: number;
	is_write: boolean;
	project: string;
	language: string;
	entity: string;
	branch: string;
	category: string;
	editor: string;
	machine: string;
	user_agent: string;
	ip_address: string;
	lines: number;
	source_type: number | string;
}

export interface HeartbeatRangeResult {
	heartbeats: RawHeartbeat[];
	/** True if the fetch hit the safety cap and the tail of the range is missing. */
	truncated: boolean;
}

/**
 * Fetches every heartbeat in the range, paginating until the API reports no
 * more. `project` narrows the fetch server-side; the filter is CASE-SENSITIVE,
 * so pass an exact name from the admin project list (see getMatchedProjects),
 * not a program-supplied key. The safety cap only guards against runaway
 * pagination; hitting it means the result is incomplete, and callers must
 * treat the data as a lower bound (`truncated`), never as the full range.
 */
export async function getRawHeartbeatRange(
	userId: string,
	startTimestampS: number,
	endTimestampS: number,
	project?: string
): Promise<HeartbeatRangeResult> {
	log.debug('getRawHeartbeatRange called', { userId, startTimestampS, endTimestampS, project });
	const timer = log.time('getRawHeartbeatRange');
	const BATCH_SIZE = 5000;
	const MAX_FETCH = 500000;
	let all: RawHeartbeat[] = [];
	let offset = 0;
	let truncated = false;

	for (;;) {
		if (all.length >= MAX_FETCH) {
			truncated = true;
			break;
		}
		const params: Record<string, string> = {
			id: userId,
			start_date: String(startTimestampS),
			end_date: String(endTimestampS),
			limit: String(BATCH_SIZE),
			offset: String(offset)
		};
		if (project !== undefined) params.project = project;
		const response = await authFetch('/api/admin/v1/user/heartbeats', params);
		const data = await response.json();
		const batch: RawHeartbeat[] = data.heartbeats ?? [];
		const hasMore = data.has_more ?? false;
		if (batch.length === 0 && hasMore) {
			// Defensive: an empty page with has_more=true would loop forever.
			log.warn('getRawHeartbeatRange got empty batch with has_more=true; stopping', { userId, offset });
			truncated = true;
			break;
		}
		all = all.concat(batch);
		offset += BATCH_SIZE;
		log.trace('getRawHeartbeatRange batch', { userId, batchSize: batch.length, totalAccumulated: all.length, hasMore });
		if (!hasMore) break;
	}

	if (truncated) {
		log.error('getRawHeartbeatRange hit fetch cap; result is truncated', undefined, {
			userId,
			project,
			maxFetch: MAX_FETCH,
			startTimestampS,
			endTimestampS
		});
	}

	timer.end({ userId, totalHeartbeats: all.length, truncated });
	return { heartbeats: all, truncated };
}

export interface HeartbeatLapseTimelapse {
	id: string;
	name: string;
	heartbeatCount: number;
	firstSeen: number;
	lastSeen: number;
	project: string;
}

export async function getLapseTimelapsesFromHeartbeats(
	userId: string,
	projectKeys: string[]
): Promise<HeartbeatLapseTimelapse[]> {
	log.debug('getLapseTimelapsesFromHeartbeats called', { userId, projectKeys: projectKeys.join(',') });
	let matched;
	try {
		matched = await getMatchedProjects(userId, projectKeys);
	} catch (err) {
		log.error('getLapseTimelapsesFromHeartbeats failed to get date range', err, { userId });
		return [];
	}
	if (!matched) return [];

	const startS = Math.floor(new Date(utcDateStr(matched.earliestS) + 'T00:00:00Z').getTime() / 1000);
	const endS = Math.floor(new Date(utcDateStr(matched.latestS) + 'T23:59:59Z').getTime() / 1000);

	let all: RawHeartbeat[];
	try {
		const results = await Promise.all(
			matched.names.map((name) => getRawHeartbeatRange(userId, startS, endS, name))
		);
		all = results.flatMap((r) => r.heartbeats);
	} catch (err) {
		log.error('getLapseTimelapsesFromHeartbeats failed to get heartbeats', err, { userId });
		return [];
	}
	const lapseHbs = all.filter(
		(hb) =>
			hb.editor?.toLowerCase() === 'lapse' || hb.user_agent?.toLowerCase().includes('lapse')
	);

	const groups = new Map<string, RawHeartbeat[]>();
	for (const hb of lapseHbs) {
		const entity = hb.entity ?? '';
		if (!groups.has(entity)) groups.set(entity, []);
		groups.get(entity)!.push(hb);
	}

	const result: HeartbeatLapseTimelapse[] = [];
	for (const [entity, hbs] of groups) {
		const idMatch = entity.match(/\(([^)]+)\)\s*$/);
		const id = idMatch?.[1] ?? entity;
		const name = idMatch ? entity.slice(0, entity.lastIndexOf('(')).trimEnd() : entity;

		const times = hbs.map((hb) => hb.time);
		result.push({
			id,
			name,
			heartbeatCount: hbs.length,
			firstSeen: Math.min(...times),
			lastSeen: Math.max(...times),
			project: hbs[0].project
		});
	}

	log.debug('getLapseTimelapsesFromHeartbeats result', { userId, timelapseCount: result.length });
	return result.sort((a, b) => b.lastSeen - a.lastSeen);
}

export interface HackatimeSearchUser {
	id: number;
	username: string | null;
	slackUsername: string | null;
	githubUsername: string | null;
	slackAvatarUrl: string | null;
	githubAvatarUrl: string | null;
	email: string;
}

export async function searchUsers(query: string): Promise<HackatimeSearchUser[]> {
	log.debug('searchUsers called', { query });
	const token = env.HACKATIME_ADMIN_TOKEN;
	if (!token) throw new Error('HACKATIME_ADMIN_TOKEN is not set');

	const url = new URL('/api/admin/v1/user/search_fuzzy', BASE_URL);
	const timer = log.time('searchUsers');
	const response = await fetch(url.toString(), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({ query }),
		signal: AbortSignal.timeout(5000)
	});

	if (!response.ok) {
		timer.end({ status: response.status });
		log.warn('searchUsers API returned non-ok', { query, status: response.status });
		return [];
	}
	const data = await response.json();

	const users = (data.users ?? []).map((u: Record<string, unknown>) => ({
		id: u.id,
		username: u.username ?? null,
		slackUsername: u.slack_username ?? null,
		githubUsername: u.github_username ?? null,
		slackAvatarUrl: u.slack_avatar_url ?? null,
		githubAvatarUrl: u.github_avatar_url ?? null,
		email: u.email ?? ''
	}));
	timer.end({ resultCount: users.length });
	log.debug('searchUsers result', { query, resultCount: users.length });
	return users;
}

export async function getSummary(
	userId: string,
	start: string,
	end: string,
	project?: string
): Promise<SummaryResult> {
	log.debug('getSummary called', { userId, start, end, project });
	const params: Record<string, string> = {
		user_id: userId,
		start,
		end
	};
	if (project) params.project = project;

	const response = await authFetch('/api/summary', params);
	const data = await response.json();

	const result = {
		projects: data.projects ?? [],
		languages: data.languages ?? [],
		editors: data.editors ?? [],
		grand_total: data.grand_total ?? { total_seconds: 0, text: '0 secs' }
	};
	log.debug('getSummary result', { userId, projectCount: result.projects.length, grandTotalSeconds: result.grand_total.total_seconds });
	return result;
}
