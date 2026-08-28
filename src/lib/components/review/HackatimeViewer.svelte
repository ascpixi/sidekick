<script lang="ts">
	import { createLogger } from '$lib/logger.js';
	import {
		Activity,
		LoaderCircle,
		FolderCode,
		ExternalLink,
		Check,
		ChartLine,
		PieChart,
		FileCode,
		Code,
		Ship,
		MessageSquare,
		X,
		CalendarOff,
		Database,
		CircleHelp,
		RefreshCw
	} from 'lucide-svelte';
	import {
		cachedHackatimeFetch,
		invalidateClientHackatimeCache,
		HackatimeFetchError
	} from '$lib/review/hackatimeClientCache.js';
	import HeartbeatFrequencyBar from './HeartbeatFrequencyBar.svelte';
	import HeartbeatScatter from './HeartbeatScatter.svelte';
	import HeartbeatTable from './HeartbeatTable.svelte';
	import HackatimeBreakdown from './HackatimeBreakdown.svelte';
	import HackatimeFiles from './HackatimeFiles.svelte';
	import TabBar from '$lib/components/ui/TabBar.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';

	const log = createLogger('HackatimeViewer');

	interface HeartbeatRow {
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
		ip: string;
		lines: number;
		source_type: number | string;
	}

	interface DayActivity {
		date: string;
		count: number;
		totalSeconds: number;
		lineNoPath: string;
		cursorPath: string;
	}

	interface ProjectBreakdown {
		name: string;
		totalSeconds: number;
	}

	type MarkerType = 'commit' | 'approval' | 'rejection' | 'comment' | 'ship' | 'airtable';

	interface ReviewMarker {
		type: MarkerType;
		timestamp: string;
		title: string;
		subtitle?: string;
		avatarUrl?: string;
		/** For commit markers: author key matching the GitHub-tab user filter. */
		authorKey?: string;
	}

	interface Props {
		hackatimeUser: string;
		hackatimeProjectKeys: string[];
		programId: string;
		defaultDate?: string;
		projectBreakdown?: ProjectBreakdown[];
		markers?: ReviewMarker[];
		authorTimezone?: string;
		// ISO date (YYYY-MM-DD) — the program's Hackatime cutoff; activity before
		// this date is shown in the day list but doesn't count toward hour totals.
		hackatimeStartDate?: string;
		/** When set, commit tooltips only show commits by this author key and note how many are hidden. */
		commitAuthorFilter?: string | null;
		class?: string;
	}

	let {
		hackatimeUser,
		hackatimeProjectKeys,
		programId,
		defaultDate,
		projectBreakdown = [],
		markers = [],
		authorTimezone = 'UTC',
		hackatimeStartDate,
		commitAuthorFilter = null,
		class: className = ''
	}: Props = $props();

	const MARKER_CONFIG: Record<MarkerType, { icon: typeof Check; label: string; color: string }> = {
		ship: { icon: Ship, label: 'Ship', color: '#06b6d4' },
		commit: { icon: Code, label: 'Commit', color: '#8b5cf6' },
		approval: { icon: Check, label: 'Approval', color: '#22c55e' },
		rejection: { icon: X, label: 'Rejection', color: '#ef4444' },
		comment: { icon: MessageSquare, label: 'Comment', color: '#3b82f6' },
		airtable: { icon: Database, label: 'Airtable record', color: '#ec4899' }
	};

	const MARKER_ORDER: MarkerType[] = [
		'ship',
		'commit',
		'approval',
		'rejection',
		'comment',
		'airtable'
	];

	const MAX_VISIBLE_PROJECTS = 4;

	const sortedProjects = $derived.by(() => {
		const timeMap = new Map(projectBreakdown.map((p) => [p.name, p.totalSeconds]));
		return [...hackatimeProjectKeys]
			.map((key) => ({ name: key, totalSeconds: timeMap.get(key) ?? 0 }))
			.sort((a, b) => b.totalSeconds - a.totalSeconds);
	});

	const visibleProjects = $derived(sortedProjects.slice(0, MAX_VISIBLE_PROJECTS));
	const overflowProjects = $derived(sortedProjects.slice(MAX_VISIBLE_PROJECTS));

	function formatHours(seconds: number): string {
		const h = seconds / 3600;
		if (h < 0.1) return '<0.1h';
		return h < 10 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
	}

	let currentDate = $state(defaultDate || new Date().toISOString().split('T')[0]);
	let heartbeats = $state<HeartbeatRow[] | null>(null);
	let loading = $state(false);
	let hasSelectedInitialDay = false;
	let error = $state<string | null>(null);

	let focusedTimestamp = $state<number | undefined>(undefined);
	let animationKey = $state(0);
	let hoveredTimeRange = $state<[number, number] | null>(null);
	let visibleRange = $state<[number, number] | null>(null);

	let activityCache = $state<Record<string, DayActivity[]>>({});
	let overviewLoading = $state(false);
	let overflowTooltip = $state<{ x: number; y: number } | null>(null);
	let scrollContainer = $state<HTMLElement | null>(null);
	let telescreenCopied = $state(false);
	let selectedProject = $state<string | null>(null);
	let overflowHideTimer: ReturnType<typeof setTimeout> | null = null;
	let activeTab = $state('graph');
	let breakdownScope = $state<'day' | 'all'>('day');
	let allHeartbeats = $state<HeartbeatRow[] | null>(null);
	let allHeartbeatsLoading = $state(false);
	let heartbeatsFromCache = $state(false);

	const detailTabs = [
		{ id: 'graph', label: 'Graph', icon: ChartLine },
		{ id: 'breakdown', label: 'Breakdown', icon: PieChart },
		{ id: 'files', label: 'Files', icon: FileCode }
	];

	const effectiveProjectKeys = $derived(selectedProject ? [selectedProject] : hackatimeProjectKeys);

	function monthKey(dateStr: string): string {
		return dateStr.slice(0, 7);
	}

	function formatDateLabel(dateStr: string): string {
		const d = new Date(dateStr + 'T12:00:00Z');
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: authorTimezone
		});
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${Math.round(seconds)}s`;

		const m = Math.floor(seconds / 60);
		if (m < 60) return `${m}m`;

		const h = Math.floor(m / 60);
		const rm = m % 60;
		return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
	}

	function shiftMonthKey(ym: string, delta: number): string {
		const [y, m] = ym.split('-').map(Number);
		const d = new Date(Date.UTC(y, m - 1 + delta, 1));
		return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	function monthsBetween(startYm: string, endYm: string): string[] {
		const months: string[] = [];
		let cur = startYm;

		while (cur <= endYm) {
			months.push(cur);
			cur = shiftMonthKey(cur, 1);
		}

		return months;
	}

	async function fetchActivity(ym: string): Promise<DayActivity[]> {
		if (activityCache[ym]) {
			log.trace('Activity cache hit', { ym });
			return activityCache[ym];
		}

		const [y, m] = ym.split('-');

		const params = new URLSearchParams({
			userId: hackatimeUser,
			projects: effectiveProjectKeys.join(','),
			year: y,
			month: m,
			tz: authorTimezone
		});

		log.debug('Fetching activity data', { ym });
		const t = log.time(`fetchActivity:${ym}`);

		try {
			const { data } = await cachedHackatimeFetch(
				`/api/programs/${programId}/hackatime/activity?${params}`
			);
			t.end('ok');
			activityCache[ym] = data.days;
			log.debug('Activity data fetched', { ym, dayCount: data.days?.length ?? 0 });
			return data.days;
		} catch (e) {
			log.error('Failed to fetch activity data', { ym }, e);
			return [];
		}
	}

	async function loadOverview() {
		overviewLoading = true;
		log.info('Loading hackatime overview', {
			hackatimeUser,
			projectCount: hackatimeProjectKeys.length
		});
		const t = log.time('loadOverview');
		try {
			const params = new URLSearchParams({
				userId: hackatimeUser,
				projects: effectiveProjectKeys.join(',')
			});

			let months: string[];
			try {
				log.debug('Fetching date range');
				params.set('tz', authorTimezone);
				const res = await fetch(`/api/programs/${programId}/hackatime/date-range?${params}`);
				log.debug('Date range response', { status: res.status });
				const data = res.ok ? await res.json() : null;

				if (data?.range) {
					const startYm = monthKey(data.range.firstDate);
					const endYm = monthKey(data.range.lastDate);
					months = monthsBetween(startYm, endYm);
					log.debug('Date range resolved', { startYm, endYm, monthCount: months.length });
				} else {
					log.debug('No date range returned, using fallback months');
					months = fallbackMonths();
				}
			} catch (e) {
				log.warn('Date range fetch failed, using fallback months', e);
				months = fallbackMonths();
			}

			// Fetch months a couple at a time: each is a full-month heartbeat pull
			// on the server, and firing a whole project's history at once is
			// enough of a burst to trip Hackatime's admin API rate limit.
			const queue = [...months];
			await Promise.all(
				Array.from({ length: Math.min(2, queue.length) }, async () => {
					while (queue.length > 0) await fetchActivity(queue.shift()!);
				})
			);

			if (!hasSelectedInitialDay) {
				hasSelectedInitialDay = true;
				const days: DayActivity[] = [];

				for (const entries of Object.values(activityCache)) {
					for (const d of entries) {
						if (d.count > 0) {
							days.push(d);
						}
					}
				}

				if (days.length > 0) {
					days.sort((a, b) => b.date.localeCompare(a.date));
					currentDate = days[0].date;
					log.debug('Auto-selected initial day', { date: currentDate });
				}
			}

			t.end('months loaded', months.length);
			requestAnimationFrame(() => scrollToSelected());
		} finally {
			overviewLoading = false;
		}
	}

	function fallbackMonths(): string[] {
		const base = currentDate || new Date().toISOString().split('T')[0];
		const ym = monthKey(base);
		return [shiftMonthKey(ym, -2), shiftMonthKey(ym, -1), ym, shiftMonthKey(ym, 1)];
	}

	$effect(() => {
		void hackatimeUser;
		void effectiveProjectKeys;
		if (!hackatimeUser || effectiveProjectKeys.length === 0) return;

		activityCache = {};
		hasSelectedInitialDay = false;
		loadOverview();
	});

	const allActiveDays = $derived.by(() => {
		const days: DayActivity[] = [];
		for (const entries of Object.values(activityCache)) {
			for (const d of entries) {
				if (d.count > 0) {
					days.push(d);
				}
			}
		}

		return days.sort((a, b) => b.date.localeCompare(a.date));
	});

	function isPreCutoff(date: string): boolean {
		return !!hackatimeStartDate && date < hackatimeStartDate;
	}

	// The newest active day that falls before the cutoff. The day list runs
	// newest → oldest, so the cutoff divider renders immediately to the left of
	// this day's card — everything right of it doesn't count toward totals.
	const cutoffBoundaryDate = $derived(allActiveDays.find((d) => isPreCutoff(d.date))?.date ?? null);

	const cutoffTitle = $derived(
		hackatimeStartDate
			? `Hackatime cutoff (${formatDateLabel(hackatimeStartDate)}) — activity before this date doesn't count toward hour totals`
			: ''
	);

	const monthGroups = $derived.by(() => {
		const groups: { ym: string; label: string; startIdx: number; days: DayActivity[] }[] = [];
		let idx = 0;
		let curYm = '';

		for (const day of allActiveDays) {
			const ym = monthKey(day.date);
			if (ym !== curYm) {
				const [y, m] = ym.split('-').map(Number);
				const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
					month: 'short',
					year: 'numeric',
					timeZone: authorTimezone
				});
				groups.push({ ym, label, startIdx: idx, days: [] });
				curYm = ym;
			}

			groups[groups.length - 1].days.push(day);
			idx++;
		}

		return groups;
	});

	function selectDay(date: string) {
		log.debug('Day selected', { date });
		currentDate = date;
	}

	interface MarkerGroup {
		type: MarkerType;
		items: ReviewMarker[];
	}

	function markerDate(iso: string): string {
		return new Date(iso).toLocaleDateString('sv-SE', { timeZone: authorTimezone });
	}

	// Batches each marker onto an active Hackatime day. Commits and Airtable records
	// attach to the latest active day on or BEFORE them (both mark the tail end of work
	// that already happened). Other events attach to the earliest active day on or
	// after them, so review actions between active days roll onto the next one.
	const dayMarkers = $derived.by(() => {
		const result: Record<string, MarkerGroup[]> = {};
		if (!allActiveDays.length || markers.length === 0) return result;

		const ascDates = allActiveDays.map((d) => d.date).sort();
		const firstDate = ascDates[0];
		const lastDate = ascDates[ascDates.length - 1];
		const byDate: Record<string, Record<string, ReviewMarker[]>> = {};

		for (const m of markers) {
			const mDate = markerDate(m.timestamp);
			const target =
				m.type === 'commit' || m.type === 'airtable'
					? (ascDates.findLast((d) => d <= mDate) ?? firstDate)
					: (ascDates.find((d) => d >= mDate) ?? lastDate);
			byDate[target] ??= {};
			(byDate[target][m.type] ??= []).push(m);
		}

		for (const [date, groups] of Object.entries(byDate)) {
			result[date] = MARKER_ORDER.filter((type) => groups[type]?.length).map((type) => ({
				type,
				items: groups[type].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
			}));
		}

		return result;
	});

	let markerTooltip = $state<{ x: number; y: number; group: MarkerGroup } | null>(null);
	let markerHideTimer: ReturnType<typeof setTimeout> | null = null;

	function formatMarkerTime(iso: string): string {
		return new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZone: authorTimezone
		});
	}

	function showMarkerTooltip(e: MouseEvent, group: MarkerGroup) {
		if (markerHideTimer) {
			clearTimeout(markerHideTimer);
			markerHideTimer = null;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		markerTooltip = { x: rect.left + rect.width / 2, y: rect.top, group };
		ensureCommitGaps(group);
	}

	function scheduleHideMarker() {
		markerHideTimer = setTimeout(() => {
			markerTooltip = null;
		}, 150);
	}

	function cancelHideMarker() {
		if (markerHideTimer) {
			clearTimeout(markerHideTimer);
			markerHideTimer = null;
		}
	}

	function scrollToSelected() {
		if (!scrollContainer) return;

		const el = scrollContainer.querySelector('[data-selected="true"]') as HTMLElement | null;
		if (!el) return;

		const left = el.offsetLeft - scrollContainer.offsetWidth / 2 + el.offsetWidth / 2;
		scrollContainer.scrollTo({ left, behavior: 'smooth' });
	}

	$effect(() => {
		void refreshNonce;
		const date = currentDate;
		const user = hackatimeUser;
		const keys = effectiveProjectKeys;
		if (!user || keys.length === 0) return;

		loading = true;
		error = null;

		log.debug('Fetching heartbeats', { date, user });
		const t = log.time(`fetchHeartbeats:${date}`);
		const params = new URLSearchParams({
			userId: user,
			projects: keys.join(','),
			date,
			tz: authorTimezone
		});

		cachedHackatimeFetch(`/api/programs/${programId}/hackatime/heartbeats?${params}`)
			.then(({ data, fromClientCache }) => {
				if (date !== currentDate) {
					log.debug('Heartbeat response discarded (date changed)', {
						requestedDate: date,
						currentDate
					});
					return;
				}

				heartbeats = data.heartbeats;
				heartbeatsFromCache = fromClientCache || (data.fromCache ?? false);
				t.end('heartbeats', data.heartbeats?.length ?? 0);
			})
			.catch((e) => {
				if (e instanceof HackatimeFetchError && e.status === 429) {
					e = new Error(
						'Hackatime rate limit hit — wait a few seconds, then switch days to retry'
					);
				}
				if (date !== currentDate) {
					log.debug('Heartbeat error discarded (date changed)', {
						requestedDate: date,
						currentDate
					});
					return;
				}

				heartbeats = null;
				heartbeatsFromCache = false;
				error = e.message;
				log.error('Failed to fetch heartbeats', { date }, e);
			})
			.finally(() => {
				if (date !== currentDate) return;

				loading = false;
			});
	});

	const codingHeartbeats = $derived(
		heartbeats?.filter(
			(hb) => hb.editor !== 'lapse' && !hb.user_agent.toLowerCase().includes('lapse')
		) ?? null
	);

	// "Ridiculous" heartbeats carry a lineno/cursorpos/lines value wildly above the
	// day's median (bogus editor-reported values, e.g. a cursorpos in the millions) —
	// a single one squashes the scatter's y-axis so the real activity flatlines.
	const RIDICULOUS_MULTIPLIER = 100;
	// Floor so tiny medians (e.g. median lineno of 3) don't flag legitimately
	// large-but-sane values in big files.
	const RIDICULOUS_FLOOR = 10_000;

	let excludeRidiculous = $state(false);

	function median(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
	}

	const RIDICULOUS_FIELDS = ['lineno', 'cursorpos', 'lines'] as const;

	const ridiculousThresholds = $derived.by(() => {
		if (!codingHeartbeats || codingHeartbeats.length === 0) return null;
		return Object.fromEntries(
			RIDICULOUS_FIELDS.map((field) => [
				field,
				Math.max(
					median(codingHeartbeats.map((hb) => hb[field])) * RIDICULOUS_MULTIPLIER,
					RIDICULOUS_FLOOR
				)
			])
		) as Record<(typeof RIDICULOUS_FIELDS)[number], number>;
	});

	function isRidiculous(hb: HeartbeatRow): boolean {
		const t = ridiculousThresholds;
		return !!t && RIDICULOUS_FIELDS.some((field) => hb[field] > t[field]);
	}

	const ridiculousHeartbeats = $derived(codingHeartbeats?.filter(isRidiculous) ?? []);
	const ridiculousCount = $derived(ridiculousHeartbeats.length);

	let ridiculousHelpOpen = $state(false);

	// Whether this specific field is what put the heartbeat over the threshold —
	// its cell gets highlighted in the help dropdown's mini-table.
	function isFieldRidiculous(hb: HeartbeatRow, field: (typeof RIDICULOUS_FIELDS)[number]): boolean {
		const t = ridiculousThresholds;
		return !!t && hb[field] > t[field];
	}

	function formatHeartbeatTime(ms: number): string {
		return new Date(ms).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
			timeZone: authorTimezone
		});
	}

	function fileName(entity: string): string {
		return entity.split('/').pop() || entity;
	}

	const scatterHeartbeats = $derived(
		codingHeartbeats && excludeRidiculous && ridiculousCount > 0
			? codingHeartbeats.filter((hb) => !isRidiculous(hb))
			: codingHeartbeats
	);

	const dayProjectKeys = $derived.by(() => {
		if (!codingHeartbeats) return effectiveProjectKeys;
		const keySet = new Set(effectiveProjectKeys.map((k) => k.toLowerCase()));
		const present = new Set<string>();
		for (const hb of codingHeartbeats) {
			if (keySet.has(hb.project.toLowerCase())) present.add(hb.project);
		}
		return present.size > 0 ? [...present] : effectiveProjectKeys;
	});

	function buildTelescreenUrl(): string {
		// Telescreen's workbench reads `u` as a numeric Hackatime ID; a Slack ID
		// (our fallback when a project has no Hackatime ID) goes in `slack` instead.
		const params = new URLSearchParams({
			...(/^\d+$/.test(hackatimeUser) ? { u: hackatimeUser } : { slack: hackatimeUser }),
			d: currentDate,
			p: dayProjectKeys.join(',')
		});
		return `https://telescreen.hackclub.com/workbench/hackatime?${params}`;
	}

	async function copyTelescreenLink() {
		await navigator.clipboard.writeText(buildTelescreenUrl());
		telescreenCopied = true;
		setTimeout(() => (telescreenCopied = false), 2000);
	}

	let refreshing = $state(false);
	// Bumped after a cache purge so the day-heartbeats effect refires even
	// though the selected date didn't change.
	let refreshNonce = $state(0);

	// Server-side, Hackatime responses are cached (finalized heartbeat windows
	// for days) — this drops that cache plus the local month/day state, for
	// when the reviewer needs live data.
	async function refreshHackatimeData() {
		if (refreshing) return;
		refreshing = true;
		log.info('Refreshing Hackatime data (purging caches)', { hackatimeUser });
		try {
			const res = await fetch(
				`/api/programs/${programId}/hackatime/cache?userId=${encodeURIComponent(hackatimeUser)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			invalidateClientHackatimeCache(hackatimeUser);
			activityCache = {};
			allHeartbeats = null;
			commitGaps = {};
			refreshNonce++;
			await loadOverview();
		} catch (e) {
			log.error('Failed to refresh Hackatime data', {}, e);
		} finally {
			refreshing = false;
		}
	}

	async function fetchAllHeartbeats() {
		if (allHeartbeatsLoading) return;
		if (!allActiveDays.length) return;

		const firstDate = allActiveDays[allActiveDays.length - 1].date;
		const lastDate = allActiveDays[0].date;

		allHeartbeatsLoading = true;
		try {
			const params = new URLSearchParams({
				userId: hackatimeUser,
				projects: effectiveProjectKeys.join(','),
				date: firstDate,
				endDate: lastDate,
				tz: authorTimezone
			});
			const { data } = await cachedHackatimeFetch(
				`/api/programs/${programId}/hackatime/heartbeats?${params}`
			);
			allHeartbeats = data.heartbeats;
		} catch (e) {
			log.error('Failed to fetch all heartbeats', {}, e);
			allHeartbeats = null;
		} finally {
			allHeartbeatsLoading = false;
		}
	}

	$effect(() => {
		if (breakdownScope === 'all' && !allHeartbeats && !allHeartbeatsLoading) {
			fetchAllHeartbeats();
		}
	});

	$effect(() => {
		void effectiveProjectKeys;
		allHeartbeats = null;
	});

	const allCodingHeartbeats = $derived(
		allHeartbeats?.filter(
			(hb) => hb.editor !== 'lapse' && !hb.user_agent.toLowerCase().includes('lapse')
		) ?? null
	);

	const breakdownHeartbeats = $derived(
		breakdownScope === 'all' ? allCodingHeartbeats : codingHeartbeats
	);

	// Gap (seconds) from each commit to its nearest heartbeat, keyed by commit
	// timestamp. Populated lazily per tooltip — see ensureCommitGaps. Infinity means
	// no heartbeat within the searched window (effectively ">1d").
	let commitGaps = $state<Record<string, number>>({});
	let commitGapsLoading = $state<Record<string, boolean>>({});

	function dayString(ms: number): string {
		return new Date(ms).toLocaleDateString('sv-SE', { timeZone: authorTimezone });
	}

	function nearestGapSeconds(sortedTimesMs: number[], t: number): number {
		if (sortedTimesMs.length === 0) return Infinity;

		let lo = 0;
		let hi = sortedTimesMs.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sortedTimesMs[mid] < t) lo = mid + 1;
			else hi = mid;
		}

		let best = Math.abs(sortedTimesMs[lo] - t);
		if (lo > 0) best = Math.min(best, Math.abs(sortedTimesMs[lo - 1] - t));
		return best / 1000;
	}

	// Fetches heartbeats in a bounded window around a commit group and computes each
	// commit's nearest-heartbeat gap. Scoped to the group's date span (±2 days) rather
	// than the whole project history — the full range exceeds the heartbeat fetch cap
	// (100k, oldest-first), which would silently drop recent heartbeats and report
	// every recent commit as a bogus ~400-day gap.
	async function ensureCommitGaps(group: MarkerGroup) {
		if (group.type !== 'commit') return;

		const pending = group.items.filter(
			(it) => commitGaps[it.timestamp] === undefined && !commitGapsLoading[it.timestamp]
		);
		if (pending.length === 0) return;

		const loadingNext = { ...commitGapsLoading };
		for (const it of pending) loadingNext[it.timestamp] = true;
		commitGapsLoading = loadingNext;

		const PAD_MS = 2 * 86400000;
		const times = pending.map((it) => new Date(it.timestamp).getTime());
		const params = new URLSearchParams({
			userId: hackatimeUser,
			projects: effectiveProjectKeys.join(','),
			date: dayString(Math.min(...times) - PAD_MS),
			endDate: dayString(Math.max(...times) + PAD_MS),
			tz: authorTimezone
		});

		try {
			const { data } = await cachedHackatimeFetch(
				`/api/programs/${programId}/hackatime/heartbeats?${params}`
			);
			const hbTimes = (data.heartbeats as HeartbeatRow[])
				.filter((hb) => hb.editor !== 'lapse' && !hb.user_agent.toLowerCase().includes('lapse'))
				.map((hb) => hb.time)
				.sort((a, b) => a - b);

			const gapsNext = { ...commitGaps };
			for (const it of pending) {
				gapsNext[it.timestamp] = nearestGapSeconds(hbTimes, new Date(it.timestamp).getTime());
			}
			commitGaps = gapsNext;
		} catch (e) {
			log.error('Failed to fetch commit-window heartbeats', {}, e);
		} finally {
			const doneNext = { ...commitGapsLoading };
			for (const it of pending) delete doneNext[it.timestamp];
			commitGapsLoading = doneNext;
		}
	}

	// Green (just-committed, near a heartbeat) → red (a day or more away).
	function gapColor(seconds: number): string {
		const frac = Math.min(seconds / 86400, 1);
		const hue = (1 - frac) * 130;
		return `hsl(${hue}, 65%, 42%)`;
	}

	// Caps at a day — beyond that the exact distance doesn't matter, it's just "far".
	function formatGap(seconds: number): string {
		return seconds >= 86400 ? '>1d' : formatDuration(seconds);
	}

	function handleFocusChange(timestamp: number) {
		focusedTimestamp = timestamp;
		animationKey++;
	}

	function selectProject(name: string) {
		selectedProject = selectedProject === name ? null : name;
		overflowTooltip = null;
	}

	function showOverflowTooltip(e: MouseEvent) {
		if (overflowHideTimer) {
			clearTimeout(overflowHideTimer);
			overflowHideTimer = null;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		overflowTooltip = { x: rect.left + rect.width / 2, y: rect.top };
	}

	function scheduleHideOverflow() {
		overflowHideTimer = setTimeout(() => {
			overflowTooltip = null;
		}, 150);
	}

	function cancelHideOverflow() {
		if (overflowHideTimer) {
			clearTimeout(overflowHideTimer);
			overflowHideTimer = null;
		}
	}
</script>

<svelte:window
	onclick={() => {
		if (ridiculousHelpOpen) ridiculousHelpOpen = false;
	}}
/>

<div
	class="border border-border-card rounded-card shadow-card overflow-hidden flex flex-col {className}"
>
	<div class="flex items-center px-6 py-4 border-b border-border-card">
		<div class="flex items-center gap-2.5">
			<Activity size={18} class="text-text-secondary" />
			<div class="flex flex-col gap-0.5">
				<h2 class="font-bold text-[15px] text-text-primary tracking-[-0.45px]">
					Hackatime Details
				</h2>
				<p class="text-[12px] text-text-secondary tracking-[-0.24px] flex items-center gap-1.5">
					{#if codingHeartbeats}
						{codingHeartbeats.length} heartbeat{codingHeartbeats.length === 1 ? '' : 's'}
						{#if heartbeatsFromCache}
							<span
								class="text-text-tertiary"
								title="Served from Sidekick's cache — use “Refresh data” to refetch live">(cached)</span
							>
						{/if}
					{:else}
						No data
					{/if}
					{#if loading}
						<LoaderCircle size={12} class="animate-spin text-text-tertiary" />
					{/if}
				</p>
			</div>
		</div>
	</div>

	<div
		class="flex items-center justify-between px-6 py-2.5 border-b border-border-card bg-surface/30"
	>
		<div class="flex items-center gap-2 min-w-0">
			<FolderCode size={14} class="text-text-tertiary shrink-0" />
			<span class="text-[12px] text-text-tertiary shrink-0">Projects:</span>
			<div class="flex flex-wrap gap-1.5 min-w-0">
				{#each visibleProjects as proj (proj.name)}
					<button
						class="text-[12px] font-medium rounded-tag px-2 py-0.5 truncate cursor-pointer transition-colors
							{selectedProject === proj.name
							? 'text-accent bg-accent-bg border border-accent'
							: 'text-text-primary bg-page border border-border-card hover:border-accent/50'}"
						onclick={() => selectProject(proj.name)}
					>
						{proj.name}
						<span
							class="{selectedProject === proj.name
								? 'text-accent/70'
								: 'text-text-tertiary'} font-normal">{formatHours(proj.totalSeconds)}</span
						>
					</button>
				{/each}
				{#if overflowProjects.length > 0}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						class="overflow-pill text-[12px] font-medium rounded-tag px-2 py-0.5 cursor-default
							{overflowProjects.some((p) => p.name === selectedProject)
							? 'text-accent bg-accent-bg border border-accent'
							: 'text-text-secondary bg-page border border-border-card'}"
						onmouseenter={showOverflowTooltip}
						onmouseleave={scheduleHideOverflow}
					>
						+{overflowProjects.length}
					</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center shrink-0 ml-4">
			<button
				class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-tag cursor-pointer transition-colors shrink-0 bg-page border border-border-card text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-default"
				onclick={refreshHackatimeData}
				disabled={refreshing}
				title="Drop cached Hackatime data and refetch live"
			>
				<RefreshCw size={12} class={refreshing ? 'animate-spin' : ''} />
				Refresh data
			</button>
			<button
				class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-tag cursor-pointer transition-colors shrink-0 ml-2 {telescreenCopied
					? 'bg-check-pass/10 text-check-pass border border-check-pass/30'
					: 'bg-page border border-border-card text-text-secondary hover:text-text-primary'}"
				onclick={copyTelescreenLink}
			>
				{#if telescreenCopied}
					<Check size={12} />
					Copied
				{:else}
					<ExternalLink size={12} />
					Copy Telescreen link
				{/if}
			</button>
		</div>
	</div>

	<div class="border-b border-border-card bg-surface/20 relative">
		{#if allActiveDays.length > 0}
			<div bind:this={scrollContainer} class="overflow-x-auto scrollbar-thin">
				<div class="flex px-4 py-3 gap-0" style="min-width: max-content;">
					{#each monthGroups as group (group.ym)}
						<div class="flex flex-col shrink-0">
							<div
								class="text-[10px] font-bold text-text-tertiary uppercase tracking-wide px-1 pb-1.5 sticky left-0"
							>
								{group.label}
							</div>
							<div class="flex gap-1.5">
								{#each group.days as day (day.date)}
									{#if day.date === cutoffBoundaryDate}
										<div class="relative flex items-center shrink-0 px-1" title={cutoffTitle}>
											<div
												class="self-stretch border-l-2 border-dashed"
												style="border-color: #f59e0b"
											></div>
											<div
												class="absolute left-1/2 -translate-x-1/2 -top-1.5 z-10 flex items-center rounded-full h-3.5 px-1.5 shadow-sm ring-1 ring-page/40"
												style="background-color: #f59e0b"
											>
												<CalendarOff size={9} color="white" strokeWidth={2.5} />
											</div>
										</div>
									{/if}
									<div class="relative shrink-0">
										<button
											class="flex flex-col gap-0.5 rounded-section p-1 cursor-pointer transition-all border w-[140px] shrink-0
											{day.date === currentDate
												? 'border-accent bg-accent-bg ring-1 ring-accent'
												: 'border-transparent hover:border-border-card hover:bg-surface/50'}
											{isPreCutoff(day.date) && day.date !== currentDate ? 'opacity-45' : ''}"
											data-selected={day.date === currentDate}
											title={isPreCutoff(day.date)
												? "Before the Hackatime cutoff — doesn't count toward totals"
												: undefined}
											onclick={() => selectDay(day.date)}
										>
											<svg viewBox="0 0 400 100" class="w-full aspect-[4/1] bg-surface rounded-tag">
												<path
													d={day.lineNoPath}
													stroke="#06b6d4"
													stroke-width="10"
													stroke-linecap="round"
													fill="none"
												/>
												<path
													d={day.cursorPath}
													stroke="#e33062"
													stroke-width="10"
													stroke-linecap="round"
													fill="none"
												/>
											</svg>
											<div class="flex items-center justify-between px-0.5">
												<span class="text-[10px] text-text-secondary">
													{new Date(day.date + 'T12:00:00Z').toLocaleDateString('en-US', {
														month: 'short',
														day: 'numeric',
														timeZone: authorTimezone
													})}
												</span>
												<span class="text-[10px] font-mono text-text-tertiary">
													{formatDuration(day.totalSeconds)}
												</span>
											</div>
										</button>
										{#if dayMarkers[day.date]}
											<div
												class="absolute left-1/2 -translate-x-1/2 -top-1.5 z-10 flex items-center gap-0.5"
											>
												{#each dayMarkers[day.date] as group (group.type)}
													{@const Icon = MARKER_CONFIG[group.type].icon}
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="flex items-center gap-1 rounded-full h-3.5 px-1.5 shadow-sm cursor-default ring-1 ring-page/40"
														style="background-color: {MARKER_CONFIG[group.type].color}"
														onmouseenter={(e) => showMarkerTooltip(e, group)}
														onmouseleave={scheduleHideMarker}
													>
														<Icon size={9} color="white" strokeWidth={2.5} />
														{#if group.items.length > 1}
															<span class="text-[8px] font-bold text-white leading-none"
																>{group.items.length}</span
															>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
						<div class="w-3 shrink-0"></div>
					{/each}
				</div>
			</div>
		{:else if overviewLoading}
			<div class="flex gap-1.5 px-4 py-3">
				<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
				{#each Array(6) as _, i (i)}
					<div class="animate-pulse w-[140px] shrink-0">
						<div class="w-full aspect-[4/1] bg-surface rounded-tag"></div>
						<div class="flex justify-between mt-1 px-0.5">
							<div class="h-2.5 w-10 bg-surface rounded"></div>
							<div class="h-2.5 w-6 bg-surface rounded"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="px-6 py-4 text-[12px] text-text-tertiary text-center">
				No activity found for these projects.
			</div>
		{/if}
	</div>

	{#if error}
		<div class="px-6 py-8">
			<div
				class="border border-check-fail/30 bg-check-fail/5 rounded-section px-4 py-3 text-sm text-check-fail"
			>
				Failed to load heartbeats: {error}
			</div>
		</div>
	{:else if codingHeartbeats && codingHeartbeats.length > 0}
		<TabBar tabs={detailTabs} active={activeTab} onchange={(id) => (activeTab = id)} />

		{#if activeTab === 'graph'}
			<HeartbeatFrequencyBar
				heartbeats={codingHeartbeats}
				{visibleRange}
				timezone={authorTimezone}
				onhover={(range) => (hoveredTimeRange = range)}
				onclick={(timestamp) => handleFocusChange(timestamp)}
			/>

			<HeartbeatScatter
				heartbeats={scatterHeartbeats ?? []}
				{hoveredTimeRange}
				timezone={authorTimezone}
				onfocuschange={(timestamp) => handleFocusChange(timestamp)}
			/>

			{#if ridiculousCount > 0}
				<div class="flex items-center gap-1.5 px-6 py-2.5 border-t border-border-card">
					<Checkbox
						checked={excludeRidiculous}
						onchange={() => (excludeRidiculous = !excludeRidiculous)}
					>
						<span class="text-[12px] text-text-secondary leading-[18px] select-none">
							Exclude {ridiculousCount} ridiculous heartbeat{ridiculousCount === 1 ? '' : 's'}
						</span>
					</Checkbox>
					<span class="relative flex items-center">
						<button
							type="button"
							class="flex items-center cursor-pointer"
							onclick={(e) => {
								e.stopPropagation();
								ridiculousHelpOpen = !ridiculousHelpOpen;
							}}
						>
							<CircleHelp size={14} class="text-text-tertiary hover:text-text-secondary" />
						</button>
						{#if ridiculousHelpOpen}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div class="ridiculous-help-dropdown" onclick={(e) => e.stopPropagation()}>
								<p class="text-[12px] text-text-secondary leading-snug">
									Heartbeats whose line no, cursor pos, or total lines is more than
									{RIDICULOUS_MULTIPLIER}× the day's median (and above
									{RIDICULOUS_FLOOR.toLocaleString('en-US')}). These might sometimes be caused by
									e.g. accidentally opening transpiled output, large JSON files, etc...
								</p>
								<div class="mt-2 max-h-48 overflow-auto scrollbar-thin">
									<table class="w-full text-[11px] border-collapse">
										<thead>
											<tr class="text-left text-text-secondary">
												<th class="mini-th">Time</th>
												<th class="mini-th">Project</th>
												<th class="mini-th">File</th>
												<th class="mini-th text-right">Line</th>
												<th class="mini-th text-right">Col</th>
												<th class="mini-th text-right">Lines</th>
											</tr>
										</thead>
										<tbody>
											{#each ridiculousHeartbeats as hb, i (i)}
												<!-- svelte-ignore a11y_click_events_have_key_events -->
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												<tr
													class="cursor-pointer hover:bg-surface/50 transition-colors"
													title="Show in the table below"
													onclick={() => handleFocusChange(hb.time)}
												>
													<td class="mini-td font-mono whitespace-nowrap">
														{formatHeartbeatTime(hb.time)}
													</td>
													<td class="mini-td max-w-[70px] truncate" title={hb.project}>
														{hb.project}
													</td>
													<td class="mini-td font-mono max-w-[110px] truncate" title={hb.entity}>
														{fileName(hb.entity)}
													</td>
													<td
														class="mini-td font-mono text-right {isFieldRidiculous(hb, 'lineno')
															? 'text-check-fail font-semibold'
															: ''}"
													>
														{hb.lineno.toLocaleString('en-US')}
													</td>
													<td
														class="mini-td font-mono text-right {isFieldRidiculous(hb, 'cursorpos')
															? 'text-check-fail font-semibold'
															: ''}"
													>
														{hb.cursorpos.toLocaleString('en-US')}
													</td>
													<td
														class="mini-td font-mono text-right {isFieldRidiculous(hb, 'lines')
															? 'text-check-fail font-semibold'
															: ''}"
													>
														{hb.lines.toLocaleString('en-US')}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</span>
				</div>
			{/if}

			<div class="flex flex-col min-h-[300px] max-h-[500px] border-t border-border-card">
				<HeartbeatTable
					heartbeats={codingHeartbeats}
					{focusedTimestamp}
					{animationKey}
					timezone={authorTimezone}
					onrangechange={(range) => (visibleRange = range)}
				/>
			</div>
		{:else if activeTab === 'breakdown' || activeTab === 'files'}
			<div class="flex items-center gap-1 px-6 pt-4">
				<button
					class="text-[12px] font-medium rounded-tag px-2.5 py-1 cursor-pointer transition-colors
						{breakdownScope === 'day'
						? 'text-accent bg-accent-bg border border-accent'
						: 'text-text-secondary bg-page border border-border-card hover:border-accent/50'}"
					onclick={() => (breakdownScope = 'day')}
				>
					Selected day
				</button>
				<button
					class="text-[12px] font-medium rounded-tag px-2.5 py-1 cursor-pointer transition-colors
						{breakdownScope === 'all'
						? 'text-accent bg-accent-bg border border-accent'
						: 'text-text-secondary bg-page border border-border-card hover:border-accent/50'}"
					onclick={() => (breakdownScope = 'all')}
				>
					All time
				</button>
			</div>
			{#if breakdownScope === 'all' && allHeartbeatsLoading}
				<div class="flex flex-col items-center justify-center py-16 gap-3 text-text-tertiary">
					<LoaderCircle size={20} class="animate-spin" />
					<span class="text-[12px]">Loading all heartbeats...</span>
				</div>
			{:else if breakdownHeartbeats && breakdownHeartbeats.length > 0}
				{#if activeTab === 'breakdown'}
					<HackatimeBreakdown heartbeats={breakdownHeartbeats} />
				{:else}
					<HackatimeFiles heartbeats={breakdownHeartbeats} />
				{/if}
			{:else}
				<div class="flex items-center justify-center py-16 text-sm text-text-tertiary">
					No heartbeat data available.
				</div>
			{/if}
		{/if}
	{:else if codingHeartbeats}
		<div class="flex items-center justify-center py-16 text-sm text-text-tertiary">
			No heartbeats found for {formatDateLabel(currentDate)}.
		</div>
	{:else if loading}
		<div class="flex flex-col items-center justify-center py-20 gap-3 text-text-tertiary">
			<LoaderCircle size={24} class="animate-spin" />
			<span class="text-sm">Loading heartbeats...</span>
		</div>
	{/if}
</div>

{#if overflowTooltip}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="overflow-tooltip"
		style="left: {overflowTooltip.x}px; top: {overflowTooltip.y}px;"
		onmouseenter={cancelHideOverflow}
		onmouseleave={scheduleHideOverflow}
	>
		{#each overflowProjects as proj (proj.name)}
			<button
				class="whitespace-nowrap text-[12px] text-left cursor-pointer rounded px-1 py-0.5 transition-colors
					{selectedProject === proj.name ? 'text-accent font-medium' : 'text-text-primary hover:text-accent'}"
				onclick={() => selectProject(proj.name)}
			>
				{proj.name}
				<span class={selectedProject === proj.name ? 'text-accent/70' : 'text-text-tertiary'}
					>{formatHours(proj.totalSeconds)}</span
				>
			</button>
		{/each}
	</div>
{/if}

{#if markerTooltip}
	{@const cfg = MARKER_CONFIG[markerTooltip.group.type]}
	{@const TipIcon = cfg.icon}
	{@const tooltipItems =
		markerTooltip.group.type === 'commit' && commitAuthorFilter
			? markerTooltip.group.items.filter((it) => it.authorKey === commitAuthorFilter)
			: markerTooltip.group.items}
	{@const hiddenCommitCount = markerTooltip.group.items.length - tooltipItems.length}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="marker-tooltip"
		style="left: {markerTooltip.x}px; top: {markerTooltip.y}px;"
		onmouseenter={cancelHideMarker}
		onmouseleave={scheduleHideMarker}
	>
		<div class="flex items-center gap-1.5 pb-1.5 mb-1 border-b border-border-card">
			<span
				class="flex items-center justify-center rounded-full w-4 h-4 shrink-0"
				style="background-color: {cfg.color}"
			>
				<TipIcon size={10} color="white" strokeWidth={2.5} />
			</span>
			<span class="text-[12px] font-semibold text-text-primary">
				{tooltipItems.length}
				{cfg.label.toLowerCase()}{tooltipItems.length === 1 ? '' : 's'}
			</span>
		</div>
		<div class="flex flex-col gap-1.5 max-h-64 overflow-y-auto scrollbar-thin">
			{#each tooltipItems as item, i (i)}
				{#if markerTooltip.group.type === 'commit'}
					{@const gap = commitGaps[item.timestamp]}
					<div class="flex flex-col gap-1">
						<span class="text-[12px] text-text-primary leading-snug line-clamp-2">{item.title}</span
						>
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-1.5 min-w-0">
								{#if item.avatarUrl}
									<img
										src={item.avatarUrl}
										alt=""
										class="w-3.5 h-3.5 rounded-full shrink-0 object-cover"
									/>
								{/if}
								<span class="text-[11px] text-text-secondary truncate">{item.subtitle}</span>
							</div>
							{#if gap === undefined}
								<span class="text-[10px] text-text-tertiary shrink-0">checking…</span>
							{:else}
								<span
									class="text-[10px] font-semibold text-white rounded-full px-1.5 py-0.5 leading-none shrink-0"
									style="background-color: {gapColor(gap)}"
								>
									{formatGap(gap)}
								</span>
							{/if}
						</div>
					</div>
				{:else}
					<div class="flex flex-col gap-0.5">
						<div class="flex items-center gap-1.5 min-w-0">
							{#if item.avatarUrl}
								<img
									src={item.avatarUrl}
									alt=""
									class="w-3.5 h-3.5 rounded-full shrink-0 object-cover"
								/>
							{/if}
							<span class="text-[12px] text-text-primary leading-snug truncate">{item.title}</span>
						</div>
						{#if item.subtitle}
							<span class="text-[11px] text-text-secondary leading-snug line-clamp-2"
								>{item.subtitle}</span
							>
						{/if}
						<span class="text-[10px] text-text-tertiary font-mono"
							>{formatMarkerTime(item.timestamp)}</span
						>
					</div>
				{/if}
			{/each}
			{#if hiddenCommitCount > 0}
				<span class="text-[11px] text-text-tertiary italic">
					({hiddenCommitCount} commit{hiddenCommitCount === 1 ? '' : 's'} hidden)
				</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.marker-tooltip {
		position: fixed;
		transform: translate(-50%, calc(-100% - 8px));
		width: 240px;
		background: var(--color-page, #fff);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		padding: 8px 10px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
	}

	.ridiculous-help-dropdown {
		position: absolute;
		left: 0;
		top: calc(100% + 8px);
		width: 440px;
		background: var(--color-page, #fff);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		padding: 10px 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
		cursor: default;
	}

	.mini-th {
		font-weight: 700;
		padding: 0 6px 4px 0;
		border-bottom: 1px solid var(--color-border-card);
		position: sticky;
		top: 0;
		background: var(--color-page, #fff);
	}

	.mini-td {
		padding: 3px 6px 3px 0;
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.overflow-tooltip {
		position: fixed;
		transform: translate(-50%, calc(-100% - 6px));
		background: var(--color-page, #fff);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		padding: 6px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
	}
</style>
