<script lang="ts">
	import { createLogger } from '$lib/logger.js';
	import { invalidateAll } from '$app/navigation';
	import { applyAction, deserialize } from '$app/forms';
	import { resolve } from '$app/paths';
	import { AlertTriangle, X, Plus, Check } from 'lucide-svelte';
	import type { PageData } from './$types.js';

	const log = createLogger('ReviewPage');
	import UserCard from '$lib/components/ui/UserCard.svelte';
	import HourBreakdown from '$lib/components/review/HourBreakdown.svelte';
	import ProjectCard from '$lib/components/review/ProjectCard.svelte';
	import CheckList from '$lib/components/review/CheckList.svelte';
	import Timeline from '$lib/components/review/Timeline.svelte';
	import ReviewActionPanel from '$lib/components/review/ReviewActionPanel.svelte';
	import MultiSourceDetails from '$lib/components/review/MultiSourceDetails.svelte';
	import AirtableRecords from '$lib/components/review/AirtableRecords.svelte';
	import HackatimeViewer from '$lib/components/review/HackatimeViewer.svelte';
	import OtherProjects from '$lib/components/review/OtherProjects.svelte';
	import ProjectTags from '$lib/components/review/ProjectTags.svelte';
	import { ChevronLeft } from 'lucide-svelte';
	import type { TimelineEvent as TEvent, ReviewFieldDefinition } from '$lib/server/protocol/types.js';
	import { isUuid, shortenId } from '$lib/utils/id';
	import { normalizeTags } from '$lib/utils/tags';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		PROJECT_DETAILS_EXPORT_SCHEMA_VERSION,
		type ProjectDetailsExport
	} from '$lib/review/projectDetailsExport.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let submitting = $state(false);
	let reviewPanelRef = $state<HTMLElement | null>(null);
	let authorizing = $state<string | null>(null);
	let protocolError = $state<string | null>(null);
	let countFuzzyAirtable = $state(false);
	// Hour-breakdown toggles: which deductions the reviewer counts toward the
	// remaining hours. Airtable records are keyed by their record URL.
	let excludeAi = $state(true);
	let excludeBrowsers = $state(false);
	let uncountedAirtableShips = $state<Record<string, boolean>>({});
	// GitHub-tab user filter, shared with the Hackatime day-marker commit tooltips.
	let commitAuthorFilter = $state<string | null>(null);

	// Program-defined project tags — optimistic local set (writable derived, so it
	// resyncs from server data on navigation/invalidation).
	let assignedTagIds = $derived(new SvelteSet(data.assignedTagIds));
	let tagMenuOpen = $state(false);
	let savingTags = $state(false);

	const assignedCustomTags = $derived(data.tagDefinitions.filter((t) => assignedTagIds.has(t.id)));

	async function toggleAssignedTag(tagId: string) {
		const prev = [...assignedTagIds];
		if (assignedTagIds.has(tagId)) assignedTagIds.delete(tagId);
		else assignedTagIds.add(tagId);
		savingTags = true;
		try {
			const res = await fetch(
				`/api/programs/${data.program.id}/projects/${encodeURIComponent(data.project.id)}/tags`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ tagIds: [...assignedTagIds] })
				}
			);
			if (!res.ok) assignedTagIds = new SvelteSet(prev);
		} catch {
			assignedTagIds = new SvelteSet(prev);
		} finally {
			savingTags = false;
		}
	}

	function handleTagMenuWindowClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-tags-dropdown]')) tagMenuOpen = false;
	}

	$effect(() => {
		if (tagMenuOpen) {
			window.addEventListener('click', handleTagMenuWindowClick, true);
			return () => window.removeEventListener('click', handleTagMenuWindowClick, true);
		}
	});

	function normalizeForCompare(s: string): string {
		return s.toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	// Custom review field definitions by name, merged across all ships (the
	// program only sends them on pending ships, but the names/labels are stable
	// program-wide) — lets the timeline label field values and render markdown
	// fields as boxes.
	const reviewFieldDefs = $derived.by(() => {
		const defs: Record<string, ReviewFieldDefinition> = {};
		for (const ship of data.project.ships) {
			for (const def of [...(ship.approveFields ?? []), ...(ship.rejectFields ?? [])]) {
				defs[def.name] = def;
			}
		}
		return defs;
	});

	let hackatime = $state<Awaited<typeof data.hackatimeData> | null>(null);
	let airtable = $state<Awaited<typeof data.airtableData> | null>(null);
	let github = $state<Awaited<typeof data.githubData> | null>(null);
	let lapse = $state<Awaited<typeof data.lapseData> | null>(null);
	let lookout = $state<Awaited<typeof data.lookoutData> | null>(null);
	let authorProjects = $state<Awaited<typeof data.authorProjectsData> | null>(null);
	let userNote = $state<Awaited<typeof data.userNoteData> | null>(null);

	$effect(() => {
		hackatime = null;
		data.hackatimeData.then((v) => {
			hackatime = v;
		});
	});
	$effect(() => {
		airtable = null;
		data.airtableData.then((v) => {
			airtable = v;
		});
	});
	$effect(() => {
		github = null;
		data.githubData.then((v) => {
			github = v;
		});
	});
	$effect(() => {
		lapse = null;
		data.lapseData.then((v) => {
			lapse = v;
		});
	});
	$effect(() => {
		lookout = null;
		data.lookoutData.then((v) => {
			lookout = v;
		});
	});
	$effect(() => {
		authorProjects = null;
		data.authorProjectsData.then((v) => {
			authorProjects = v;
		});
	});
	$effect(() => {
		userNote = null;
		data.userNoteData.then((v) => {
			userNote = v;
		});
	});

	async function handleSaveUserNote(note: string): Promise<boolean> {
		log.info('Saving user note', { userId: data.project.authorId, cleared: !note });
		try {
			const res = await fetch(`/api/programs/${data.program.id}/user-note`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: data.project.authorId, note: note || null })
			});
			if (!res.ok) {
				log.error('User note save failed', { status: res.status });
				return false;
			}
			if (userNote) userNote = { ...userNote, note: note || null };
			return true;
		} catch (e) {
			log.error('User note save failed', { error: e });
			return false;
		}
	}

	// Hours come through as raw floats (e.g. 35.71222…) — show at most 2 decimals,
	// dropping any trailing zeros so whole hours render without a decimal point.
	function fmtHrs(hours: number): string {
		return `${Math.round(hours * 100) / 100}`;
	}

	type ReviewMarker = {
		type: 'commit' | 'approval' | 'rejection' | 'comment' | 'ship' | 'airtable';
		timestamp: string;
		title: string;
		subtitle?: string;
		avatarUrl?: string;
		authorKey?: string;
	};

	const reviewMarkers = $derived.by<ReviewMarker[]>(() => {
		const out: ReviewMarker[] = [];

		for (const e of data.timeline) {
			const actor = data.actors[e.actorId];
			const name = actor?.name ?? 'Unknown';
			const avatarUrl = actor?.avatarUrl ?? undefined;
			if (e.type === 'ship') {
				out.push({
					type: 'ship',
					timestamp: e.timestamp,
					title: `${name} shipped`,
					subtitle: `${fmtHrs(e.hoursSubmitted)}h submitted`,
					avatarUrl
				});
			} else if (
				e.type === 'approval' ||
				e.type === 'authorized_approval' ||
				e.type === 'pending_approval'
			) {
				out.push({
					type: 'approval',
					timestamp: e.timestamp,
					title: `${name} approved for ${fmtHrs(e.hoursAssigned)}h`,
					subtitle: e.feedbackMessage || undefined,
					avatarUrl
				});
			} else if (e.type === 'rejection') {
				out.push({
					type: 'rejection',
					timestamp: e.timestamp,
					title: `${name} rejected`,
					subtitle: e.feedbackMessage || undefined,
					avatarUrl
				});
			} else if (e.type === 'comment') {
				out.push({
					type: 'comment',
					timestamp: e.timestamp,
					title: `${name} commented`,
					subtitle: e.message,
					avatarUrl
				});
			}
		}

		for (const c of github?.githubCommits ?? []) {
			out.push({
				type: 'commit',
				timestamp: c.date,
				title: c.message.split('\n')[0],
				subtitle: c.author,
				avatarUrl: c.authorAvatarUrl ?? undefined,
				// Must match MultiSourceDetails' commitAuthorKey so the filter lines up.
				authorKey: c.authorLogin ?? c.author
			});
		}

		// Fuzzy matches may belong to other projects, so they're only marked while
		// the "count fuzzy matches" checkbox on the Airtable Records card is on.
		for (const r of airtable?.airtableRecords ?? []) {
			if (!r.createdAt) continue;
			if (!r.isExact && !countFuzzyAirtable) continue;
			out.push({
				type: 'airtable',
				timestamp: r.createdAt,
				title: r.isExact ? 'Airtable record created' : 'Airtable record created (fuzzy match)',
				subtitle: `${r.id} · ${fmtHrs(r.hours)}h`
			});
		}

		return out;
	});

	let polledChecks = $state<typeof data.checks | null>(null);
	const checks = $derived(polledChecks ?? data.checks);

	$effect(() => {
		const shipId = data.checkShipId;
		const programId = data.program.id;
		if (!shipId) return;

		let active = true;
		let pollCount = 0;
		log.info('Starting check polling', { shipId, programId });

		const poll = async () => {
			if (!active) return;
			pollCount++;
			try {
				const res = await fetch(`/api/programs/${programId}/checks/${shipId}`);
				if (!res.ok || !active) {
					if (!res.ok) log.warn('Check poll returned non-ok', { status: res.status, pollCount });
					return;
				}
				const result = await res.json();
				if (result.checks.length > 0) {
					polledChecks = result.checks;
				}
				log.trace('Check poll result', {
					pollCount,
					allCompleted: result.allCompleted,
					checkCount: result.checks?.length
				});
				if (result.allCompleted) {
					log.info('All checks completed', { pollCount });
					active = false;
				}
			} catch (e) {
				log.debug('Check poll error (expected during loading)', e);
			}
		};

		const interval = setInterval(poll, 1500);
		const timeout = setTimeout(() => {
			log.warn('Check polling timed out after 120s', { shipId, pollCount });
			active = false;
		}, 120000);

		return () => {
			active = false;
			clearInterval(interval);
			clearTimeout(timeout);
			log.debug('Check polling stopped', { shipId, pollCount });
		};
	});

	// The changelog baseline is the last *reviewed* ship before the pending one.
	// Re-ship sequences can put several never-reviewed pending ships in between —
	// diffing against those would hide work the reviewer hasn't seen yet.
	const previousReviewedShip = $derived.by(() => {
		if (!data.pendingShip) return null;
		const ships = data.project.ships;
		const pendingIdx = ships.findIndex((s) => s.id === data.pendingShip!.id);
		const before = pendingIdx >= 0 ? ships.slice(0, pendingIdx) : ships;
		return before.findLast((s) => s.status === 'approved' || s.status === 'rejected') ?? null;
	});

	const changelogContext = $derived.by(() => {
		if (!previousReviewedShip || !data.pendingShip || !data.project.codeUrl) return null;

		const dayMs = 86400000;
		const sinceDate = new Date(
			new Date(previousReviewedShip.submittedAt).getTime() - dayMs
		).toISOString();
		const untilRaw = new Date(new Date(data.pendingShip.submittedAt).getTime() + dayMs);
		const today = new Date();
		const untilDate = (untilRaw > today ? today : untilRaw).toISOString();

		return {
			programId: data.program.id,
			repoUrl: data.project.codeUrl,
			previousShipDate: sinceDate,
			currentShipDate: untilDate
		};
	});

	const overviewContext = $derived.by(() => {
		if (previousReviewedShip || !data.pendingShip || !data.project.codeUrl) return null;
		return {
			programId: data.program.id,
			repoUrl: data.project.codeUrl,
			projectTitle: data.project.title,
			projectDescription: data.project.description
		};
	});

	// An approval already awaiting HQ authorization on the pending ship blocks new
	// verdicts — authorizers act on the timeline instead, and we must not stack a
	// second approval on top of the queued one.
	const hasPendingApproval = $derived(
		data.pendingShip?.status === 'pending_hq' ||
			data.timeline.some((e) => e.type === 'pending_approval' && e.shipId === data.pendingShip?.id)
	);

	// Map shipId → approved hours from timeline events (accounts for reviewer deflation)
	const approvedHoursMap = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const event of data.timeline) {
			if (event.type === 'approval' || event.type === 'authorized_approval') {
				map[event.shipId] = event.hoursAssigned;
			}
		}
		return map;
	});

	const shippedDeltaHours = $derived.by(() => {
		if (!data.pendingShip) return undefined;
		const ships = data.project.ships;
		const lastApprovedCumulative = ships
			.filter((s) => s.id !== data.pendingShip!.id && s.status === 'approved')
			.reduce((max, s) => Math.max(max, s.hoursSubmitted), 0);
		// Some programs (e.g. Beest) don't report claimed hours on pending ships
		// and send 0 — treat the claim as unknown rather than "0 new hours", and
		// estimate from Hackatime time minus what approved ships already covered.
		if (data.pendingShip.hoursSubmitted <= 0) {
			if (lastApprovedCumulative <= 0 || !hackatime?.hackatime) return undefined;
			return Math.max(0, hackatime.hackatime.totalSeconds / 3600 - lastApprovedCumulative);
		}
		return Math.max(0, data.pendingShip.hoursSubmitted - lastApprovedCumulative);
	});

	// Records from *other* programs that already credited hours to this project.
	// Structured as early returns rather than `(a || b) && c && d` — Svelte 5.55's
	// dev transform drops the parentheses when reprinting such expressions, which
	// silently changes the operator precedence.
	function isExternalPreviousRecord(r: { isExact: boolean; hours: number; id: string }): boolean {
		if (!countFuzzyAirtable && !r.isExact) return false;
		if (r.hours <= 0) return false;
		const recProgram = normalizeForCompare(r.id.split('–')[0]?.trim() || r.id);
		return recProgram !== normalizeForCompare(data.programYswsName);
	}

	// Only records the reviewer hasn't unchecked in the hour breakdown count.
	const externalPreviousHours = $derived.by(() => {
		if (!airtable?.airtableRecords) return 0;
		return airtable.airtableRecords
			.filter((r) => isExternalPreviousRecord(r) && !uncountedAirtableShips[r.url])
			.reduce((sum, r) => sum + r.hours, 0);
	});

	const remainingHours = $derived.by(() => {
		const delta = shippedDeltaHours;
		if (!hackatime?.hackatime) return delta ?? 0;
		const ht = hackatime.hackatime;
		const totalH = ht.totalSeconds / 3600;
		const baseH = delta != null ? Math.min(totalH, delta) : totalH;
		const excludedSeconds =
			excludeAi && excludeBrowsers
				? ht.aiAndBrowserSeconds
				: excludeAi
					? ht.aiSeconds
					: excludeBrowsers
						? ht.browserSeconds
						: 0;
		const exclRatio = totalH > 0 ? excludedSeconds / 3600 / totalH : 0;
		return Math.max(0, baseH - baseH * exclRatio - externalPreviousHours);
	});

	// Snapshot of everything the reviewer currently sees, shaped to the shared
	// ProjectDetailsExport schema. Integration sections start null and populate
	// as their async sources resolve, so an early copy may legitimately omit them.
	// `exportedAt` is stamped at copy time by ProjectCard, not here.
	const projectDetailsExport = $derived<ProjectDetailsExport>({
		schemaVersion: PROJECT_DETAILS_EXPORT_SCHEMA_VERSION,
		exportedAt: '',
		program: { id: data.program.id, name: data.program.name },
		project: {
			id: data.project.id,
			title: data.project.title,
			description: data.project.description,
			screenshotUrl: data.project.screenshotUrl ?? null,
			demoUrl: data.project.demoUrl ?? null,
			codeUrl: data.project.codeUrl,
			hackatimeProjectKeys: data.project.hackatimeProjectKeys,
			tags: normalizeTags(data.project.tags)
		},
		author: {
			name: data.author.name,
			email: data.author.email ?? null,
			avatarUrl: data.author.avatarUrl,
			slackId: data.author.slackId ?? null,
			hackatimeId: data.author.hackatimeId,
			joinDate: data.author.joinDate
		},
		ships: data.project.ships.map((s) => ({
			id: s.id,
			hoursSubmitted: s.hoursSubmitted,
			submittedAt: s.submittedAt,
			status: s.status
		})),
		pendingShipId: data.pendingShip?.id ?? null,
		timeline: data.timeline,
		hackatime: hackatime?.hackatime
			? {
					totalSeconds: hackatime.hackatime.totalSeconds,
					aiSeconds: hackatime.hackatime.aiSeconds,
					browserSeconds: hackatime.hackatime.browserSeconds,
					trustLevel: hackatime.trustLevel,
					projectBreakdown: hackatime.projectBreakdown
				}
			: null,
		github: github
			? {
					isPublic: github.githubIsPublic,
					readme: github.githubReadme,
					commits: github.githubCommits
				}
			: null,
		airtable: airtable
			? { records: airtable.airtableRecords, previousHours: airtable.airtablePreviousHours }
			: null,
		lapse: lapse ? { timelapses: lapse.lapseTimelapses } : null,
		lookout: lookout ? { sessions: lookout.lookoutSessions } : null
	});

	async function handleReviewSubmit(reviewData: {
		action: string;
		hoursAssigned?: number;
		rewardedHoursOverride?: number;
		feedbackMessage?: string;
		justification?: string;
		internalMessage?: string;
		commentText?: string;
		fields?: Record<string, string | number | boolean>;
	}) {
		submitting = true;
		log.info('Submitting review', { action: reviewData.action, shipId: data.pendingShip?.id });
		const t = log.time('handleReviewSubmit');

		const formData = new FormData();
		if (data.pendingShip) {
			formData.set('shipId', data.pendingShip.id);
		}
		for (const [key, value] of Object.entries(reviewData)) {
			if (value !== undefined) {
				if (key === 'fields') {
					formData.set(key, JSON.stringify(value));
				} else {
					formData.set(key, String(value));
				}
			}
		}

		const response = await fetch('?/review', { method: 'POST', body: formData });
		const result = deserialize(await response.text());
		t.end('resultType', result.type);
		if (result.type === 'success') {
			protocolError = null;
			log.info('Review submitted successfully');
			await invalidateAll();
		} else if (result.type === 'failure' && result.data?.protocolError) {
			protocolError = result.data.protocolError as string;
			log.error('Review submission protocol error', { protocolError });
		}
		await applyAction(result);
		submitting = false;
	}

	// Save handlers resolve to null on success or an error message to display —
	// TimelineEvent only commits the edit to its display on success.
	async function handleSaveReview(editData: {
		event: TEvent;
		feedbackMessage: string;
		internalMessage?: string;
		justification?: string;
	}): Promise<string | null> {
		const event = editData.event;
		if (event.type !== 'approval' && event.type !== 'rejection') return null;

		log.info('Saving review edit', { shipId: event.shipId, type: event.type });
		const t = log.time('handleSaveReview');
		try {
			const res = await fetch(`/api/programs/${data.program.id}/review/${event.shipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: event.type,
					reviewerId: event.actorId,
					feedbackMessage: editData.feedbackMessage,
					justification: editData.justification,
					internalMessage: editData.internalMessage
				})
			});

			t.end('status', res.status);
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				const message = body?.message ?? `Failed to save (HTTP ${res.status})`;
				log.error('Failed to save review edit', { status: res.status, message });
				return message;
			}
			log.debug('Review edit saved successfully');
			await invalidateAll();
			return null;
		} catch (e) {
			log.error('Failed to save review edit', { error: e });
			return 'Failed to save — check your connection and try again.';
		}
	}

	async function handleAuthorize(pendingApprovalId: string) {
		authorizing = pendingApprovalId;
		log.info('Authorizing pending approval', { pendingApprovalId });
		const t = log.time('handleAuthorize');
		try {
			const res = await fetch(`/api/programs/${data.program.id}/review/authorize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pendingApprovalId, projectId: data.project.id })
			});
			t.end('status', res.status);
			if (res.ok) {
				protocolError = null;
				log.info('Authorization successful', { pendingApprovalId });
				await invalidateAll();
			} else {
				const body = await res.json().catch(() => null);
				protocolError = body?.message ?? `Authorization failed (HTTP ${res.status})`;
				log.error('Authorization failed', { pendingApprovalId, status: res.status, protocolError });
			}
		} finally {
			authorizing = null;
		}
	}

	async function handleDeletePending(pendingApprovalId: string) {
		authorizing = pendingApprovalId;
		log.info('Deleting pending approval', { pendingApprovalId });
		const t = log.time('handleDeletePending');
		try {
			const res = await fetch(`/api/programs/${data.program.id}/review/authorize`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pendingApprovalId, projectId: data.project.id })
			});
			t.end('status', res.status);
			if (res.ok) {
				protocolError = null;
				log.info('Pending approval deleted', { pendingApprovalId });
				await invalidateAll();
			} else {
				const body = await res.json().catch(() => null);
				protocolError = body?.message ?? `Discard failed (HTTP ${res.status})`;
				log.error('Failed to delete pending approval', {
					pendingApprovalId,
					status: res.status,
					protocolError
				});
			}
		} finally {
			authorizing = null;
		}
	}

	async function handleEditPending(
		pendingApprovalId: string,
		reviewerId: string,
		feedbackMessage: string,
		justification: string,
		hoursAssigned: number,
		// undefined = leave untouched (dropped by JSON.stringify), null = clear.
		rewardedHoursOverride: number | null | undefined
	): Promise<string | null> {
		log.info('Editing pending approval', { pendingApprovalId, hoursAssigned });
		const t = log.time('handleEditPending');
		try {
			const res = await fetch(`/api/programs/${data.program.id}/review/authorize`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pendingApprovalId,
					reviewerId,
					feedbackMessage,
					justification,
					hoursAssigned,
					rewardedHoursOverride
				})
			});
			t.end('status', res.status);
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				const message = body?.message ?? `Failed to save (HTTP ${res.status})`;
				log.error('Failed to edit pending approval', { pendingApprovalId, status: res.status, message });
				return message;
			}
			log.debug('Pending approval edited successfully');
			await invalidateAll();
			return null;
		} catch (e) {
			log.error('Failed to edit pending approval', { pendingApprovalId, error: e });
			return 'Failed to save — check your connection and try again.';
		}
	}
</script>

<svelte:head>
	<title>{data.project.title} - {data.program.name} - Sidekick</title>
</svelte:head>

<div class="flex flex-col h-full">
	<div
		class="border-b border-border-input flex h-11 items-center justify-between px-4 shrink-0 min-w-0"
	>
		<div class="flex gap-4 items-center min-w-0 flex-1">
			<a
				href={resolve(`/program/${data.program.id}/review`)}
				class="shrink-0 border border-border-button rounded-md flex gap-1.5 h-8 items-center justify-center px-3 hover:bg-surface transition-colors"
			>
				<ChevronLeft size={14} />
				<span class="font-medium text-sm text-text-subtle tracking-[-0.3px]">Queue</span>
			</a>

			<div class="flex gap-1.5 items-center text-sm tracking-[-0.4px] min-w-0 truncate">
				<span class="text-text-secondary shrink-0" title={isUuid(data.project.id) ? data.project.id : undefined}>#{shortenId(data.project.id)}</span>
				<span class="font-bold truncate">{data.project.title}</span>
				<span class="shrink-0">by</span>
				<div class="flex gap-1 items-center shrink-0">
					{#if data.author.avatarUrl}
						<img src={data.author.avatarUrl} alt="" class="size-[18px] rounded-full object-cover" />
					{/if}
					<span class="font-bold">{data.author.name}</span>
				</div>
			</div>
		</div>

		<div class="flex gap-4 items-center shrink-0 ml-4">
			<span class="text-sm tracking-[-0.3px] hidden lg:inline">
				<span class="font-bold">{data.pendingCount}</span> projects left in queue.
			</span>
		</div>
	</div>

	{#snippet tagPicker()}
		<span class="relative inline-flex" data-tags-dropdown>
			<button
				class="inline-flex items-center gap-1 rounded-tag border border-dashed border-border-input px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-[-0.2px] text-text-tertiary hover:text-text-secondary hover:bg-surface cursor-pointer disabled:opacity-50"
				onclick={() => (tagMenuOpen = !tagMenuOpen)}
				disabled={savingTags}
			>
				<Plus size={10} class="shrink-0" />
				add tag
			</button>
			{#if tagMenuOpen}
				<div class="absolute top-full left-0 mt-1 bg-page border border-border-card rounded-input shadow-lg z-30 min-w-[200px] max-h-[320px] overflow-y-auto py-1">
					{#each data.tagDefinitions as tag (tag.id)}
						<button
							class="w-full text-left px-3 py-1.5 text-sm hover:bg-surface cursor-pointer flex items-center justify-between gap-2 disabled:opacity-50"
							onclick={() => toggleAssignedTag(tag.id)}
							disabled={savingTags}
						>
							<ProjectTags tags={[tag]} />
							{#if assignedTagIds.has(tag.id)}
								<Check size={14} class="text-accent shrink-0" />
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</span>
	{/snippet}

	<div class="flex-1 overflow-auto px-4 md:px-6 wide:px-16 py-10">
		<div class="review-bento gap-3">
			<div class="flex flex-col gap-3" style="grid-area: user">
				<UserCard
					name={data.author.name}
					avatarUrl={data.author.avatarUrl}
					joinDate={data.author.joinDate}
					slackId={data.author.slackId}
					hackatimeId={data.author.hackatimeId}
					email={data.author.email}
					trustLevel={hackatime?.trustLevel ?? null}
					trustLogs={hackatime?.trustLogs ?? []}
					loading={!hackatime}
					noteSupported={userNote?.supported ?? false}
					note={userNote?.note ?? null}
					canEditNote={data.canReview}
					onSaveNote={handleSaveUserNote}
				/>
				<HourBreakdown
					aggregatedSeconds={hackatime?.hackatime?.totalSeconds ?? 0}
					truncated={hackatime?.hackatime?.truncated ?? false}
					shippedHours={shippedDeltaHours}
					aiSeconds={hackatime?.hackatime?.aiSeconds ?? 0}
					browserSeconds={hackatime?.hackatime?.browserSeconds ?? 0}
					aiAndBrowserSeconds={hackatime?.hackatime?.aiAndBrowserSeconds ?? 0}
					previousShips={(airtable?.airtableRecords ?? [])
						.filter((r) => isExternalPreviousRecord(r))
						.map((r) => ({
							key: r.url,
							programName: r.id.split('–')[0]?.trim() || r.id,
							date: '',
							hours: r.hours,
							url: r.url
						}))}
					bind:excludeAi
					bind:excludeBrowsers
					bind:uncountedShips={uncountedAirtableShips}
					loading={!hackatime}
					class="flex-1"
				/>
			</div>

			<div class="project-checks-wrapper">
				<div class="flex-1 min-w-0" style="grid-area: project">
					<ProjectCard
						id={data.project.id}
						title={data.project.title}
						description={data.project.description}
						screenshotUrl={data.project.screenshotUrl}
						demoUrl={data.project.demoUrl ?? ''}
						codeUrl={data.project.codeUrl}
						tags={[...(data.project.tags ?? []), ...assignedCustomTags]}
						tagPicker={data.canReview && data.tagDefinitions.length > 0 ? tagPicker : undefined}
						details={projectDetailsExport}
						class="h-full"
					/>
				</div>

				<div style="grid-area: checks">
					<CheckList {checks} class="h-full" />
				</div>
			</div>

			<div class="flex flex-col gap-3" style="grid-area: timeline">
				{#if protocolError}
					<div
						class="flex items-start gap-2 px-4 py-3 rounded-section bg-check-fail/10 border border-check-fail/30 text-sm text-check-fail"
					>
						<AlertTriangle size={16} class="shrink-0 mt-0.5" />
						<span class="flex-1">{protocolError}</span>
						<button
							onclick={() => (protocolError = null)}
							class="shrink-0 cursor-pointer hover:opacity-70"
						>
							<X size={14} />
						</button>
					</div>
				{/if}
				<Timeline
					events={data.timeline}
					actors={data.actors}
					shipHours={Object.fromEntries(data.project.ships.map((s) => [s.id, s.hoursSubmitted]))}
					approvedShipHours={approvedHoursMap}
					canAuthorize={data.canAuthorize}
					onsave={handleSaveReview}
					fieldDefs={reviewFieldDefs}
					supportsOverride={Object.fromEntries(
						data.project.ships.map((s) => [s.id, s.supportsRewardedOverride ?? false])
					)}
					onauthorize={handleAuthorize}
					ondelete={handleDeletePending}
					oneditpending={handleEditPending}
					{authorizing}
				/>

				{#if data.canReview && data.pendingShip}
					<div bind:this={reviewPanelRef}>
						<ReviewActionPanel
							{remainingHours}
							onsubmit={handleReviewSubmit}
							{submitting}
							changelog={changelogContext}
							overview={overviewContext}
							draftKey={data.project.id}
							approveFields={data.pendingShip.approveFields}
							rejectFields={data.pendingShip.rejectFields}
							rejectionTemplates={data.rejectionTemplates}
							supportsRewardedOverride={data.pendingShip.supportsRewardedOverride ?? false}
							{hasPendingApproval}
						/>
					</div>
				{/if}
			</div>

			<div class="md:relative md:min-h-[32rem]" style="grid-area: multi">
				<div class="flex flex-col gap-3 md:absolute md:inset-0 md:overflow-y-auto">
					<AirtableRecords
						records={airtable?.airtableRecords ?? []}
						loading={!airtable}
						bind:countFuzzy={countFuzzyAirtable}
					/>
					<MultiSourceDetails
						commits={github?.githubCommits ?? []}
						repoUrl={data.project.codeUrl}
						programId={data.program.id}
						loading={!github}
						bind:selectedAuthor={commitAuthorFilter}
						markers={data.timeline
							.filter(
								(e) =>
									e.type === 'ship' ||
									e.type === 'approval' ||
									e.type === 'authorized_approval' ||
									e.type === 'rejection'
							)
							.map((e) => ({
								type: (e.type === 'authorized_approval' ? 'approval' : e.type) as
									| 'ship'
									| 'approval'
									| 'rejection',
								label:
									e.type === 'ship'
										? `${data.actors[e.actorId]?.name ?? 'Unknown'} shipped`
										: e.type === 'approval' || e.type === 'authorized_approval'
											? `Approved for ${fmtHrs((e as Extract<typeof e, { type: 'approval' }>).hoursAssigned)}h`
											: `${data.actors[e.actorId]?.name ?? 'Unknown'} rejected`,
								date: e.timestamp
							}))}
						timelapses={lapse?.lapseTimelapses ?? []}
						lookoutSessions={lookout?.lookoutSessions ?? []}
						class="flex-1 min-h-0"
					/>
				</div>
			</div>

			{#if authorProjects === null || authorProjects.supported}
				<div style="grid-area: others">
					<OtherProjects
						programId={data.program.id}
						projects={authorProjects?.projects ?? []}
						loading={authorProjects === null}
					/>
				</div>
			{/if}

			{#if data.hackatimeUser && data.project.hackatimeProjectKeys.length > 0}
				<div style="grid-area: heartbeats">
					<HackatimeViewer
						hackatimeUser={data.hackatimeUser}
						hackatimeProjectKeys={data.project.hackatimeProjectKeys}
						programId={data.program.id}
						defaultDate={data.pendingShip?.submittedAt
							? new Date(data.pendingShip.submittedAt).toLocaleDateString('sv-SE', {
									timeZone: data.authorTimezone
								})
							: undefined}
						projectBreakdown={hackatime?.projectBreakdown ?? []}
						markers={reviewMarkers}
						authorTimezone={data.authorTimezone}
						hackatimeStartDate={data.project.hackatimeStartDate}
						{commitAuthorFilter}
					/>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.review-bento {
		display: grid;
		grid-template-columns: 1fr;
		grid-template-areas:
			'user'
			'project'
			'checks'
			'multi'
			'heartbeats'
			'others'
			'timeline';
	}

	@media (min-width: 768px) {
		.review-bento {
			grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
			grid-template-areas:
				'user       project'
				'checks     multi'
				'heartbeats heartbeats'
				'others     others'
				'timeline   timeline';
		}
	}

	.project-checks-wrapper {
		display: contents;
	}

	@media (min-width: 1600px) {
		.review-bento {
			grid-template-columns: minmax(0, 380px) minmax(0, 1fr) minmax(0, 540px);
			grid-template-areas:
				'user       top             top'
				'heartbeats heartbeats       multi'
				'others     others           others'
				'timeline   timeline         timeline';
		}

		.project-checks-wrapper {
			grid-area: top;
			display: flex;
			gap: 0.75rem;
			align-items: stretch;
		}
	}
</style>
