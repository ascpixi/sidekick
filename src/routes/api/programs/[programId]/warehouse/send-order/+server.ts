import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { requirePermission } from '$lib/server/rbac.js';
import { ProtocolClient, ProtocolError, isAddressUnavailable } from '$lib/server/protocol/client.js';
import { decrypt } from '$lib/server/crypto.js';
import { createWarehouseOrder, parseWarehouseTags } from '$lib/server/integrations/theseus.js';
import { getValidHcbToken, createHcbTransfer } from '$lib/server/integrations/hcb.js';
import { createLogger } from '$lib/server/logger.js';
import type { CreateWarehouseOrderParams } from '$lib/server/integrations/theseus.js';
import type { RequestHandler } from './$types.js';

const logger = createLogger('api:warehouse:send-order');

function parseDecimalCents(value: string | null): number {
	if (!value) return 0;
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

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
	const { orderId } = body;

	if (!orderId) {
		throw error(400, 'orderId is required');
	}

	logger.info('POST send warehouse order', { orderId, programId: params.programId });

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
	const orderDetail = await client.fetchOrderDetail({ orderId });

	const template = await db.warehouseTemplate.findUnique({
		where: {
			programId_shopItemId: {
				programId: params.programId,
				shopItemId: orderDetail.item.id
			}
		}
	});

	if (!template) {
		throw error(404, 'No warehouse template configured for this item');
	}

	logger.debug('Template found', { shopItemId: orderDetail.item.id, templateTags: template.tags });

	const tags = parseWarehouseTags(template.tags);
	if (tags.length === 0) {
		logger.warn('Warehouse template has no tags', { orderId, shopItemId: orderDetail.item.id });
		throw error(400, 'The warehouse template for this item has no tags — Theseus requires at least one. Add one in program settings.');
	}

	let address;
	try {
		logger.debug('Revealing order address', { orderId });
		address = await client.revealOrderAddress({ orderId });
	} catch (e) {
		if (e instanceof ProtocolError) {
			if (isAddressUnavailable(e)) {
				logger.warn('Shipping address temporarily unavailable', { orderId, status: e.status });
				throw error(503, 'Shipping address is temporarily unavailable upstream. Try again later.');
			}
			logger.warn('No shipping address for order', { orderId });
			throw error(400, 'No shipping address on file for this order');
		}
		throw e;
	}

	if (!address?.line1?.trim()) {
		throw error(400, 'No shipping address on file for this order');
	}

	const contents = (template.contents as Array<{ sku: string; quantity: number }>).map(c => ({
		sku: c.sku,
		quantity: c.quantity * orderDetail.order.quantity
	}));

	const orderParams: CreateWarehouseOrderParams = {
		warehouse_order: {
			recipient_email: orderDetail.order.userEmail,
			tags,
			user_facing_title: template.userFacingTitle || undefined,
			idempotency_key: `sidekick-${params.programId}-${orderId}`,
			metadata: {
				...(template.metadata as Record<string, unknown> ?? {}),
				sidekick_program_id: params.programId,
				sidekick_order_id: orderId
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

	logger.debug('Sending warehouse order to Theseus', { orderId, contents: contents.length });
	const result = await createWarehouseOrder(apiKey, orderParams);
	logger.debug('Warehouse order created', { warehouseOrderId: result.id, contentsCost: result.contents_cost, laborCost: result.labor_cost, postageCost: result.postage_cost });

	const totalCostCents = parseDecimalCents(result.contents_cost)
		+ parseDecimalCents(result.labor_cost)
		+ parseDecimalCents(result.postage_cost);

	const fmtCost = (v: string | null) => '$' + (parseFloat(v ?? '0') || 0).toFixed(2);
	const skuList = contents.length === 1 && contents[0].quantity === 1
		? contents[0].sku
		: contents.map(c => `${c.quantity}x ${c.sku}`).join(', ');
	const transferName = `Warehouse order for ${skuList}, order ${orderId} (contents: ${fmtCost(result.contents_cost)}, labor: ${fmtCost(result.labor_cost)}, postage: ${fmtCost(result.postage_cost)}) via sidekick.ascpixi.dev`;

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
	} else {
		logger.debug('Skipping HCB transfer (zero cost)');
	}

	const reference = `https://mail.hackclub.com/packages/${result.id}`;
	await client.updateOrderFields({ orderId, reference });

	await db.auditLog.create({
		data: {
			programId: params.programId,
			userId: user.id,
			action: 'warehouse_order_sent',
			entityType: 'order',
			entityId: orderId,
			metadata: {
				warehouseOrderId: result.id,
				shopItemId: orderDetail.item.id,
				quantity: orderDetail.order.quantity,
				email: orderDetail.order.userEmail,
				totalCostCents,
				hcbTransferId: transfer?.id ?? null
			}
		}
	});

	logger.info('Warehouse order sent successfully', { orderId, warehouseOrderId: result.id, totalCostCents, transferId: transfer?.id ?? null });

	return json({ success: true, warehouseOrder: result, reference, totalCostCents, transfer });
};
