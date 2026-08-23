<script lang="ts">
	import { createLogger } from '$lib/logger.js';
	import { X, NotebookPen, MessageSquareText, ChevronDown, ExternalLink, Pencil, Check, CreditCard, Loader2, TriangleAlert, Package } from 'lucide-svelte';
	import StatusLight from '$lib/components/ui/StatusLight.svelte';
	import UserCard from '$lib/components/ui/UserCard.svelte';
	import ShippingAddress from './ShippingAddress.svelte';
	import { marked, Renderer } from 'marked';
	import { isUuid, shortenId } from '$lib/utils/id';

	const log = createLogger('OrderDetailPane');

	const contextRenderer = new Renderer();
	contextRenderer.link = ({ href, text }) =>
		`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
	import type { Order, ShopItem } from '$lib/server/protocol/types.js';

	interface CardGrantTemplateInfo {
		shopItemId: string;
		amountCents: number;
		purpose: string | null;
		oneTimeUse: boolean;
	}

	interface WarehouseTemplateInfo {
		shopItemId: string;
		tags: string;
		userFacingTitle: string | null;
		contents: Array<{ sku: string; quantity: number }>;
	}

	interface Props {
		order: Order;
		item: ShopItem;
		programId: string;
		cardGrantTemplate?: CardGrantTemplateInfo | null;
		warehouseTemplate?: WarehouseTemplateInfo | null;
		hcbOrganization?: { id: string; name: string } | null;
		hasTheseusApiKey?: boolean;
		onclose: () => void;
		onstatuschange?: (newStatus: string) => void;
		onreferencechange?: (newRef: string) => void;
		onnoteschange?: (newNotes: string) => void;
		onusernoteschange?: (newNotes: string) => void;
		oncontextchange?: (newContext: string) => void;
		onsendgrant?: (reference: string) => void;
		onbatchreferencechange?: (updates: Array<{ orderId: string; reference: string }>) => void;
	}

	let { order, item, programId, cardGrantTemplate = null, warehouseTemplate = null, hcbOrganization = null, hasTheseusApiKey = false, onclose, onstatuschange, onreferencechange, onnoteschange, onusernoteschange, oncontextchange, onsendgrant, onbatchreferencechange }: Props = $props();

	let editingNotes = $state(false);
	let notesValue = $state('');
	let savingNotes = $state(false);

	$effect(() => {
		notesValue = order.adminNotes ?? '';
		editingNotes = false;
	});

	let editingRef = $state(false);
	let refValue = $state('');
	let savingRef = $state(false);
	let refOverride = $state<string | null>(null);
	const currentRefUrl = $derived(refOverride ?? order.reference ?? '');

	$effect(() => {
		void order.reference;
		refOverride = null;
		editingRef = false;
	});

	function startEditRef() {
		refValue = currentRefUrl;
		editingRef = true;
	}

	function cancelEditRef() {
		editingRef = false;
	}

	async function saveRef() {
		savingRef = true;
		log.info('Saving reference for order', { orderId: order.id, refValue });
		const t = log.time('saveRef');

		try {
			const res = await fetch(`/api/programs/${programId}/orders`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id, reference: refValue || undefined })
			});

			t.end('status', res.status);
			if (!res.ok) {
				log.warn('Save reference returned non-ok status', { status: res.status });
			} else {
				log.debug('Reference saved successfully');
			}

			refOverride = refValue;
			onreferencechange?.(refValue);
			editingRef = false;
		}
		catch (e) {
			log.error('Failed to save reference', e);
			throw e;
		}
		finally {
			savingRef = false;
		}
	}

	function handleRefKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			saveRef();
		} else if (e.key === 'Escape') {
			cancelEditRef();
		}
	}

	const refIsUrl = $derived.by(() => {
		try { return Boolean(currentRefUrl && new URL(currentRefUrl)); }
		catch { return false; }
	});

	type OrderStatus = 'pending' | 'fulfilled' | 'cancelled';
	const statusOptions: Array<{ value: OrderStatus; label: string; light: 'ok' | 'pending' | 'fail' }> = [
		{ value: 'pending', label: 'Pending', light: 'pending' },
		{ value: 'fulfilled', label: 'Fulfilled', light: 'ok' },
		{ value: 'cancelled', label: 'Cancelled', light: 'fail' },
	];

	let statusOverride = $state<OrderStatus | null>(null);
	const currentStatus = $derived<OrderStatus>(statusOverride ?? order.status as OrderStatus);
	let statusDropdownOpen = $state(false);
	let savingStatus = $state(false);

	$effect(() => {
		void order.status;
		statusOverride = null;
	});

	const currentStatusOption = $derived(
		statusOptions.find(o => o.value === currentStatus) ?? statusOptions[0]
	);

	function toggleStatusDropdown() {
		statusDropdownOpen = !statusDropdownOpen;
	}

	function closeStatusDropdown() {
		statusDropdownOpen = false;
	}

	async function selectStatus(value: OrderStatus) {
		if (value === currentStatus) {
			statusDropdownOpen = false;
			return;
		}

		savingStatus = true;
		statusDropdownOpen = false;
		log.info('Changing order status', { orderId: order.id, from: currentStatus, to: value });
		const t = log.time('selectStatus');

		try {
			const res = await fetch(`/api/programs/${programId}/orders`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id, status: value })
			});

			t.end('status', res.status);
			if (!res.ok) {
				log.warn('Status change returned non-ok', { status: res.status });
			} else {
				log.debug('Status changed successfully', { newStatus: value });
			}

			statusOverride = value;
			onstatuschange?.(value);
		}
		catch (e) {
			log.error('Failed to change status', e);
			throw e;
		}
		finally {
			savingStatus = false;
		}
	}

	function handleWindowClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('[data-status-dropdown]')) {
			closeStatusDropdown();
		}
	}

	$effect(() => {
		if (statusDropdownOpen) {
			window.addEventListener('click', handleWindowClick, true);
			return () => window.removeEventListener('click', handleWindowClick, true);
		}
	});

	async function saveNotes() {
		savingNotes = true;
		log.info('Saving admin notes for order', { orderId: order.id });
		const t = log.time('saveNotes');

		try {
			const res = await fetch(`/api/programs/${programId}/orders`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id, adminNotes: notesValue })
			});

			t.end('status', res.status);
			if (!res.ok) {
				log.warn('Save admin notes returned non-ok', { status: res.status });
			} else {
				log.debug('Admin notes saved successfully');
			}

			onnoteschange?.(notesValue);
			editingNotes = false;
		}
		catch (e) {
			log.error('Failed to save admin notes', e);
			throw e;
		}
		finally {
			savingNotes = false;
		}
	}

	function cancelNotesEdit() {
		notesValue = order.adminNotes ?? '';
		editingNotes = false;
	}

	let editingUserNotes = $state(false);
	let userNotesValue = $state('');
	let savingUserNotes = $state(false);

	$effect(() => {
		userNotesValue = order.userNotes ?? '';
		editingUserNotes = false;
	});

	async function saveUserNotes() {
		savingUserNotes = true;
		log.info('Saving user notes for order', { orderId: order.id });
		const t = log.time('saveUserNotes');

		try {
			const res = await fetch(`/api/programs/${programId}/orders`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id, userNotes: userNotesValue })
			});

			t.end('status', res.status);
			if (!res.ok) {
				log.warn('Save user notes returned non-ok', { status: res.status });
			} else {
				log.debug('User notes saved successfully');
			}

			onusernoteschange?.(userNotesValue);
			editingUserNotes = false;
		}
		catch (e) {
			log.error('Failed to save user notes', e);
			throw e;
		}
		finally {
			savingUserNotes = false;
		}
	}

	function cancelUserNotesEdit() {
		userNotesValue = order.userNotes ?? '';
		editingUserNotes = false;
	}

	let editingContext = $state(false);
	let contextValue = $state('');
	let savingContext = $state(false);

	$effect(() => {
		contextValue = item.fulfillerContext ?? '';
		editingContext = false;
	});

	async function saveContext() {
		savingContext = true;
		log.info('Saving fulfiller context for item', { itemId: item.id });
		const t = log.time('saveContext');

		try {
			const res = await fetch(`/api/programs/${programId}/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fulfillerContext: contextValue })
			});

			t.end('status', res.status);
			if (!res.ok) {
				log.warn('Save fulfiller context returned non-ok', { status: res.status });
			} else {
				log.debug('Fulfiller context saved successfully');
			}

			oncontextchange?.(contextValue);
			editingContext = false;
		}
		catch (e) {
			log.error('Failed to save fulfiller context', e);
			throw e;
		}
		finally {
			savingContext = false;
		}
	}

	function cancelContextEdit() {
		contextValue = item.fulfillerContext ?? '';
		editingContext = false;
	}

	interface ExistingGrant {
		id: string;
		amount_cents: number;
		balance_cents?: number;
		email: string;
		purpose: string | null;
		status: string;
		created_at: string;
	}

	let sendingGrant = $state(false);
	let grantSent = $state(false);
	let grantError = $state('');
	let existingGrants = $state<ExistingGrant[]>([]);
	let loadingGrants = $state(false);
	let selectedGrantId = $state<string | null>(null);
	let grantMode = $state<'new' | 'topup'>('new');

	$effect(() => {
		void order.id;
		grantSent = false;
		grantError = '';
		existingGrants = [];
		selectedGrantId = null;
		grantMode = 'new';

		if (cardGrantTemplate && hcbOrganization && order.userEmail) {
			loadingGrants = true;
			log.info('Fetching existing HCB grants', { email: order.userEmail, orderId: order.id });
			const t = log.time('fetchGrants');
			fetch(`/api/programs/${programId}/hcb/grants?email=${encodeURIComponent(order.userEmail)}`)
				.then((r) => {
					log.debug('HCB grants response', { status: r.status });
					return r.json();
				})
				.then((data) => {
					existingGrants = data.grants ?? [];
					t.end('grants found', existingGrants.length);
				})
				.catch((e) => {
					log.error('Failed to fetch HCB grants', e);
				})
				.finally(() => { loadingGrants = false; });
		}
	});

	async function sendCardGrant() {
		if (!cardGrantTemplate || !hcbOrganization)
			return;
		sendingGrant = true;
		grantError = '';
		log.info('Sending card grant', { orderId: order.id, mode: grantMode, selectedGrantId });
		const t = log.time('sendCardGrant');

		try {
			const body: Record<string, unknown> = { orderId: order.id, email: order.userEmail };
			if (grantMode === 'topup' && selectedGrantId) {
				body.topUpGrantId = selectedGrantId;
			}

			const res = await fetch(`/api/programs/${programId}/hcb/send-grant`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			t.end('status', res.status);

			if (res.status === 401) {
				const data = await res.json();
				if (data.needsAuth) {
					log.warn('HCB auth required, redirecting');
					window.location.href = `/auth/hcb?returnUrl=${encodeURIComponent(window.location.pathname)}`;
					return;
				}
			}

			if (!res.ok) {
				const text = await res.text();
				grantError = `Failed: ${text}`;
				log.error('Card grant failed', { status: res.status, body: text });
				return;
			}

			const data = await res.json();
			grantSent = true;
			refOverride = data.reference;
			onreferencechange?.(data.reference);
			onsendgrant?.(data.reference);
			log.info('Card grant sent successfully', { reference: data.reference });
		} catch (e) {
			grantError = e instanceof Error ? e.message : 'Unknown error';
			log.error('Card grant exception', e);
		} finally {
			sendingGrant = false;
		}
	}

	function fmtGrantDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	let sendingWarehouseOrder = $state(false);
	let warehouseOrderSent = $state(false);
	let warehouseOrderError = $state('');

	interface BatchableOrder {
		id: string;
		quantity: number;
		createdAt: string;
		reference?: string;
	}

	let batchOrders = $state<BatchableOrder[]>([]);
	let batchTotalQuantity = $state(0);
	let loadingBatch = $state(false);
	let sendingBatchOrder = $state(false);
	let batchOrderSent = $state(false);
	let batchOrderError = $state('');
	let batchOrderRef = $state('');
	let batchOrderIds = $state<string[]>([]);

	$effect(() => {
		void order.id;
		warehouseOrderSent = false;
		warehouseOrderError = '';
		batchOrders = [];
		batchTotalQuantity = 0;
		batchOrderSent = false;
		batchOrderError = '';
		batchOrderRef = '';
		batchOrderIds = [];

		if (warehouseTemplate && hasTheseusApiKey && hcbOrganization) {
			loadingBatch = true;
			fetch(`/api/programs/${programId}/warehouse/batch-order?itemId=${encodeURIComponent(order.itemId)}&userId=${encodeURIComponent(order.userId)}`)
				.then(r => r.json())
				.then(data => {
					batchOrders = data.orders ?? [];
					batchTotalQuantity = data.totalQuantity ?? 0;
				})
				.catch(e => {
					log.error('Failed to fetch batchable orders', e);
				})
				.finally(() => { loadingBatch = false; });
		}
	});

	const hasBatchableOrders = $derived(batchOrders.length > 1);
	// Theseus rejects warehouse orders without tags, so older templates saved without any can't be sent
	const warehouseTemplateHasTags = $derived(!!warehouseTemplate?.tags?.split(',').some(t => t.trim()));

	async function sendWarehouseOrder() {
		if (!warehouseTemplate || !hasTheseusApiKey || !hcbOrganization) return;
		sendingWarehouseOrder = true;
		warehouseOrderError = '';
		log.info('Sending warehouse order', { orderId: order.id });
		const t = log.time('sendWarehouseOrder');

		try {
			const res = await fetch(`/api/programs/${programId}/warehouse/send-order`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id })
			});

			t.end('status', res.status);

			if (res.status === 401) {
				const data = await res.json();
				if (data.needsAuth) {
					log.warn('HCB auth required for warehouse order, redirecting');
					window.location.href = `/auth/hcb?returnUrl=${encodeURIComponent(window.location.pathname)}`;
					return;
				}
			}

			if (!res.ok) {
				const text = await res.text();
				warehouseOrderError = `Failed: ${text}`;
				log.error('Warehouse order failed', { status: res.status, body: text });
				return;
			}

			const data = await res.json();
			warehouseOrderSent = true;
			refOverride = data.reference;
			onreferencechange?.(data.reference);
			onsendgrant?.(data.reference);
			log.info('Warehouse order sent successfully', { reference: data.reference });
		} catch (e) {
			warehouseOrderError = e instanceof Error ? e.message : 'Unknown error';
			log.error('Warehouse order exception', e);
		} finally {
			sendingWarehouseOrder = false;
		}
	}

	async function sendBatchWarehouseOrder() {
		if (!warehouseTemplate || !hasTheseusApiKey || !hcbOrganization) return;
		sendingBatchOrder = true;
		batchOrderError = '';
		log.info('Sending batch warehouse order', { itemId: order.itemId, userId: order.userId, orderCount: batchOrders.length });
		const t = log.time('sendBatchWarehouseOrder');

		try {
			const res = await fetch(`/api/programs/${programId}/warehouse/batch-order`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemId: order.itemId, userId: order.userId })
			});

			t.end('status', res.status);

			if (res.status === 401) {
				const data = await res.json();
				if (data.needsAuth) {
					log.warn('HCB auth required for batch warehouse order, redirecting');
					window.location.href = `/auth/hcb?returnUrl=${encodeURIComponent(window.location.pathname)}`;
					return;
				}
			}

			if (!res.ok) {
				const text = await res.text();
				batchOrderError = `Failed: ${text}`;
				log.error('Batch warehouse order failed', { status: res.status, body: text });
				return;
			}

			const data = await res.json();
			batchOrderSent = true;
			batchOrderRef = data.reference;
			batchOrderIds = data.orderIds;
			refOverride = data.reference;
			onreferencechange?.(data.reference);
			onsendgrant?.(data.reference);
			onbatchreferencechange?.(
				(data.orderIds as string[]).map((id: string) => ({ orderId: id, reference: data.reference }))
			);
			log.info('Batch warehouse order sent successfully', {
				reference: data.reference,
				orderCount: data.orderIds.length,
				totalQuantity: data.totalQuantity
			});
		} catch (e) {
			batchOrderError = e instanceof Error ? e.message : 'Unknown error';
			log.error('Batch warehouse order exception', e);
		} finally {
			sendingBatchOrder = false;
		}
	}

	let userSlackId = $state<string | null>(null);
	let slackDeactivated = $state<boolean | null>(null);

	$effect(() => {
		userSlackId = null;
		slackDeactivated = null;

		log.debug('Fetching Slack user info', { userId: order.userId });
		const t = log.time('fetchSlackUser');
		fetch(`/api/slack/${encodeURIComponent(order.userId)}`)
			.then((r) => {
				log.debug('Slack user info response', { status: r.status });
				return r.json();
			})
			.then((data) => {
				userSlackId = data.slackId ?? null;
				slackDeactivated = data.slackId ? !!data.deleted : null;
				t.end('slackId', userSlackId, 'deactivated', slackDeactivated);
			})
			.catch((e) => {
				log.error('Failed to fetch Slack user info', e);
			});
	});
</script>

<div class="@container flex flex-col gap-6 pb-8 pt-12 px-8">
	<div class="flex items-start justify-between">
		<div class="flex flex-col gap-4 flex-1 min-w-0">
			<div class="flex gap-3 items-center">
				{#if item.thumbnailUrl}
					<img src={item.thumbnailUrl} alt="" class="h-8 w-[52px] object-cover shrink-0" />
				{/if}
				<span class="text-[16px] tracking-[-0.48px]">
					<span>{order.quantity}x </span>
					<span class="font-bold">{item.name}</span>
				</span>
			</div>

			{#if editingContext}
				<div class="flex flex-col gap-2">
					<textarea
						bind:value={contextValue}
						rows="4"
						class="bg-white border border-border-card rounded-section p-4 text-sm tracking-[-0.3px] resize-y w-full"
						placeholder="Sourcing instructions, shipping notes, supplier links..."
					></textarea>
					<div class="flex gap-2 justify-end">
						<button
							class="px-3 py-1.5 rounded-tag border border-border-input text-xs font-medium hover:bg-surface cursor-pointer"
							onclick={cancelContextEdit}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer"
							onclick={saveContext}
							disabled={savingContext}
						>
							{savingContext ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>
			{:else}
				<button
					class="text-left w-full cursor-pointer hover:opacity-70 transition-opacity"
					onclick={(e) => { if (!(e.target as HTMLElement).closest('a')) editingContext = true; }}
				>
					{#if item.fulfillerContext}
						<div class="prose prose-sm max-w-none text-sm tracking-[-0.3px]">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html marked(item.fulfillerContext, { renderer: contextRenderer })}
						</div>
					{:else}
						<span class="text-sm tracking-[-0.3px] text-text-placeholder-light">
							Click to add fulfillment context...
						</span>
					{/if}
				</button>
			{/if}
		</div>
		<button class="size-5 shrink-0 cursor-pointer hover:opacity-70" onclick={onclose}>
			<X size={18} class="text-text-secondary" />
		</button>
	</div>

	<div class="flex flex-col gap-2">
		<div class="flex items-center" data-status-dropdown>
			<div class="bg-white border border-border-input flex h-10 items-center justify-center px-5 rounded-l-input shrink-0">
				<span class="font-bold text-sm text-text-input">Status</span>
			</div>

			<div class="relative flex-1 min-w-0">
				<button
					class="bg-white border-y border-r border-border-input flex w-full h-10 items-center justify-between px-4 rounded-r-input cursor-pointer hover:bg-surface/50 transition-colors"
					onclick={toggleStatusDropdown}
					disabled={savingStatus}
				>
					<div class="flex gap-2.5 items-center">
						<StatusLight status={currentStatusOption.light} />
						<span class="text-sm text-text-input capitalize">
							{savingStatus ? 'Saving...' : currentStatusOption.label}
						</span>
					</div>
					<ChevronDown size={14} class="text-text-tertiary shrink-0 transition-transform {statusDropdownOpen ? 'rotate-180' : ''}" />
				</button>

				{#if statusDropdownOpen}
					<div class="absolute top-full left-0 right-0 mt-1 bg-white border border-border-input rounded-input shadow-lg z-30 py-1 overflow-clip">
						{#each statusOptions as opt (opt.value)}
							<button
								class="flex w-full gap-2.5 items-center px-4 py-2.5 text-sm text-text-input cursor-pointer transition-colors {opt.value === currentStatus ? 'bg-surface font-medium' : 'hover:bg-surface/50'}"
								onclick={() => selectStatus(opt.value)}
							>
								<StatusLight status={opt.light} />
								<span class="capitalize">{opt.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="flex items-center">
			<div class="bg-white border border-border-input flex h-10 items-center justify-center px-5 rounded-l-input shrink-0">
				<span class="font-bold text-sm text-text-input">Reference</span>
			</div>

			{#if editingRef}
				<div class="bg-white border-y border-r border-border-input flex flex-1 h-10 items-center gap-2 px-3 rounded-r-input min-w-0">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={refValue}
						onkeydown={handleRefKeydown}
						placeholder="Tracking ID/URL/HCB grant link/etc..."
						class="flex-1 text-sm font-mono text-text-input bg-transparent outline-none min-w-0 placeholder:text-text-placeholder placeholder:font-sans"
						autofocus
					/>
					<button
						class="shrink-0 text-check-pass hover:opacity-70 cursor-pointer"
						onclick={saveRef}
						disabled={savingRef}
					>
						<Check size={14} />
					</button>
					<button
						class="shrink-0 text-text-tertiary hover:opacity-70 cursor-pointer"
						onclick={cancelEditRef}
					>
						<X size={14} />
					</button>
				</div>
			{:else}
				<button
					class="bg-white border-y border-r border-border-input flex flex-1 h-10 items-center justify-between gap-2 px-4 rounded-r-input min-w-0 cursor-pointer hover:bg-surface/50 transition-colors group"
					onclick={startEditRef}
				>
					{#if currentRefUrl}
						<span class="text-sm font-mono text-text-input truncate">{currentRefUrl}</span>
						<div class="flex gap-1.5 items-center shrink-0">
							{#if refIsUrl}
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									href={currentRefUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="text-text-tertiary hover:text-link cursor-pointer"
									onclick={(e) => e.stopPropagation()}
								>
									<ExternalLink size={12} />
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
							<Pencil size={12} class="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
						</div>
					{:else}
						<span class="text-sm text-text-placeholder">Tracking ID/URL/HCB grant link/etc...</span>
						<Pencil size={12} class="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
					{/if}
				</button>
			{/if}
		</div>
	</div>

	{#if order.quantity > 1 || slackDeactivated}
		<div class="flex flex-col gap-2">
			{#if order.quantity > 1}
				<div class="flex items-center gap-2 px-3 py-2 rounded-section bg-amber-50 border border-amber-200">
					<TriangleAlert size={14} class="text-amber-700 shrink-0" />
					<p class="text-xs text-amber-700">The quantity for this order is <span class="font-bold">{order.quantity}</span>.</p>
				</div>
			{/if}
			{#if slackDeactivated}
				<div class="flex items-center gap-2 px-3 py-2 rounded-section bg-check-fail/10 border border-check-fail/30">
					<TriangleAlert size={14} class="text-check-fail shrink-0" />
					<span class="text-xs text-check-fail">This user's Slack account has been deactivated.</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if cardGrantTemplate}
		<div class="flex flex-col gap-2">
			{#if grantSent}
				<div class="flex items-center gap-2 px-4 py-3 rounded-section bg-check-pass/10 border border-check-pass/30">
					<CreditCard size={14} class="text-check-pass shrink-0" />
					<span class="text-sm font-medium text-check-pass">
						Card grant {grantMode === 'topup' ? 'topped up' : 'sent'} successfully
					</span>
				</div>
			{:else if !hcbOrganization}
				<button
					disabled
					class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-surface text-text-tertiary text-sm font-medium cursor-not-allowed"
					title="HCB organization not configured — contact a program admin"
				>
					<CreditCard size={14} />
					Send Card Grant (HCB not configured)
				</button>
			{:else}
				{#if loadingGrants}
					<div class="flex items-center gap-2 h-10 px-4">
						<Loader2 size={14} class="animate-spin text-text-tertiary" />
						<span class="text-sm text-text-tertiary">Checking existing grants…</span>
					</div>
				{:else if existingGrants.length > 0}
					<div class="flex flex-col gap-2 border border-border-card rounded-section p-3">
						<div class="flex gap-2">
							<button
								type="button"
								class="flex-1 py-1.5 rounded-tag text-xs font-medium text-center cursor-pointer transition-colors
									{grantMode === 'new' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-surface/80'}"
								onclick={() => { grantMode = 'new'; selectedGrantId = null; }}
							>
								New grant
							</button>
							<button
								type="button"
								class="flex-1 py-1.5 rounded-tag text-xs font-medium text-center cursor-pointer transition-colors
									{grantMode === 'topup' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-surface/80'}"
								onclick={() => { grantMode = 'topup'; selectedGrantId = existingGrants[0]?.id ?? null; }}
							>
								Top up existing ({existingGrants.length})
							</button>
						</div>

						{#if grantMode === 'topup'}
							<div class="flex flex-col gap-1">
								{#each existingGrants as grant (grant.id)}
									<div class="flex items-center gap-1">
										<button
											type="button"
											class="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-tag text-left cursor-pointer transition-colors min-w-0
												{selectedGrantId === grant.id ? 'bg-accent/10 border border-accent' : 'bg-surface/50 border border-transparent hover:bg-surface'}"
											onclick={() => { selectedGrantId = grant.id; }}
										>
											<div class="flex flex-col min-w-0">
												<span class="text-xs font-medium text-text-primary truncate">
													{grant.purpose || grant.id}
												</span>
												<span class="text-[10px] text-text-tertiary">
													{fmtGrantDate(grant.created_at)}{grant.balance_cents != null ? ` · Balance: $${(grant.balance_cents / 100).toFixed(2)}` : ''}
												</span>
											</div>
											<span class="text-xs font-mono text-text-secondary shrink-0">
												${(grant.amount_cents / 100).toFixed(2)}
											</span>
										</button>
										<a
											href="https://hcb.hackclub.com/grants/{grant.id.replace(/^cdg_/, '')}"
											target="_blank"
											rel="noopener noreferrer"
											class="shrink-0 size-7 flex items-center justify-center rounded-tag text-text-tertiary hover:text-link hover:bg-surface transition-colors"
											title="View on HCB"
											onclick={(e) => e.stopPropagation()}
										>
											<ExternalLink size={12} />
										</a>
									</div>
								{/each}
							</div>
						{/if}

						<button
							class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
							onclick={sendCardGrant}
							disabled={sendingGrant || (grantMode === 'topup' && !selectedGrantId)}
						>
							{#if sendingGrant}
								<Loader2 size={14} class="animate-spin" />
								{grantMode === 'topup' ? 'Topping up…' : 'Sending…'}
							{:else}
								<CreditCard size={14} />
								{#if grantMode === 'topup' && selectedGrantId}
									Top up {#if order.quantity > 1}${(cardGrantTemplate.amountCents / 100).toFixed(2)} &times; {order.quantity} =&nbsp;{/if}${(cardGrantTemplate.amountCents * order.quantity / 100).toFixed(2)}
								{:else}
									Send {#if order.quantity > 1}${(cardGrantTemplate.amountCents / 100).toFixed(2)} &times; {order.quantity} =&nbsp;{/if}${(cardGrantTemplate.amountCents * order.quantity / 100).toFixed(2)} Card Grant
								{/if}
							{/if}
						</button>
					</div>
				{/if}

				{#if existingGrants.length === 0 && !loadingGrants}
					<button
						class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
						onclick={sendCardGrant}
						disabled={sendingGrant}
					>
						{#if sendingGrant}
							<Loader2 size={14} class="animate-spin" />
							Sending…
						{:else}
							<CreditCard size={14} />
							Send {#if order.quantity > 1}${(cardGrantTemplate.amountCents / 100).toFixed(2)} &times; {order.quantity} = {/if}${(cardGrantTemplate.amountCents * order.quantity / 100).toFixed(2)} Card Grant
						{/if}
					</button>
				{/if}
			{/if}
			{#if grantError}
				<p class="text-xs text-check-fail">{grantError}</p>
			{/if}
		</div>
	{/if}

	{#if warehouseTemplate}
		<div class="flex flex-col gap-2">
			{#if batchOrderSent}
				<div class="flex items-center gap-2 px-4 py-3 rounded-section bg-check-pass/10 border border-check-pass/30">
					<Package size={14} class="text-check-pass shrink-0" />
					<span class="text-sm font-medium text-check-pass">
						Batch warehouse order sent for {batchOrderIds.length} orders
					</span>
				</div>
			{:else if warehouseOrderSent}
				<div class="flex items-center gap-2 px-4 py-3 rounded-section bg-check-pass/10 border border-check-pass/30">
					<Package size={14} class="text-check-pass shrink-0" />
					<span class="text-sm font-medium text-check-pass">
						Warehouse order sent successfully
					</span>
				</div>
			{:else if !hasTheseusApiKey || !hcbOrganization}
				<button
					disabled
					class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-surface text-text-tertiary text-sm font-medium cursor-not-allowed"
					title={!hasTheseusApiKey ? 'Theseus API key not configured' : 'HCB organization not configured'}
				>
					<Package size={14} />
					Send Warehouse Order ({!hasTheseusApiKey ? 'API key not configured' : 'HCB not configured'})
				</button>
			{:else if !warehouseTemplateHasTags}
				<button
					disabled
					class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-surface text-text-tertiary text-sm font-medium cursor-not-allowed"
					title="Theseus requires at least one tag — add one to this item's warehouse template in program settings"
				>
					<Package size={14} />
					Send Warehouse Order (template has no tags)
				</button>
			{:else}
				<div class="flex flex-col gap-2 border border-border-card rounded-section p-3">
					<div class="flex flex-col gap-1 py-1">
						{#each warehouseTemplate.contents as c}
							<div class="flex items-center justify-between text-xs text-text-primary">
								<span class="font-mono">{c.sku}</span>
								<span>&times; {c.quantity * order.quantity}</span>
							</div>
						{/each}
					</div>
					<button
						class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
						onclick={sendWarehouseOrder}
						disabled={sendingWarehouseOrder || sendingBatchOrder}
					>
						{#if sendingWarehouseOrder}
							<Loader2 size={14} class="animate-spin" />
							Sending…
						{:else}
							<Package size={14} />
							Send Warehouse Order
						{/if}
					</button>

					{#if loadingBatch}
						<div class="flex items-center gap-2 h-8 px-1">
							<Loader2 size={12} class="animate-spin text-text-tertiary" />
							<span class="text-xs text-text-tertiary">Checking for batchable orders…</span>
						</div>
					{:else if hasBatchableOrders}
						<div class="border-t border-border-card pt-2 mt-1 flex flex-col gap-2">
							<div class="flex flex-col gap-1">
								<span class="text-xs font-medium text-text-secondary">
									{batchOrders.length} pending orders from this user for this item (total qty: {batchTotalQuantity})
								</span>
								<div class="flex flex-col gap-0.5">
									{#each batchOrders as bo}
										<div class="flex items-center justify-between text-[11px] text-text-dim font-mono">
											<span class={bo.id === order.id ? 'font-bold' : ''} title={isUuid(bo.id) ? bo.id : undefined}>#{shortenId(bo.id)}</span>
											<span>&times; {bo.quantity}</span>
										</div>
									{/each}
								</div>
								<div class="flex flex-col gap-0.5 mt-1">
									{#each warehouseTemplate.contents as c}
										<div class="flex items-center justify-between text-xs text-text-secondary">
											<span class="font-mono">{c.sku}</span>
											<span>&times; {c.quantity * batchTotalQuantity}</span>
										</div>
									{/each}
								</div>
							</div>
							<button
								class="flex items-center justify-center gap-2 h-10 px-4 rounded-input bg-text-primary text-white text-sm font-medium hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
								onclick={sendBatchWarehouseOrder}
								disabled={sendingBatchOrder || sendingWarehouseOrder}
							>
								{#if sendingBatchOrder}
									<Loader2 size={14} class="animate-spin" />
									Sending batch…
								{:else}
									<Package size={14} />
									Send Batch Warehouse Order ({batchOrders.length} orders)
								{/if}
							</button>
						</div>
					{/if}
				</div>
			{/if}
			{#if warehouseOrderError}
				<p class="text-xs text-check-fail">{warehouseOrderError}</p>
			{/if}
			{#if batchOrderError}
				<p class="text-xs text-check-fail">{batchOrderError}</p>
			{/if}
		</div>
	{/if}

	<div class="flex flex-col @md:flex-row gap-4">
		<div class="flex-1 min-w-0 flex flex-col gap-2">
			<div class="flex gap-2 items-center">
				<NotebookPen size={14} class="text-text-primary" />
				<span class="font-bold text-[15px] text-text-primary tracking-[-0.4px]">Admin Notes</span>
			</div>

			{#if editingNotes}
				<div class="flex flex-col gap-2">
					<textarea
						bind:value={notesValue}
						rows="4"
						class="bg-white border border-border-card rounded-section p-4 text-sm tracking-[-0.3px] resize-y w-full"
					></textarea>
					<div class="flex gap-2 justify-end">
						<button
							class="px-3 py-1.5 rounded-tag border border-border-input text-xs font-medium hover:bg-surface cursor-pointer"
							onclick={cancelNotesEdit}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer"
							onclick={saveNotes}
							disabled={savingNotes}
						>
							{savingNotes ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>
			{:else}
				<button
					class="bg-white border border-border-card rounded-section p-4 text-left w-full cursor-pointer hover:border-accent transition-colors"
					onclick={() => (editingNotes = true)}
				>
					<span class="text-sm tracking-[-0.3px] {order.adminNotes ? 'text-text-primary' : 'text-text-placeholder-light'}">
						{order.adminNotes || 'No notes yet.'}
					</span>
				</button>
			{/if}
		</div>

		<div class="flex-1 min-w-0 flex flex-col gap-2">
			<div class="flex gap-2 items-center">
				<MessageSquareText size={14} class="text-text-primary" />
				<span class="font-bold text-[15px] text-text-primary tracking-[-0.4px]">User-visible Notes</span>
			</div>

			{#if editingUserNotes}
				<div class="flex flex-col gap-2">
					<textarea
						bind:value={userNotesValue}
						rows="4"
						class="bg-white border border-border-card rounded-section p-4 text-sm tracking-[-0.3px] resize-y w-full"
					></textarea>
					<div class="flex gap-2 justify-end">
						<button
							class="px-3 py-1.5 rounded-tag border border-border-input text-xs font-medium hover:bg-surface cursor-pointer"
							onclick={cancelUserNotesEdit}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer"
							onclick={saveUserNotes}
							disabled={savingUserNotes}
						>
							{savingUserNotes ? 'Saving...' : 'Save'}
						</button>
					</div>
				</div>
			{:else}
				<button
					class="bg-white border border-border-card rounded-section p-4 text-left w-full cursor-pointer hover:border-accent transition-colors"
					onclick={() => (editingUserNotes = true)}
				>
					<span class="text-sm tracking-[-0.3px] {order.userNotes ? 'text-text-primary' : 'text-text-placeholder-light'}">
						{order.userNotes || 'No user notes yet.'}
					</span>
				</button>
			{/if}
		</div>
	</div>

	<UserCard
		name={order.userName}
		email={order.userEmail}
		avatarUrl={order.userAvatarUrl}
		slackId={userSlackId}
		{slackDeactivated}
		joinDate=""
	/>

	{#key order.id}
		<ShippingAddress orderId={order.id} {programId} />
	{/key}
</div>
