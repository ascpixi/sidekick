<script lang="ts">
	import Avatar from './Avatar.svelte';
	import SlackIcon from '../icons/SlackIcon.svelte';
	import { ShieldAlert, Clock, Mail, ArrowRight, Eye, Pencil, X, Check, StickyNote, IdCard } from 'lucide-svelte';
	import type { TrustLog } from '$lib/server/integrations/hackatime.js';

	interface Props {
		name: string;
		avatarUrl?: string | null;
		joinDate: string;
		slackId?: string | null;
		hackatimeId?: string | null;
		email?: string | null;
		hcaName?: string | null;
		trustLevel?: string | null;
		trustLogs?: TrustLog[];
		slackDeactivated?: boolean | null;
		loading?: boolean;
		// Per-user reviewer note (optional protocol feature). The section is only
		// rendered when noteSupported is true; onSaveNote resolves to whether the
		// save succeeded.
		noteSupported?: boolean;
		note?: string | null;
		canEditNote?: boolean;
		onSaveNote?: (note: string) => Promise<boolean>;
		class?: string;
	}

	let {
		name,
		avatarUrl = null,
		joinDate,
		slackId = null,
		hackatimeId = null,
		email = null,
		hcaName = null,
		trustLevel = null,
		trustLogs = [],
		slackDeactivated = null,
		loading = false,
		noteSupported = false,
		note = null,
		canEditNote = false,
		onSaveNote = undefined,
		class: className = ''
	}: Props = $props();

	let editingNote = $state(false);
	let noteDraft = $state('');
	let savingNote = $state(false);
	let noteError = $state<string | null>(null);

	function startEditNote() {
		noteDraft = note ?? '';
		noteError = null;
		editingNote = true;
	}

	async function saveNote() {
		if (!onSaveNote || savingNote) return;
		savingNote = true;
		noteError = null;
		const ok = await onSaveNote(noteDraft.trim());
		savingNote = false;
		if (ok) {
			editingNote = false;
		} else {
			noteError = 'Failed to save note. Please try again.';
		}
	}

	function openSlack() {
		if (slackId) {
			window.open(`https://hackclub.enterprise.slack.com/team/${slackId}`, '_blank');
		}
	}

	// Telescreen identifies subjects by Hackatime ID first, falling back to Slack ID.
	const telescreenId = $derived(hackatimeId ?? slackId);

	function openTelescreen() {
		if (telescreenId) {
			window.open(`https://telescreen.hackclub.com/subjects/${telescreenId}`, '_blank');
		}
	}

	const trustColorClasses = $derived(
		trustLevel === 'green'
			? 'bg-check-pass text-white'
			: trustLevel === 'yellow'
				? 'bg-amber-400 text-black'
				: trustLevel === 'red'
					? 'bg-check-fail text-white'
					: trustLevel === 'blue'
						? 'bg-blue-500 text-white'
						: 'bg-text-tertiary text-white'
	);

	function trustPillClasses(level: string): string {
		switch (level) {
			case 'green':
				return 'bg-check-pass text-white';
			case 'red':
				return 'bg-check-fail text-white';
			case 'yellow':
				return 'bg-amber-400 text-black';
			case 'blue':
				return 'bg-blue-500 text-white';
			default:
				return 'bg-text-tertiary text-white';
		}
	}

	function formatLogDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let showTooltip = $state(false);
	let pillEl: HTMLDivElement | undefined = $state();
	// The tooltip is right-anchored to the pill and up to 420px wide, so on a
	// card near the viewport's left edge it would run off-screen. Flip it to a
	// left anchor (growing rightwards) when there isn't room on the left.
	let tooltipAlignLeft = $state(false);

	function openTrustTooltip() {
		if (trustLogs.length === 0) return;
		tooltipAlignLeft = (pillEl?.getBoundingClientRect().right ?? Infinity) < 436;
		showTooltip = true;
	}
</script>

<div
	class="@container border border-border-card rounded-card shadow-card p-8 flex flex-col gap-4 {className}"
>
	<div class="flex gap-2 items-center w-full">
		<div class="flex flex-1 gap-2.5 items-center min-w-0">
			<Avatar {name} url={avatarUrl} size="lg" />
			<div class="flex flex-col gap-0.5 min-w-0">
				<p class="font-bold text-[16px] text-text-primary tracking-[-0.48px] truncate">{name}</p>
				{#if joinDate}
					<p class="text-sm text-text-primary tracking-[-0.3px]">{joinDate}</p>
				{/if}
			</div>
		</div>
		{#if telescreenId}
			<button
				class="size-8 shrink-0 rounded-tag border border-border-input flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
				onclick={openTelescreen}
				title="Open profile in Telescreen"
			>
				<Eye size={16} />
			</button>
		{/if}
		{#if slackId}
			<button
				class="size-8 shrink-0 rounded-tag border border-border-input flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
				onclick={openSlack}
				title="Open in Slack"
			>
				<SlackIcon size={16} />
			</button>
		{/if}
	</div>

	<div class="flex flex-col gap-2 w-full">
		{#if hcaName}
			<div class="flex items-center justify-between w-full gap-2">
				<div class="flex gap-1.5 items-center shrink-0">
					<IdCard size={14} class="text-text-primary" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">HCA name</span>
				</div>
				<span class="text-sm text-text-primary tracking-[-0.3px] truncate min-w-0" title={hcaName}
					>{hcaName}</span
				>
			</div>
		{/if}

		{#if loading && !trustLevel}
			<div class="flex items-center justify-between w-full animate-pulse">
				<div class="flex gap-1.5 items-center">
					<ShieldAlert size={14} class="text-text-placeholder" />
					<span class="text-sm text-text-placeholder tracking-[-0.3px]">Hackatime trust level</span>
				</div>
				<div class="h-3.5 w-12 rounded bg-surface"></div>
			</div>
		{:else if trustLevel}
			<div class="flex items-center justify-between w-full">
				<div class="flex gap-1.5 items-center">
					<ShieldAlert size={14} class="text-text-primary" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">Hackatime trust level</span>
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="relative"
					onmouseenter={openTrustTooltip}
					onmouseleave={() => (showTooltip = false)}
				>
					<div
						bind:this={pillEl}
						class="px-2.5 py-0.5 rounded-full text-xs font-medium tracking-[-0.3px] cursor-default select-none {trustColorClasses}"
					>
						{trustLevel}{#if trustLogs.length > 0}<span class="opacity-75 ml-1"
								>({trustLogs.length})</span
							>{/if}
					</div>

					{#if showTooltip && trustLogs.length > 0}
						<div class="trust-tooltip-bridge"></div>
						<div class="trust-tooltip" class:trust-tooltip-left={tooltipAlignLeft}>
							<div class="flex flex-col gap-3">
								{#each trustLogs.slice(0, 10) as log}
									<div class="flex flex-col gap-2">
										<div class="flex items-center gap-2">
											<span
												class="px-2 py-0.5 rounded-full text-xs font-medium tracking-[-0.3px] leading-none {trustPillClasses(
													log.previousTrustLevel
												)}">{log.previousTrustLevel}</span
											>
											<ArrowRight size={12} class="text-text-tertiary shrink-0" />
											<span
												class="px-2 py-0.5 rounded-full text-xs font-medium tracking-[-0.3px] leading-none {trustPillClasses(
													log.newTrustLevel
												)}">{log.newTrustLevel}</span
											>
											<span class="text-xs text-text-tertiary ml-auto shrink-0 leading-none"
												>{formatLogDate(log.createdAt)}</span
											>
											{#if log.changedBy}
												<span class="text-xs text-text-secondary shrink-0 leading-none"
													>{log.changedBy}</span
												>
												<Avatar name={log.changedBy} url={log.changedByAvatarUrl} size="xs" />
											{/if}
										</div>
										{#if log.reason}
											<span class="text-xs text-text-secondary leading-tight">{log.reason}</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if slackId}
			<div class="flex items-center justify-between w-full gap-2">
				<div class="flex gap-1.5 items-center shrink-0">
					<SlackIcon size={14} class="text-text-primary shrink-0" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">Slack ID</span>
				</div>
				<div class="flex gap-2 items-center min-w-0">
					<span class="font-mono text-sm text-text-primary tracking-[-0.3px] truncate"
						>{slackId}</span
					>
					{#if slackDeactivated}
						<div class="flex gap-1.5 items-center shrink-0">
							<span
								class="inline-block rounded-full shrink-0 bg-check-fail"
								style="width: 8px; height: 8px"
							></span>
							<span class="text-sm tracking-[-0.3px] text-check-fail">deactivated</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if hackatimeId}
			<div class="flex items-center justify-between w-full gap-2">
				<div class="flex gap-1.5 items-center shrink-0">
					<Clock size={14} class="text-text-primary" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">Hackatime ID</span>
				</div>
				<span class="font-mono text-sm text-text-primary tracking-[-0.3px] truncate min-w-0"
					>{hackatimeId}</span
				>
			</div>
		{/if}

		{#if email}
			<div class="flex items-center justify-between w-full gap-2">
				<div class="flex gap-1.5 items-center shrink-0">
					<Mail size={14} class="text-text-primary" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">Email</span>
				</div>
				<span class="font-mono text-sm text-text-primary tracking-[-0.3px] truncate min-w-0"
					>{email}</span
				>
			</div>
		{/if}

		{#if noteSupported && (note || editingNote)}
			<div
				class="bg-accent-bg-warm border border-dashed border-accent rounded-tag p-3 flex flex-col gap-1.5 w-full min-w-0 mt-1"
			>
				<p class="font-bold text-sm tracking-[-0.3px] flex items-center gap-1.5">
					Reviewer note
					<Eye size={12} class="text-accent" />
					{#if canEditNote && !editingNote}
						<button
							class="ml-auto bg-white border border-border-active rounded-tag p-1.5 flex items-center justify-center hover:bg-surface transition-colors cursor-pointer"
							onclick={startEditNote}
							title="Edit reviewer note"
						>
							<Pencil size={12} />
						</button>
					{/if}
				</p>
				{#if editingNote}
					<textarea
						bind:value={noteDraft}
						rows="3"
						disabled={savingNote}
						placeholder="Internal note about this user — visible to reviewers only, follows them across projects"
						class="text-sm tracking-[-0.3px] bg-white border border-dashed border-accent rounded-tag px-2.5 py-2 resize-y outline-none focus:border-accent transition-colors"
					></textarea>
					{#if noteError}
						<p class="text-sm text-check-fail tracking-[-0.3px]">{noteError}</p>
					{/if}
					<div class="flex items-center justify-end gap-1.5">
						<button
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-tag text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
							disabled={savingNote}
							onclick={() => (editingNote = false)}
						>
							<X size={12} />
							Cancel
						</button>
						<button
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-tag text-xs font-medium bg-accent text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							disabled={savingNote}
							onclick={saveNote}
						>
							<Check size={12} />
							{savingNote ? 'Saving...' : 'Save'}
						</button>
					</div>
				{:else}
					<p class="text-sm tracking-[-0.3px] whitespace-pre-wrap break-words">{note}</p>
				{/if}
			</div>
		{:else if noteSupported && canEditNote}
			<div class="flex items-center justify-between w-full gap-2">
				<div class="flex gap-1.5 items-center shrink-0">
					<StickyNote size={14} class="text-text-primary" />
					<span class="text-sm text-text-primary tracking-[-0.3px]">Reviewer note</span>
				</div>
				<button
					class="flex gap-1 items-center text-sm text-text-secondary tracking-[-0.3px] hover:text-text-primary transition-colors cursor-pointer"
					onclick={startEditNote}
				>
					<Pencil size={12} />
					Add note
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.trust-tooltip-bridge {
		position: absolute;
		right: 0;
		top: 100%;
		width: 100%;
		height: 8px;
	}

	.trust-tooltip {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		background: var(--color-page, #fff);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		padding: 16px;
		min-width: min(320px, calc(100vw - 32px));
		max-width: min(420px, calc(100vw - 32px));
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
	}

	.trust-tooltip-left {
		right: auto;
		left: 0;
	}
</style>
