import { env } from '$env/dynamic/private';
import { db } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { createLogger } from '../logger.js';

const log = createLogger('hcb');
const HCB_BASE = 'https://hcb.hackclub.com';

// HCB's v4 API reports failures as { error, messages: [...] }, e.g.
// { "error": "invalid_operation", "messages": ["You don't have enough money..."] }.
// Keep the human-readable part separate so handleError can show it to the user
// instead of masking it as "Internal Error".
export class HcbApiError extends Error {
	status: number;
	displayMessage: string;

	constructor(action: string, status: number, body: string) {
		let detail = '';
		try {
			const parsed = JSON.parse(body);
			if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
				detail = parsed.messages.join(' ');
			} else if (typeof parsed?.error === 'string') {
				detail = parsed.error;
			}
		} catch {
			// non-JSON body; fall back to the raw text
		}
		if (!detail) detail = body || `HTTP ${status}`;

		super(`${action}: ${status} ${body}`);
		this.name = 'HcbApiError';
		this.status = status;
		this.displayMessage = `${action}: ${detail}`;
	}
}

export interface HcbTokens {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
	scope: string;
}

export interface HcbOrganization {
	id: string;
	name: string;
	slug: string;
	icon: string | null;
	country: string;
	transparent: boolean;
}

export interface CardGrantParams {
	amount_cents: number;
	email: string;
	purpose?: string;
	one_time_use?: boolean;
	pre_authorization_required?: boolean;
	instructions?: string;
	merchant_lock?: string;
	category_lock?: string;
	keyword_lock?: string;
	expiration_at?: string;
}

export interface CardGrantResult {
	id: string;
	object: string;
	amount_cents: number;
	balance_cents: number;
	email: string;
	purpose: string | null;
	status: string;
	one_time_use: boolean;
	pre_authorization_required: boolean;
	card_id: string | null;
	created_at: string;
}

export function getHcbAuthorizationUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: env.HCB_CLIENT_ID!,
		redirect_uri: env.HCB_REDIRECT_URI!,
		response_type: 'code',
		scope: 'card_grants:write',
		state
	});
	return `${HCB_BASE}/api/v4/oauth/authorize?${params}`;
}

export async function exchangeHcbCode(code: string): Promise<HcbTokens> {
	log.info('exchangeHcbCode start');
	const timer = log.time('exchangeHcbCode');
	const res = await fetch(`${HCB_BASE}/api/v4/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'authorization_code',
			client_id: env.HCB_CLIENT_ID,
			client_secret: env.HCB_CLIENT_SECRET,
			redirect_uri: env.HCB_REDIRECT_URI,
			code
		})
	});

	if (!res.ok) {
		const text = await res.text();
		timer.end({ status: res.status });
		log.error('exchangeHcbCode failed', undefined, { status: res.status });
		throw new HcbApiError('HCB token exchange failed', res.status, text);
	}

	timer.end({ status: res.status });
	log.info('exchangeHcbCode success');
	return res.json();
}

export async function refreshHcbToken(refreshToken: string): Promise<HcbTokens> {
	log.info('refreshHcbToken start');
	const timer = log.time('refreshHcbToken');
	const res = await fetch(`${HCB_BASE}/api/v4/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'refresh_token',
			client_id: env.HCB_CLIENT_ID,
			client_secret: env.HCB_CLIENT_SECRET,
			refresh_token: refreshToken
		})
	});

	if (!res.ok) {
		const text = await res.text();
		timer.end({ status: res.status });
		log.error('refreshHcbToken failed', undefined, { status: res.status });
		throw new HcbApiError('HCB token refresh failed', res.status, text);
	}

	timer.end({ status: res.status });
	log.info('refreshHcbToken success');
	return res.json();
}

export async function getHcbUserOrganizations(accessToken: string): Promise<HcbOrganization[]> {
	log.debug('getHcbUserOrganizations called');
	const timer = log.time('getHcbUserOrganizations');
	const res = await fetch(`${HCB_BASE}/api/v4/user/organizations`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!res.ok) {
		timer.end({ status: res.status });
		log.error('getHcbUserOrganizations failed', undefined, { status: res.status });
		throw new Error(`HCB organizations fetch failed: ${res.status}`);
	}

	const orgs: HcbOrganization[] = await res.json();
	timer.end({ orgCount: orgs.length });
	log.debug('getHcbUserOrganizations result', { orgCount: orgs.length });
	return orgs;
}

export async function createCardGrant(
	accessToken: string,
	orgId: string,
	params: CardGrantParams
): Promise<CardGrantResult> {
	log.info('createCardGrant called', { orgId, email: params.email, amountCents: params.amount_cents });
	const timer = log.time('createCardGrant');
	const res = await fetch(`${HCB_BASE}/api/v4/organizations/${encodeURIComponent(orgId)}/card_grants`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(params)
	});

	if (!res.ok) {
		const text = await res.text();
		timer.end({ status: res.status });
		log.error('createCardGrant failed', undefined, { orgId, status: res.status });
		throw new HcbApiError('HCB card grant creation failed', res.status, text);
	}

	const result: CardGrantResult = await res.json();
	timer.end({ grantId: result.id });
	log.info('createCardGrant success', { orgId, grantId: result.id });
	return result;
}

export async function listOrgCardGrants(accessToken: string, orgId: string): Promise<CardGrantResult[]> {
	log.debug('listOrgCardGrants called', { orgId });
	const timer = log.time('listOrgCardGrants');
	const res = await fetch(`${HCB_BASE}/api/v4/organizations/${encodeURIComponent(orgId)}/card_grants?expand=balance_cents`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!res.ok) {
		timer.end({ status: res.status });
		log.error('listOrgCardGrants failed', undefined, { orgId, status: res.status });
		throw new Error(`HCB card grants list failed: ${res.status}`);
	}

	const grants: CardGrantResult[] = await res.json();
	timer.end({ grantCount: grants.length });
	log.debug('listOrgCardGrants result', { orgId, grantCount: grants.length });
	return grants;
}

export async function topUpCardGrant(
	accessToken: string,
	grantId: string,
	amountCents: number
): Promise<CardGrantResult> {
	log.info('topUpCardGrant called', { grantId, amountCents });
	const timer = log.time('topUpCardGrant');
	const res = await fetch(`${HCB_BASE}/api/v4/card_grants/${encodeURIComponent(grantId)}/topup`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ amount_cents: amountCents })
	});

	if (!res.ok) {
		const text = await res.text();
		timer.end({ status: res.status });
		log.error('topUpCardGrant failed', undefined, { grantId, status: res.status });
		throw new HcbApiError('HCB card grant top-up failed', res.status, text);
	}

	const result: CardGrantResult = await res.json();
	timer.end({ grantId: result.id });
	log.info('topUpCardGrant success', { grantId, amountCents });
	return result;
}

export interface HcbTransferResult {
	id: string;
	object: string;
	status: string;
	amount_cents: number;
	from: { id: string; name: string; slug: string };
	to: { id: string; name: string; slug: string };
	sender: { id: string; name: string };
}

export async function createHcbTransfer(
	accessToken: string,
	sourceOrgSlug: string,
	toOrganizationId: string,
	amountCents: number,
	name: string
): Promise<HcbTransferResult> {
	log.info('createHcbTransfer called', { sourceOrgSlug, toOrganizationId, amountCents });
	const timer = log.time('createHcbTransfer');
	const res = await fetch(`${HCB_BASE}/api/v4/organizations/${encodeURIComponent(sourceOrgSlug)}/transfers`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			to_organization_id: toOrganizationId,
			amount_cents: amountCents,
			name
		})
	});

	if (!res.ok) {
		const text = await res.text();
		timer.end({ status: res.status });
		log.error('createHcbTransfer failed', undefined, { sourceOrgSlug, toOrganizationId, status: res.status });
		throw new HcbApiError('HCB transfer failed', res.status, text);
	}

	const result: HcbTransferResult = await res.json();
	timer.end({ transferId: result.id });
	log.info('createHcbTransfer success', { transferId: result.id, sourceOrgSlug, toOrganizationId, amountCents });
	return result;
}

export async function getValidHcbToken(userId: string): Promise<string | null> {
	log.debug('getValidHcbToken called', { userId });
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { hcbAccessToken: true, hcbRefreshToken: true, hcbTokenExpiresAt: true }
	});

	if (!user?.hcbAccessToken || !user.hcbRefreshToken) {
		log.debug('getValidHcbToken no tokens found', { userId });
		return null;
	}

	const accessToken = decrypt(user.hcbAccessToken);
	const refreshToken = decrypt(user.hcbRefreshToken);

	// Return current token if still valid (with 5-minute buffer)
	if (user.hcbTokenExpiresAt && user.hcbTokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
		log.debug('getValidHcbToken token still valid', { userId });
		return accessToken;
	}

	// Refresh the token
	log.debug('getValidHcbToken token expired, refreshing', { userId });
	const tokens = await refreshHcbToken(refreshToken);
	await db.user.update({
		where: { id: userId },
		data: {
			hcbAccessToken: encrypt(tokens.access_token),
			hcbRefreshToken: encrypt(tokens.refresh_token),
			hcbTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000)
		}
	});

	log.debug('getValidHcbToken refreshed successfully', { userId });
	return tokens.access_token;
}
