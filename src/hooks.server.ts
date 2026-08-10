import { getSessionUser } from '$lib/server/auth.js';
import { createLogger } from '$lib/server/logger.js';
import { ProtocolError, ProtocolTransportError } from '$lib/server/protocol/client.js';
import { HcbApiError } from '$lib/server/integrations/hcb.js';
import type { Handle, HandleServerError } from '@sveltejs/kit';

const log = createLogger('hooks');

let workerStarted = false;

export const handle: Handle = async ({ event, resolve }) => {
	const timer = log.time(`${event.request.method} ${event.url.pathname}`);

	if (!workerStarted) {
		workerStarted = true;
		log.info('starting checks worker');
		const { ensureWorkerStarted } = await import('$lib/server/queue/checks.js');
		ensureWorkerStarted();
		log.info('checks worker started');
	}

	log.trace('incoming request', {
		method: event.request.method,
		path: event.url.pathname
	});

	event.locals.user = await getSessionUser(event.cookies);

	log.trace('session resolved', {
		userId: event.locals.user?.id ?? null,
		hasUser: !!event.locals.user
	});

	const response = await resolve(event);

	timer.end({
		status: response.status,
		userId: event.locals.user?.id ?? null
	});

	return response;
};

// SvelteKit masks unexpected errors from load functions as "Internal Error".
// Master-endpoint failures are our most common (and most actionable) breakage,
// so surface exactly what failed instead of the generic message.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	log.error('unhandled error', error, { path: event.url.pathname, status });

	if (error instanceof ProtocolError) {
		return {
			message: `Communication with the program's master endpoint failed: ${error.displayMessage}`
		};
	}
	if (error instanceof ProtocolTransportError) {
		// Already reads "<ACTION> request to the master endpoint failed: <reason>".
		return { message: error.message };
	}
	if (error instanceof HcbApiError) {
		// e.g. "HCB card grant creation failed: You don't have enough money to make this disbursement."
		return { message: error.displayMessage };
	}

	return { message };
};
