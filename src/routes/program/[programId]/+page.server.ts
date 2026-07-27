import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { ProtocolClient } from '$lib/server/protocol/client.js';
import type { Project } from '$lib/server/protocol/types.js';
import { createLogger } from '$lib/server/logger.js';
import type { PageServerLoad } from './$types.js';

const log = createLogger('page:dashboard');

async function fetchAllProjects(
	client: ProtocolClient,
	status: 'pending' | 'pending_hq'
): Promise<Project[]> {
	const projects: Project[] = [];
	let cursor: string | undefined;
	for (;;) {
		const result = await client.fetchProjects({ status, cursor, limit: 100 });
		projects.push(...result.projects);
		if (!result.nextCursor) break;
		cursor = result.nextCursor;
	}
	return projects;
}

// hoursSubmitted is cumulative per project, so pending hours are measured
// against the last approved ship — the same baseline the review timeline uses.
// Programs that report per-ship hours (pending below the approved baseline)
// fall back to the raw submitted value.
function pendingProjectHours(project: Project): number {
	const pending = project.ships
		.filter((s) => s.status === 'pending' || s.status === 'pending_hq')
		.reduce((max, s) => Math.max(max, s.hoursSubmitted), 0);
	if (pending === 0) return 0;
	const approved = project.ships
		.filter((s) => s.status === 'approved')
		.reduce((max, s) => Math.max(max, s.hoursSubmitted), 0);
	return approved > 0 && pending > approved ? pending - approved : pending;
}

export const load: PageServerLoad = async ({ params, parent }) => {
	const tLoad = log.time('load');
	const { user } = await parent();
	if (!user) throw redirect(302, '/auth/login');

	const program = await db.program.findUniqueOrThrow({
		where: { id: params.programId }
	});

	const client = new ProtocolClient(program.masterEndpoint, program.secretKey);

	const [stats, pendingProjects, hqProjects] = await Promise.all([
		client.getProgramStats({}),
		fetchAllProjects(client, 'pending'),
		fetchAllProjects(client, 'pending_hq')
	]);

	// One WP ("weighted project") per 10 pending hours. Dedupe across the two
	// status queries — endpoints that don't support pending_hq may return
	// overlapping (or all) projects, and pendingProjectHours already ignores
	// projects with no pending ships.
	const uniquePendingProjects = new Map(
		[...pendingProjects, ...hqProjects].map((p) => [p.id, p])
	);
	let pendingHours = 0;
	for (const project of uniquePendingProjects.values()) {
		pendingHours += pendingProjectHours(project);
	}
	const pendingWps = pendingHours / 10;

	const now = new Date();
	const weekAgo = new Date(now.getTime() - 7 * 86400000);

	const today = new Date(now.toISOString().slice(0, 10));
	const [, snapshotRows] = await Promise.all([
		db.programStatsSnapshot.upsert({
			where: { programId_date: { programId: params.programId, date: today } },
			create: {
				programId: params.programId,
				date: today,
				pendingReviewCount: stats.pendingReviewCount,
				pendingFulfillmentCount: stats.pendingFulfillmentCount
			},
			update: {
				pendingReviewCount: stats.pendingReviewCount,
				pendingFulfillmentCount: stats.pendingFulfillmentCount
			}
		}),
		db.programStatsSnapshot.findMany({
			where: { programId: params.programId, date: { lt: today } },
			orderBy: { date: 'desc' },
			take: 364
		})
	]);
	const snapshots = snapshotRows
		.map((s) => ({
			date: s.date,
			pendingReviewCount: s.pendingReviewCount,
			pendingFulfillmentCount: s.pendingFulfillmentCount
		}))
		.reverse();
	snapshots.push({
		date: today,
		pendingReviewCount: stats.pendingReviewCount,
		pendingFulfillmentCount: stats.pendingFulfillmentCount
	});

	const [fulfillmentLogs, reviewLogs] = await Promise.all([
		db.auditLog.findMany({
			where: {
				programId: params.programId,
				action: { in: ['order_status_change', 'order_fields_update'] }
			},
			include: { user: true },
			orderBy: { createdAt: 'desc' },
			take: 500
		}),
		db.auditLog.findMany({
			where: {
				programId: params.programId,
				action: { startsWith: 'review_' }
			},
			include: { user: true },
			orderBy: { createdAt: 'desc' },
			take: 500
		})
	]);

	const fulfillmentLogsByUser = aggregateByUser(
		fulfillmentLogs.filter((l) => l.createdAt >= weekAgo)
	);
	const fulfillmentLogsAllTime = aggregateByUser(fulfillmentLogs);
	const reviewLogsByUser = aggregateByUser(
		reviewLogs.filter((l) => l.createdAt >= weekAgo)
	);
	const reviewLogsAllTime = aggregateByUser(reviewLogs);

	const fulfillmentVolume = buildDailySeries(snapshots, 'pendingFulfillmentCount');
	const reviewVolume = buildDailySeries(snapshots, 'pendingReviewCount');

	const recentFulfillmentLogs = fulfillmentLogs.slice(0, 6);
	const recentReviewLogs = reviewLogs.slice(0, 6);

	const orderIds = [
		...new Set(recentFulfillmentLogs.map((l) => l.entityId).filter((id): id is string => !!id))
	];
	const projectIds = [
		...new Set(
			recentReviewLogs
				.map((l) => (l.metadata as Record<string, unknown> | null)?.projectId)
				.filter((id): id is string => typeof id === 'string')
		)
	];
	const [orderLabelEntries, projectLabelEntries] = await Promise.all([
		Promise.all(
			orderIds.map(async (id) => {
				const label = await cachedEntityLabel(`${params.programId}:order:${id}`, async () => {
					const { order, item } = await client.fetchOrderDetail({ orderId: id });
					return order.quantity > 1 ? `${order.quantity}× ${item.name}` : item.name;
				});
				return [id, label] as const;
			})
		),
		Promise.all(
			projectIds.map(async (id) => {
				const label = await cachedEntityLabel(`${params.programId}:project:${id}`, async () => {
					const project = await client.fetchProjectDetail({ projectId: id });
					return project.title;
				});
				return [id, label] as const;
			})
		)
	]);
	const orderLabels = new Map(orderLabelEntries);
	const projectLabels = new Map(projectLabelEntries);

	// Some review logs (e.g. HQ-queue authorizations from before projectId was
	// recorded) only carry a ship ID — fall back to finding the ship in the
	// program's project list, one sweep at most per load.
	const unresolvedShipIds = [
		...new Set(
			recentReviewLogs
				.filter((l) => {
					const pid = (l.metadata as Record<string, unknown> | null)?.projectId;
					return !(typeof pid === 'string' && projectLabels.get(pid));
				})
				.map((l) => l.entityId)
				.filter((id): id is string => !!id)
		)
	];
	let shipLabels = new Map<string, string | null>();
	if (unresolvedShipIds.length > 0) {
		let sweepPromise: Promise<Map<string, string>> | null = null;
		const sweep = () =>
			(sweepPromise ??= (async () => {
				const map = new Map<string, string>();
				let cursor: string | undefined;
				for (let page = 0; page < 10; page++) {
					const res = await client.fetchProjects({ status: 'all', limit: 200, cursor });
					for (const project of res.projects)
						for (const ship of project.ships) map.set(ship.id, project.title);
					if (!res.nextCursor) break;
					cursor = res.nextCursor;
				}
				return map;
			})());
		shipLabels = new Map(
			await Promise.all(
				unresolvedShipIds.map(
					async (id) =>
						[
							id,
							await cachedEntityLabel(`${params.programId}:ship:${id}`, async () =>
								(await sweep()).get(id) ?? null
							)
						] as const
				)
			)
		);
	}

	log.info('dashboard data loaded', {
		programId: params.programId,
		pendingReviewCount: stats.pendingReviewCount,
		pendingFulfillmentCount: stats.pendingFulfillmentCount,
		pendingWps,
		fulfillmentLogCount: fulfillmentLogs.length,
		reviewLogCount: reviewLogs.length
	});
	tLoad.end();

	return {
		pendingReviewCount: stats.pendingReviewCount,
		pendingFulfillmentCount: stats.pendingFulfillmentCount,
		pendingWps,
		fulfillmentLeaderboardWeekly: fulfillmentLogsByUser,
		fulfillmentLeaderboardAllTime: fulfillmentLogsAllTime,
		reviewLeaderboardWeekly: reviewLogsByUser,
		reviewLeaderboardAllTime: reviewLogsAllTime,
		fulfillmentVolume,
		reviewVolume,
		recentFulfillments: recentFulfillmentLogs.map((l) => ({
			userName: l.user.name,
			userAvatarUrl: l.user.avatarUrl,
			action: l.action,
			entityId: l.entityId,
			entityLabel: (l.entityId && orderLabels.get(l.entityId)) || null,
			metadata: l.metadata as Record<string, unknown> | null,
			createdAt: l.createdAt.toISOString()
		})),
		recentReviews: recentReviewLogs.map((l) => {
			const projectId = (l.metadata as Record<string, unknown> | null)?.projectId;
			return {
				userName: l.user.name,
				userAvatarUrl: l.user.avatarUrl,
				action: l.action,
				entityId: l.entityId,
				entityLabel:
					(typeof projectId === 'string' && projectLabels.get(projectId)) ||
					(l.entityId && shipLabels.get(l.entityId)) ||
					null,
				metadata: l.metadata as Record<string, unknown> | null,
				createdAt: l.createdAt.toISOString()
			};
		})
	};
};

// Human-readable names for audit-log entities live upstream, so the recent-history
// lists resolve them through the protocol on load. Results (including failures, so a
// deleted entity doesn't get re-queried every visit) are cached for a few minutes.
const entityLabelCache = new Map<string, { label: string | null; expires: number }>();
const ENTITY_LABEL_TTL = 10 * 60 * 1000;

async function cachedEntityLabel(
	cacheKey: string,
	resolve: () => Promise<string | null>
): Promise<string | null> {
	const now = Date.now();
	const hit = entityLabelCache.get(cacheKey);
	if (hit && hit.expires > now) return hit.label;

	let label: string | null = null;
	try {
		label = await resolve();
	} catch (e) {
		log.warn('failed to resolve entity label', { cacheKey, error: String(e) });
	}
	entityLabelCache.set(cacheKey, { label, expires: now + ENTITY_LABEL_TTL });
	return label;
}

function aggregateByUser(
	logs: Array<{ user: { name: string; avatarUrl: string | null } }>
): Array<{ username: string; avatarUrl: string | null; value: number }> {
	const map = new Map<string, { avatarUrl: string | null; count: number }>();
	for (const log of logs) {
		const existing = map.get(log.user.name);
		if (existing) {
			existing.count++;
		} else {
			map.set(log.user.name, { avatarUrl: log.user.avatarUrl, count: 1 });
		}
	}
	return Array.from(map.entries())
		.map(([username, { avatarUrl, count }]) => ({ username, avatarUrl, value: count }))
		.sort((a, b) => b.value - a.value);
}

// Snapshots only exist for days the dashboard was loaded, so gap days carry the
// last known value forward and are flagged as estimated.
function buildDailySeries(
	snapshots: Array<{ date: Date; pendingReviewCount: number; pendingFulfillmentCount: number }>,
	key: 'pendingReviewCount' | 'pendingFulfillmentCount'
): Array<{ date: string; count: number; estimated: boolean }> {
	if (snapshots.length === 0) return [];
	const dayMs = 86400000;
	const byDay = new Map(snapshots.map((s) => [Math.floor(s.date.getTime() / dayMs), s[key]]));
	const firstDay = Math.floor(snapshots[0].date.getTime() / dayMs);
	const lastDay = Math.floor(snapshots[snapshots.length - 1].date.getTime() / dayMs);

	const series: Array<{ date: string; count: number; estimated: boolean }> = [];
	let carried = snapshots[0][key];
	for (let day = firstDay; day <= lastDay; day++) {
		const recorded = byDay.get(day);
		if (recorded !== undefined) carried = recorded;
		series.push({
			date: new Date(day * dayMs).toISOString().slice(0, 10),
			count: recorded ?? carried,
			estimated: recorded === undefined
		});
	}
	return series.slice(-365);
}
