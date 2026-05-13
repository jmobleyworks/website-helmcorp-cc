/**
 * MASCOM Advanced Functor Library
 * Extends core edge orchestration with caching, versioning, routing, security, monitoring
 *
 * Philosophy: Composable, chainable functors for edge compute operations
 * Works with Cloudflare Workers, D1, Cache API, and KV
 */

// ============================================================================
// CACHING FUNCTORS
// ============================================================================

/**
 * Wraps a functor with Cloudflare Cache API
 * @param {Function} fn - Async function to cache
 * @param {number} ttl - Time-to-live in seconds
 * @param {string} key - Cache key
 * @param {Object} cacheApi - Cloudflare caches API
 * @returns {Function} Cached version of fn
 */
export function edgeCache(fn, ttl, key, cacheApi) {
	return async (...args) => {
		if (!cacheApi) {
			console.warn('edgeCache: cacheApi not provided, skipping cache');
			return fn(...args);
		}

		try {
			// Try cache hit
			const cached = await cacheApi.match(key);
			if (cached) {
				const data = await cached.json();
				data._cached = true;
				data._cacheKey = key;
				data._cacheTtl = ttl;
				return data;
			}
		} catch (e) {
			console.warn('edgeCache: cache hit failed', e);
		}

		// Cache miss: execute function
		const result = await fn(...args);

		// Store in cache
		try {
			const response = new Response(JSON.stringify(result), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': `max-age=${ttl}`,
				},
			});
			await cacheApi.put(key, response);
		} catch (e) {
			console.warn('edgeCache: cache write failed', e);
		}

		result._cached = false;
		result._cacheKey = key;
		result._cacheTtl = ttl;
		return result;
	};
}

/**
 * In-memory result caching for repeated calls
 * @param {Function} fn - Function to memoize
 * @param {number} ttl - Seconds to keep memoized result
 * @returns {Function} Memoized version
 */
export function memoize(fn, ttl = 300) {
	const memo = new Map();
	const expirations = new Map();

	return async (...args) => {
		const key = JSON.stringify(args);

		// Check if memoized and not expired
		if (memo.has(key)) {
			const exp = expirations.get(key);
			if (exp > Date.now()) {
				return memo.get(key);
			}
			memo.delete(key);
			expirations.delete(key);
		}

		// Execute and cache
		const result = await fn(...args);
		memo.set(key, result);
		expirations.set(key, Date.now() + ttl * 1000);

		return result;
	};
}

/**
 * Generate versioned cache key
 * @param {string} domain - Domain identifier
 * @param {number|string} version - Version number
 * @returns {string} Cache key
 */
export function cacheKey(domain, version) {
	return `mascom:${domain}:v${version}:${Date.now()}`;
}

/**
 * Pattern-based cache invalidation
 * Requires external coordination (KV or metadata store)
 * @param {string} pattern - Pattern to match (e.g., 'mascom:example.com:*')
 * @param {Object} kv - Cloudflare KV namespace
 * @returns {Promise<number>} Number of keys invalidated
 */
export async function invalidateCache(pattern, kv) {
	if (!kv) {
		console.warn('invalidateCache: KV not provided');
		return 0;
	}

	try {
		// List all keys matching pattern
		const list = await kv.list({ prefix: pattern.replace('*', '') });
		const keys = list.keys.map(k => k.name);

		// Delete in batches
		let count = 0;
		for (let i = 0; i < keys.length; i += 1000) {
			const batch = keys.slice(i, i + 1000);
			await Promise.all(batch.map(k => kv.delete(k)));
			count += batch.length;
		}

		return count;
	} catch (error) {
		console.error('invalidateCache failed:', error);
		return 0;
	}
}

// ============================================================================
// VERSIONING FUNCTORS
// ============================================================================

/**
 * Execute query with version awareness
 * Returns result with version metadata
 * @param {string} sql - SQL query
 * @param {string} domain - Domain identifier
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object>} Query result with version
 */
export async function versionedQuery(sql, domain, db) {
	if (!db) throw new Error('versionedQuery: db binding required');

	try {
		const result = await db.prepare(sql).all();
		const versionStmt = await db.prepare(`
			SELECT version FROM site_registry WHERE domain = ?
		`).bind(domain).first();

		return {
			data: result.results,
			domain,
			version: versionStmt?.version || 0,
			timestamp: new Date().toISOString(),
			_query: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
		};
	} catch (error) {
		throw new Error(`versionedQuery failed: ${error.message}`);
	}
}

/**
 * Auto-increment domain version on write
 * @param {string} domain - Domain identifier
 * @param {Object} env - Environment (db binding)
 * @returns {Promise<number>} New version number
 */
export async function incrementVersion(domain, env) {
	if (!env.HYDRA_DB) throw new Error('incrementVersion: HYDRA_DB required');

	try {
		const stmt = env.HYDRA_DB.prepare(`
			UPDATE site_registry
			SET version = version + 1, last_updated = CURRENT_TIMESTAMP
			WHERE domain = ?
			RETURNING version
		`).bind(domain);

		const result = await stmt.first();
		return result?.version || 0;
	} catch (error) {
		throw new Error(`incrementVersion failed: ${error.message}`);
	}
}

/**
 * Rollback domain to previous version
 * @param {string} domain - Domain identifier
 * @param {number} targetVersion - Version to restore
 * @param {Object} env - Environment with db and KV
 * @returns {Promise<Object>} Restored gene_blob
 */
export async function rollbackToVersion(domain, targetVersion, env) {
	if (!env.HYDRA_DB) throw new Error('rollbackToVersion: HYDRA_DB required');

	try {
		// Fetch from version history (assuming versioned_genes table)
		const versionStmt = env.HYDRA_DB.prepare(`
			SELECT gene_blob FROM versioned_genes
			WHERE domain = ? AND version = ?
			ORDER BY timestamp DESC
			LIMIT 1
		`).bind(domain, targetVersion);

		const versionRecord = await versionStmt.first();
		if (!versionRecord) {
			throw new Error(`Version ${targetVersion} not found for domain ${domain}`);
		}

		// Restore to current registry
		const restoreStmt = env.HYDRA_DB.prepare(`
			UPDATE site_registry
			SET gene_blob = ?, version = ?, last_updated = CURRENT_TIMESTAMP
			WHERE domain = ?
		`).bind(versionRecord.gene_blob, targetVersion, domain);

		await restoreStmt.run();

		return {
			domain,
			version: targetVersion,
			restored: true,
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		throw new Error(`rollbackToVersion failed: ${error.message}`);
	}
}

/**
 * Fetch version audit trail
 * @param {string} domain - Domain identifier
 * @param {number} limit - Number of versions to return
 * @param {Object} env - Environment with db
 * @returns {Promise<Array>} Version history
 */
export async function getVersionHistory(domain, limit = 50, env) {
	if (!env.HYDRA_DB) throw new Error('getVersionHistory: HYDRA_DB required');

	try {
		const stmt = env.HYDRA_DB.prepare(`
			SELECT version, timestamp, checksum
			FROM versioned_genes
			WHERE domain = ?
			ORDER BY timestamp DESC
			LIMIT ?
		`).bind(domain, limit);

		const results = await stmt.all();
		return {
			domain,
			history: results.results || [],
			count: results.results?.length || 0,
		};
	} catch (error) {
		throw new Error(`getVersionHistory failed: ${error.message}`);
	}
}

/**
 * JSON diff between two versions
 * @param {Object} v1 - First version object
 * @param {Object} v2 - Second version object
 * @returns {Object} Diff object with added/removed/changed keys
 */
export function diffVersions(v1, v2) {
	const diff = {
		added: {},
		removed: {},
		changed: {},
	};

	// Keys in v2 but not v1 (added)
	for (const key in v2) {
		if (!(key in v1)) {
			diff.added[key] = v2[key];
		}
	}

	// Keys in v1 but not v2 (removed)
	for (const key in v1) {
		if (!(key in v2)) {
			diff.removed[key] = v1[key];
		}
	}

	// Common keys with different values (changed)
	for (const key in v1) {
		if (key in v2 && JSON.stringify(v1[key]) !== JSON.stringify(v2[key])) {
			diff.changed[key] = {
				from: v1[key],
				to: v2[key],
			};
		}
	}

	return diff;
}

// ============================================================================
// ROUTING FUNCTORS
// ============================================================================

/**
 * Look up routing rule for domain
 * @param {string} domain - Domain identifier
 * @param {Object} env - Environment with db
 * @returns {Promise<Object>} Routing rule or null
 */
export async function matchRoutingRule(domain, env) {
	if (!env.HYDRA_DB) throw new Error('matchRoutingRule: HYDRA_DB required');

	try {
		const stmt = env.HYDRA_DB.prepare(`
			SELECT id, pattern, domain_target, priority, enabled, created_at
			FROM routing_rules
			WHERE (pattern = ? OR pattern = ?)
			AND enabled = 1
			ORDER BY priority DESC
			LIMIT 1
		`).bind(domain, domain.split('.')[0]); // Try exact match and subdomain

		const result = await stmt.first();
		return result || null;
	} catch (error) {
		console.error('matchRoutingRule failed:', error);
		return null;
	}
}

/**
 * Resolve domain to target via routing rules or direct lookup
 * @param {string} domain - Domain identifier
 * @param {Object} env - Environment with db
 * @returns {Promise<string>} Target domain
 */
export async function resolveTarget(domain, env) {
	if (!env.HYDRA_DB) throw new Error('resolveTarget: HYDRA_DB required');

	try {
		// Check routing rules first
		const rule = await matchRoutingRule(domain, env);
		if (rule) {
			return rule.domain_target;
		}

		// Fall back to direct lookup
		const stmt = env.HYDRA_DB.prepare(`
			SELECT domain FROM site_registry WHERE domain = ? LIMIT 1
		`).bind(domain);

		const result = await stmt.first();
		return result?.domain || domain;
	} catch (error) {
		console.error('resolveTarget failed:', error);
		return domain;
	}
}

/**
 * Try primary route, fallback on failure
 * @param {Function} primaryRoute - Primary routing function
 * @param {Function} fallbackRoute - Fallback routing function
 * @returns {Function} Combined routing function
 */
export function fallbackRoute(primaryRoute, fallbackRoute) {
	return async (...args) => {
		try {
			const result = await primaryRoute(...args);
			if (result && result.status !== 404) {
				return result;
			}
		} catch (error) {
			console.warn('Primary route failed, trying fallback:', error.message);
		}

		try {
			return await fallbackRoute(...args);
		} catch (error) {
			throw new Error(`All routing options failed: ${error.message}`);
		}
	};
}

/**
 * Route by Host header with routing rules fallback
 * @param {Request} req - Fetch API request
 * @param {Object} env - Environment with db
 * @returns {Promise<string>} Target domain
 */
export async function hostHeaderRoute(req, env) {
	const url = new URL(req.url);
	const host = url.hostname || req.headers.get('Host');

	if (!host) {
		throw new Error('hostHeaderRoute: No Host header found');
	}

	return resolveTarget(host, env);
}

// ============================================================================
// SECURITY FUNCTORS
// ============================================================================

/**
 * Validate pre-shared key from request header
 * @param {Request} req - Fetch API request
 * @param {string} expectedSecret - Expected PSK value
 * @returns {boolean} True if valid
 */
export function validatePSK(req, expectedSecret) {
	const secret = req.headers.get('X-MASCOM-SECRET');
	if (!secret) {
		return false;
	}

	// Constant-time comparison to prevent timing attacks
	return timingSafeEqual(secret, expectedSecret);
}

/**
 * Constant-time string comparison
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if equal
 */
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}

	return result === 0;
}

/**
 * Rate limiter by client IP
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @param {Object} kv - Cloudflare KV namespace
 * @returns {Function} Middleware function
 */
export function rateLimiter(maxRequests, windowMs, kv) {
	return async (req) => {
		if (!kv) {
			console.warn('rateLimiter: KV not provided, skipping');
			return { allowed: true };
		}

		const ip = req.headers.get('cf-connecting-ip') || 'unknown';
		const key = `ratelimit:${ip}:${Math.floor(Date.now() / windowMs)}`;

		try {
			const current = parseInt(await kv.get(key)) || 0;

			if (current >= maxRequests) {
				return {
					allowed: false,
					remaining: 0,
					retryAfter: Math.ceil(windowMs / 1000),
				};
			}

			await kv.put(key, String(current + 1), {
				expirationTtl: Math.ceil(windowMs / 1000),
			});

			return {
				allowed: true,
				remaining: maxRequests - current - 1,
			};
		} catch (error) {
			console.error('rateLimiter failed:', error);
			return { allowed: true }; // Fail open
		}
	};
}

/**
 * CORS validation middleware
 * @param {string|Array<string>} allowedOrigins - Allowed origins
 * @returns {Function} Middleware function
 */
export function corsMiddleware(allowedOrigins) {
	const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];

	return (req) => {
		const origin = req.headers.get('Origin');
		const allowed = origins.includes('*') || origins.includes(origin);

		return {
			headers: {
				'Access-Control-Allow-Origin': allowed ? origin : '',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, X-MASCOM-SECRET',
				'Access-Control-Max-Age': '86400',
			},
			allowed,
		};
	};
}

/**
 * Sign response with HMAC signature
 * @param {Object} json - JSON response object
 * @param {string} secret - Signing secret
 * @returns {Promise<Object>} Response with signature
 */
export async function signResponse(json, secret) {
	const payload = JSON.stringify(json);
	const encoder = new TextEncoder();
	const data = encoder.encode(payload);
	const keyData = encoder.encode(secret);

	try {
		const key = await crypto.subtle.importKey(
			'raw',
			keyData,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, data);
		const signatureHex = Array.from(new Uint8Array(signature))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');

		return {
			data: json,
			signature: signatureHex,
			algorithm: 'HMAC-SHA256',
		};
	} catch (error) {
		throw new Error(`signResponse failed: ${error.message}`);
	}
}

// ============================================================================
// MONITORING FUNCTORS
// ============================================================================

/**
 * Log all requests with timing
 * @param {Request} req - Fetch API request
 * @param {Function} handler - Handler function
 * @param {Object} logger - Logger object (optional)
 * @returns {Promise<Response>} Response with timing info
 */
export async function logRequest(req, handler, logger = console) {
	const start = Date.now();
	const method = req.method;
	const url = new URL(req.url);
	const path = url.pathname;

	try {
		const response = await handler(req);
		const duration = Date.now() - start;

		logger.log({
			timestamp: new Date().toISOString(),
			method,
			path,
			status: response.status,
			duration,
			ip: req.headers.get('cf-connecting-ip'),
		});

		return response;
	} catch (error) {
		const duration = Date.now() - start;
		logger.error({
			timestamp: new Date().toISOString(),
			method,
			path,
			error: error.message,
			duration,
		});

		throw error;
	}
}

/**
 * Collect execution metrics for a function
 * @param {string} name - Metric name
 * @param {Function} fn - Function to measure
 * @param {Object} metricsStore - Storage for metrics
 * @returns {Function} Wrapped function
 */
export function metricsCollector(name, fn, metricsStore = {}) {
	if (!metricsStore[name]) {
		metricsStore[name] = {
			calls: 0,
			successes: 0,
			failures: 0,
			totalDuration: 0,
			minDuration: Infinity,
			maxDuration: 0,
		};
	}

	return async (...args) => {
		const start = Date.now();
		const metric = metricsStore[name];
		metric.calls++;

		try {
			const result = await fn(...args);
			metric.successes++;
			return result;
		} catch (error) {
			metric.failures++;
			throw error;
		} finally {
			const duration = Date.now() - start;
			metric.totalDuration += duration;
			metric.minDuration = Math.min(metric.minDuration, duration);
			metric.maxDuration = Math.max(metric.maxDuration, duration);
		}
	};
}

/**
 * Track and report errors
 * @param {Error} error - Error object
 * @param {Object} context - Error context
 * @param {Object} reporter - Error reporter (optional)
 * @returns {Promise<void>}
 */
export async function errorTracker(error, context, reporter = console) {
	const errorData = {
		timestamp: new Date().toISOString(),
		message: error.message,
		stack: error.stack,
		context,
	};

	reporter.error(errorData);

	// Could send to external service here
	// await sendToErrorTracking(errorData);
}

/**
 * Performance timing decorator
 * @param {string} name - Operation name
 * @returns {Function} Decorator function
 */
export function perfTiming(name) {
	return async (fn) => {
		const start = performance.now();
		const result = await fn();
		const duration = performance.now() - start;

		return {
			result,
			timing: {
				name,
				duration,
				timestamp: new Date().toISOString(),
			},
		};
	};
}

// ============================================================================
// COMPOSITION HELPERS
// ============================================================================

/**
 * Conditional branching
 * @param {Function|boolean} condition - Condition function or boolean
 * @param {Function} thenFn - Function to execute if true
 * @param {Function} elseFn - Function to execute if false
 * @returns {Function} Composed function
 */
export function ifThen(condition, thenFn, elseFn) {
	return async (...args) => {
		let condResult;

		if (typeof condition === 'function') {
			condResult = await condition(...args);
		} else {
			condResult = condition;
		}

		if (condResult) {
			return thenFn(...args);
		} else if (elseFn) {
			return elseFn(...args);
		}

		return null;
	};
}

/**
 * Retry with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} backoffMs - Initial backoff in milliseconds
 * @returns {Function} Wrapped function
 */
export function retry(fn, maxAttempts = 3, backoffMs = 100) {
	return async (...args) => {
		let lastError;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await fn(...args);
			} catch (error) {
				lastError = error;

				if (attempt < maxAttempts) {
					const delay = backoffMs * Math.pow(2, attempt - 1);
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		throw new Error(
			`Retry failed after ${maxAttempts} attempts: ${lastError.message}`
		);
	};
}

/**
 * Timeout wrapper
 * @param {Function} fn - Function to timeout
 * @param {number} ms - Timeout in milliseconds
 * @returns {Function} Wrapped function
 */
export function timeout(fn, ms) {
	return async (...args) => {
		return Promise.race([
			fn(...args),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
			),
		]);
	};
}

/**
 * Run functors in parallel and collect results
 * @param {Array<Function>} fns - Functions to run in parallel
 * @returns {Function} Composed function
 */
export function parallel(...fns) {
	return async (...args) => {
		const promises = fns.map(fn => fn(...args));
		const results = await Promise.allSettled(promises);

		return {
			results: results.map((r, i) => ({
				index: i,
				status: r.status,
				value: r.status === 'fulfilled' ? r.value : null,
				error: r.status === 'rejected' ? r.reason?.message : null,
			})),
			successful: results.filter(r => r.status === 'fulfilled').length,
			failed: results.filter(r => r.status === 'rejected').length,
		};
	};
}

/**
 * Pipe composition (run functions sequentially, passing output to next)
 * @param {Array<Function>} fns - Functions to pipe
 * @returns {Function} Composed function
 */
export function pipe(...fns) {
	return async (initialInput) => {
		let result = initialInput;

		for (const fn of fns) {
			result = await fn(result);
		}

		return result;
	};
}

/**
 * Compose functions (reverse pipe order, right-to-left)
 * @param {Array<Function>} fns - Functions to compose
 * @returns {Function} Composed function
 */
export function compose(...fns) {
	return pipe(...fns.reverse());
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Create a functor context with bound environment
 * Useful for closure-based state management
 * @param {Object} env - Environment bindings
 * @returns {Object} Context object with helper methods
 */
export function createContext(env) {
	const metrics = {};
	const cache = new Map();

	return {
		env,
		metrics,
		cache,
		async executeWithMetrics(name, fn, ...args) {
			const wrapped = metricsCollector(name, fn, this.metrics);
			return wrapped(...args);
		},
		getMetrics(name) {
			return this.metrics[name] || null;
		},
		async executeWithCache(key, fn, ttl, ...args) {
			if (this.cache.has(key)) {
				const entry = this.cache.get(key);
				if (entry.expiry > Date.now()) {
					return entry.value;
				}
				this.cache.delete(key);
			}

			const result = await fn(...args);
			this.cache.set(key, {
				value: result,
				expiry: Date.now() + (ttl * 1000),
			});

			return result;
		},
	};
}

export default {
	// Caching
	edgeCache,
	memoize,
	cacheKey,
	invalidateCache,

	// Versioning
	versionedQuery,
	incrementVersion,
	rollbackToVersion,
	getVersionHistory,
	diffVersions,

	// Routing
	matchRoutingRule,
	resolveTarget,
	fallbackRoute,
	hostHeaderRoute,

	// Security
	validatePSK,
	rateLimiter,
	corsMiddleware,
	signResponse,

	// Monitoring
	logRequest,
	metricsCollector,
	errorTracker,
	perfTiming,

	// Composition
	ifThen,
	retry,
	timeout,
	parallel,
	pipe,
	compose,

	// Utilities
	createContext,
};
