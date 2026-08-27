import { json, error } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/rbac.js';
import { getRawHeartbeatRange, tzDayBounds, HackatimeRateLimitError, type RawHeartbeat } from '$lib/server/integrations/hackatime.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const logger = createLogger('api:hackatime:heartbeats');

function transformHeartbeats(raw: RawHeartbeat[], projectKeys: Set<string>) {
	return raw
		.filter((hb) => projectKeys.has((hb.project ?? '').toLowerCase()))
		.sort((a, b) => a.time - b.time)
		.map((hb) => ({
			time: hb.time * 1000,
			lineno: hb.lineno ?? 0,
			cursorpos: hb.cursorpos ?? 0,
			is_write: hb.is_write ?? false,
			project: hb.project ?? '',
			language: hb.language ?? '',
			entity: hb.entity ?? '',
			branch: hb.branch ?? '',
			category: hb.category ?? '',
			editor: hb.editor ?? '',
			machine: hb.machine ?? '',
			user_agent: hb.user_agent ?? '',
			ip: hb.ip_address ?? '',
			lines: hb.lines ?? 0,
			source_type: hb.source_type ?? 0
		}));
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'canViewReviews', {
		isSuperAdmin: user.isSuperAdmin
	});

	const userId = url.searchParams.get('userId');
	const projects = url.searchParams.get('projects');
	const date = url.searchParams.get('date');
	const endDate = url.searchParams.get('endDate');
	const tz = url.searchParams.get('tz') || 'UTC';

	if (!userId || !projects || !date) {
		throw error(400, 'Missing userId, projects, or date');
	}

	logger.debug('GET request', { userId, projects, date, endDate, tz, programId: params.programId });

	const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!dateMatch) throw error(400, 'Invalid date format, expected YYYY-MM-DD');

	if (endDate) {
		const endDateMatch = endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!endDateMatch) throw error(400, 'Invalid endDate format, expected YYYY-MM-DD');
	}

	const projectKeys = new Set(projects.split(',').map((p) => p.trim().toLowerCase()));
	const effectiveEndDate = endDate ?? date;

	const { startS } = tzDayBounds(date, tz);
	const { endS } = tzDayBounds(effectiveEndDate, tz);

	let raw: RawHeartbeat[];
	try {
		({ heartbeats: raw } = await getRawHeartbeatRange(userId, startS, endS));
	} catch (e) {
		if (e instanceof HackatimeRateLimitError) {
			throw error(429, 'Hackatime is rate limiting Sidekick; wait a moment and try again');
		}
		throw e;
	}
	const heartbeats = transformHeartbeats(raw, projectKeys);

	logger.debug('Fetched heartbeats', { date, endDate: effectiveEndDate, tz, heartbeatCount: heartbeats.length });
	return json({ heartbeats });
};
