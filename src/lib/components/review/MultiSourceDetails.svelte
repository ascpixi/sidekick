<script lang="ts">
	import { Ship, CircleCheck, CircleX, ExternalLink, ChevronDown } from 'lucide-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import TabBar from '$lib/components/ui/TabBar.svelte';
	import GitHubIcon from '$lib/components/icons/GitHubIcon.svelte';
	import LapseIcon from '$lib/components/icons/LapseIcon.svelte';
	import LookoutIcon from '$lib/components/icons/LookoutIcon.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';

	interface CommitFile {
		filename: string;
		status: string;
		additions: number;
		deletions: number;
	}

	interface CommitDetail {
		additions: number;
		deletions: number;
		files: CommitFile[];
	}

	interface GitCommit {
		sha: string;
		message: string;
		author: string;
		authorLogin?: string | null;
		authorAvatarUrl?: string | null;
		date: string;
	}

	interface CommitAuthor {
		key: string;
		name: string;
		login: string | null;
		avatarUrl: string | null;
		count: number;
	}

	interface TimelineMarker {
		type: 'ship' | 'approval' | 'rejection';
		label: string;
		date: string;
	}

	interface LapseTimelapse {
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
	}

	interface LookoutSession {
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
	}

	interface Props {
		commits: GitCommit[];
		markers?: TimelineMarker[];
		timelapses?: LapseTimelapse[];
		lookoutSessions?: LookoutSession[];
		repoUrl?: string;
		programId?: string;
		loading?: boolean;
		/** Author key (GitHub login, or git author name when unlinked) to filter commits by. */
		selectedAuthor?: string | null;
		class?: string;
	}

	let {
		commits,
		markers = [],
		timelapses = [],
		lookoutSessions = [],
		repoUrl = '',
		programId = '',
		loading = false,
		selectedAuthor = $bindable(null),
		class: className = ''
	}: Props = $props();

	let activeTab = $state('github');
	let hoveredCommit: GitCommit | null = $state(null);
	let popupPos: { x: number; y: number } | null = $state(null);
	let popupVisible = $state(false);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	let fadeTimeout: ReturnType<typeof setTimeout> | null = null;
	let details: Record<string, CommitDetail | 'loading'> = $state({});

	function parseGhUrl(url: string): { owner: string; repo: string } | null {
		try {
			const parsed = new URL(url);
			if (parsed.hostname !== 'github.com') return null;
			const segments = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
			if (segments.length < 2) return null;
			return { owner: segments[0], repo: segments[1] };
		} catch { return null; }
	}

	async function fetchDetail(sha: string) {
		if (details[sha] || !repoUrl || !programId) return;
		const repo = parseGhUrl(repoUrl);
		if (!repo) return;

		details[sha] = 'loading';
		try {
			const params = new URLSearchParams({ owner: repo.owner, repo: repo.repo, sha });
			const res = await fetch(`/api/programs/${programId}/github/commit-detail?${params}`);
			if (res.ok) {
				details[sha] = await res.json();
			} else {
				delete details[sha];
			}
		} catch {
			delete details[sha];
		}
	}

	function showPopup(commit: GitCommit, el: HTMLElement) {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		if (fadeTimeout) clearTimeout(fadeTimeout);
		hoverTimeout = setTimeout(() => {
			const rect = el.getBoundingClientRect();
			popupPos = { x: rect.left - 8, y: rect.top };
			hoveredCommit = commit;
			fetchDetail(commit.sha);
			requestAnimationFrame(() => { popupVisible = true; });
		}, 120);
	}

	function hidePopup() {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		if (fadeTimeout) clearTimeout(fadeTimeout);
		fadeTimeout = setTimeout(() => {
			popupVisible = false;
			setTimeout(() => {
				if (!popupVisible) {
					hoveredCommit = null;
					popupPos = null;
				}
			}, 150);
		}, 150);
	}

	function keepPopup() {
		if (hoverTimeout) clearTimeout(hoverTimeout);
		if (fadeTimeout) clearTimeout(fadeTimeout);
		popupVisible = true;
	}

	const tabs = $derived((() => {
		const t = [
			{ id: 'github', label: commits.length > 0 ? `GitHub (${commits.length})` : 'GitHub', icon: GitHubIcon }
		];
		if (timelapses.length > 0) {
			t.push({ id: 'lapse', label: `Lapse (${timelapses.length})`, icon: LapseIcon });
		}
		if (lookoutSessions.length > 0) {
			t.push({ id: 'lookout', label: `Lookout (${lookoutSessions.length})`, icon: LookoutIcon });
		}
		return t;
	})());

	function commitAuthorKey(c: GitCommit): string {
		return c.authorLogin ?? c.author;
	}

	const commitAuthors = $derived.by((): CommitAuthor[] => {
		const byKey = new SvelteMap<string, CommitAuthor>();
		for (const c of commits) {
			const key = commitAuthorKey(c);
			const entry = byKey.get(key);
			if (entry) {
				entry.count++;
				entry.avatarUrl ??= c.authorAvatarUrl ?? null;
			} else {
				byKey.set(key, {
					key,
					name: c.author,
					login: c.authorLogin ?? null,
					avatarUrl: c.authorAvatarUrl ?? null,
					count: 1
				});
			}
		}
		return [...byKey.values()].sort((a, b) => b.count - a.count);
	});

	const filteredCommits = $derived(
		selectedAuthor ? commits.filter((c) => commitAuthorKey(c) === selectedAuthor) : commits
	);

	const selectedAuthorEntry = $derived(
		commitAuthors.find((a) => a.key === selectedAuthor) ?? null
	);

	let userFilterOpen = $state(false);

	// Drop a stale filter if the commit list changes and no longer has that user.
	$effect(() => {
		if (selectedAuthor && commits.length > 0 && !commitAuthors.some((a) => a.key === selectedAuthor)) {
			selectedAuthor = null;
		}
	});

	function selectAuthor(key: string | null) {
		selectedAuthor = key;
		userFilterOpen = false;
	}

	function timeAgo(date: string): string {
		const diff = Date.now() - new Date(date).getTime();
		const hours = Math.floor(diff / 3600000);
		if (hours < 1)
			return '<1h';
		if (hours < 24)
			return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d ${hours % 24}h`;
	}

	function shortDate(date: string): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function fmtDuration(seconds: number): string {
		if (seconds < 60) return `${Math.round(seconds)}s`;
		const mins = Math.floor(seconds / 60);
		const secs = Math.round(seconds % 60);
		if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
		const hrs = Math.floor(mins / 60);
		const remMins = mins % 60;
		return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
	}

	function lapseUrl(id: string): string {
		return `https://lapse.hackclub.com/timelapse/${id}`;
	}

	/** Human label for a non-complete Lookout session; null once the video is ready. */
	function lookoutStatusLabel(status: string): string | null {
		switch (status) {
			case 'complete': return null;
			case 'pending': return 'Not started';
			case 'active': return 'Recording';
			case 'paused': return 'Paused';
			case 'stopped':
			case 'compiling': return 'Processing video';
			case 'failed': return 'Processing failed';
			default: return status;
		}
	}

	function daysBetween(a: string, b: string): number {
		return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
	}

	function commitUrl(sha: string): string | null {
		if (!repoUrl)
			return null;
		const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
		return `${clean}/commit/${sha}`;
	}

	type DisplayItem =
		| { type: 'commit'; commit: GitCommit }
		| { type: 'gap'; days: number }
		| { type: 'marker'; marker: TimelineMarker };

	const displayItems = $derived.by((): DisplayItem[] => {
		const merged: Array<{ date: string; item: DisplayItem }> = [];

		for (const c of filteredCommits) {
			merged.push({ date: c.date, item: { type: 'commit', commit: c } });
		}
		for (const m of markers) {
			merged.push({ date: m.date, item: { type: 'marker', marker: m } });
		}

		merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		const items: DisplayItem[] = [];
		for (let i = 0; i < merged.length; i++) {
			items.push(merged[i].item);
			if (i < merged.length - 1) {
				const cur = merged[i];
				const next = merged[i + 1];
				if (cur.item.type === 'commit' && next.item.type === 'commit') {
					const gap = daysBetween(next.date, cur.date);
					if (gap > 3) {
						items.push({ type: 'gap', days: gap });
					}
				}
			}
		}
		return items;
	});
</script>

<svelte:window
	onclick={() => {
		if (userFilterOpen) userFilterOpen = false;
	}}
/>

<div class="flex flex-col h-full border border-border-card rounded-card shadow-card overflow-hidden {className}">
	<TabBar {tabs} active={activeTab} onchange={(id) => (activeTab = id)} />

	<div class="flex-1 min-h-0 overflow-auto px-8 py-5">
		{#if activeTab === 'github'}
			{#if loading}
				<div class="flex flex-col gap-0.5 animate-pulse">
					<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
					{#each Array(8) as _, i (i)}
						<div class="flex gap-2.5 items-center h-8 px-1">
							<div class="size-5 rounded-full bg-surface shrink-0"></div>
							<div class="flex flex-1 items-center justify-between">
								<div class="h-3.5 rounded bg-surface" style="width: {50 + (i * 17) % 40}%"></div>
								<div class="flex gap-1.5 items-center shrink-0 ml-2">
									<div class="h-3 w-6 rounded bg-surface"></div>
									<div class="h-3 w-6 rounded bg-surface"></div>
									<div class="h-3 w-8 rounded bg-surface"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
			{#if commitAuthors.length > 1}
				<div class="flex justify-end mb-3">
					<div class="relative">
						<button
							class="flex items-center gap-1.5 text-[12px] font-medium rounded-tag border px-2.5 py-1 cursor-pointer transition-colors
								{selectedAuthorEntry
								? 'text-accent bg-accent-bg border-accent'
								: 'text-text-primary bg-page border-border-input hover:border-border-active'}"
							onclick={(e) => {
								e.stopPropagation();
								userFilterOpen = !userFilterOpen;
							}}
						>
							{#if selectedAuthorEntry}
								<Avatar name={selectedAuthorEntry.name} url={selectedAuthorEntry.avatarUrl} size="xs" />
								<span class="truncate max-w-40">{selectedAuthorEntry.name}</span>
								{#if selectedAuthorEntry.login && selectedAuthorEntry.login !== selectedAuthorEntry.name}
									<span class="font-mono font-normal text-accent/70 truncate max-w-32">@{selectedAuthorEntry.login}</span>
								{/if}
							{:else}
								<span>All users</span>
							{/if}
							<ChevronDown size={13} class="shrink-0 transition-transform {userFilterOpen ? 'rotate-180' : ''}" />
						</button>
						{#if userFilterOpen}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div class="user-filter-dropdown" onclick={(e) => e.stopPropagation()}>
								<button
									class="flex w-full items-center gap-2 rounded-tag px-2 py-1.5 text-[12px] cursor-pointer transition-colors
										{selectedAuthor === null ? 'text-accent bg-accent-bg' : 'text-text-primary hover:bg-surface'}"
									onclick={() => selectAuthor(null)}
								>
									<span class="font-medium">All users</span>
									<span class="ml-auto text-[11px] {selectedAuthor === null ? 'text-accent/70' : 'text-text-tertiary'}">
										{commits.length} commit{commits.length === 1 ? '' : 's'}
									</span>
								</button>
								{#each commitAuthors as author (author.key)}
									{@const isSelected = selectedAuthor === author.key}
									<button
										class="flex w-full items-center gap-2 rounded-tag px-2 py-1.5 text-[12px] cursor-pointer transition-colors
											{isSelected ? 'text-accent bg-accent-bg' : 'text-text-primary hover:bg-surface'}"
										onclick={() => selectAuthor(author.key)}
									>
										<Avatar name={author.name} url={author.avatarUrl} size="sm" class="border border-border-card" />
										<span class="font-medium truncate">{author.name}</span>
										{#if author.login && author.login !== author.name}
											<span class="font-mono text-[11px] truncate {isSelected ? 'text-accent/70' : 'text-text-secondary'}">@{author.login}</span>
										{/if}
										<span class="ml-auto shrink-0 text-[11px] {isSelected ? 'text-accent/70' : 'text-text-tertiary'}">
											{author.count}
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
			<div class="flex flex-col gap-0.5 relative">
				{#if filteredCommits.length > 1}
					<div class="absolute left-2.5 top-2.5 bottom-2.5 w-[2px] bg-border-card"></div>
				{/if}

				{#each displayItems as item, i (i)}
					{#if item.type === 'commit' && item.commit}
						{@const url = commitUrl(item.commit.sha)}
						{@const commit = item.commit}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={url ?? '#'}
							target="_blank"
							rel="noopener noreferrer"
							class="flex gap-2.5 items-center h-8 px-1 -mx-1 rounded-tag transition-colors {url ? 'hover:bg-surface cursor-pointer' : ''}"
							onmouseenter={(e) => showPopup(commit, e.currentTarget)}
							onmouseleave={hidePopup}
						>
							<div class="shrink-0 size-5 relative z-10">
								<Avatar name={item.commit.author} url={item.commit.authorAvatarUrl} size="sm" class="border border-border-card" />
							</div>
							<div class="flex flex-1 items-center justify-between min-w-0">
								<p class="font-medium text-sm text-text-primary tracking-[-0.4px] truncate">
									{item.commit.message.split('\n')[0]}
								</p>
								<div class="flex gap-1.5 items-center text-xs shrink-0 ml-2">
									{#if details[item.commit.sha] && details[item.commit.sha] !== 'loading'}
										{@const d = details[item.commit.sha] as CommitDetail}
										<span class="text-git-added">+{d.additions}</span>
										<span class="text-git-removed">-{d.deletions}</span>
									{/if}
									<span class="text-text-faint">{timeAgo(item.commit.date)}</span>
								</div>
							</div>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else if item.type === 'marker' && item.marker}
						<div class="flex gap-2.5 items-center h-8 px-1 -mx-1">
							<div class="shrink-0 size-5 flex items-center justify-center relative z-10 bg-white rounded
								{item.marker.type === 'approval' ? 'text-check-pass' : item.marker.type === 'rejection' ? 'text-check-fail' : 'text-text-primary'}">
								{#if item.marker.type === 'approval'}
									<CircleCheck size={18} />
								{:else if item.marker.type === 'rejection'}
									<CircleX size={18} />
								{:else}
									<Ship size={18} />
								{/if}
							</div>
							<div class="flex flex-1 items-center justify-between min-w-0">
								<p class="font-semibold text-xs tracking-[-0.24px]
									{item.marker.type === 'approval' ? 'text-check-pass' : item.marker.type === 'rejection' ? 'text-check-fail' : 'text-text-primary'}">
									{item.marker.label}
								</p>
								<span class="text-xs text-text-faint shrink-0 ml-2">{shortDate(item.marker.date)}</span>
							</div>
						</div>
					{:else if item.type === 'gap'}
						<div class="flex gap-2.5 items-center h-8 px-1 -mx-1">
							<div class="shrink-0 size-5 rounded-full bg-surface border border-border-card flex items-center justify-center relative z-10">
								<span class="text-[8px] text-text-faint">···</span>
							</div>
							<p class="font-medium text-sm text-text-faint tracking-[-0.4px]">
								{item.days} days later
							</p>
						</div>
					{/if}
				{/each}
			</div>
			{/if}
		{:else if activeTab === 'lapse'}
			<div class="grid grid-cols-2 gap-3">
				{#each timelapses as tl (tl.id)}
					{@const url = lapseUrl(tl.id)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						class="group border border-border-card rounded-section overflow-hidden transition-colors hover:border-accent"
					>
						{#if tl.thumbnailUrl}
							<div class="relative aspect-video bg-surface">
								<img src={tl.thumbnailUrl} alt="" class="w-full h-full object-cover" />
								<div class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
									{fmtDuration(tl.duration)}
								</div>
							</div>
						{:else}
							<div class="relative aspect-video bg-surface flex items-center justify-center">
								<LapseIcon size={24} />
								{#if tl.duration}
									<div class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
										{fmtDuration(tl.duration)}
									</div>
								{/if}
							</div>
						{/if}
						<div class="px-3 py-2.5 flex flex-col gap-0.5">
							<div class="flex items-center justify-between gap-2">
								<p class="font-semibold text-sm text-text-primary truncate">{tl.name}</p>
								<ExternalLink size={12} class="shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
							</div>
							{#if tl.hackatimeProject}
								<p class="text-xs text-text-tertiary font-mono truncate">{tl.hackatimeProject}</p>
							{/if}
							{#if tl.description}
								<p class="text-xs text-text-secondary line-clamp-2">{tl.description}</p>
							{/if}
							{#if tl.visibility === 'UNLISTED'}
								<p class="text-[10px] text-text-faint italic">Unlisted</p>
							{/if}
						</div>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>
		{:else if activeTab === 'lookout'}
			{#snippet lookoutCard(s: LookoutSession)}
				{#if s.thumbnailUrl}
					<div class="relative aspect-video bg-surface">
						<img src={s.thumbnailUrl} alt="" class="w-full h-full object-cover" />
						<div class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
							{fmtDuration(s.trackedSeconds)}
						</div>
					</div>
				{:else}
					<div class="relative aspect-video bg-surface flex items-center justify-center">
						<LookoutIcon size={24} />
						{#if s.trackedSeconds}
							<div class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
								{fmtDuration(s.trackedSeconds)}
							</div>
						{/if}
					</div>
				{/if}
				<div class="px-3 py-2.5 flex flex-col gap-0.5">
					<div class="flex items-center justify-between gap-2">
						<p class="font-semibold text-sm text-text-primary truncate">{s.name}</p>
						{#if s.videoUrl}
							<ExternalLink size={12} class="shrink-0 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
						{/if}
					</div>
					<p class="text-xs text-text-tertiary truncate">
						{s.screenshotCount} screenshot{s.screenshotCount === 1 ? '' : 's'}{s.createdAt ? ` · ${shortDate(s.createdAt)}` : ''}
					</p>
					{#if s.clientInfo}
						<p class="text-xs text-text-secondary font-mono truncate">{s.clientInfo}</p>
					{/if}
					{#if lookoutStatusLabel(s.status)}
						<p class="text-[10px] text-text-faint italic">{lookoutStatusLabel(s.status)}</p>
					{/if}
				</div>
			{/snippet}
			<div class="grid grid-cols-2 gap-3">
				{#each lookoutSessions as s (s.token)}
					{#if s.videoUrl}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={s.videoUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="group border border-border-card rounded-section overflow-hidden transition-colors hover:border-accent"
						>
							{@render lookoutCard(s)}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}
						<div class="border border-border-card rounded-section overflow-hidden">
							{@render lookoutCard(s)}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if hoveredCommit && popupPos}
	{@const detail = details[hoveredCommit.sha]}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-50 transition-opacity duration-150 {popupVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
		style="left: {Math.max(0, popupPos.x - 260)}px; top: {popupPos.y}px;"
		onmouseenter={keepPopup}
		onmouseleave={hidePopup}
	>
		<div class="bg-white border border-border-card rounded-section shadow-card px-3 py-2 w-[260px] max-h-[200px] overflow-auto">
			{#if !detail || detail === 'loading'}
				<div class="flex items-center gap-2 text-xs text-text-secondary py-1">
					<div class="animate-spin size-3 border-2 border-text-tertiary border-t-transparent rounded-full"></div>
					Loading diff…
				</div>
			{:else if detail.files.length > 0}
				<p class="text-[10px] font-bold text-text-secondary mb-1.5">
					{detail.files.length} file{detail.files.length !== 1 ? 's' : ''} changed
					<span class="text-git-added ml-1">+{detail.additions}</span>
					<span class="text-git-removed ml-0.5">-{detail.deletions}</span>
				</p>
				<div class="flex flex-col gap-0.5">
					{#each detail.files as file (file.filename)}
						<div class="flex items-center justify-between gap-2 text-[11px]">
							<span class="text-text-primary truncate font-mono">{file.filename.split('/').pop()}<span class="text-text-tertiary font-sans">{file.filename.includes('/') ? ` ${file.filename.slice(0, file.filename.lastIndexOf('/'))}` : ''}</span></span>
							<div class="flex gap-1 shrink-0 text-[10px]">
								{#if file.additions > 0}<span class="text-git-added">+{file.additions}</span>{/if}
								{#if file.deletions > 0}<span class="text-git-removed">-{file.deletions}</span>{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-[10px] text-text-faint py-1">No files changed</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.user-filter-dropdown {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		min-width: 220px;
		max-width: 320px;
		max-height: 260px;
		overflow-y: auto;
		background: var(--color-page, #fff);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
		cursor: default;
	}
</style>
