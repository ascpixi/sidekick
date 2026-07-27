import { redirect, error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { requirePermission } from '$lib/server/rbac.js';
import { ProtocolClient, ProtocolError } from '$lib/server/protocol/client.js';
import { resolveActorIds } from '$lib/server/actors.js';
import { getProjectHackatimeStats, getTrustLogs, getUserInfo } from '$lib/server/integrations/hackatime.js';
import type { TrustLog, UserInfo } from '$lib/server/integrations/hackatime.js';
import { findRecordsByUrl, airtableRecordUrl, normalizeUrl as normalizeAirtableUrl } from '$lib/server/integrations/airtable.js';
import { parseRepoUrl, getCommits, getRepoInfo, getReadme } from '$lib/server/integrations/github.js';
import { getLapseTimelapses } from '$lib/server/integrations/lapse.js';
import { getLookoutSessions } from '$lib/server/integrations/lookout.js';
import { CHECKS } from '$lib/server/checks/registry.js';
import { enqueueChecks } from '$lib/server/queue/checks.js';
import { createLogger } from '$lib/server/logger.js';
import type { CheckContext } from '$lib/server/checks/types.js';
import type { SubmitReviewActionInput } from '$lib/server/protocol/types.js';
import type { PageServerLoad, Actions } from './$types.js';

const log = createLogger('page:review');

export const load: PageServerLoad = async ({ params, parent }) => {
	const tTotal = log.time('load');
	log.info('loading review detail', { projectId: params.projectId, programId: params.programId });

	const tParent = log.time('parent()');
	const { user } = await parent();
	if (!user) throw redirect(302, '/auth/login');
	tParent.end();

	const tAuth = log.time('auth + program');
	const membership = await requirePermission(user.id, params.programId, 'canViewReviews', {
		isSuperAdmin: user.isSuperAdmin
	});

	const program = await db.program.findUniqueOrThrow({
		where: { id: params.programId }
	});
	tAuth.end();

	const client = new ProtocolClient(program.masterEndpoint, program.secretKey);

	const tProtocol = log.time('protocol (project+timeline+stats)');
	const [project, timeline, stats] = await Promise.all([
		client.fetchProjectDetail({ projectId: params.projectId }),
		client.fetchProjectTimeline({ projectId: params.projectId }),
		client.getProgramStats({})
	]);
	tProtocol.end();

	// Ships are ordered oldest-first; target the *most recent* pending ship so a stale
	// earlier submission (e.g. one whose verdict record is missing upstream) can never be
	// surfaced for review ahead of the live one.
	const pendingShip = project.ships.findLast((s) => s.status === 'pending' || s.status === 'pending_hq');

	// Resolve author and all timeline actors in one batch. Some event types carry
	// a second actor (who discarded/authorized the approval) that the upstream
	// sends as a raw ID — resolve those too so their pills show a name + avatar.
	const actorIds = new Set([project.authorId]);
	for (const event of timeline.events) {
		actorIds.add(event.actorId);
		if (event.type === 'discarded_approval') actorIds.add(event.discardedByActorId);
		if (event.type === 'authorized_approval') actorIds.add(event.authorizedByActorId);
	}

	const hackatimeUser = project.hackatimeId ?? project.authorId;

	const tActors = log.time('resolveActorIds + authorUser + userInfo');
	const [actors, authorUser, userInfo] = await Promise.all([
		resolveActorIds([...actorIds]),
		db.user.findFirst({
			where: project.authorId.startsWith('U')
				? { slackId: project.authorId }
				: { hcaId: project.authorId },
			select: { createdAt: true, hackatimeId: true }
		}),
		(hackatimeUser
			? getUserInfo(hackatimeUser).catch((e) => { log.warn('getUserInfo failed', { error: e }); return null as UserInfo | null; })
			: Promise.resolve(null as UserInfo | null))
	]);
	const author = actors.get(project.authorId)!;
	const authorTimezone = userInfo?.timezone ?? 'UTC';
	tActors.end({ actorCount: actorIds.size, authorTimezone });

	// Stream integration data — each resolves independently for incremental rendering
	type GhCommit = {
		sha: string;
		message: string;
		author: string;
		authorLogin: string | null;
		authorAvatarUrl: string | null;
		date: string;
	};
	type LapseEntry = {
		id: string;
		name: string;
		description: string;
		visibility: string;
		thumbnailUrl: string | null;
		playbackUrl: string | null;
		duration: number;
		createdAt: number;
		ownerHandle: string;
		hackatimeProject: string | null;
	};
	type LookoutEntry = {
		token: string;
		name: string;
		status: string;
		trackedSeconds: number;
		screenshotCount: number;
		clientInfo: string | null;
		startedAt: string | null;
		totalActiveSeconds: number;
		createdAt: string;
		thumbnailUrl: string | null;
		videoUrl: string | null;
	};
	type AirtableMatch = {
		id: string;
		url: string;
		hours: number;
		approvedAt: string | null;
		createdAt: string | null;
		playableUrl: string | null;
		codeUrl: string | null;
		isExact: boolean;
		// Which exact-match criteria failed (empty for exact matches). "demo URL"
		// also appears when the project has no demo URL to compare against.
		mismatches: string[];
	};

	const repo = parseRepoUrl(project.codeUrl);
	const checkShipId = pendingShip?.id ?? params.projectId;

	// Clear stale check results eagerly so the client's first poll doesn't
	// pick up completed results from a previous run and stop polling before
	// enqueueChecks (which is fire-and-forget) creates fresh pending results.
	await db.checkResult.deleteMany({ where: { programId: params.programId, shipId: checkShipId } });

	const hackatimeData = (async () => {
		if (!(hackatimeUser && project.hackatimeProjectKeys.length > 0)) {
			return { hackatime: null as { totalSeconds: number; aiSeconds: number; browserSeconds: number; aiAndBrowserSeconds: number; truncated: boolean } | null, trustLevel: null as string | null, trustLogs: [] as TrustLog[], projectBreakdown: [] as { name: string; totalSeconds: number }[], lookoutTokens: [] as string[] };
		}
		try {
			// hackatimeStartDate scopes aggregation to the program's event window —
			// without it, time logged on reused Hackatime projects before the event
			// would inflate the totals (and the checks fed from them).
			const [stats, trustLogs] = await Promise.all([
				getProjectHackatimeStats(hackatimeUser, project.hackatimeProjectKeys, project.hackatimeStartDate),
				getTrustLogs(hackatimeUser).catch((e) => { log.warn('trust logs fetch failed', { error: e }); return [] as TrustLog[]; })
			]);
			const totalSeconds = stats.projects.reduce((s, p) => s + p.totalSeconds, 0);
			const trustLevel = userInfo?.trustLevel ?? null;
			log.debug('hackatime data loaded', { totalSeconds, aiSeconds: stats.aiSeconds, trustLevel, truncated: stats.truncated });
			return {
				hackatime: { totalSeconds, aiSeconds: stats.aiSeconds, browserSeconds: stats.browserSeconds, aiAndBrowserSeconds: stats.aiAndBrowserSeconds, truncated: stats.truncated },
				trustLevel,
				trustLogs,
				projectBreakdown: stats.projects.map((p) => ({ name: p.name, totalSeconds: p.totalSeconds })),
				lookoutTokens: stats.lookoutTokens
			};
		} catch (e) {
			log.error('hackatime integration failed', e);
			return { hackatime: null, trustLevel: null, trustLogs: [], projectBreakdown: [], lookoutTokens: [] as string[] };
		}
	})();

	const airtableData = (async () => {
		try {
			const records = await findRecordsByUrl(project.demoUrl ?? '', project.codeUrl);
			const normDemoUrl = normalizeAirtableUrl(project.demoUrl ?? '');
			const normCodeUrl = normalizeAirtableUrl(project.codeUrl);
			const authorNameParts = author.name.toLowerCase().split(/\s+/).filter(Boolean);
			const airtableRecords: AirtableMatch[] = records.map((r) => {
				const recPlayable = normalizeAirtableUrl(r.fields['Playable URL'] ?? '');
				const recCode = normalizeAirtableUrl(r.fields['Code URL'] ?? '');
				const repoMatches = !!(normCodeUrl && recCode === normCodeUrl);
				const demoMatches = !!(normDemoUrl && recPlayable === normDemoUrl);
				const recFirst = (r.fields['First Name'] ?? '').toLowerCase().trim();
				const recLast = (r.fields['Last Name'] ?? '').toLowerCase().trim();
				const nameMatches = authorNameParts.length > 0 && !!(
					(recFirst && authorNameParts.includes(recFirst)) ||
					(recLast && authorNameParts.includes(recLast))
				);
				const isExact = repoMatches && demoMatches && nameMatches;
				const mismatches = [
					...(repoMatches ? [] : ['code URL']),
					...(demoMatches ? [] : [normDemoUrl ? 'demo URL' : 'demo URL (project has none)']),
					...(nameMatches ? [] : ['author name'])
				];
				return {
					id: r.fields['ID'] ?? r.id,
					url: airtableRecordUrl(r.id),
					hours: r.fields['Override Hours Spent'] ?? r.fields['Hours Spent'] ?? 0,
					approvedAt: r.fields['Approved At'] ?? r.fields['Created'] ?? null,
					createdAt: r.fields['Created'] ?? null,
					playableUrl: r.fields['Playable URL'] ?? null,
					codeUrl: r.fields['Code URL'] ?? null,
					isExact,
					mismatches
				};
			});
			const airtablePreviousHours = airtableRecords.filter((r) => r.isExact).reduce((s, r) => s + r.hours, 0);
			log.debug('airtable data loaded', { recordCount: airtableRecords.length, previousHours: airtablePreviousHours });
			return { airtableRecords, airtablePreviousHours };
		} catch (e) {
			log.error('airtable integration failed', e);
			return { airtableRecords: [] as AirtableMatch[], airtablePreviousHours: 0 };
		}
	})();

	const githubData = (async () => {
		if (!repo) return { githubCommits: [] as GhCommit[], githubReadme: null as string | null, githubIsPublic: false };
		try {
			// repo.branch is a best-effort hint from /tree/<branch> URLs; it can be
			// wrong (slashed branch names parse as the first segment), so fall back
			// to the default branch rather than failing the whole GitHub block.
			const [commits, repoInfo, readme] = await Promise.all([
				repo.branch
					? getCommits(repo.owner, repo.repo, { sha: repo.branch }).catch(() => getCommits(repo.owner, repo.repo))
					: getCommits(repo.owner, repo.repo),
				getRepoInfo(repo.owner, repo.repo),
				getReadme(repo.owner, repo.repo)
			]);
			log.debug('github data loaded', { commitCount: commits.length, isPublic: repoInfo.isPublic });
			return { githubCommits: commits, githubIsPublic: repoInfo.isPublic, githubReadme: readme };
		} catch (e) {
			log.error('github integration failed', e);
			return { githubCommits: [] as GhCommit[], githubReadme: null as string | null, githubIsPublic: false };
		}
	})();

	// Other projects by the same author. FETCH_AUTHOR_PROJECTS is an optional
	// protocol action — endpoints that don't implement it return INVALID_ACTION,
	// in which case the section is hidden entirely (supported: false).
	const authorProjectsData = (async () => {
		try {
			const result = await client.fetchAuthorProjects({
				authorId: project.authorId,
				excludeProjectId: project.id
			});
			// Defensive: exclude the current project even if the endpoint ignored excludeProjectId.
			const projects = result.projects.filter((p) => p.id !== project.id);
			log.debug('author projects loaded', { count: projects.length });
			return { supported: true, projects };
		} catch (e) {
			if (e instanceof ProtocolError) {
				log.debug('author projects unavailable', { status: e.status, code: e.errorCode });
			} else {
				log.warn('author projects fetch failed', { error: e });
			}
			return { supported: false, projects: [] };
		}
	})();

	// The per-user reviewer note shown on the author's user card. FETCH_USER_NOTE
	// is an optional protocol action — endpoints that don't implement it return
	// INVALID_ACTION, in which case the note UI is hidden entirely (supported: false).
	const userNoteData = (async () => {
		try {
			const result = await client.fetchUserNote({ userId: project.authorId });
			return { supported: true, note: result.note ?? null };
		} catch (e) {
			if (e instanceof ProtocolError) {
				log.debug('user note unavailable', { status: e.status, code: e.errorCode });
			} else {
				log.warn('user note fetch failed', { error: e });
			}
			return { supported: false, note: null };
		}
	})();

	const lapseData = (async () => {
		if (!(hackatimeUser && project.hackatimeProjectKeys.length > 0)) return { lapseTimelapses: [] as LapseEntry[] };
		try {
			const timelapses = await getLapseTimelapses(hackatimeUser, project.hackatimeProjectKeys);
			log.debug('lapse data loaded', { timelapseCount: timelapses.length });
			return { lapseTimelapses: timelapses.map((t) => ({ ...t })) };
		} catch (e) {
			log.error('lapse integration failed', e);
			return { lapseTimelapses: [] as LapseEntry[] };
		}
	})();

	// Lookout screen-recording sessions are discovered from the project's
	// Hackatime heartbeats (language "Lookout", entity = session token), so this
	// piggybacks on hackatimeData's heartbeat fetch instead of doing its own.
	const lookoutData = (async () => {
		try {
			const ht = await hackatimeData;
			if (ht.lookoutTokens.length === 0) return { lookoutSessions: [] as LookoutEntry[] };
			const sessions = await getLookoutSessions(ht.lookoutTokens);
			log.debug('lookout data loaded', { sessionCount: sessions.length });
			return { lookoutSessions: sessions as LookoutEntry[] };
		} catch (e) {
			log.error('lookout integration failed', e);
			return { lookoutSessions: [] as LookoutEntry[] };
		}
	})();

	// Enqueue checks once hackatime + github + airtable resolve (don't wait for lapse)
	Promise.all([hackatimeData, airtableData, githubData]).then(([ht, at, gh]) => {
		log.debug('checks context ready', { projectId: params.projectId });
		const checkCtx: CheckContext = {
			project,
			ship: pendingShip ?? {
				id: params.projectId,
				hoursSubmitted: 0,
				submittedAt: new Date().toISOString(),
				status: 'pending' as const
			},
			timeline: timeline.events,
			hackatime:
				hackatimeUser && project.hackatimeProjectKeys.length > 0
					? {
							username: hackatimeUser,
							totalSeconds: ht.hackatime?.totalSeconds ?? 0,
							aiSeconds: ht.hackatime?.aiSeconds ?? 0,
							projectKeys: project.hackatimeProjectKeys,
							trustLevel: ht.trustLevel
						}
					: null,
			github: repo
				? {
						owner: repo.owner,
						repo: repo.repo,
						commits: gh.githubCommits.map((c) => ({
							sha: c.sha,
							message: c.message,
							date: c.date
						})),
						readmeContent: gh.githubReadme,
						isPublic: gh.githubIsPublic
					}
				: null,
			airtable: {
				existingRecords: [],
				totalPreviousHours: at.airtablePreviousHours
			}
		};
		enqueueChecks(params.programId, checkShipId, checkCtx).catch((e) => {
			log.error('failed to enqueue checks', e);
		});
	}).catch((e) => {
		log.error('failed to build checks context', e);
	});
	tTotal.end({ projectId: params.projectId });

	// Serialize actors map for the client
	const actorsObj: Record<string, { name: string; avatarUrl: string | null }> = {};
	for (const [id, actor] of actors) {
		actorsObj[id] = { name: actor.name, avatarUrl: actor.avatarUrl };
	}

	function formatJoinDate(date: Date): string {
		const diffMs = Date.now() - date.getTime();
		const days = Math.floor(diffMs / 86400000);
		if (days < 30) return `Joined ${days}d ago`;
		const months = Math.floor(days / 30.44);
		if (months < 12) return `Joined ${months}mo ago`;
		const years = Math.floor(months / 12);
		const remainMonths = months % 12;
		if (remainMonths === 0) return `Joined ${years}yr ago`;
		return `Joined ${years}yr ${remainMonths}mo ago`;
	}

	// Merge pending approvals into timeline
	const pendingApprovals = await db.pendingApproval.findMany({
		where: { programId: params.programId, projectId: params.projectId }
	});

	const shipStatusMap = Object.fromEntries(project.ships.map((s) => [s.id, s.status]));
	const pendingHqShipIds = new Set(
		project.ships.filter((s) => s.status === 'pending_hq').map((s) => s.id)
	);

	// Group approval events by ship to detect multi-approval (HQ authorization) patterns.
	const approvalsByShip = new Map<string, Array<Extract<typeof timeline.events[number], { type: 'approval' }>>>();
	for (const event of timeline.events) {
		if (event.type === 'approval') {
			const list = approvalsByShip.get(event.shipId) ?? [];
			list.push(event);
			approvalsByShip.set(event.shipId, list);
		}
	}

	// Ships with 2+ approvals where the ship is now approved = HQ authorized.
	// First approval is the reviewer, last is the HQ authorizer.
	const authorizedByActor: Record<string, string> = {};
	const hqApprovalEvents = new Set<typeof timeline.events[number]>();
	for (const [shipId, approvals] of approvalsByShip) {
		if (approvals.length >= 2 && shipStatusMap[shipId] === 'approved') {
			const sorted = approvals.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			authorizedByActor[shipId] = sorted[sorted.length - 1].actorId;
			hqApprovalEvents.add(sorted[sorted.length - 1]);
		}
	}

	// Find approval events whose ship is no longer approved/pending_hq (i.e. deauthorized).
	// For each, find the subsequent rejection to identify who discarded it.
	const discardedShipIds = new Set<string>();
	const discardedByActor: Record<string, string> = {};
	for (const event of timeline.events) {
		if (event.type === 'approval') {
			const status = shipStatusMap[event.shipId];
			if (status && status !== 'approved' && status !== 'pending_hq') {
				discardedShipIds.add(event.shipId);
			}
		}
	}
	for (const event of timeline.events) {
		if (event.type === 'rejection' && discardedShipIds.has(event.shipId) && !discardedByActor[event.shipId]) {
			discardedByActor[event.shipId] = event.actorId;
		}
	}

	const mergedTimeline = [...timeline.events]
		.map((event) => {
			if (event.type === 'approval' && pendingHqShipIds.has(event.shipId)) {
				return {
					type: 'pending_approval' as const,
					id: `hq:${event.shipId}`,
					shipId: event.shipId,
					actorId: event.actorId,
					hoursAssigned: event.hoursAssigned,
					rewardedHoursOverride: event.rewardedHoursOverride,
					feedbackMessage: event.feedbackMessage,
					justification: event.justification,
					fields: event.fields,
					timestamp: event.timestamp
				};
			}
			if (event.type === 'approval' && discardedShipIds.has(event.shipId)) {
				return {
					type: 'discarded_approval' as const,
					id: `disc:${event.shipId}`,
					shipId: event.shipId,
					actorId: event.actorId,
					discardedByActorId: discardedByActor[event.shipId] ?? event.actorId,
					hoursAssigned: event.hoursAssigned,
					rewardedHoursOverride: event.rewardedHoursOverride,
					feedbackMessage: event.feedbackMessage,
					justification: event.justification,
					fields: event.fields,
					timestamp: event.timestamp
				};
			}
			if (event.type === 'approval' && authorizedByActor[event.shipId] && !hqApprovalEvents.has(event)) {
				return {
					type: 'authorized_approval' as const,
					shipId: event.shipId,
					actorId: event.actorId,
					authorizedByActorId: authorizedByActor[event.shipId],
					hoursAssigned: event.hoursAssigned,
					hoursDeflated: event.hoursDeflated,
					rewardedHoursOverride: event.rewardedHoursOverride,
					feedbackMessage: event.feedbackMessage,
					justification: event.justification,
					fields: event.fields,
					timestamp: event.timestamp
				};
			}
			return event;
		})
		.filter((event) => {
			if (event.type === 'rejection' && discardedShipIds.has(event.shipId)) {
				const actorId = discardedByActor[event.shipId];
				if (actorId === event.actorId) {
					delete discardedByActor[event.shipId];
					return false;
				}
			}
			// Filter out the HQ approval event (absorbed into the authorized_approval pill)
			if (hqApprovalEvents.has(event as typeof timeline.events[number])) {
				return false;
			}
			return true;
		});

	for (const pa of pendingApprovals) {
		actorIds.add(pa.reviewerId);
		if (pa.discardedById) actorIds.add(pa.discardedById);

		if (pa.status === 'discarded') {
			mergedTimeline.push({
				type: 'discarded_approval',
				id: pa.id,
				shipId: pa.shipId,
				actorId: pa.reviewerId,
				discardedByActorId: pa.discardedById!,
				hoursAssigned: pa.hoursAssigned,
				rewardedHoursOverride: pa.rewardedHoursOverride ?? undefined,
				feedbackMessage: pa.feedbackMessage,
				justification: pa.justification,
				fields: (pa.fields as Record<string, string | number | boolean>) ?? undefined,
				timestamp: pa.createdAt.toISOString()
			});
		} else {
			mergedTimeline.push({
				type: 'pending_approval',
				id: pa.id,
				shipId: pa.shipId,
				actorId: pa.reviewerId,
				hoursAssigned: pa.hoursAssigned,
				rewardedHoursOverride: pa.rewardedHoursOverride ?? undefined,
				feedbackMessage: pa.feedbackMessage,
				justification: pa.justification,
				fields: (pa.fields as Record<string, string | number | boolean>) ?? undefined,
				timestamp: pa.createdAt.toISOString()
			});
		}
	}

	mergedTimeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	// Re-resolve actors if we added new ones from pending approvals
	if (pendingApprovals.length > 0) {
		const allActors = await resolveActorIds([...actorIds]);
		for (const [id, actor] of allActors) {
			actorsObj[id] = { name: actor.name, avatarUrl: actor.avatarUrl };
		}
	}

	const [rejectionTemplates, tagDefinitions, tagAssignments] = await Promise.all([
		db.rejectionTemplate.findMany({
			where: { programId: params.programId },
			orderBy: { createdAt: 'asc' },
			select: { id: true, name: true, feedbackMessage: true, internalMessage: true }
		}),
		db.projectTagDefinition.findMany({
			where: { programId: params.programId },
			orderBy: { label: 'asc' },
			select: { id: true, label: true, color: true }
		}),
		db.projectTagAssignment.findMany({
			where: { programId: params.programId, projectId: params.projectId },
			select: { tagId: true }
		})
	]);

	return {
		project,
		tagDefinitions,
		assignedTagIds: tagAssignments.map((a) => a.tagId),
		pendingShip: pendingShip ?? null,
		rejectionTemplates,
		author: {
			name: author.name,
			email: author.email,
			avatarUrl: author.avatarUrl,
			slackId: author.slackId,
			hackatimeId: authorUser?.hackatimeId ?? project.hackatimeId ?? null,
			joinDate: authorUser ? formatJoinDate(authorUser.createdAt) : ''
		},
		actors: actorsObj,
		timeline: mergedTimeline,
		pendingCount: stats.pendingReviewCount,
		hackatimeData,
		airtableData,
		githubData,
		lapseData,
		lookoutData,
		authorProjectsData,
		userNoteData,
		checkShipId,
		checks: CHECKS.map((c) => ({
			id: c.id,
			name: c.description,
			status: 'pending' as const,
			passed: false,
			summary: '',
			severity: c.severity
		})),
		canReview: membership.canCreateReviews,
		canAuthorize: membership.canAuthorizeReviews,
		programYswsName: program.yswsName || program.name,
		hackatimeUser: hackatimeUser && project.hackatimeProjectKeys.length > 0 ? hackatimeUser : null,
		authorTimezone
	};
};

export const actions: Actions = {
	review: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) throw error(401);

		const membership = await requirePermission(user.id, params.programId, 'canCreateReviews', {
			isSuperAdmin: user.isSuperAdmin
		});

		const program = await db.program.findUniqueOrThrow({
			where: { id: params.programId }
		});

		const formData = await request.formData();
		const action = formData.get('action') as string;
		const shipId = formData.get('shipId') as string;
		const fieldsRaw = formData.get('fields') as string | null;
		const fields = fieldsRaw ? JSON.parse(fieldsRaw) as Record<string, string | number | boolean> : undefined;
		const rewardedOverrideRaw = formData.get('rewardedHoursOverride') as string | null;
		const rewardedHoursOverride =
			rewardedOverrideRaw != null && rewardedOverrideRaw !== '' && Number.isFinite(parseFloat(rewardedOverrideRaw))
				? parseFloat(rewardedOverrideRaw)
				: undefined;

		log.info('review action', { action, shipId, projectId: params.projectId, userId: user.id });

		const reviewerId = user.slackId || user.hcaId;

		// Non-HQ approvals go to pending queue instead of master endpoint
		if (action === 'approve' && !membership.canAuthorizeReviews) {
			log.info('queuing pending approval (non-HQ user)', { shipId, projectId: params.projectId });
			await db.pendingApproval.upsert({
				where: {
					programId_shipId_reviewerId: {
						programId: params.programId,
						shipId,
						reviewerId
					}
				},
				create: {
					programId: params.programId,
					projectId: params.projectId,
					shipId,
					reviewerId,
					hoursAssigned: parseFloat(formData.get('hoursAssigned') as string),
					rewardedHoursOverride: rewardedHoursOverride ?? null,
					feedbackMessage: formData.get('feedbackMessage') as string,
					justification: formData.get('justification') as string,
					fields: fields ?? undefined
				},
				update: {
					hoursAssigned: parseFloat(formData.get('hoursAssigned') as string),
					rewardedHoursOverride: rewardedHoursOverride ?? null,
					feedbackMessage: formData.get('feedbackMessage') as string,
					justification: formData.get('justification') as string,
					fields: fields ?? undefined
				}
			});

			await db.auditLog.create({
				data: {
					programId: params.programId,
					userId: user.id,
					action: 'review_pending_approve',
					entityType: 'ship',
					entityId: shipId,
					metadata: {
						projectId: params.projectId,
						hoursAssigned: (formData.get('hoursAssigned') as string) || null,
						rewardedHoursOverride: rewardedHoursOverride ?? null
					}
				}
			});

			log.info('review queued for hq approval', { shipId, projectId: params.projectId });
			return { success: true };
		}

		const client = new ProtocolClient(program.masterEndpoint, program.secretKey);

		let input: SubmitReviewActionInput;
		const base = { shipId, reviewerId };

		switch (action) {
			case 'approve':
				// Only reachable for HQ users — non-HQ approvals were queued above.
				input = {
					...base,
					action: 'approve',
					hoursAssigned: parseFloat(formData.get('hoursAssigned') as string),
					rewardedHoursOverride,
					feedbackMessage: formData.get('feedbackMessage') as string,
					justification: formData.get('justification') as string,
					isHq: membership.canAuthorizeReviews,
					fields
				};
				break;
			case 'reject':
				input = {
					...base,
					action: 'reject',
					feedbackMessage: formData.get('feedbackMessage') as string,
					internalMessage: (formData.get('internalMessage') as string) || undefined,
					isHq: membership.canAuthorizeReviews,
					fields
				};
				break;
			case 'comment':
			case 'internal_comment': {
				const commentText = (formData.get('commentText') as string | null) ?? '';
				if (!commentText.trim()) throw error(400, 'Comment text is required');
				input = {
					...base,
					action: action as 'comment' | 'internal_comment',
					commentText
				};
				break;
			}
			default:
				throw error(400, `Unknown action: ${action}`);
		}

		let result;
		try {
			result = await client.submitReviewAction(input);
		} catch (e) {
			if (e instanceof ProtocolError) {
				log.error('protocol error during review action', e, { action, shipId });
				return fail(502, { protocolError: `Upstream error: ${e.displayMessage}` });
			}
			throw e;
		}

		await db.auditLog.create({
			data: {
				programId: params.programId,
				userId: user.id,
				action: `review_${action}`,
				entityType: 'ship',
				entityId: shipId,
				metadata: {
					projectId: params.projectId,
					hoursAssigned: (formData.get('hoursAssigned') as string) || null,
					rewardedHoursOverride: rewardedHoursOverride ?? null
				}
			}
		});

		log.info('review action complete', { action, shipId, success: result.success });

		return { success: result.success };
	}
};
