<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll, goto } from '$app/navigation';
	import {
		AlertTriangle,
		Users,
		ChevronDown,
		ChevronUp,
		Trash2,
		User,
		Calendar,
		Clock,
		Globe,
		KeyRound,
		EthernetPort,
		ScrollText,
		PackageCheck,
		CircleCheck,
		CircleX,
		MessageSquare,
		MapPin,
		FileEdit,
		Settings,
		Camera,
		Table2,
		Search,
		UserPlus,
		Loader2,
		Store,
		CreditCard,
		Link,
		Unlink,
		Banknote,
		Package,
		Plus,
		Tag,
		X
	} from 'lucide-svelte';
	import ManageLayout from '$lib/components/manage/ManageLayout.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import LabeledField from '$lib/components/manage/LabeledField.svelte';
	import EndpointField from '$lib/components/ui/EndpointField.svelte';
	import SecretKeyField from '$lib/components/ui/SecretKeyField.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import ProjectTags from '$lib/components/review/ProjectTags.svelte';
	import { DEFAULT_TAG_COLOR } from '$lib/utils/tags.js';
	import { SPENDING_CATEGORIES } from '$lib/data/spending-categories.js';
	import { isUuid, shortenId } from '$lib/utils/id';
	import type { PageData } from './$types.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let yswsName = $state(data.program.yswsName);
	let yswsSaving = $state(false);
	let yswsSaved = $state(false);
	let iconUrl = $state(data.program.iconUrl);

	let masterEndpoint = $state(data.program.masterEndpoint);
	let secretKey = $state(data.program.secretKey);
	let apiConfigSaving = $state(false);
	let apiConfigSaved = $state(false);

	let expandedMembers: Record<string, boolean> = $state({});
	let togglingPerm = $state<string | null>(null);
	let removingMember = $state<string | null>(null);

	let searchQuery = $state('');
	let searchResults = $state<Array<{
		userId: string | null;
		name: string;
		email: string;
		avatarUrl: string | null;
		slackId: string | null;
		hackatimeId: number | null;
		source: string;
		isMember: boolean;
		isInvited: boolean;
	}>>([]);
	let searchLoading = $state(false);
	let addingUser = $state<string | null>(null);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	const canManageMembers = $derived(data.currentMembership.isRoot);

	let showDeleteModal = $state(false);
	let deleteConfirmText = $state('');
	let deletingProgram = $state(false);

	async function deleteProgram() {
		if (deleteConfirmText !== data.program.name)
			return;

		deletingProgram = true;
		try {
			const res = await fetch('?/deleteProgram', {
				method: 'POST',
				body: new FormData()
			});
			if (res.ok) {
				await goto('/');
			}
		} finally {
			deletingProgram = false;
		}
	}

	function toggleMember(id: string) {
		expandedMembers[id] = !expandedMembers[id];
	}

	const permissionLabels: Array<{ key: string; label: string; description: string }> = [
		{ key: 'canViewReviews', label: 'View reviews', description: 'Shows the Review tab to the user.' },
		{ key: 'canCreateReviews', label: 'Create reviews', description: 'Allows the user to approve, reject, and comment on pending reviews.' },
		{ key: 'canAuthorizeReviews', label: 'Authorize reviews', description: 'Users without this permission will be forced to have all approvals to be authorized by a user with this permission. Usually given to trusted/HQ reviewers.' },
		{ key: 'canViewFulfillments', label: 'View fulfillments', description: 'Shows the Fulfillment tab to the user. This alone doesn\'t grant them access to see detailed user data.' },
		{ key: 'canViewAddressData', label: 'View address data', description: 'Shows detailed address information needed for fulfillment. Use with caution.' },
		{ key: 'canUpdateFulfillments', label: 'Update fulfillments', description: 'Allows the user to update the status, reference numbers, and other editable fields of all fulfillments.' },
		{ key: 'canUpdateProgram', label: 'Update program', description: 'Allows the user to modify fields on this page.' },
		{ key: 'isRoot', label: 'Treat as root', description: 'Allows the user to add other users to this Sidekick program and modify permissions. Risky!' }
	];

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: '2-digit',
			day: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	function formatShortDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: '2-digit',
			day: '2-digit',
			year: 'numeric'
		});
	}

	function describeAction(action: string, entityType: string | null): string {
		const parts = action.replace(/_/g, ' ').toLowerCase();
		if (entityType)
			return `${parts} on ${entityType}`;
		return parts;
	}

	function getActionIcon(action: string) {
		if (action.includes('status'))
			return PackageCheck;
		if (action.includes('approve'))
			return CircleCheck;
		if (action.includes('reject'))
			return CircleX;
		if (action.includes('comment'))
			return MessageSquare;
		if (action.includes('address'))
			return MapPin;
		if (action.includes('field'))
			return FileEdit;
		return Settings;
	}

	function getActionColor(action: string): string {
		if (action.includes('reject') || action.includes('remove') || action.includes('delete'))
			return 'text-check-fail';
		if (action.includes('approve') || action.includes('add') || action.includes('create'))
			return 'text-check-pass';
		return 'text-amber-500';
	}

	function handleIconFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file)
			return;

		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const size = 256;
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;

				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, size, size);

				const scale = Math.max(size / img.width, size / img.height);
				const w = img.width * scale;
				const h = img.height * scale;
				const x = (size - w) / 2;
				const y = (size - h) / 2;
				ctx.drawImage(img, x, y, w, h);

				const dataUrl = canvas.toDataURL('image/png');
				iconUrl = dataUrl;

				// Submit via hidden form
				const form = document.createElement('form');
				form.method = 'POST';
				form.action = '?/updateIcon';
				const hiddenInput = document.createElement('input');
				hiddenInput.type = 'hidden';
				hiddenInput.name = 'iconDataUrl';
				hiddenInput.value = dataUrl;
				form.appendChild(hiddenInput);
				document.body.appendChild(form);
				form.submit();
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	async function togglePermission(membershipId: string, permission: string) {
		const key = `${membershipId}:${permission}`;
		togglingPerm = key;
		try {
			const form = new FormData();
			form.set('membershipId', membershipId);
			form.set('permission', permission);
			const res = await fetch('?/togglePermission', {
				method: 'POST',
				body: form
			});
			if (res.ok) { await invalidateAll(); }
		} finally {
			togglingPerm = null;
		}
	}

	async function removeMember(membershipId: string) {
		removingMember = membershipId;
		try {
			const form = new FormData();
			form.set('membershipId', membershipId);
			const res = await fetch('?/removeMember', {
				method: 'POST',
				body: form
			});
			if (res.ok) { await invalidateAll(); }
		} finally {
			removingMember = null;
		}
	}

	function handleSearch(query: string) {
		searchQuery = query;
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		if (query.length < 2) {
			searchResults = [];
			return;
		}
		searchLoading = true;
		searchTimeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/programs/${data.program.id}/members/search?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					const data = await res.json();
					searchResults = data.results;
				}
			} finally {
				searchLoading = false;
			}
		}, 300);
	}

	let hcbOrgs = $state<Array<{ id: string; name: string; slug: string; icon: string | null }>>([]);
	let loadingOrgs = $state(false);
	let linkingOrg = $state(false);
	let unlinkingOrg = $state(false);
	let selectedOrgId = $state('');
	let expandedItems: Record<string, boolean> = $state({});
	let shopItemFilter = $state('');
	const filteredShopItems = $derived(
		shopItemFilter
			? data.shopItems.filter((item) => item.name.toLowerCase().includes(shopItemFilter.toLowerCase()))
			: data.shopItems
	);
	// Kept as its own derived: inlining `(a || b) && c` in the template gets
	// miscompiled by Svelte 5.55's dev transform, which drops the parentheses.
	const canConfigureShopItems = $derived.by(() => {
		const hasIntegration = !!data.program.hcbOrganizationId || data.hasTheseusApiKey;
		return hasIntegration && data.shopItems.length > 0;
	});

	interface TemplateForm {
		amountDollars: string;
		purpose: string;
		oneTimeUse: boolean;
		preAuthorizationRequired: boolean;
		instructions: string;
		merchantLock: string;
		categoryLock: string;
		keywordLock: string;
		expirationDays: string;
	}

	let templateForms: Record<string, TemplateForm> = $state({});
	let savingTemplate = $state<string | null>(null);
	let deletingTemplate = $state<string | null>(null);

	interface WarehouseTemplateForm {
		tags: string;
		userFacingTitle: string;
		contents: Array<{ sku: string; quantity: string }>;
	}

	let warehouseTemplateForms: Record<string, WarehouseTemplateForm> = $state({});
	let savingWarehouseTemplate = $state<string | null>(null);
	let deletingWarehouseTemplate = $state<string | null>(null);
	let theseusApiKeyInput = $state('');
	let savingTheseusKey = $state(false);
	let removingTheseusKey = $state(false);

	type TemplateType = 'card_grant' | 'warehouse';
	let selectedTemplateType: Record<string, TemplateType> = $state({});

	function getTemplateTypeForItem(itemId: string): TemplateType | null {
		if (data.cardGrantTemplates.find((t: { shopItemId: string }) => t.shopItemId === itemId)) return 'card_grant';
		if (data.warehouseTemplates.find((t: { shopItemId: string }) => t.shopItemId === itemId)) return 'warehouse';
		return null;
	}

	function getSelectedTemplateType(itemId: string): TemplateType {
		if (selectedTemplateType[itemId]) return selectedTemplateType[itemId];
		const existing = getTemplateTypeForItem(itemId);
		return existing ?? 'card_grant';
	}

	function getTemplateForItem(itemId: string) {
		return data.cardGrantTemplates.find((t) => t.shopItemId === itemId);
	}

	function getWarehouseTemplateForItem(itemId: string) {
		return data.warehouseTemplates.find((t: { shopItemId: string }) => t.shopItemId === itemId);
	}

	function getWarehouseTemplateForm(itemId: string): WarehouseTemplateForm {
		if (!warehouseTemplateForms[itemId]) {
			const existing = getWarehouseTemplateForItem(itemId);
			warehouseTemplateForms[itemId] = {
				tags: existing?.tags ?? '',
				userFacingTitle: existing?.userFacingTitle ?? '',
				contents: existing?.contents?.map((c: { sku: string; quantity: number }) => ({ sku: c.sku, quantity: c.quantity.toString() })) ?? [{ sku: '', quantity: '1' }]
			};
		}
		return warehouseTemplateForms[itemId];
	}

	function addContentRow(itemId: string) {
		const form = getWarehouseTemplateForm(itemId);
		form.contents = [...form.contents, { sku: '', quantity: '1' }];
	}

	function removeContentRow(itemId: string, index: number) {
		const form = getWarehouseTemplateForm(itemId);
		form.contents = form.contents.filter((_, i) => i !== index);
	}

	async function saveWarehouseTemplate(itemId: string) {
		const form = getWarehouseTemplateForm(itemId);
		const contents = form.contents
			.filter(c => c.sku.trim())
			.map(c => ({ sku: c.sku.trim(), quantity: parseInt(c.quantity) || 1 }));
		if (contents.length === 0) return;
		// Theseus rejects warehouse orders without tags, so don't let a template be saved without them
		if (!form.tags.trim()) return;

		savingWarehouseTemplate = itemId;
		try {
			await fetch(`/api/programs/${data.program.id}/warehouse/templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					shopItemId: itemId,
					tags: form.tags,
					userFacingTitle: form.userFacingTitle || undefined,
					contents
				})
			});
			savingWarehouseTemplate = null;
			await invalidateAll();
			delete warehouseTemplateForms[itemId];
		} finally {
			savingWarehouseTemplate = null;
		}
	}

	async function deleteWarehouseTemplate(itemId: string) {
		deletingWarehouseTemplate = itemId;
		try {
			await fetch(`/api/programs/${data.program.id}/warehouse/templates`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shopItemId: itemId })
			});
			deletingWarehouseTemplate = null;
			await invalidateAll();
			delete warehouseTemplateForms[itemId];
		} finally {
			deletingWarehouseTemplate = null;
		}
	}

	let theseusKeyError = $state('');

	async function saveTheseusApiKey() {
		if (!theseusApiKeyInput.trim()) return;
		savingTheseusKey = true;
		theseusKeyError = '';
		try {
			const res = await fetch(`/api/programs/${data.program.id}/warehouse`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apiKey: theseusApiKeyInput.trim() })
			});
			if (!res.ok) {
				const text = await res.text();
				theseusKeyError = text;
				return;
			}
			theseusApiKeyInput = '';
			await invalidateAll();
		} finally {
			savingTheseusKey = false;
		}
	}

	async function removeTheseusApiKey() {
		removingTheseusKey = true;
		theseusKeyError = '';
		try {
			const res = await fetch(`/api/programs/${data.program.id}/warehouse`, { method: 'DELETE' });
			if (!res.ok) {
				const text = await res.text();
				theseusKeyError = text;
				return;
			}
			await invalidateAll();
		} finally {
			removingTheseusKey = false;
		}
	}

	function getTemplateForm(itemId: string): TemplateForm {
		if (!templateForms[itemId]) {
			const existing = getTemplateForItem(itemId);
			templateForms[itemId] = {
				amountDollars: existing ? (existing.amountCents / 100).toFixed(2) : '',
				purpose: existing?.purpose ?? '',
				oneTimeUse: existing?.oneTimeUse ?? false,
				preAuthorizationRequired: existing?.preAuthorizationRequired ?? false,
				instructions: existing?.instructions ?? '',
				merchantLock: existing?.merchantLock ?? '',
				categoryLock: existing?.categoryLock ?? '',
				keywordLock: existing?.keywordLock ?? '',
				expirationDays: existing?.expirationDays?.toString() ?? ''
			};
		}
		return templateForms[itemId];
	}

	function initForms(id: string) {
		getTemplateForm(id);
		getWarehouseTemplateForm(id);
	}

	function toggleItem(id: string) {
		expandedItems[id] = !expandedItems[id];
		if (expandedItems[id]) {
			initForms(id);
			if (!(id in selectedTemplateType)) {
				selectedTemplateType = { ...selectedTemplateType, [id]: getTemplateTypeForItem(id) ?? 'card_grant' };
			}
		}
	}

	async function loadHcbOrgs() {
		loadingOrgs = true;
		try {
			const res = await fetch(`/api/programs/${data.program.id}/hcb`);
			const json = await res.json();
			if (json.needsAuth) {
				window.location.href = `/auth/hcb?returnUrl=${encodeURIComponent(window.location.pathname)}`;
				return;
			}
			hcbOrgs = json.organizations;
			if (hcbOrgs.length > 0 && !selectedOrgId) {
				selectedOrgId = hcbOrgs[0].id;
			}
		} finally {
			loadingOrgs = false;
		}
	}

	async function linkOrg() {
		const org = hcbOrgs.find((o) => o.id === selectedOrgId);
		if (!org)
			return;
		linkingOrg = true;
		try {
			await fetch(`/api/programs/${data.program.id}/hcb`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ organizationId: org.id, organizationName: org.name, organizationSlug: org.slug })
			});
			await invalidateAll();
		} finally {
			linkingOrg = false;
		}
	}

	async function unlinkOrg() {
		unlinkingOrg = true;
		try {
			await fetch(`/api/programs/${data.program.id}/hcb`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			unlinkingOrg = false;
		}
	}

	async function saveTemplate(itemId: string) {
		const form = getTemplateForm(itemId);
		const amountCents = Math.round(parseFloat(form.amountDollars) * 100);
		if (!amountCents || amountCents <= 0)
			return;
		savingTemplate = itemId;
		try {
			await fetch(`/api/programs/${data.program.id}/hcb/templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					shopItemId: itemId,
					amountCents,
					purpose: form.purpose || undefined,
					oneTimeUse: form.oneTimeUse,
					preAuthorizationRequired: form.preAuthorizationRequired,
					instructions: form.instructions || undefined,
					merchantLock: form.merchantLock || undefined,
					categoryLock: form.categoryLock || undefined,
					keywordLock: form.keywordLock || undefined,
					expirationDays: form.expirationDays ? parseInt(form.expirationDays) : undefined
				})
			});
			savingTemplate = null;
			await invalidateAll();
			delete templateForms[itemId];
		} finally {
			savingTemplate = null;
		}
	}

	async function deleteTemplate(itemId: string) {
		deletingTemplate = itemId;
		try {
			await fetch(`/api/programs/${data.program.id}/hcb/templates`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ shopItemId: itemId })
			});
			deletingTemplate = null;
			await invalidateAll();
			delete templateForms[itemId];
		} finally {
			deletingTemplate = null;
		}
	}

	interface MerchantResult { name: string; networkIds: string[] }
	let merchantQuery = $state('');
	let merchantResults = $state<MerchantResult[]>([]);
	let merchantSearchLoading = $state(false);
	let merchantSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let merchantSearchOpen = $state<string | null>(null);
	let popupPos = $state<{ top: number; left: number } | null>(null);

	function openPopup(itemId: string, type: 'merchant' | 'category', e: MouseEvent) {
		const btn = e.currentTarget as HTMLElement;
		const rect = btn.getBoundingClientRect();
		popupPos = { top: rect.bottom + 4, left: rect.right - 320 };
		if (type === 'merchant') {
			categorySearchOpen = null;
			if (merchantSearchOpen === itemId) { merchantSearchOpen = null; popupPos = null; return; }
			merchantSearchOpen = itemId;
			merchantQuery = '';
			merchantResults = [];
		} else {
			merchantSearchOpen = null;
			if (categorySearchOpen === itemId) { categorySearchOpen = null; popupPos = null; return; }
			categorySearchOpen = itemId;
			categoryQuery = '';
		}
	}

	function handleMerchantSearch(query: string, itemId: string) {
		merchantQuery = query;
		merchantSearchOpen = itemId;
		if (merchantSearchTimeout) {
			clearTimeout(merchantSearchTimeout);
		}
		if (query.length < 1) {
			merchantResults = [];
			return;
		}
		merchantSearchLoading = true;
		merchantSearchTimeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/merchants?q=${encodeURIComponent(query)}`);
				if (res.ok) {
					const data = await res.json();
					merchantResults = data.merchants;
				}
			} finally {
				merchantSearchLoading = false;
			}
		}, 200);
	}

	let categoryQuery = $state('');
	let categorySearchOpen = $state<string | null>(null);

	const filteredCategories = $derived(
		categoryQuery
			? SPENDING_CATEGORIES.filter(
					(c) => c.label.toLowerCase().includes(categoryQuery.toLowerCase()) || c.id.includes(categoryQuery.toLowerCase())
				)
			: SPENDING_CATEGORIES
	);

	function addCategoryToForm(itemId: string, categoryId: string) {
		const form = getTemplateForm(itemId);
		const existing = form.categoryLock ? form.categoryLock.split(',').map((s) => s.trim()).filter(Boolean) : [];
		if (!existing.includes(categoryId)) {
			form.categoryLock = [...existing, categoryId].join(',');
		}
		categoryQuery = '';
		categorySearchOpen = null;
	}

	function addMerchantToForm(itemId: string, merchant: MerchantResult) {
		const form = getTemplateForm(itemId);
		const existing = form.merchantLock ? form.merchantLock.split(',').map((s) => s.trim()).filter(Boolean) : [];
		const existingSet = new Set(existing);
		const newIds = merchant.networkIds.filter((id) => !existingSet.has(id));
		if (newIds.length > 0) {
			form.merchantLock = [...existing, ...newIds].join(',');
		}
		merchantQuery = '';
		merchantResults = [];
		merchantSearchOpen = null;
	}

	interface RejectionTemplateForm {
		name: string;
		feedbackMessage: string;
		internalMessage: string;
	}

	let rejectionForms: Record<string, RejectionTemplateForm> = $state({});
	let expandedRejections: Record<string, boolean> = $state({});
	let showNewRejection = $state(false);
	let savingRejection = $state<string | null>(null);
	let deletingRejection = $state<string | null>(null);

	function initRejectionForm(id: string) {
		if (!rejectionForms[id]) {
			const existing = data.rejectionTemplates.find((t: { id: string }) => t.id === id);
			rejectionForms[id] = {
				name: existing?.name ?? '',
				feedbackMessage: existing?.feedbackMessage ?? '',
				internalMessage: existing?.internalMessage ?? ''
			};
		}
	}

	function toggleRejection(id: string) {
		expandedRejections[id] = !expandedRejections[id];
		if (expandedRejections[id]) {
			initRejectionForm(id);
		}
	}

	// "new" is a sentinel form key for a template that hasn't been created yet.
	async function saveRejectionTemplate(id: string) {
		const form = rejectionForms[id];
		if (!form || !form.name.trim() || !form.feedbackMessage.trim())
			return;
		savingRejection = id;
		try {
			const res = await fetch(`/api/programs/${data.program.id}/rejection-templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: id === 'new' ? undefined : id,
					name: form.name,
					feedbackMessage: form.feedbackMessage,
					internalMessage: form.internalMessage
				})
			});
			if (!res.ok)
				return;
			await invalidateAll();
			delete rejectionForms[id];
			if (id === 'new') {
				showNewRejection = false;
			} else {
				expandedRejections[id] = false;
			}
		} finally {
			savingRejection = null;
		}
	}

	async function deleteRejectionTemplate(id: string) {
		deletingRejection = id;
		try {
			const res = await fetch(`/api/programs/${data.program.id}/rejection-templates`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok)
				return;
			await invalidateAll();
			delete rejectionForms[id];
		} finally {
			deletingRejection = null;
		}
	}

	const TAG_COLOR_PRESETS = [
		'#6b7280', // gray
		'#ef4444', // red
		'#f97316', // orange
		'#eab308', // yellow
		'#22c55e', // green
		'#14b8a6', // teal
		'#3b82f6', // blue
		'#8b5cf6', // violet
		'#ec4899' // pink
	];

	interface ProjectTagForm {
		label: string;
		color: string;
	}

	let tagForms: Record<string, ProjectTagForm> = $state({});
	let editingTags: Record<string, boolean> = $state({});
	let showNewTag = $state(false);
	let savingTag = $state<string | null>(null);
	let deletingTag = $state<string | null>(null);
	let tagError = $state<string | null>(null);

	function initTagForm(id: string) {
		if (!tagForms[id]) {
			const existing = data.projectTags.find((t: { id: string }) => t.id === id);
			tagForms[id] = {
				label: existing?.label ?? '',
				color: existing?.color ?? DEFAULT_TAG_COLOR
			};
		}
	}

	function toggleTagEdit(id: string) {
		editingTags[id] = !editingTags[id];
		if (editingTags[id]) {
			initTagForm(id);
		}
		tagError = null;
	}

	// "new" is a sentinel form key for a tag that hasn't been created yet.
	async function saveProjectTag(id: string) {
		const form = tagForms[id];
		if (!form || !form.label.trim())
			return;
		savingTag = id;
		tagError = null;
		try {
			const res = await fetch(`/api/programs/${data.program.id}/tags`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: id === 'new' ? undefined : id,
					label: form.label,
					color: form.color
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				tagError = body?.message ?? 'Failed to save tag';
				return;
			}
			await invalidateAll();
			delete tagForms[id];
			if (id === 'new') {
				showNewTag = false;
			} else {
				editingTags[id] = false;
			}
		} finally {
			savingTag = null;
		}
	}

	async function deleteProjectTag(id: string) {
		deletingTag = id;
		tagError = null;
		try {
			const res = await fetch(`/api/programs/${data.program.id}/tags`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok)
				return;
			await invalidateAll();
			delete tagForms[id];
		} finally {
			deletingTag = null;
		}
	}

	let cancellingInvite = $state<string | null>(null);

	async function cancelInvite(inviteId: string) {
		cancellingInvite = inviteId;
		try {
			const form = new FormData();
			form.set('inviteId', inviteId);
			const res = await fetch('?/cancelInvite', {
				method: 'POST',
				body: form
			});
			if (res.ok) { await invalidateAll(); }
		} finally {
			cancellingInvite = null;
		}
	}

	async function addMember(result: typeof searchResults[number]) {
		const key = result.userId || result.email;
		addingUser = key;
		try {
			const form = new FormData();
			if (result.userId) { form.set('userId', result.userId); }
			form.set('email', result.email);
			form.set('name', result.name);
			if (result.avatarUrl) { form.set('avatarUrl', result.avatarUrl); }
			if (result.hackatimeId) { form.set('hackatimeId', String(result.hackatimeId)); }
			const res = await fetch('?/addMember', {
				method: 'POST',
				body: form
			});
			if (res.ok) {
				await invalidateAll();
				searchQuery = '';
				searchResults = [];
			}
		} finally {
			addingUser = null;
		}
	}
</script>

<svelte:head>
	<title>Manage - {data.program.name} - Sidekick</title>
</svelte:head>

<ManageLayout programs={data.programs} activeProgramId={data.program.id}>
	<div class="border border-border-card rounded-bento overflow-hidden">
			<div class="flex items-center gap-4 px-8 pt-8 pb-6">
				<label class="relative group cursor-pointer shrink-0">
					{#if iconUrl}
						<img
							src={iconUrl}
							alt={data.program.name}
							class="size-12 object-cover rounded-section"
						/>
					{:else}
						<div class="size-12 bg-accent rounded-section flex items-center justify-center text-white font-bold text-lg">
							{data.program.name.charAt(0)}
						</div>
					{/if}
					<div class="absolute inset-0 bg-black/40 rounded-section flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
						<Camera size={16} class="text-white" />
					</div>
					<input type="file" accept="image/*" class="hidden" onchange={handleIconFile} />
				</label>
				<div class="flex flex-col gap-0.5">
					<h1 class="font-bold text-[20px] text-text-primary tracking-[-0.6px]">
						{data.program.name}
					</h1>
					<p class="text-sm text-text-secondary tracking-[-0.26px]">
						{data.memberships.length} team member{data.memberships.length === 1 ? '' : 's'}
					</p>
				</div>
			</div>

			<ManageSection title="General" description="Basic program configuration.">
				{#snippet icon()}<Settings size={16} class="text-text-secondary" />{/snippet}
				<div class="border border-dashed border-border-card rounded-section p-6">
					<LabeledField label="Unified YSWS name" description="Set this to what you see in the Airtable ID of your unified DB records.">
						{#snippet icon()}<Table2 size={16} />{/snippet}
						<form
							method="POST"
							action="?/updateProgram"
							use:enhance={() => {
								yswsSaving = true;
								return async ({ update }) => {
									await update();
									yswsSaving = false;
									yswsSaved = true;
									setTimeout(() => { yswsSaved = false; }, 2000);
								};
							}}
							class="flex gap-2"
						>
							<input
								type="text"
								name="yswsName"
								bind:value={yswsName}
								placeholder={data.program.name}
								class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] placeholder:text-text-placeholder focus:outline-none focus:border-border-active transition-colors"
							/>
							<button
								type="submit"
								disabled={yswsSaving}
								class="h-9 px-4 rounded-input border border-border-button text-sm font-medium text-text-subtle tracking-[-0.3px] hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
							>
								{yswsSaved ? 'Saved!' : yswsSaving ? 'Saving…' : 'Save'}
							</button>
						</form>
					</LabeledField>
				</div>
			</ManageSection>

			<ManageSection title="Team" description="These are all of the users authorized to access this program on Sidekick.">
				{#snippet icon()}<Users size={16} class="text-text-secondary" />{/snippet}
				<div class="flex flex-col gap-2">
				{#if canManageMembers}
					<div class="flex flex-col">
						<div class="relative">
							<UserPlus size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
							<input
								type="text"
								placeholder="Add a member by name, email, or Slack ID..."
								value={searchQuery}
								oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
								class="w-full h-9 pl-9 pr-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] placeholder:text-text-placeholder focus:outline-none focus:border-border-active transition-colors"
							/>
							{#if searchLoading}
								<Loader2 size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary animate-spin" />
							{/if}
						</div>
						{#if searchResults.length > 0}
							<div class="border border-border-card border-t-0 rounded-b-section overflow-hidden">
								{#each searchResults as result (result.userId || result.email)}
									{@const resultKey = result.userId || result.email}
									{@const unavailable = result.isMember || result.isInvited}
									<button
										type="button"
										class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface/50 transition-colors cursor-pointer text-left
											{unavailable ? 'opacity-50 cursor-default' : ''}"
										onclick={() => !unavailable && addMember(result)}
										disabled={unavailable || addingUser === resultKey}
									>
										<Avatar name={result.name} url={result.avatarUrl} size="md" />
										<div class="flex flex-col min-w-0 flex-1">
											<span class="text-sm font-medium text-text-primary truncate">{result.name}</span>
											<span class="text-[11px] text-text-tertiary truncate">{result.email}{result.source === 'hackatime' ? ' (Hackatime)' : ''}</span>
										</div>
										{#if addingUser !== null && addingUser === resultKey}
											<Loader2 size={14} class="animate-spin text-accent shrink-0" />
										{:else if result.isMember}
											<span class="text-[11px] text-text-tertiary font-medium shrink-0">Already a member</span>
										{:else if result.isInvited}
											<span class="text-[11px] text-text-tertiary font-medium shrink-0">Invite pending</span>
										{:else}
											<UserPlus size={14} class="text-text-tertiary shrink-0" />
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#each data.memberships as member (member.id)}
						<div class="border border-border-card rounded-section bg-page overflow-hidden">
							<button
								class="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
								onclick={() => toggleMember(member.id)}
							>
								<Avatar name={member.userName} url={member.userAvatarUrl} size="lg" />
								<div class="flex flex-col items-start min-w-0 flex-1">
									<span class="font-semibold text-sm text-text-primary truncate">{member.userName}</span>
									<span class="text-xs text-text-secondary truncate">{member.userEmail}</span>
								</div>
								<div class="shrink-0 text-text-tertiary">
									{#if expandedMembers[member.id]}
										<ChevronUp size={16} />
									{:else}
										<ChevronDown size={16} />
									{/if}
								</div>
							</button>

							{#if expandedMembers[member.id]}
								<div class="px-4 pb-4 flex flex-col gap-4 border-t border-border-card pt-4">
									<div class="flex items-start justify-between">
										<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-center text-[12px]">
											<div class="flex items-center gap-1.5 text-text-tertiary">
												<User size={13} />
												<span>Invited by</span>
											</div>
											<div class="flex items-center gap-1.5">
												{#if member.invitedByName}
													<span class="font-semibold text-text-primary">{member.invitedByName}</span>
												{:else}
													<span class="text-text-tertiary">Direct add</span>
												{/if}
											</div>
											<div class="flex items-center gap-1.5 text-text-tertiary">
												<Calendar size={13} />
												<span>Join date</span>
											</div>
											<span class="font-semibold text-text-primary">{formatDate(member.joinedAt)}</span>
											<div class="flex items-center gap-1.5 text-text-tertiary">
												<Clock size={13} />
												<span>Last access</span>
											</div>
											<span class="font-semibold text-text-primary">{member.lastAccess ? formatDate(member.lastAccess) : 'Never'}</span>
										</div>
										{#if canManageMembers}
											<button
												class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 transition-colors cursor-pointer text-[12px] font-medium shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
												onclick={() => removeMember(member.id)}
												disabled={removingMember === member.id}
											>
												{#if removingMember === member.id}
													<Loader2 size={13} class="animate-spin" />
												{:else}
													<Trash2 size={13} />
												{/if}
												Remove
											</button>
										{/if}
									</div>

									<div class="flex flex-col gap-3">
										{#each permissionLabels as perm (perm.key)}
											{@const isOn = member[perm.key as keyof typeof member] as boolean}
											{@const permKey = `${member.id}:${perm.key}`}
											{#if togglingPerm === permKey}
												<div class="flex items-start gap-2.5 text-left">
													<div class="size-[18px] flex items-center justify-center shrink-0 mt-px">
														<Loader2 size={14} class="animate-spin text-accent" />
													</div>
													<div class="flex flex-col gap-0.5">
														<span class="text-sm font-semibold text-text-primary">{perm.label}</span>
														<span class="text-xs text-text-tertiary leading-relaxed">{perm.description}</span>
													</div>
												</div>
											{:else}
												<Checkbox
													checked={isOn}
													onchange={() => togglePermission(member.id, perm.key)}
													disabled={!canManageMembers}
												>
													<div class="flex flex-col gap-0.5">
														<span class="text-sm font-semibold text-text-primary">{perm.label}</span>
														<span class="text-xs text-text-tertiary leading-relaxed">{perm.description}</span>
													</div>
												</Checkbox>
											{/if}
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}

				{#if data.pendingInvites.length > 0}
					<div class="flex flex-col gap-2 mt-2">
						<span class="text-[11px] font-medium text-text-tertiary uppercase tracking-wide px-1">Pending invites</span>
						{#each data.pendingInvites as invite (invite.id)}
							<div class="border border-dashed border-border-card rounded-section bg-page flex items-center gap-3 px-4 py-3">
								<Avatar name={invite.name} url={invite.avatarUrl} size="lg" class="opacity-60" />
								<div class="flex flex-col items-start min-w-0 flex-1">
									<span class="font-semibold text-sm text-text-primary truncate">{invite.name}</span>
									<span class="text-xs text-text-tertiary truncate">{invite.email} &middot; Invited by {invite.invitedByName}</span>
								</div>
								{#if canManageMembers}
									<button
										class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-tag text-text-tertiary hover:text-check-fail hover:bg-check-fail/5 transition-colors cursor-pointer text-[12px] font-medium shrink-0 disabled:opacity-50"
										onclick={() => cancelInvite(invite.id)}
										disabled={cancellingInvite === invite.id}
									>
										{#if cancellingInvite === invite.id}
											<Loader2 size={13} class="animate-spin" />
										{:else}
											<Trash2 size={13} />
										{/if}
										Cancel
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
				</div>
			</ManageSection>

			{#snippet rejectionTemplateFields(id: string)}
				{@const form = rejectionForms[id]}
				<div class="flex flex-col gap-1">
					<label for="rej-name-{id}" class="text-xs font-semibold text-text-secondary">Name</label>
					<input
						id="rej-name-{id}"
						type="text"
						maxlength="80"
						bind:value={form.name}
						placeholder="e.g. Demo link broken"
						class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="rej-feedback-{id}" class="text-xs font-semibold text-text-secondary">Rejection message <span class="font-normal text-text-tertiary">(visible to author)</span></label>
					<textarea
						id="rej-feedback-{id}"
						bind:value={form.feedbackMessage}
						rows="4"
						placeholder="Please fix the following issues..."
						class="w-full px-3 py-2 rounded-input border border-border-input text-sm text-text-input resize-y focus:outline-none focus:border-border-active"
					></textarea>
				</div>
				<div class="flex flex-col gap-1">
					<label for="rej-internal-{id}" class="text-xs font-semibold text-text-secondary">Internal note <span class="font-normal text-text-tertiary">(optional, staff only)</span></label>
					<textarea
						id="rej-internal-{id}"
						bind:value={form.internalMessage}
						rows="3"
						placeholder="Optional internal context..."
						class="w-full px-3 py-2 rounded-input border border-border-input text-sm text-text-input resize-y focus:outline-none focus:border-border-active"
					></textarea>
				</div>
			{/snippet}

			<ManageSection title="Quick Rejections" description="Pre-filled rejection message templates.">
				{#snippet icon()}<CircleX size={16} class="text-text-secondary" />{/snippet}
				<div class="border border-dashed border-border-card rounded-section p-6 flex flex-col gap-2">
					{#each data.rejectionTemplates as tpl (tpl.id)}
						<div class="border border-border-card rounded-section bg-page overflow-hidden">
							<button
								class="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
								onclick={() => toggleRejection(tpl.id)}
							>
								<CircleX size={16} class="text-check-fail shrink-0" />
								<div class="flex flex-col items-start min-w-0 flex-1">
									<span class="font-semibold text-sm text-text-primary truncate">{tpl.name}</span>
									<span class="text-xs text-text-tertiary truncate w-full text-left">{tpl.feedbackMessage}</span>
								</div>
								<div class="shrink-0 text-text-tertiary">
									{#if expandedRejections[tpl.id]}
										<ChevronUp size={16} />
									{:else}
										<ChevronDown size={16} />
									{/if}
								</div>
							</button>

							{#if expandedRejections[tpl.id] && rejectionForms[tpl.id]}
								<div class="px-4 pb-4 flex flex-col gap-3 border-t border-border-card pt-4">
									{@render rejectionTemplateFields(tpl.id)}
									<div class="flex gap-2 justify-end pt-1">
										<button
											class="px-3 py-1.5 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 text-xs font-medium cursor-pointer disabled:opacity-50"
											onclick={() => deleteRejectionTemplate(tpl.id)}
											disabled={deletingRejection === tpl.id}
										>
											{#if deletingRejection === tpl.id}
												<Loader2 size={12} class="animate-spin inline mr-1" />
											{/if}
											Delete
										</button>
										<button
											class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
											onclick={() => saveRejectionTemplate(tpl.id)}
											disabled={savingRejection === tpl.id || !rejectionForms[tpl.id].name.trim() || !rejectionForms[tpl.id].feedbackMessage.trim()}
										>
											{#if savingRejection === tpl.id}
												<Loader2 size={12} class="animate-spin inline mr-1" />
											{/if}
											Save
										</button>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						{#if !showNewRejection}
							<p class="text-sm text-text-tertiary py-2">No quick rejections yet. Add one to speed up common rejection reasons.</p>
						{/if}
					{/each}

					{#if showNewRejection && rejectionForms['new']}
						<div class="border border-dashed border-border-card rounded-section bg-page px-4 py-4 flex flex-col gap-3">
							{@render rejectionTemplateFields('new')}
							<div class="flex gap-2 justify-end pt-1">
								<button
									class="px-3 py-1.5 rounded-tag text-text-dim hover:bg-surface text-xs font-medium cursor-pointer disabled:opacity-50"
									onclick={() => { showNewRejection = false; delete rejectionForms['new']; }}
									disabled={savingRejection === 'new'}
								>
									Cancel
								</button>
								<button
									class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
									onclick={() => saveRejectionTemplate('new')}
									disabled={savingRejection === 'new' || !rejectionForms['new'].name.trim() || !rejectionForms['new'].feedbackMessage.trim()}
								>
									{#if savingRejection === 'new'}
										<Loader2 size={12} class="animate-spin inline mr-1" />
									{/if}
									Create
								</button>
							</div>
						</div>
					{:else}
						<button
							class="flex items-center gap-1.5 w-fit px-3 py-2 rounded-tag border border-border-input text-xs font-medium text-text-subtle hover:bg-surface transition-colors cursor-pointer"
							onclick={() => { initRejectionForm('new'); showNewRejection = true; }}
						>
							<Plus size={13} />
							Add quick rejection
						</button>
					{/if}
				</div>
			</ManageSection>

			{#snippet projectTagFields(id: string)}
				{@const form = tagForms[id]}
				<div class="flex flex-col gap-1">
					<label for="tag-label-{id}" class="text-xs font-semibold text-text-secondary">Name</label>
					<input
						id="tag-label-{id}"
						type="text"
						maxlength="50"
						bind:value={form.label}
						placeholder="e.g. hardware"
						class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<span class="text-xs font-semibold text-text-secondary">Color</span>
					<div class="flex items-center gap-2 flex-wrap">
						{#each TAG_COLOR_PRESETS as preset (preset)}
							<button
								type="button"
								class="size-6 rounded-full cursor-pointer border-2 transition-transform hover:scale-110 {form.color.toLowerCase() === preset ? 'border-text-primary' : 'border-transparent'}"
								style="background: {preset}"
								aria-label="Use color {preset}"
								onclick={() => (form.color = preset)}
							></button>
						{/each}
						<input
							type="text"
							maxlength="7"
							bind:value={form.color}
							placeholder="#6b7280"
							class="w-24 h-8 px-2 rounded-input border border-border-input text-sm font-mono text-text-input focus:outline-none focus:border-border-active"
						/>
						{#if form.label.trim()}
							<ProjectTags tags={[{ label: form.label.trim(), color: form.color }]} />
						{/if}
					</div>
				</div>
			{/snippet}

			<ManageSection title="Project Tags" description="Custom tags reviewers can assign to projects and filter the review queue by.">
				{#snippet icon()}<Tag size={16} class="text-text-secondary" />{/snippet}
				<div class="border border-dashed border-border-card rounded-section p-6 flex flex-col gap-2">
					{#each data.projectTags as tag (tag.id)}
						<div class="border border-border-card rounded-section bg-page overflow-hidden">
							<button
								class="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
								onclick={() => toggleTagEdit(tag.id)}
							>
								<ProjectTags tags={[tag]} class="shrink-0" />
								<span class="flex-1"></span>
								<div class="shrink-0 text-text-tertiary">
									{#if editingTags[tag.id]}
										<ChevronUp size={16} />
									{:else}
										<ChevronDown size={16} />
									{/if}
								</div>
							</button>

							{#if editingTags[tag.id] && tagForms[tag.id]}
								<div class="px-4 pb-4 flex flex-col gap-3 border-t border-border-card pt-4">
									{@render projectTagFields(tag.id)}
									<div class="flex gap-2 justify-end pt-1">
										<button
											class="px-3 py-1.5 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 text-xs font-medium cursor-pointer disabled:opacity-50"
											onclick={() => deleteProjectTag(tag.id)}
											disabled={deletingTag === tag.id}
										>
											{#if deletingTag === tag.id}
												<Loader2 size={12} class="animate-spin inline mr-1" />
											{/if}
											Delete
										</button>
										<button
											class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
											onclick={() => saveProjectTag(tag.id)}
											disabled={savingTag === tag.id || !tagForms[tag.id].label.trim()}
										>
											{#if savingTag === tag.id}
												<Loader2 size={12} class="animate-spin inline mr-1" />
											{/if}
											Save
										</button>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						{#if !showNewTag}
							<p class="text-sm text-text-tertiary py-2">No project tags yet. Add tags like <span class="font-mono text-xs">hardware</span> or <span class="font-mono text-xs">review later</span> to organize the review queue.</p>
						{/if}
					{/each}

					{#if showNewTag && tagForms['new']}
						<div class="border border-dashed border-border-card rounded-section bg-page px-4 py-4 flex flex-col gap-3">
							{@render projectTagFields('new')}
							<div class="flex gap-2 justify-end pt-1">
								<button
									class="px-3 py-1.5 rounded-tag text-text-dim hover:bg-surface text-xs font-medium cursor-pointer disabled:opacity-50"
									onclick={() => { showNewTag = false; delete tagForms['new']; tagError = null; }}
									disabled={savingTag === 'new'}
								>
									Cancel
								</button>
								<button
									class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
									onclick={() => saveProjectTag('new')}
									disabled={savingTag === 'new' || !tagForms['new'].label.trim()}
								>
									{#if savingTag === 'new'}
										<Loader2 size={12} class="animate-spin inline mr-1" />
									{/if}
									Create
								</button>
							</div>
						</div>
					{:else}
						<button
							class="flex items-center gap-1.5 w-fit px-3 py-2 rounded-tag border border-border-input text-xs font-medium text-text-subtle hover:bg-surface transition-colors cursor-pointer"
							onclick={() => { initTagForm('new'); showNewTag = true; }}
						>
							<Plus size={13} />
							Add tag
						</button>
					{/if}

					{#if tagError}
						<p class="text-xs text-check-fail">{tagError}</p>
					{/if}
				</div>
			</ManageSection>

			{#if data.currentMembership.isRoot}
			<ManageSection title="Shop Items" description="Configure fulfillment templates for shop items — either HCB card grants or Theseus warehouse orders.">
				{#snippet icon()}<Store size={16} class="text-text-secondary" />{/snippet}
				<div class="flex flex-col gap-4">
					<div class="border border-dashed border-border-card rounded-section p-6">
						<LabeledField label="HCB Organization" description="Link an HCB organization to enable card grant distribution.">
							{#snippet icon()}<CreditCard size={16} />{/snippet}
							{#if data.program.hcbOrganizationId}
								<div class="flex items-center justify-between gap-3">
									<div class="flex items-center gap-2">
										<Link size={14} class="text-check-pass" />
										<span class="text-sm font-semibold text-text-primary">{data.program.hcbOrganizationName}</span>
										{#if data.program.hcbOrganizationSlug}
											<span class="text-xs text-text-tertiary font-mono">{data.program.hcbOrganizationSlug}</span>
										{/if}
									</div>
									<button
										class="flex items-center gap-1.5 px-3 py-1.5 rounded-tag border border-border-input text-xs font-medium hover:bg-surface cursor-pointer disabled:opacity-50"
										onclick={unlinkOrg}
										disabled={unlinkingOrg}
									>
										{#if unlinkingOrg}
											<Loader2 size={12} class="animate-spin" />
										{:else}
											<Unlink size={12} />
										{/if}
										Unlink
									</button>
								</div>
							{:else if hcbOrgs.length > 0}
								<div class="flex gap-2">
									<select
										bind:value={selectedOrgId}
										class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] focus:outline-none focus:border-border-active transition-colors"
									>
										{#each hcbOrgs as org (org.id)}
											<option value={org.id}>{org.name} ({org.slug})</option>
										{/each}
									</select>
									<button
										class="h-9 px-4 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
										onclick={linkOrg}
										disabled={linkingOrg}
									>
										{linkingOrg ? 'Linking…' : 'Link'}
									</button>
								</div>
							{:else}
								<button
									class="flex items-center gap-2 h-9 px-4 rounded-input border border-border-input text-sm font-medium text-text-subtle hover:bg-surface cursor-pointer disabled:opacity-50"
									onclick={loadHcbOrgs}
									disabled={loadingOrgs}
								>
									{#if loadingOrgs}
										<Loader2 size={14} class="animate-spin" />
										Loading organizations…
									{:else}
										<CreditCard size={14} />
										{data.userHasHcbAuth ? 'Select HCB Organization' : 'Connect to HCB'}
									{/if}
								</button>
							{/if}
						</LabeledField>
					</div>

					<div class="border border-dashed border-border-card rounded-section p-6">
						<LabeledField label="Theseus API Key" description="Set a Theseus API key to enable warehouse order fulfillment.">
							{#snippet icon()}<Package size={16} />{/snippet}
							{#if data.hasTheseusApiKey}
								<div class="flex flex-col gap-2">
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-2">
											<Link size={14} class="text-check-pass" />
											<span class="text-sm font-semibold text-text-primary">{data.theseusUser?.name || 'Unknown'}</span>
											{#if data.theseusUser?.email}
												<span class="text-xs text-text-tertiary font-mono">{data.theseusUser.email}</span>
											{/if}
										</div>
										<button
											class="flex items-center gap-1.5 px-3 py-1.5 rounded-tag border border-border-input text-xs font-medium hover:bg-surface cursor-pointer disabled:opacity-50"
											onclick={removeTheseusApiKey}
											disabled={removingTheseusKey}
										>
											{#if removingTheseusKey}
												<Loader2 size={12} class="animate-spin" />
											{:else}
												<Unlink size={12} />
											{/if}
											Remove
										</button>
									</div>
									{#if theseusKeyError}
										<p class="text-xs text-check-fail">{theseusKeyError}</p>
									{/if}
								</div>
							{:else}
								<div class="flex flex-col gap-2">
									<div class="flex gap-2">
										<input
											type="password"
											bind:value={theseusApiKeyInput}
											placeholder="th_api_live_..."
											class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] font-mono focus:outline-none focus:border-border-active transition-colors"
										/>
										<button
											class="h-9 px-4 rounded-input bg-accent text-white text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
											onclick={saveTheseusApiKey}
											disabled={savingTheseusKey || !theseusApiKeyInput.trim()}
										>
											{savingTheseusKey ? 'Verifying…' : 'Save'}
										</button>
									</div>
									{#if theseusKeyError}
										<p class="text-xs text-check-fail">{theseusKeyError}</p>
									{/if}
								</div>
							{/if}
						</LabeledField>
					</div>

					{#if canConfigureShopItems}
						<input
							type="search"
							placeholder="Filter shop items…"
							bind:value={shopItemFilter}
							class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] placeholder:text-text-placeholder focus:outline-none focus:border-border-active transition-colors"
						/>
						<div class="flex flex-col gap-2 max-h-[640px] overflow-y-auto overflow-x-visible">
							{#each filteredShopItems as item (item.id)}
								{@const cardTemplate = getTemplateForItem(item.id)}
								{@const whTemplate = getWarehouseTemplateForItem(item.id)}
								{@const existingType = getTemplateTypeForItem(item.id)}
								{@const selectedType = selectedTemplateType[item.id] ?? existingType ?? 'card_grant'}
								<div class="border border-border-card rounded-section bg-page">
									<button
										class="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
										onclick={() => toggleItem(item.id)}
									>
										{#if item.thumbnailUrl}
											<img src={item.thumbnailUrl} alt="" class="h-8 w-[52px] object-cover shrink-0 rounded" />
										{:else}
											<div class="h-8 w-[52px] bg-surface rounded flex items-center justify-center shrink-0">
												<Store size={14} class="text-text-tertiary" />
											</div>
										{/if}
										<div class="flex flex-col items-start min-w-0 flex-1">
											<span class="font-semibold text-sm text-text-primary truncate">{item.name}</span>
											{#if item.unitPrice != null}
												<span class="flex items-center gap-1 text-xs text-text-tertiary"><Banknote size={12} />{item.unitPrice}</span>
											{/if}
										</div>
										<div class="flex items-center gap-2 shrink-0">
											{#if cardTemplate}
												<span class="flex items-center gap-1 text-[11px] font-medium text-check-pass">
													<CircleCheck size={13} />
													${(cardTemplate.amountCents / 100).toFixed(2)} grant
												</span>
											{:else if whTemplate}
												<span class="flex items-center gap-1 text-[11px] font-medium text-check-pass">
													<CircleCheck size={13} />
													Warehouse
												</span>
											{:else}
												<span class="text-[11px] text-text-tertiary">No template</span>
											{/if}
											{#if expandedItems[item.id]}
												<ChevronUp size={16} class="text-text-tertiary" />
											{:else}
												<ChevronDown size={16} class="text-text-tertiary" />
											{/if}
										</div>
									</button>

									{#if expandedItems[item.id]}
										<div class="px-4 pb-4 flex flex-col gap-3 border-t border-border-card pt-4">
											{#if !existingType}
												<div class="flex gap-2">
													<button
														type="button"
														class="flex-1 py-1.5 rounded-tag text-xs font-medium text-center cursor-pointer transition-colors
															{selectedType === 'card_grant' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-surface/80'}"
														onclick={() => { selectedTemplateType = { ...selectedTemplateType, [item.id]: 'card_grant' }; }}
													>
														<CreditCard size={12} class="inline mr-1" />Card Grant
													</button>
													<button
														type="button"
														class="flex-1 py-1.5 rounded-tag text-xs font-medium text-center cursor-pointer transition-colors
															{selectedType === 'warehouse' ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:bg-surface/80'}"
														onclick={() => { selectedTemplateType = { ...selectedTemplateType, [item.id]: 'warehouse' }; }}
													>
														<Package size={12} class="inline mr-1" />Warehouse
													</button>
												</div>
											{/if}

											{#if selectedType === 'card_grant'}
												{@const form = templateForms[item.id]}
												<div class="grid grid-cols-2 gap-3">
													<div class="flex flex-col gap-1">
														<label for="amount-{item.id}" class="text-xs font-semibold text-text-secondary">Amount ($)</label>
														<div class="relative">
															<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">$</span>
															<input
																id="amount-{item.id}"
																type="number"
																step="0.01"
																min="0.01"
																bind:value={form.amountDollars}
																placeholder="25.00"
																class="w-full h-9 pl-7 pr-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
															/>
														</div>
													</div>
													<div class="flex flex-col gap-1">
														<label for="purpose-{item.id}" class="text-xs font-semibold text-text-secondary">Purpose <span class="font-normal text-text-tertiary">({form.purpose.length}/30)</span></label>
														<input
															id="purpose-{item.id}"
															type="text"
															maxlength="30"
															bind:value={form.purpose}
															placeholder="e.g. Prize fulfillment"
															class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
														/>
													</div>
												</div>

												<div class="flex gap-4">
													<Checkbox checked={form.oneTimeUse} onchange={() => { form.oneTimeUse = !form.oneTimeUse; }}>
														<div class="flex flex-col gap-0.5">
															<span class="text-sm font-semibold text-text-primary">One-time use</span>
															<span class="text-xs text-text-tertiary">Card can only be used once</span>
														</div>
													</Checkbox>
													<Checkbox checked={form.preAuthorizationRequired} onchange={() => { form.preAuthorizationRequired = !form.preAuthorizationRequired; }}>
														<div class="flex flex-col gap-0.5">
															<span class="text-sm font-semibold text-text-primary">Pre-authorization required</span>
															<span class="text-xs text-text-tertiary">Requires approval before use</span>
														</div>
													</Checkbox>
												</div>

												<div class="flex flex-col gap-1">
													<label for="instructions-{item.id}" class="text-xs font-semibold text-text-secondary">Instructions</label>
													<textarea
														id="instructions-{item.id}"
														bind:value={form.instructions}
														rows="2"
														placeholder="Instructions for the cardholder..."
														class="w-full px-3 py-2 rounded-input border border-border-input text-sm text-text-input resize-y focus:outline-none focus:border-border-active"
													></textarea>
												</div>

												<div class="flex flex-col gap-1">
													<label for="merchant-{item.id}" class="text-xs font-semibold text-text-secondary">Merchant lock</label>
													<div class="flex gap-2">
														<input
															id="merchant-{item.id}"
															type="text"
															bind:value={form.merchantLock}
															placeholder="Comma-separated merchant IDs"
															class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm font-mono text-text-input focus:outline-none focus:border-border-active"
														/>
														<button
															type="button"
															class="size-9 rounded-input border border-border-input flex items-center justify-center text-text-subtle hover:bg-surface cursor-pointer shrink-0"
															title="Look up known merchants"
															onclick={(e) => openPopup(item.id, 'merchant', e)}
														>
															<Search size={14} />
														</button>
													</div>
												</div>

												<div class="flex flex-col gap-1">
													<label for="category-{item.id}" class="text-xs font-semibold text-text-secondary">Category lock</label>
													<div class="flex gap-2">
														<input
															id="category-{item.id}"
															type="text"
															bind:value={form.categoryLock}
															placeholder="Comma-separated categories"
															class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm font-mono text-text-input focus:outline-none focus:border-border-active"
														/>
														<button
															type="button"
															class="size-9 rounded-input border border-border-input flex items-center justify-center text-text-subtle hover:bg-surface cursor-pointer shrink-0"
															title="Look up spending categories"
															onclick={(e) => openPopup(item.id, 'category', e)}
														>
															<Search size={14} />
														</button>
													</div>
												</div>

												<div class="flex flex-col gap-1">
													<label for="keyword-{item.id}" class="text-xs font-semibold text-text-secondary">Keyword lock</label>
													<input
														id="keyword-{item.id}"
														type="text"
														bind:value={form.keywordLock}
														placeholder={'e.g. \\AApple[a-zA-Z]{0,2}\\z'}
														class="w-full h-9 px-3 rounded-input border border-border-input text-sm font-mono text-text-input focus:outline-none focus:border-border-active"
													/>
													<span class="text-xs text-text-tertiary">Ruby regular expression matched against the merchant name. Locks work in tandem: a transaction matching any configured lock is allowed.</span>
												</div>

												<div class="grid grid-cols-1 gap-3">
													<div class="flex flex-col gap-1">
														<label for="expiration-{item.id}" class="text-xs font-semibold text-text-secondary">Expiration (days)</label>
														<input
															id="expiration-{item.id}"
															type="number"
															min="1"
															bind:value={form.expirationDays}
															placeholder="30"
															class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
														/>
													</div>
												</div>

												<div class="flex gap-2 justify-end pt-1">
													{#if cardTemplate}
														<button
															class="px-3 py-1.5 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 text-xs font-medium cursor-pointer disabled:opacity-50"
															onclick={() => deleteTemplate(item.id)}
															disabled={deletingTemplate === item.id}
														>
															{#if deletingTemplate === item.id}
																<Loader2 size={12} class="animate-spin inline mr-1" />
															{/if}
															Delete Template
														</button>
													{/if}
													<button
														class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
														onclick={() => saveTemplate(item.id)}
														disabled={savingTemplate === item.id || !form.amountDollars}
													>
														{#if savingTemplate === item.id}
															<Loader2 size={12} class="animate-spin inline mr-1" />
														{/if}
														{cardTemplate ? 'Update Template' : 'Create Template'}
													</button>
												</div>
											{:else}
												{@const wForm = warehouseTemplateForms[item.id]}
												<div class="flex flex-col gap-1">
													<label for="wh-tags-{item.id}" class="text-xs font-semibold text-text-secondary">Tags <span class="font-normal text-text-tertiary">(comma-separated, required)</span></label>
													<input
														id="wh-tags-{item.id}"
														type="text"
														bind:value={wForm.tags}
														placeholder="e.g. stickers,hackclub"
														class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
													/>
													{#if !wForm.tags.trim()}
														<span class="text-[11px] text-text-tertiary">Theseus requires at least one tag on every warehouse order.</span>
													{/if}
												</div>

												<div class="flex flex-col gap-1">
													<label for="wh-title-{item.id}" class="text-xs font-semibold text-text-secondary">User-facing title</label>
													<input
														id="wh-title-{item.id}"
														type="text"
														bind:value={wForm.userFacingTitle}
														placeholder="e.g. Hack Club Sticker Pack"
														class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
													/>
												</div>

												<div class="flex flex-col gap-2">
													<div class="flex items-center justify-between">
														<span class="text-xs font-semibold text-text-secondary">Contents (SKU + Quantity)</span>
														<button
															type="button"
															class="flex items-center gap-1 text-xs text-accent hover:opacity-70 cursor-pointer"
															onclick={() => addContentRow(item.id)}
														>
															<Plus size={12} /> Add row
														</button>
													</div>
													{#each wForm.contents as row, idx}
														<div class="flex gap-2 items-center">
															<input
																type="text"
																bind:value={row.sku}
																placeholder="SKU"
																class="flex-1 h-9 px-3 rounded-input border border-border-input text-sm font-mono text-text-input focus:outline-none focus:border-border-active"
															/>
															<input
																type="number"
																min="1"
																bind:value={row.quantity}
																placeholder="Qty"
																class="w-20 h-9 px-3 rounded-input border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
															/>
															{#if wForm.contents.length > 1}
																<button
																	type="button"
																	class="size-9 rounded-input border border-border-input flex items-center justify-center text-text-tertiary hover:text-check-fail hover:bg-check-fail/5 cursor-pointer shrink-0"
																	onclick={() => removeContentRow(item.id, idx)}
																>
																	<X size={14} />
																</button>
															{/if}
														</div>
													{/each}
												</div>

												<div class="flex gap-2 justify-end pt-1">
													{#if whTemplate}
														<button
															class="px-3 py-1.5 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 text-xs font-medium cursor-pointer disabled:opacity-50"
															onclick={() => deleteWarehouseTemplate(item.id)}
															disabled={deletingWarehouseTemplate === item.id}
														>
															{#if deletingWarehouseTemplate === item.id}
																<Loader2 size={12} class="animate-spin inline mr-1" />
															{/if}
															Delete Template
														</button>
													{/if}
													<button
														class="px-3 py-1.5 rounded-tag bg-accent text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50"
														onclick={() => saveWarehouseTemplate(item.id)}
														disabled={savingWarehouseTemplate === item.id || !wForm.tags.trim() || !wForm.contents.some(c => c.sku.trim())}
													>
														{#if savingWarehouseTemplate === item.id}
															<Loader2 size={12} class="animate-spin inline mr-1" />
														{/if}
														{whTemplate ? 'Update Template' : 'Create Template'}
													</button>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else if data.program.hcbOrganizationId || data.hasTheseusApiKey}
						<p class="text-sm text-text-tertiary py-4 text-center">No shop items found. Items appear here once your program has fulfillment items configured.</p>
					{/if}
				</div>
			</ManageSection>
			{/if}

			<ManageSection title="Program API Configuration" description="This is how Sidekick reads, writes, and otherwise communicates with your program.">
				{#snippet icon()}<EthernetPort size={16} class="text-text-secondary" />{/snippet}
				<form
					method="POST"
					action="?/updateApiConfig"
					use:enhance={() => {
						apiConfigSaving = true;
						return async ({ update }) => {
							await update({ reset: false });
							apiConfigSaving = false;
							apiConfigSaved = true;
							setTimeout(() => { apiConfigSaved = false; }, 2000);
						};
					}}
					class="border border-dashed border-border-card rounded-section p-6 flex flex-col gap-6"
				>
					<LabeledField label="Master endpoint" description="This endpoint should follow the Sidekick communication protocol.">
						{#snippet icon()}<Globe size={16} />{/snippet}
						<EndpointField name="masterEndpoint" bind:value={masterEndpoint} secretKey={secretKey} />
					</LabeledField>
					<LabeledField label="Secret key" description="Only your API server and Sidekick should share this. Authorizes ALL API requests.">
						{#snippet icon()}<KeyRound size={16} />{/snippet}
						<SecretKeyField name="secretKey" bind:value={secretKey} />
					</LabeledField>
					<button
						type="submit"
						disabled={apiConfigSaving}
						class="h-9 px-4 rounded-input border border-border-button text-sm font-medium text-text-subtle tracking-[-0.3px] hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 w-fit"
					>
						{apiConfigSaved ? 'Saved!' : apiConfigSaving ? 'Saving…' : 'Save'}
					</button>
				</form>
			</ManageSection>

			<ManageSection title="Audit Log" description="What's going on?!">
				{#snippet icon()}<ScrollText size={16} class="text-text-secondary" />{/snippet}
				<div class="flex flex-col gap-0.5 max-h-[320px] overflow-y-auto">
					{#each data.auditLogs as log (log.id)}
						{@const ActionIcon = getActionIcon(log.action)}
						{@const actionColor = getActionColor(log.action)}
						<div class="flex items-center gap-3 px-3 py-2.5 rounded-tag hover:bg-surface/50 transition-colors">
							<div class="shrink-0 {actionColor}">
								<ActionIcon size={18} />
							</div>
							<Avatar name={log.actor.name} url={log.actor.avatarUrl} size="sm" />
							<div class="flex-1 min-w-0">
								<span class="text-[12px] text-text-primary">
									<span class="font-semibold">{log.actor.name}</span>
									{describeAction(log.action, log.entityType)}
									{#if log.entityId}
										<span class="font-mono text-text-muted text-xs" title={isUuid(log.entityId) ? log.entityId : undefined}>{shortenId(log.entityId)}</span>
									{/if}
								</span>
							</div>
							<span class="shrink-0 text-xs text-text-tertiary">{formatShortDate(log.createdAt)}</span>
						</div>
					{:else}
						<p class="text-sm text-text-tertiary py-6 text-center">No audit log entries yet.</p>
					{/each}
				</div>
			</ManageSection>

			{#if data.currentMembership.isRoot}
			<ManageSection title="Danger Zone" description="Irreversible and destructive actions.">
				{#snippet icon()}<AlertTriangle size={16} class="text-check-fail" />{/snippet}
				<div class="border border-check-fail/30 rounded-section p-6 flex items-center justify-between gap-4">
					<div class="flex flex-col gap-0.5">
						<span class="text-sm font-semibold text-text-primary">Delete this program</span>
						<span class="text-xs text-text-tertiary">Permanently removes the program along with all of its members, templates, audit logs, and review data. This cannot be undone.</span>
					</div>
					<button
						class="flex items-center gap-1.5 px-3 py-2 rounded-tag text-check-fail border border-check-fail/30 hover:bg-check-fail/5 transition-colors cursor-pointer text-sm font-medium shrink-0"
						onclick={() => { deleteConfirmText = ''; showDeleteModal = true; }}
					>
						<Trash2 size={14} />
						Delete program
					</button>
				</div>
			</ManageSection>
			{/if}
		</div>
</ManageLayout>

{#if showDeleteModal}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
	onmousedown={(e) => { if (e.target === e.currentTarget && !deletingProgram) showDeleteModal = false; }}
>
	<div class="bg-page border border-border-card rounded-card shadow-xl w-[440px] max-w-[90vw] flex flex-col">
		<div class="flex items-center justify-between px-5 py-4 border-b border-border-card">
			<div class="flex items-center gap-2">
				<AlertTriangle size={16} class="text-check-fail" />
				<span class="font-bold text-[15px] text-text-primary tracking-[-0.4px]">Delete program</span>
			</div>
			<button
				class="text-text-tertiary hover:text-text-primary cursor-pointer disabled:opacity-50"
				onclick={() => showDeleteModal = false}
				disabled={deletingProgram}
			>
				<X size={16} />
			</button>
		</div>
		<div class="px-5 py-4 flex flex-col gap-3">
			<p class="text-sm text-text-secondary leading-relaxed">
				This will permanently delete <span class="font-semibold text-text-primary">{data.program.name}</span> along with all of its members, templates, audit logs, and review data. This action cannot be undone.
			</p>
			<div class="flex flex-col gap-1.5">
				<label for="delete-confirm" class="text-xs font-medium text-text-secondary">
					Type <span class="font-semibold text-text-primary">{data.program.name}</span> to confirm
				</label>
				<input
					id="delete-confirm"
					type="text"
					bind:value={deleteConfirmText}
					placeholder={data.program.name}
					autocomplete="off"
					class="w-full h-9 px-3 rounded-input border border-border-input text-sm text-text-input tracking-[-0.3px] placeholder:text-text-placeholder focus:outline-none focus:border-border-active transition-colors"
				/>
			</div>
		</div>
		<div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-card">
			<button
				class="px-3 py-1.5 text-sm font-medium text-text-dim hover:bg-surface rounded-tag cursor-pointer disabled:opacity-50"
				onclick={() => showDeleteModal = false}
				disabled={deletingProgram}
			>
				Cancel
			</button>
			<button
				class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-check-fail text-white rounded-tag cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={deleteConfirmText !== data.program.name || deletingProgram}
				onclick={deleteProgram}
			>
				{#if deletingProgram}
					<Loader2 size={14} class="animate-spin" />
				{:else}
					<Trash2 size={14} />
				{/if}
				Delete program
			</button>
		</div>
	</div>
</div>
{/if}

{#if popupPos && merchantSearchOpen}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40" onclick={() => { merchantSearchOpen = null; popupPos = null; }}></div>
<div
	class="fixed z-50 w-[320px] bg-white border border-border-card rounded-input shadow-lg flex flex-col overflow-hidden"
	style="top: {popupPos.top}px; left: {Math.max(8, popupPos.left)}px;"
>
	<div class="p-2 border-b border-border-card">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			bind:value={merchantQuery}
			oninput={(e) => handleMerchantSearch((e.target as HTMLInputElement).value, merchantSearchOpen!)}
			placeholder="Search merchants…"
			class="w-full h-8 px-2.5 rounded-tag border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
			autofocus
		/>
	</div>
	<div class="max-h-[240px] overflow-auto">
		{#if merchantSearchLoading}
			<div class="flex items-center justify-center py-4"><Loader2 size={14} class="animate-spin text-text-tertiary" /></div>
		{:else if merchantResults.length > 0}
			{#each merchantResults.slice(0, 30) as merchant (merchant.name)}
				<button
					type="button"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-surface/50 cursor-pointer"
					onclick={() => addMerchantToForm(merchantSearchOpen!, merchant)}
				>
					<span class="font-medium text-text-primary truncate">{merchant.name}</span>
					<span class="text-[10px] text-text-tertiary shrink-0 ml-2">{merchant.networkIds.length} ID{merchant.networkIds.length !== 1 ? 's' : ''}</span>
				</button>
			{/each}
		{:else if merchantQuery.length > 0}
			<p class="text-xs text-text-tertiary text-center py-4">No merchants found</p>
		{:else}
			<p class="text-xs text-text-tertiary text-center py-4">Type to search</p>
		{/if}
	</div>
</div>
{/if}

{#if popupPos && categorySearchOpen}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 z-40" onclick={() => { categorySearchOpen = null; popupPos = null; }}></div>
<div
	class="fixed z-50 w-[320px] bg-white border border-border-card rounded-input shadow-lg flex flex-col overflow-hidden"
	style="top: {popupPos.top}px; left: {Math.max(8, popupPos.left)}px;"
>
	<div class="p-2 border-b border-border-card">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			bind:value={categoryQuery}
			placeholder="Search categories…"
			class="w-full h-8 px-2.5 rounded-tag border border-border-input text-sm text-text-input focus:outline-none focus:border-border-active"
			autofocus
		/>
	</div>
	<div class="max-h-[240px] overflow-auto">
		{#if filteredCategories.length > 0}
			{#each filteredCategories.slice(0, 30) as cat (cat.id)}
				<button
					type="button"
					class="w-full flex items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-surface/50 cursor-pointer"
					onclick={() => addCategoryToForm(categorySearchOpen!, cat.id)}
				>
					<span class="font-medium text-text-primary truncate">{cat.label}</span>
					<span class="text-[10px] text-text-tertiary font-mono shrink-0 ml-2">{cat.id}</span>
				</button>
			{/each}
		{:else}
			<p class="text-xs text-text-tertiary text-center py-4">No categories found</p>
		{/if}
	</div>
</div>
{/if}
