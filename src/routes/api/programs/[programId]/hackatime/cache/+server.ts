import { json, error } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/rbac.js';
import { invalidateHackatimeCache } from '$lib/server/integrations/hackatime.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const logger = createLogger('api:hackatime:cache');

// Drops all cached Hackatime data about a user so the next fetches hit the
// live API — for when a reviewer needs fresh data before the TTLs run out.
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'canViewReviews', {
		isSuperAdmin: user.isSuperAdmin
	});

	const userId = url.searchParams.get('userId');
	if (!userId) throw error(400, 'Missing userId');

	const deleted = await invalidateHackatimeCache(userId);
	logger.info('cache invalidated', { userId, deleted, by: user.id });
	return json({ deleted });
};
