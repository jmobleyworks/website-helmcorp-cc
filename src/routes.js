/**
 * Route Functors for Hydra Edge System
 * Implements pure, composable handlers for all Hydra endpoints
 */

import {
	Either,
	Option,
	asyncPipe,
	asyncMap,
	retry,
	parseJSON,
	stringifyJSON,
	Validator,
	pipe,
	tap,
} from './functors.js';

/**
 * Query D1 database safely
 * @param {Binding} db - D1 database binding
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Either>} Query result
 */
export const queryDB = async (db, sql, params = []) =>
	Either.tryCatch(() => {
		const stmt = db.prepare(sql);
		return params.length > 0
			? stmt.bind(...params).all()
			: stmt.all();
	});

/**
 * Extract hostname from request
 * @param {Request} request - HTTP request
 * @returns {string} Hostname
 */
export const extractHostname = (request) => {
	const url = new URL(request.url);
	return url.hostname;
};

/**
 * Extract pathname from request
 * @param {Request} request - HTTP request
 * @returns {string} Pathname
 */
export const extractPathname = (request) => {
	const url = new URL(request.url);
	return url.pathname;
};

/**
 * Extract query parameters from request
 * @param {Request} request - HTTP request
 * @returns {URLSearchParams} Query params
 */
export const extractQuery = (request) => {
	const url = new URL(request.url);
	return url.searchParams;
};

/**
 * Lookup domain in site_registry
 * @param {Binding} db - D1 database
 * @param {string} domain - Domain to look up
 * @returns {Promise<Either>} Domain record or error
 */
export const lookupDomain = async (db, domain) => {
	const result = await queryDB(
		db,
		`SELECT domain, gene_blob, version, status, checksum, last_updated, metadata
		 FROM site_registry
		 WHERE domain = ? AND status = 'active'`,
		[domain]
	);

	return result.flatMap((queryResult) => {
		const record = queryResult.results[0];
		return record
			? Either.Right(record)
			: Either.Left(`Domain not found: ${domain}`);
	});
};

/**
 * Parse gene blob from database record
 * @param {Object} record - Database record
 * @returns {Either} Parsed gene or error
 */
export const parseGeneBlob = (record) => {
	try {
		const gene = typeof record.gene_blob === 'string'
			? JSON.parse(record.gene_blob)
			: record.gene_blob;
		return Either.Right(gene);
	} catch (e) {
		return Either.Left(`Invalid gene JSON: ${e.message}`);
	}
};

/**
 * Create JSON response
 * @param {*} data - Response body
 * @param {Object} options - Response options
 * @returns {Response} HTTP response
 */
export const jsonResponse = (data, options = {}) => {
	const {
		status = 200,
		headers = {},
		cacheControl = 'max-age=300, stale-while-revalidate=3600',
	} = options;

	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': cacheControl,
			'Access-Control-Allow-Origin': '*',
			...headers,
		},
	});
};

/**
 * Create HTML response
 * @param {string} html - HTML content
 * @param {Object} options - Response options
 * @returns {Response} HTTP response
 */
export const htmlResponse = (html, options = {}) => {
	const {
		status = 200,
		headers = {},
		cacheControl = 'max-age=300, stale-while-revalidate=3600',
	} = options;

	return new Response(html, {
		status,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': cacheControl,
			...headers,
		},
	});
};

/**
 * Error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Response} Error response
 */
export const errorResponse = (message, status = 500) =>
	jsonResponse(
		{
			error: true,
			message,
			timestamp: new Date().toISOString(),
		},
		{ status, cacheControl: 'max-age=60' }
	);

/**
 * Add CORS headers to response
 * @param {Response} response - Original response
 * @param {string} origin - Allowed origin
 * @returns {Response} Response with CORS headers
 */
export const addCORS = (response, origin = '*') => {
	const headers = new Headers(response.headers);
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, X-MASCOM-SECRET');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

/**
 * ROUTE: GET /api/domains
 * Returns array of all active domains
 */
export const getDomains = async (db) => {
	const result = await queryDB(
		db,
		`SELECT domain FROM site_registry WHERE status = 'active' ORDER BY domain ASC`
	);

	return result.fold(
		(error) => errorResponse(`Database error: ${error}`, 500),
		(queryResult) => {
			const domains = queryResult.results.map((row) => row.domain);
			return jsonResponse(domains, {
				cacheControl: 'max-age=3600, stale-while-revalidate=86400',
			});
		}
	);
};

/**
 * ROUTE: GET /api/ventures
 * Returns domains with site_name, description, version, species
 */
export const getVentures = async (db) => {
	const result = await queryDB(
		db,
		`SELECT domain, gene_blob FROM site_registry WHERE status = 'active' ORDER BY domain ASC`
	);

	return result.fold(
		(error) => errorResponse(`Database error: ${error}`, 500),
		(queryResult) => {
			const ventures = queryResult.results.map((row) => {
				const geneResult = parseGeneBlob(row);
				const gene = geneResult.fold(
					() => ({
						site_name: 'Parse Error',
						description: 'Could not parse gene blob',
					}),
					(g) => g
				);

				return {
					domain: row.domain,
					site_name: gene.site_name || 'Unnamed',
					description: gene.description || 'No description',
					version: gene.version || '1.0',
					species: gene.species || 'unknown',
				};
			});

			return jsonResponse(ventures, {
				cacheControl: 'max-age=3600, stale-while-revalidate=86400',
			});
		}
	);
};

/**
 * ROUTE: GET /api/config
 * Returns gene blob for specific domain
 */
export const getConfig = async (db, domain) => {
	const domainResult = await lookupDomain(db, domain);

	return domainResult.flatMap(parseGeneBlob).fold(
		(error) => errorResponse(error, 404),
		(gene) =>
			jsonResponse(gene, {
				headers: {
					'X-Gene-Domain': domain,
				},
			})
	);
};

/**
 * ROUTE: POST /api/register
 * Register or update domain gene
 * Requires X-MASCOM-SECRET header
 */
export const registerDomain = async (db, request, secret) => {
	// Verify secret
	const headerSecret = request.headers.get('X-MASCOM-SECRET');
	if (headerSecret !== secret) {
		return errorResponse('Unauthorized: Invalid secret', 401);
	}

	// Parse request body
	const bodyResult = Either.tryCatch(() =>
		JSON.parse(request.body)
	);

	return bodyResult
		.flatMap((payload) => {
			const { domain, gene_blob, status = 'active' } = payload;

			// Validate payload
			if (!domain) {
				return Either.Left('Missing domain field');
			}

			// Calculate checksum
			const checksumStr = JSON.stringify(gene_blob || {});
			const checksum = hashSHA256(checksumStr);

			// Store in database
			return Either.Right({
				domain,
				gene_blob: typeof gene_blob === 'string'
					? gene_blob
					: JSON.stringify(gene_blob),
				status,
				checksum,
			});
		})
		.fold(
			(error) => errorResponse(`Invalid payload: ${error}`, 400),
			async (data) => {
				const insertResult = await queryDB(
					db,
					`INSERT INTO site_registry (domain, gene_blob, status, checksum, last_updated)
					 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
					 ON CONFLICT(domain) DO UPDATE SET
					   gene_blob = excluded.gene_blob,
					   status = excluded.status,
					   checksum = excluded.checksum,
					   last_updated = CURRENT_TIMESTAMP,
					   version = version + 1`,
					[
						data.domain,
						data.gene_blob,
						data.status,
						data.checksum,
					]
				);

				return insertResult.fold(
					(error) =>
						errorResponse(
							`Database insert failed: ${error}`,
							500
						),
					() =>
						jsonResponse(
							{
								success: true,
								domain: data.domain,
								message: 'Domain registered successfully',
								timestamp: new Date().toISOString(),
							},
							{ status: 201 }
						)
				);
			}
		);
};

/**
 * ROUTE: GET /api/history/:domain
 * Returns version history for domain
 */
export const getHistory = async (db, domain) => {
	const result = await queryDB(
		db,
		`SELECT version, checksum, status, published_at
		 FROM gene_history
		 WHERE domain = ?
		 ORDER BY published_at DESC
		 LIMIT 20`,
		[domain]
	);

	return result.fold(
		(error) => errorResponse(`Database error: ${error}`, 500),
		(queryResult) =>
			jsonResponse(queryResult.results, {
				headers: {
					'X-History-Domain': domain,
				},
			})
	);
};

/**
 * ROUTE: GET /health
 * Health check endpoint
 */
export const getHealth = (env) => {
	return jsonResponse(
		{
			status: 'healthy',
			service: 'mascom-hydra',
			timestamp: new Date().toISOString(),
			version: '1.0',
		},
		{ cacheControl: 'max-age=60' }
	);
};

/**
 * ROUTE: GET /api/stats
 * Return database statistics
 */
export const getStats = async (db) => {
	const domainsResult = await queryDB(
		db,
		`SELECT COUNT(*) as total FROM site_registry WHERE status = 'active'`
	);

	const historyResult = await queryDB(
		db,
		`SELECT COUNT(*) as total FROM gene_history`
	);

	return domainsResult.flatMap((domainRes) =>
		historyResult.map((historyRes) => ({
			active_domains: domainRes.results[0].total,
			total_history_records: historyRes.results[0].total,
		}))
	).fold(
		(error) => errorResponse(`Database error: ${error}`, 500),
		(stats) =>
			jsonResponse(stats, {
				headers: {
					'X-Stats-Timestamp':
						new Date().toISOString(),
				},
			})
	);
};

/**
 * Simple SHA256 hash (placeholder)
 * Note: In production, use crypto.subtle.digest
 */
export const hashSHA256 = (data) => {
	let hash = 0;
	for (let i = 0; i < data.length; i++) {
		const char = data.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return `sha256_${Math.abs(hash).toString(16)}`;
};

/**
 * Route dispatcher: Map pathname to handler
 * @param {string} pathname - Request pathname
 * @param {string} method - HTTP method
 * @returns {string} Route key
 */
export const routeKey = (pathname, method) =>
	`${method} ${pathname.split('?')[0]}`;

/**
 * Build route map
 * @param {Binding} db - D1 database binding
 * @param {Object} env - Worker environment
 * @returns {Map} Route => handler mapping
 */
export const buildRouteMap = (db, env) => {
	const secret = env.MASCOM_SECRET || 'changeme';

	return new Map([
		['GET /api/domains', () => getDomains(db)],
		['GET /api/ventures', () => getVentures(db)],
		['GET /health', () => getHealth(env)],
		['GET /api/stats', () => getStats(db)],
		['POST /api/register', (req) =>
			registerDomain(db, req, secret),
		],
	]);
};

/**
 * Match pathname pattern
 * @param {string} pattern - Route pattern (e.g., "/api/config/:domain")
 * @param {string} pathname - Request pathname
 * @returns {Object|null} Matched params or null
 */
export const matchPattern = (pattern, pathname) => {
	const patternParts = pattern.split('/');
	const pathParts = pathname.split('/');

	if (patternParts.length !== pathParts.length) {
		return null;
	}

	const params = {};
	for (let i = 0; i < patternParts.length; i++) {
		if (patternParts[i].startsWith(':')) {
			const paramName = patternParts[i].slice(1);
			params[paramName] = pathParts[i];
		} else if (patternParts[i] !== pathParts[i]) {
			return null;
		}
	}

	return params;
};

/**
 * Route with pattern matching
 * @param {Request} request - HTTP request
 * @param {Binding} db - D1 database
 * @param {Object} env - Worker environment
 * @returns {Promise<Response>} HTTP response
 */
export const routeRequest = async (request, db, env) => {
	const method = request.method;
	const pathname = extractPathname(request);
	const key = routeKey(pathname, method);
	const routes = buildRouteMap(db, env);

	// Try exact match first
	const handler = routes.get(key);
	if (handler) {
		try {
			return await handler(request);
		} catch (e) {
			return errorResponse(`Route error: ${e.message}`, 500);
		}
	}

	// Try pattern matching
	const patterns = [
		'/api/config/:domain',
		'/api/history/:domain',
	];

	for (const pattern of patterns) {
		const params = matchPattern(pattern, pathname);
		if (params && method === 'GET') {
			try {
				if (pattern === '/api/config/:domain') {
					return await getConfig(db, params.domain);
				}
				if (pattern === '/api/history/:domain') {
					return await getHistory(db, params.domain);
				}
			} catch (e) {
				return errorResponse(
					`Route error: ${e.message}`,
					500
				);
			}
		}
	}

	// 404: No route matched
	return jsonResponse(
		{
			error: true,
			message: 'Route not found',
			pathname,
			method,
		},
		{ status: 404, cacheControl: 'max-age=60' }
	);
};

export default {
	getDomains,
	getVentures,
	getConfig,
	registerDomain,
	getHistory,
	getHealth,
	getStats,
	routeRequest,
	jsonResponse,
	htmlResponse,
	errorResponse,
	addCORS,
	extractHostname,
	extractPathname,
	extractQuery,
	lookupDomain,
	parseGeneBlob,
	queryDB,
	matchPattern,
};
