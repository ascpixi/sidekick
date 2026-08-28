import { createLogger } from '$lib/logger.js';

const log = createLogger('hackatimeClientCache');

// Client-side tier over the server's Hackatime caches: flicking between days in
// the viewer re-requests the same heartbeat windows, and even a server cache
// hit costs a full round trip (plus re-serializing multi-MB heartbeat pages).
// That hop dwarfs the server's memory<->Postgres savings, so this TTL is
// deliberately LONGER than the server memory tier's 2 min — the staleness it
// adds is cheap (past-day heartbeats barely change, and "Refresh data" purges
// every tier) while each hit saves the most expensive hop in the hierarchy.
// The entry cap bounds memory the same way the server tier's does.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 32;

const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed JSON, same contract response.json() has
const inFlight = new Map<string, Promise<any>>();

/** A Hackatime API route returned a non-ok status; `status` carries it. */
export class HackatimeFetchError extends Error {
	constructor(public status: number) {
		super(`HTTP ${status}`);
		this.name = 'HackatimeFetchError';
	}
}

export interface CachedFetchResult {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed JSON, same contract response.json() has
	data: any;
	/** True when served from this client-side cache rather than the network. */
	fromClientCache: boolean;
}

/**
 * GETs a Sidekick Hackatime API URL, serving repeats from a short-lived
 * in-memory cache and coalescing identical in-flight requests. Only ok
 * responses are cached; non-ok statuses throw {@link HackatimeFetchError}.
 */
export async function cachedHackatimeFetch(url: string): Promise<CachedFetchResult> {
	const cached = responseCache.get(url);
	if (cached && cached.expiresAt > Date.now()) {
		log.trace('cache hit', { url });
		return { data: cached.data, fromClientCache: true };
	}
	responseCache.delete(url);

	const pending = inFlight.get(url);
	if (pending) {
		log.trace('coalesced into in-flight request', { url });
		return { data: await pending, fromClientCache: false };
	}

	const promise = (async () => {
		const res = await fetch(url);
		if (!res.ok) throw new HackatimeFetchError(res.status);
		return res.json();
	})();
	inFlight.set(url, promise);
	try {
		const data = await promise;
		responseCache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
		while (responseCache.size > CACHE_MAX_ENTRIES) {
			// Maps iterate in insertion order, so the first key is the oldest entry.
			responseCache.delete(responseCache.keys().next().value!);
		}
		return { data, fromClientCache: false };
	} finally {
		inFlight.delete(url);
	}
}

/**
 * Drops every cached response about the given Hackatime user (matched by the
 * `userId` query param), or everything when no user is given. Called alongside
 * the server-side purge so "Refresh data" flushes the whole cache hierarchy.
 */
export function invalidateClientHackatimeCache(userId?: string): void {
	for (const key of [...responseCache.keys()]) {
		if (
			userId === undefined ||
			new URLSearchParams(key.split('?')[1] ?? '').get('userId') === userId
		) {
			responseCache.delete(key);
		}
	}
	log.debug('client cache invalidated', { userId });
}
