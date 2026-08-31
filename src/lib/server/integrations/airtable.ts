import { env } from '$env/dynamic/private';
import { createLogger } from '../logger.js';

const log = createLogger('airtable');
const BASE_URL = 'https://api.airtable.com/v0';
const AIRTABLE_BASE_ID = 'app3A5kJwYqxMLOgh';
const AIRTABLE_TABLE_ID = 'tblzWWGUYHVH7Zyqf';
const AIRTABLE_VIEW_ID = 'viwR1DSTglVPWzYRS';

export function airtableRecordUrl(recordId: string): string {
	return `https://airtable.com/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${AIRTABLE_VIEW_ID}/${recordId}`;
}

export interface AirtableRecord {
	id: string;
	fields: {
		'Record ID'?: string;
		ID?: string;
		Email?: string;
		'First Name'?: string;
		'Last Name'?: string;
		'Playable URL'?: string;
		'Code URL'?: string;
		'Hours Spent'?: number;
		'Override Hours Spent'?: number;
		'Approved At'?: string;
		Created?: string;
	};
}

export function normalizeUrl(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.split('?')[0]
		.split('#')[0]
		.replace(/\/+$/, '')
		.replace(/\.git$/, '')
		// GitHub links to a branch or file point at the same repo — compare equal.
		.replace(/^(github\.com\/[^/]+\/[^/]+)\/(tree|blob)\/.*$/, '$1');
}

function getSearchVariants(raw: string): string[] {
	const normalized = normalizeUrl(raw);
	if (!normalized) return [];
	const parts = normalized.split('/');
	const variants: string[] = [normalized];
	for (let i = parts.length - 1; i >= 2; i--) {
		variants.push(parts.slice(0, i).join('/'));
	}
	return variants;
}

function buildFilterFormula(variants: string[]): string {
	const conditions: string[] = [];
	for (const v of variants) {
		const escaped = v.replace(/"/g, '\\"');
		for (const field of ['Code URL', 'Playable URL']) {
			conditions.push(`FIND("${escaped}/", LOWER({${field}}))`);
			conditions.push(`RIGHT(LOWER({${field}}), ${v.length}) = "${escaped}"`);
		}
	}
	return `OR(${conditions.join(',')})`;
}

function pathMatches(query: string, stored: string): boolean {
	if (!stored) return false;
	const nq = normalizeUrl(query);
	const ns = normalizeUrl(stored);
	if (!nq || !ns) return false;
	if (nq === ns) return true;
	if (ns.startsWith(nq + '/')) return true;
	if (nq.startsWith(ns + '/')) return true;
	return false;
}

const recordCache = new Map<string, { records: AirtableRecord[]; expiresAt: number }>();
const inflightRequests = new Map<string, Promise<AirtableRecord[]>>();
const CACHE_TTL = 15 * 60 * 1000;

export async function findRecordsByUrl(
	playableUrl: string,
	codeUrl: string
): Promise<AirtableRecord[]> {
	log.debug('findRecordsByUrl called', { playableUrl, codeUrl });
	const cacheKey = `${normalizeUrl(playableUrl)}||${normalizeUrl(codeUrl)}`;
	const cached = recordCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		log.trace('findRecordsByUrl cache hit', { cacheKey, recordCount: cached.records.length });
		return cached.records;
	}

	const inflight = inflightRequests.get(cacheKey);
	if (inflight) {
		log.trace('findRecordsByUrl coalesced with in-flight request', { cacheKey });
		return inflight;
	}

	log.trace('findRecordsByUrl cache miss', { cacheKey });

	const promise = fetchRecordsByUrl(playableUrl, codeUrl, cacheKey);
	inflightRequests.set(cacheKey, promise);
	try {
		return await promise;
	} finally {
		inflightRequests.delete(cacheKey);
	}
}

async function fetchRecordsByUrl(
	playableUrl: string,
	codeUrl: string,
	cacheKey: string
): Promise<AirtableRecord[]> {
	const baseId = env.AIRTABLE_BASE_ID;
	const tableId = env.AIRTABLE_TABLE_ID;
	const pat = env.AIRTABLE_PAT;
	if (!baseId || !tableId || !pat) {
		throw new Error('AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, and AIRTABLE_PAT must be set');
	}

	const allVariants = [
		...getSearchVariants(playableUrl),
		...getSearchVariants(codeUrl)
	];
	const unique = [...new Set(allVariants)];
	if (unique.length === 0) return [];

	const formula = buildFilterFormula(unique);
	log.trace('findRecordsByUrl querying Airtable', { formulaLength: formula.length, variantCount: unique.length });
	const timer = log.time('findRecordsByUrl');
	const records: AirtableRecord[] = [];
	let offset: string | undefined;

	do {
		const url = new URL(`${BASE_URL}/${baseId}/${tableId}`);
		url.searchParams.set('filterByFormula', formula);
		url.searchParams.set('pageSize', '100');
		if (offset) url.searchParams.set('offset', offset);

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${pat}`,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			const body = await response.text();
			log.error('findRecordsByUrl API error', undefined, { status: response.status });
			throw new Error(`Airtable API error ${response.status}: ${body}`);
		}

		const data = await response.json();
		records.push(...(data.records ?? []));
		offset = data.offset;
	} while (offset);

	// Airtable pagination can return the same row on two pages when the table
	// changes between page fetches — dedupe by record id so a duplicate can't
	// double-count previous hours or collide as a render key downstream.
	const dedupedRecords = [...new Map(records.map((r) => [r.id, r])).values()];

	const inputUrls = [playableUrl, codeUrl].filter(Boolean);
	const filtered = dedupedRecords.filter((r) => {
		const recPlayable = r.fields['Playable URL'] ?? '';
		const recCode = r.fields['Code URL'] ?? '';
		return inputUrls.some(
			(input) => pathMatches(input, recPlayable) || pathMatches(input, recCode)
		);
	});

	timer.end({ recordsFound: records.length, filteredCount: filtered.length });
	log.debug('findRecordsByUrl result', { recordsFound: records.length, filteredCount: filtered.length });

	log.trace('findRecordsByUrl cache set', { cacheKey, recordCount: filtered.length });
	recordCache.set(cacheKey, { records: filtered, expiresAt: Date.now() + CACHE_TTL });
	return filtered;
}

export async function getTotalPreviousHours(
	playableUrl: string,
	codeUrl: string
): Promise<number> {
	log.debug('getTotalPreviousHours called', { playableUrl, codeUrl });
	const records = await findRecordsByUrl(playableUrl, codeUrl);

	let total = 0;
	for (const record of records) {
		const override = record.fields['Override Hours Spent'];
		const hours = record.fields['Hours Spent'];

		if (override != null) {
			total += override;
		} else if (hours != null) {
			total += hours;
		}
	}

	log.debug('getTotalPreviousHours result', { totalHours: total, recordCount: records.length });
	return total;
}
