import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { requirePermission } from '$lib/server/rbac.js';
import { parseWarehouseTags } from '$lib/server/integrations/theseus.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const logger = createLogger('api:warehouse:templates');

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'canUpdateProgram', {
		isSuperAdmin: user.isSuperAdmin
	});

	logger.debug('GET warehouse templates', { programId: params.programId });

	const templates = await db.warehouseTemplate.findMany({
		where: { programId: params.programId }
	});

	logger.debug('Templates fetched', { programId: params.programId, count: templates.length });
	return json({ templates });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'isRoot', {
		isSuperAdmin: user.isSuperAdmin
	});

	const body = await request.json();
	const { shopItemId, tags, userFacingTitle, metadata, contents } = body;

	logger.info('PUT warehouse template', { programId: params.programId, shopItemId });

	if (!shopItemId) {
		throw error(400, 'shopItemId is required');
	}

	const parsedTags = parseWarehouseTags(tags);
	if (parsedTags.length === 0) {
		throw error(400, 'At least one tag is required — Theseus rejects warehouse orders without tags');
	}

	if (!Array.isArray(contents) || contents.length === 0) {
		throw error(400, 'contents must be a non-empty array of { sku, quantity }');
	}

	for (const item of contents) {
		if (!item.sku || typeof item.sku !== 'string') {
			throw error(400, 'Each content item must have a sku string');
		}
		if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
			throw error(400, 'Each content item must have a quantity >= 1');
		}
	}

	// Ensure no card grant template exists for this item
	const existingCardGrant = await db.cardGrantTemplate.findUnique({
		where: { programId_shopItemId: { programId: params.programId, shopItemId } }
	});
	if (existingCardGrant) {
		throw error(409, 'A card grant template already exists for this item. Delete it first.');
	}

	const template = await db.warehouseTemplate.upsert({
		where: {
			programId_shopItemId: { programId: params.programId, shopItemId }
		},
		create: {
			programId: params.programId,
			shopItemId,
			tags: parsedTags.join(','),
			userFacingTitle: userFacingTitle || null,
			metadata: metadata || null,
			contents
		},
		update: {
			tags: parsedTags.join(','),
			userFacingTitle: userFacingTitle || null,
			metadata: metadata || null,
			contents
		}
	});

	await db.auditLog.create({
		data: {
			programId: params.programId,
			userId: user.id,
			action: 'warehouse_template_upsert',
			entityType: 'warehouse_template',
			entityId: template.id,
			metadata: { shopItemId, tags: parsedTags }
		}
	});

	logger.info('Warehouse template upserted', { programId: params.programId, templateId: template.id, shopItemId });
	return json({ template });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401);

	await requirePermission(user.id, params.programId, 'isRoot', {
		isSuperAdmin: user.isSuperAdmin
	});

	const body = await request.json();
	const { shopItemId } = body;

	logger.info('DELETE warehouse template', { programId: params.programId, shopItemId });

	if (!shopItemId) throw error(400, 'shopItemId is required');

	const template = await db.warehouseTemplate.findUnique({
		where: { programId_shopItemId: { programId: params.programId, shopItemId } }
	});

	if (!template) throw error(404, 'Template not found');

	await db.warehouseTemplate.delete({
		where: { id: template.id }
	});

	await db.auditLog.create({
		data: {
			programId: params.programId,
			userId: user.id,
			action: 'warehouse_template_delete',
			entityType: 'warehouse_template',
			entityId: template.id,
			metadata: { shopItemId }
		}
	});

	logger.info('Warehouse template deleted', { programId: params.programId, templateId: template.id, shopItemId });
	return json({ success: true });
};
