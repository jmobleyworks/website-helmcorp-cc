/**
 * Hydra Functional Edge Orchestrator
 * Minimal worker using pure functors and route composition
 *
 * Philosophy:
 * - Pure functions for testability and composability
 * - Route composition using functors
 * - Error handling via Either/Option monads
 * - No side effects outside fetch handler
 */

import {
	pipe,
	tap,
	Either,
	asyncPipe,
} from './functors.js';

import {
	routeRequest,
	extractHostname,
	errorResponse,
	addCORS,
} from './routes.js';

/**
 * Log request (side effect)
 */
const logRequest = (request) => {
	const method = request.method;
	const url = new URL(request.url);
	const timestamp = new Date().toISOString();
	console.log(
		`[${timestamp}] ${method} ${url.hostname}${url.pathname}`
	);
	return request;
};

/**
 * Validate request
 */
const validateRequest = (request) => {
	if (!request) {
		return Either.Left('Request is null');
	}
	if (!request.headers) {
		return Either.Left('Request missing headers');
	}
	return Either.Right(request);
};

/**
 * Check if environment is properly configured
 */
const validateEnvironment = (env) => {
	if (!env.HYDRA_DB) {
		return Either.Left('HYDRA_DB binding not configured');
	}
	return Either.Right(env);
};

/**
 * Add request timing header
 */
const addTimingHeader = (startTime) => (response) => {
	const elapsed = Date.now() - startTime;
	const headers = new Headers(response.headers);
	headers.set('X-Response-Time-Ms', elapsed.toString());
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

/**
 * Apply cache headers based on route
 */
const applyCacheHeaders = (response, pathname) => {
	const headers = new Headers(response.headers);

	// Home and config routes: longer cache
	if (
		pathname === '/' ||
		pathname === '/index.html' ||
		pathname.startsWith('/api/config')
	) {
		headers.set(
			'Cache-Control',
			'max-age=300, stale-while-revalidate=3600'
		);
	}

	// API routes: shorter cache
	if (pathname.startsWith('/api/')) {
		headers.set(
			'Cache-Control',
			'max-age=60, stale-while-revalidate=300'
		);
	}

	// Health and stats: no cache
	if (
		pathname === '/health' ||
		pathname === '/api/stats'
	) {
		headers.set('Cache-Control', 'no-cache, max-age=0');
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

/**
 * Handle OPTIONS (CORS preflight)
 */
const handleOptions = (request) => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods':
				'GET, POST, OPTIONS, HEAD',
			'Access-Control-Allow-Headers':
				'Content-Type, X-MASCOM-SECRET',
			'Access-Control-Max-Age': '86400',
		},
	});
};

/**
 * Main fetch handler
 * Composes all middleware and route handlers
 */
export default {
	async fetch(request, env, ctx) {
		const startTime = Date.now();

		try {
			// Validate request and environment
			const reqValidation = validateRequest(request);
			const envValidation = validateEnvironment(env);

			if (!reqValidation.isRight) {
				return errorResponse(
					reqValidation.error,
					400
				);
			}

			if (!envValidation.isRight) {
				return errorResponse(
					`Configuration error: ${envValidation.error}`,
					503
				);
			}

			// Handle OPTIONS preflight
			if (request.method === 'OPTIONS') {
				return handleOptions(request);
			}

			// Log request
			const loggedRequest = pipe(
				tap(logRequest)
			)(request);

			// Extract pathname for cache routing
			const url = new URL(request.url);
			const pathname = url.pathname;

			// Route and handle request
			let response = await routeRequest(
				loggedRequest,
				env.HYDRA_DB,
				env
			);

			// Apply response middleware
			response = addTimingHeader(startTime)(response);
			response = applyCacheHeaders(response, pathname);
			response = addCORS(response);

			return response;
		} catch (error) {
			console.error('Unhandled error:', error);
			return errorResponse(
				`Internal server error: ${error.message}`,
				500
			);
		}
	},
};
