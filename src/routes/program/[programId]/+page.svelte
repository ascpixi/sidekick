<script lang="ts">
	import type { PageData } from './$types.js';
	import BentoGraph from '$lib/components/ui/BentoGraph.svelte';
	import BentoLeaderboard from '$lib/components/ui/BentoLeaderboard.svelte';
	import BentoBox from '$lib/components/ui/BentoBox.svelte';
	import UserMention from '$lib/components/ui/UserMention.svelte';
	import { Scale, Package, Trophy, Clock, Hourglass } from 'lucide-svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const REVIEW_VERBS: Record<string, string> = {
		review_approve: 'approved',
		review_pending_approve: 'pre-approved',
		review_authorize: 'authorized',
		review_reject: 'rejected',
		review_deauthorize: 'deauthorized',
		review_discard_pending: 'sent back',
		review_comment: 'commented on',
		review_internal_comment: 'commented on',
		review_edit_approval: 'edited an approval of',
		review_edit_rejection: 'edited a rejection of'
	};

	function reviewVerb(action: string): string {
		return REVIEW_VERBS[action] ?? 'reviewed';
	}

	function fulfillmentVerb(action: string, metadata: Record<string, unknown> | null): string {
		if (action === 'order_status_change') {
			switch (metadata?.status) {
				case 'fulfilled':
					return 'fulfilled';
				case 'cancelled':
					return 'cancelled';
				case 'pending':
					return 'reopened';
			}
		}
		return 'updated';
	}

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const hours = Math.floor(diff / 3600000);
		if (hours < 1)
			return '<1h';
		if (hours < 24)
			return `${hours}h`;
		return `${Math.floor(hours / 24)}d`;
	}
</script>

<svelte:head>
	<title>{data.program.name} - Sidekick</title>
</svelte:head>

<div class="px-6 lg:px-12 xl:px-16 py-10 flex flex-col gap-8 max-w-full overflow-hidden">
	<div class="flex items-center justify-between flex-wrap gap-4">
		<div class="flex gap-5 items-center">
			{#if data.program.iconUrl}
				<img src={data.program.iconUrl} alt="" class="w-12 h-14 object-contain" />
			{:else}
				<div class="size-12 bg-accent rounded-section flex items-center justify-center text-white font-bold text-xl">
					{data.program.name.charAt(0)}
				</div>
			{/if}
			<div class="flex flex-col gap-1">
				<h1 class="font-bold text-[24px] tracking-[-0.72px]">{data.program.name}</h1>
				<p class="text-[15px] tracking-[-0.3px]">YSWS Program</p>
			</div>
		</div>

		<div
			class="bg-surface flex flex-col gap-1 items-end justify-center overflow-clip pl-4 pr-8 py-3 rounded-section"
			title="Total hours of pending projects, divided by 10"
		>
			<div class="flex gap-2 items-center">
				<Hourglass size={15} class="text-text-primary" />
				<span class="text-[14px] tracking-[-0.28px]">Pending WPs</span>
			</div>
			<span class="font-bold text-[24px] tracking-[-0.96px]">{Math.round(data.pendingWps * 10) / 10}</span>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
		<BentoGraph
			title="Pending Fulfillment"
			description="Orders awaiting fulfillment, day by day."
			count={data.pendingFulfillmentCount}
			data={data.fulfillmentVolume}
			class="flex-1"
		>
			{#snippet icon()}<Package size={20} />{/snippet}
		</BentoGraph>
		<BentoLeaderboard
			title="Fulfillment Leaderboard (This Week)"
			description="The number of fulfilled orders done this week."
			entries={data.fulfillmentLeaderboardWeekly}
			itemType="orders"
			class="flex-1"
		>
			{#snippet icon()}<Trophy size={20} />{/snippet}
		</BentoLeaderboard>
		<BentoLeaderboard
			title="Fulfillment Leaderboard (All Time)"
			description="The number of fulfilled orders done all time."
			entries={data.fulfillmentLeaderboardAllTime}
			itemType="orders"
			class="flex-1"
		>
			{#snippet icon()}<Trophy size={20} />{/snippet}
		</BentoLeaderboard>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
		<BentoLeaderboard
			title="Review Leaderboard (This Week)"
			description="The number of reviews done this week."
			entries={data.reviewLeaderboardWeekly}
			itemType="reviews"
			class="flex-1"
		>
			{#snippet icon()}<Trophy size={20} />{/snippet}
		</BentoLeaderboard>
		<BentoLeaderboard
			title="Review Leaderboard (All Time)"
			description="The number of reviews done all time."
			entries={data.reviewLeaderboardAllTime}
			itemType="reviews"
			class="flex-1"
		>
			{#snippet icon()}<Trophy size={20} />{/snippet}
		</BentoLeaderboard>
		<BentoGraph
			title="Pending Review"
			description="Projects awaiting review, day by day."
			count={data.pendingReviewCount}
			data={data.reviewVolume}
			class="flex-1"
		>
			{#snippet icon()}<Scale size={20} />{/snippet}
		</BentoGraph>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
		<BentoBox
			title="Fulfillment History"
			description="Most recently fulfilled orders."
			class="flex-1"
		>
			{#snippet icon()}<Clock size={20} />{/snippet}
			<div class="flex flex-col gap-2">
				{#each data.recentFulfillments as entry, i (i)}
					<div class="flex h-7 items-center justify-between gap-2">
						<div class="flex gap-1 items-center text-sm min-w-0">
							<UserMention name={entry.userName} avatarUrl={entry.userAvatarUrl} size="sm" />
							<span class="shrink-0">{fulfillmentVerb(entry.action, entry.metadata)}</span>
							<span class="font-bold truncate" title={entry.entityId ?? undefined}>
								{entry.entityLabel ?? entry.entityId ?? 'an order'}
							</span>
						</div>
						<span class="text-text-tertiary text-[12px] shrink-0">{timeAgo(entry.createdAt)}</span>
					</div>
				{/each}
			</div>
		</BentoBox>
		<BentoBox
			title="Review History"
			description="Most recently reviewed projects."
			class="flex-1"
		>
			{#snippet icon()}<Scale size={20} />{/snippet}
			<div class="flex flex-col gap-2">
				{#each data.recentReviews as entry, i (i)}
					<div class="flex h-7 items-center justify-between gap-2">
						<div class="flex gap-1 items-center text-sm min-w-0">
							<UserMention name={entry.userName} avatarUrl={entry.userAvatarUrl} size="sm" />
							<span class="shrink-0">{reviewVerb(entry.action)}</span>
							<span class="font-bold truncate" title={entry.entityId ?? undefined}>
								{entry.entityLabel ?? entry.entityId ?? 'a project'}
							</span>
						</div>
						<span class="text-text-tertiary text-[12px] shrink-0">{timeAgo(entry.createdAt)}</span>
					</div>
				{/each}
			</div>
		</BentoBox>
	</div>
</div>
