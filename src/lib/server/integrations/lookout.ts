import { createLogger } from '../logger.js';

const log = createLogger('lookout');
const LOOKOUT_API = 'https://lookout.hackclub.com/api';

/**
 * A Lookout session token as it appears in a Hackatime heartbeat's entity
 * field: a 64-character hex string.
 */
export const LOOKOUT_TOKEN_REGEX = /^[0-9a-f]{64}$/i;

export interface LookoutSession {
	token: string;
	name: string;
	status: 'pending' | 'active' | 'paused' | 'stopped' | 'compiling' | 'complete' | 'failed';
	trackedSeconds: number;
	screenshotCount: number;
	clientInfo: string | null;
	startedAt: string | null;
	totalActiveSeconds: number;
	createdAt: string;
	thumbnailUrl: string | null;
	/** Null until the session finishes compiling (status "complete"). */
	videoUrl: string | null;
}

export async function getLookoutSession(token: string): Promise<LookoutSession | null> {
	log.debug('getLookoutSession called', { token });
	try {
		const timer = log.time('getLookoutSession');
		const res = await fetch(`${LOOKOUT_API}/sessions/${encodeURIComponent(token)}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) {
			timer.end({ status: res.status });
			log.debug('getLookoutSession not found', { token, status: res.status });
			return null;
		}
		const data = await res.json();
		timer.end({ found: true });
		return {
			token,
			name: (data.name as string) ?? '',
			status: data.status as LookoutSession['status'],
			trackedSeconds: (data.trackedSeconds as number) ?? 0,
			screenshotCount: (data.screenshotCount as number) ?? 0,
			clientInfo: (data.clientInfo as string) ?? null,
			startedAt: (data.startedAt as string) ?? null,
			totalActiveSeconds: (data.totalActiveSeconds as number) ?? 0,
			createdAt: (data.createdAt as string) ?? '',
			thumbnailUrl: (data.thumbnailUrl as string) ?? null,
			// videoWebmUrl is a legacy field pointing at a static placeholder — ignored.
			videoUrl: (data.videoUrl as string) ?? null
		};
	} catch (err) {
		log.error('getLookoutSession failed', err, { token });
		return null;
	}
}

export async function getLookoutSessions(tokens: string[]): Promise<LookoutSession[]> {
	log.debug('getLookoutSessions called', { tokenCount: tokens.length });
	const sessions = (await Promise.all(tokens.map(getLookoutSession))).filter(
		(s): s is LookoutSession => s !== null
	);
	log.debug('getLookoutSessions result', { tokenCount: tokens.length, sessionCount: sessions.length });
	return sessions.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
}
