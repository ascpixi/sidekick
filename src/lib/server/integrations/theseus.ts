import { createLogger } from '../logger.js';

const log = createLogger('theseus');

const THESEUS_BASE = 'https://mail.hackclub.com';

export interface WarehouseAddress {
	first_name: string;
	last_name: string;
	line_1: string;
	line_2?: string;
	city: string;
	state?: string;
	postal_code: string;
	country: string;
}

export interface WarehouseContentItem {
	sku: string;
	quantity: number;
}

export interface CreateWarehouseOrderParams {
	warehouse_order: {
		recipient_email: string;
		tags: string[];
		user_facing_title?: string;
		idempotency_key?: string;
		metadata?: Record<string, unknown>;
	};
	address: WarehouseAddress;
	contents: WarehouseContentItem[];
}

export interface WarehouseOrderResult {
	id: string;
	status: string;
	tags: string[];
	recipient_email: string;
	tracking_number: string | null;
	carrier: string | null;
	service: string | null;
	weight: string | null;
	contents_cost: string | null;
	labor_cost: string | null;
	postage_cost: string | null;
	idempotency_key: string | null;
}

export interface TheseusUser {
	id: string;
	name: string;
	email: string;
	avatar: string | null;
	admin: boolean;
}

export async function getTheseusUser(apiKey: string): Promise<TheseusUser> {
	log.debug('getTheseusUser: fetching user info');
	const timer = log.time('getTheseusUser');
	const res = await fetch(`${THESEUS_BASE}/api/v1/user`, {
		headers: { Authorization: `Bearer ${apiKey}` }
	});

	if (!res.ok) {
		const text = await res.text();
		log.error('getTheseusUser failed', new Error(`${res.status} ${text}`));
		throw new Error(`Theseus auth failed: ${res.status} ${text}`);
	}

	const user: TheseusUser = await res.json();
	timer.end({ userId: user.id, admin: user.admin });
	return user;
}

/**
 * Splits a comma-separated template tag string into the tag list Theseus expects.
 * Theseus requires at least one tag - an empty list is rejected with a 400
 * `missing_parameter` error, so callers must check the result before sending.
 */
export function parseWarehouseTags(raw: string | null | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map(t => t.trim())
		.filter(Boolean);
}

export async function createWarehouseOrder(
	apiKey: string,
	params: CreateWarehouseOrderParams
): Promise<WarehouseOrderResult> {
	if (params.warehouse_order.tags.length === 0) {
		throw new Error('Warehouse order creation failed: at least one tag is required by Theseus');
	}

	log.info('createWarehouseOrder: creating order', {
		email: params.warehouse_order.recipient_email,
		tags: params.warehouse_order.tags,
		contentItems: params.contents.length,
		country: params.address.country
	});
	const timer = log.time('createWarehouseOrder');
	const res = await fetch(`${THESEUS_BASE}/api/v1/warehouse_orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(params)
	});

	if (!res.ok) {
		const text = await res.text();
		log.error('createWarehouseOrder failed', new Error(`${res.status} ${text}`));
		throw new Error(`Warehouse order creation failed: ${res.status} ${text}`);
	}

	const data: { warehouse_order: WarehouseOrderResult } = await res.json();
	const result = data.warehouse_order;
	timer.end({ orderId: result.id, status: result.status });
	return result;
}
