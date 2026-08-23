import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { requirePermission } from '$lib/server/rbac.js';
import { ProtocolClient, ProtocolError, isAddressUnavailable } from '$lib/server/protocol/client.js';
import { decrypt } from '$lib/server/crypto.js';
import { createWarehouseOrder, parseWarehouseTags } from '$lib/server/integrations/theseus.js';
import { getValidHcbToken, createHcbTransfer } from '$lib/server/integrations/hcb.js';
import { createLogger } from '$lib/server/logger.js';
import type { CreateWarehouseOrderParams } from '$lib/server/integrations/theseus.js';
import type { Order } from '$lib/server/protocol/types.js';
import type { RequestHandler } from './$types.js';

const logger = createLogger('api:warehouse:batch-order');

function parseDecimalCents(value: string | null): number {
	if (!value) return 0;
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

async function fetchAllPendingOrdersForItem(
	client: ProtocolClient,
	itemId: string
): Promise<Order[]> {
	const allOrders: Order[] = [];
	let cursor: string | undefined;

	for (;;) {
		const result = await client.fetchOrders({
			status: 'pending',
			filterItemId: itemId,
			cursor,
			limit: 50,
			sortBy: 'date',
			sortOrder: 'asc'
		});

		allOrders.push(...result.orders);

		if (!result.nextCursor) break;
		cursor = result.nextCursor;
	}

	return allOrders;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'canViewFulfillments', {
		isSuperAdmin: user.isSuperAdmin
	});

	const itemId = url.searchParams.get('itemId');
	const userId = url.searchParams.get('userId');
	if (!itemId || !userId) {
		throw error(400, 'itemId and userId are required');
	}

	const program = await db.program.findUniqueOrThrow({
		where: { id: params.programId }
	});

	const template = await db.warehouseTemplate.findUnique({
		where: {
			programId_shopItemId: {
				programId: params.programId,
				shopItemId: itemId
			}
		}
	});

	if (!template) {
		return json({ orders: [], totalQuantity: 0 });
	}

	const client = new ProtocolClient(program.masterEndpoint, program.secretKey);
	const allPending = await fetchAllPendingOrdersForItem(client, itemId);
	const userOrders = allPending.filter(o => o.userId === userId);

	const totalQuantity = userOrders.reduce((sum, o) => sum + o.quantity, 0);

	return json({
		orders: userOrders.map(o => ({
			id: o.id,
			quantity: o.quantity,
			createdAt: o.createdAt,
			reference: o.reference
		})),
		totalQuantity
	});
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	const membership = await requirePermission(user.id, params.programId, 'canUpdateFulfillments', {
		isSuperAdmin: user.isSuperAdmin
	});

	if (!membership.canViewAddressData) {
		throw error(403, 'You need address data permission to send warehouse orders');
	}

	const body = await request.json();
	const { itemId, userId } = body;

	if (!itemId || !userId) {
		throw error(400, 'itemId and userId are required');
	}

	logger.info('POST batch warehouse order', { itemId, userId, programId: params.programId });

	const program = await db.program.findUniqueOrThrow({
		where: { id: params.programId }
	});

	if (!program.theseusApiKey) {
		throw error(400, 'No Theseus API key configured for this program');
	}

	if (!program.hcbOrganizationSlug) {
		throw error(400, 'No HCB organization linked to this program');
	}

	const apiKey = decrypt(program.theseusApiKey);

	const hcbToken = await getValidHcbToken(user.id);
	if (!hcbToken) {
		return json({ needsAuth: true }, { status: 401 });
	}

	const client = new ProtocolClient(program.masterEndpoint, program.secretKey);

	const template = await db.warehouseTemplate.findUnique({
		where: {
			programId_shopItemId: {
				programId: params.programId,
				shopItemId: itemId
			}
		}
	});

	if (!template) {
		throw error(404, 'No warehouse template configured for this item');
	}

	const tags = parseWarehouseTags(template.tags);
	if (tags.length === 0) {
		logger.warn('Warehouse template has no tags', { itemId, userId });
		throw error(400, 'The warehouse template for this item has no tags — Theseus requires at least one. Add one in program settings.');
	}

	const allPending = await fetchAllPendingOrdersForItem(client, itemId);
	const userOrders = allPending.filter(o => o.userId === userId);

	if (userOrders.length === 0) {
		throw error(404, 'No pending orders found for this user and item');
	}

	const totalQuantity = userOrders.reduce((sum, o) => sum + o.quantity, 0);
	const firstOrderId = userOrders[0].id;

	logger.info('Batching orders', {
		orderCount: userOrders.length,
		orderIds: userOrders.map(o => o.id),
		totalQuantity
	});

	let address;
	try {
		address = await client.revealOrderAddress({ orderId: firstOrderId });
	} catch (e) {
		if (e instanceof ProtocolError) {
			if (isAddressUnavailable(e)) {
				logger.warn('Shipping address temporarily unavailable', { orderId: firstOrderId, status: e.status });
				throw error(503, 'Shipping address is temporarily unavailable upstream. Try again later.');
			}
			logger.warn('No shipping address for first order', { orderId: firstOrderId });
			throw error(400, 'No shipping address on file for this order');
		}
		throw e;
	}

	if (!address?.line1?.trim()) {
		throw error(400, 'No shipping address on file for this order');
	}

	const contents = (template.contents as Array<{ sku: string; quantity: number }>).map(c => ({
		sku: c.sku,
		quantity: c.quantity * totalQuantity
	}));

	const orderIds = userOrders.map(o => o.id).sort();
	const idempotencyKey = `sidekick-batch-${params.programId}-${orderIds.join('-')}`;

	const orderParams: CreateWarehouseOrderParams = {
		warehouse_order: {
			recipient_email: userOrders[0].userEmail,
			tags,
			user_facing_title: template.userFacingTitle || undefined,
			idempotency_key: idempotencyKey,
			metadata: {
				...(template.metadata as Record<string, unknown> ?? {}),
				sidekick_program_id: params.programId,
				sidekick_order_ids: orderIds,
				sidekick_batch: true
			}
		},
		address: {
			first_name: address.firstName,
			last_name: address.lastName,
			line_1: address.line1,
			line_2: address.line2 || undefined,
			city: address.city,
			state: address.stateProvince || undefined,
			postal_code: address.postalCode,
			country: address.country
		},
		contents
	};

	logger.debug('Sending batch warehouse order to Theseus', { orderCount: userOrders.length, totalQuantity, contents: contents.length });
	const result = await createWarehouseOrder(apiKey, orderParams);
	logger.debug('Batch warehouse order created', { warehouseOrderId: result.id });

	const totalCostCents = parseDecimalCents(result.contents_cost)
		+ parseDecimalCents(result.labor_cost)
		+ parseDecimalCents(result.postage_cost);

	const fmtCost = (v: string | null) => '$' + (parseFloat(v ?? '0') || 0).toFixed(2);
	const skuList = contents.length === 1 && contents[0].quantity === 1
		? contents[0].sku
		: contents.map(c => `${c.quantity}x ${c.sku}`).join(', ');
	const transferName = `Warehouse order for ${skuList}, batch of ${userOrders.length} orders [${orderIds.join(', ')}] (contents: ${fmtCost(result.contents_cost)}, labor: ${fmtCost(result.labor_cost)}, postage: ${fmtCost(result.postage_cost)}) via sidekick.ascpixi.dev`;

	let transfer = null;
	if (totalCostCents > 0) {
		logger.debug('Creating HCB transfer', { totalCostCents, fromOrg: program.hcbOrganizationSlug });
		transfer = await createHcbTransfer(
			hcbToken,
			program.hcbOrganizationSlug,
			'hq',
			totalCostCents,
			transferName
		);
		logger.debug('HCB transfer created', { transferId: transfer?.id ?? null });
	}

	const reference = `https://mail.hackclub.com/packages/${result.id}`;

	for (const order of userOrders) {
		await client.updateOrderFields({ orderId: order.id, reference });
	}

	await db.auditLog.create({
		data: {
			programId: params.programId,
			userId: user.id,
			action: 'warehouse_batch_order_sent',
			entityType: 'order',
			entityId: orderIds.join(','),
			metadata: {
				warehouseOrderId: result.id,
				shopItemId: itemId,
				orderIds,
				orderCount: userOrders.length,
				totalQuantity,
				email: userOrders[0].userEmail,
				totalCostCents,
				hcbTransferId: transfer?.id ?? null
			}
		}
	});

	logger.info('Batch warehouse order sent successfully', {
		orderCount: userOrders.length,
		warehouseOrderId: result.id,
		totalCostCents,
		transferId: transfer?.id ?? null
	});

	return json({
		success: true,
		warehouseOrder: result,
		reference,
		totalCostCents,
		transfer,
		orderIds,
		totalQuantity
	});
};
