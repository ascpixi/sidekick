<script lang="ts">
	import { createLogger } from '$lib/logger.js';
	import { MapPin, Eye } from 'lucide-svelte';
	import { countryName } from '$lib/utils/countries';

	const log = createLogger('ShippingAddress');

	interface AddressData {
		firstName: string;
		lastName: string;
		line1: string;
		line2?: string;
		city: string;
		stateProvince?: string;
		postalCode: string;
		country: string;
		phoneNumber?: string;
	}

	interface Props {
		orderId: string;
		programId: string;
		class?: string;
	}

	let { orderId, programId, class: className = '' }: Props = $props();

	let revealed = $state(false);
	let loading = $state(false);
	let address = $state<AddressData | null>(null);
	let noAddress = $state(false);
	let unavailable = $state(false);
	let fetchError = $state<string | null>(null);

	async function revealAddress() {
		loading = true;
		fetchError = null;
		noAddress = false;
		unavailable = false;
		log.info('Revealing shipping address', { orderId, programId });
		const t = log.time('revealAddress');

		try {
			const res = await fetch(`/api/programs/${programId}/orders/${orderId}/address`, {
				method: 'POST'
			});

			t.end('status', res.status);

			if (res.status === 404) {
				log.debug('No shipping address on file (404)', { orderId });
				noAddress = true;
				revealed = true;
				return;
			}
			if (res.status === 503) {
				// Upstream can't retrieve the address right now (e.g. expired HCA
				// tokens) — leave the reveal button visible so the user can retry.
				log.warn('Shipping address temporarily unavailable (503)', { orderId });
				unavailable = true;
				return;
			}
			if (!res.ok) {
				log.error('Address reveal failed', { status: res.status });
				throw new Error('Failed to load address');
			}
			address = await res.json();
			revealed = true;
			log.info('Address revealed successfully', { orderId, country: address?.country });
		}
		catch (e) {
			fetchError = e instanceof Error ? e.message : 'Unknown error';
			log.error('Address reveal exception', e);
		}
		finally {
			loading = false;
		}
	}

	const fields = $derived(
		address
			? [
					{ label: 'First Name', value: address.firstName },
					{ label: 'Last Name', value: address.lastName },
					{ label: 'Line 1', value: address.line1 },
					...(address.line2 ? [{ label: 'Line 2', value: address.line2 }] : []),
					{ label: 'City', value: address.city },
					...(address.stateProvince
						? [{ label: 'State/Province/etc.', value: address.stateProvince }]
						: []),
					{ label: 'Postal Code', value: address.postalCode },
					{ label: 'Country', value: countryName(address.country) },
					...(address.phoneNumber
						? [{ label: 'Phone Number', value: address.phoneNumber }]
						: [])
				]
			: []
	);

	let fieldsEl = $state<HTMLElement | null>(null);

	// Rewrite the clipboard payload so a manual selection copies as
	// "Label: value" lines. The visible layout uses separate flex items for
	// each label/value, which browsers otherwise serialize onto their own
	// lines with no separator. Rows whose label isn't part of the selection
	// copy as just the value, and a selection touching no labels at all is
	// left to the browser so partial value selections copy verbatim.
	function handleCopy(e: ClipboardEvent) {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
		if (!fieldsEl || !e.clipboardData) return;

		const rows = [...fieldsEl.querySelectorAll<HTMLElement>('[data-field]')]
			.filter((row) => selection.containsNode(row, true))
			.map((row) => {
				const labelEl = row.querySelector('[data-field-label]');
				return {
					row,
					labelSelected: labelEl !== null && selection.containsNode(labelEl, true)
				};
			});
		if (!rows.some(({ labelSelected }) => labelSelected)) return;

		const text = rows
			.map(({ row, labelSelected }) =>
				labelSelected ? `${row.dataset.label}: ${row.dataset.value}` : row.dataset.value
			)
			.join('\n');
		e.clipboardData.setData('text/plain', text);
		e.preventDefault();
	}
</script>

<div class="@container border border-border-card rounded-card p-8 flex flex-col gap-4 {className}">
	<div class="flex gap-2 items-center">
		<MapPin size={14} class="text-text-primary" />
		<span class="font-bold text-[15px] text-text-primary tracking-[-0.4px]">Shipping Address</span>
	</div>

	{#if !revealed}
		<button
			class="w-full py-2 border border-dashed border-border-input rounded-section text-center text-text-placeholder tracking-[-0.3px] text-sm hover:bg-surface transition-colors cursor-pointer flex items-center justify-center gap-2"
			onclick={revealAddress}
			disabled={loading}
		>
			<Eye size={14} />
			{#if loading}
				Loading...
			{:else}
				Click to reveal shipping address
			{/if}
		</button>
		{#if unavailable}
			<p class="text-amber-600 text-xs">The shipping address is temporarily unavailable upstream. Try again in a moment.</p>
		{/if}
		{#if fetchError}
			<p class="text-check-fail text-xs">{fetchError}</p>
		{/if}
	{:else if noAddress}
		<p class="text-sm text-text-tertiary tracking-[-0.3px]">No shipping address on file for this order.</p>
	{:else if address}
		<div
			bind:this={fieldsEl}
			oncopy={handleCopy}
			class="flex flex-col gap-2 w-full text-sm tracking-[-0.3px]"
		>
			{#each fields as field (field.label)}
				<div
					data-field
					data-label={field.label}
					data-value={field.value}
					class="flex flex-col @xs:flex-row @xs:items-center @xs:justify-between w-full gap-0.5 @xs:gap-2"
				>
					<span data-field-label class="shrink-0">{field.label}</span>
					<span class="truncate min-w-0">{field.value}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
