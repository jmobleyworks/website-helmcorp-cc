/**
 * MASCOM Advanced Functor Composition Examples
 * Demonstrates real-world patterns for edge compute orchestration
 *
 * These examples show how to combine multiple functors to build
 * production-ready workflows on Cloudflare Workers
 */

import * as F from './functors-advanced.js';

// ============================================================================
// EXAMPLE 1: Secured Gene Retrieval with Caching & Metrics
// ============================================================================

/**
 * Production pattern: Retrieve gene with PSK validation, caching, and metrics
 * Usage: Call this as your main handler
 */
export async function securedGeneLookup(request, env, ctx) {
	// Create context for this request
	const context = F.createContext(env);

	// Composable flow with metrics + PSK validation
	const flow = F.pipe(
		// Step 1: Validate PSK
		async (req) => {
			if (!F.validatePSK(req, env.MASCOM_SECRET)) {
				throw new Error('Unauthorized: Invalid PSK');
			}
			return req;
		},

		// Step 2: Extract domain
		async (req) => {
			const url = new URL(req.url);
			return { domain: url.hostname, req };
		},

		// Step 3: Resolve via routing rules
		async ({ domain, req }) => {
			const target = await F.resolveTarget(domain, env);
			return { domain, target, req };
		},

		// Step 4: Lookup with cache
		async ({ domain, target, req }) => {
			const key = F.cacheKey(target, 'v1');
			// Would use caches API in real worker
			const gene = await context.executeWithMetrics(
				'gene_lookup',
				async () => {
					const stmt = env.HYDRA_DB.prepare(
						'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
					).bind(target);
					return stmt.first();
				}
			);

			if (!gene) throw new Error(`Gene not found for ${target}`);
			return { domain, target, gene, req };
		}
	);

	try {
		const result = await flow(request);
		return new Response(JSON.stringify(result.gene), {
			headers: {
				'Content-Type': 'application/json',
				'X-Gene-Version': result.gene.version,
				'Cache-Control': 'max-age=300',
			},
		});
	} catch (error) {
		await F.errorTracker(error, { domain: 'unknown', path: request.url });
		return new Response(
			JSON.stringify({ error: error.message }),
			{ status: 403, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

// ============================================================================
// EXAMPLE 2: Automatic Version Tracking & Rollback
// ============================================================================

/**
 * Production pattern: Update gene with automatic versioning
 * On each write, increments version and stores old version in history
 */
export async function updateGeneWithVersioning(domain, newGene, env) {
	try {
		// Get current version for history
		const current = await env.HYDRA_DB.prepare(
			'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
		).bind(domain).first();

		const oldVersion = current?.version || 0;

		// Store in version history
		await env.HYDRA_DB.prepare(`
			INSERT INTO versioned_genes (domain, version, gene_blob, timestamp)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		`).bind(domain, oldVersion, current?.gene_blob).run();

		// Increment version
		const newVersion = await F.incrementVersion(domain, env);

		// Update current registry
		await env.HYDRA_DB.prepare(`
			UPDATE site_registry
			SET gene_blob = ?, version = ?, checksum = ?
			WHERE domain = ?
		`).bind(
			JSON.stringify(newGene),
			newVersion,
			hashJson(newGene),
			domain
		).run();

		return {
			domain,
			previousVersion: oldVersion,
			newVersion,
			updated: true,
		};
	} catch (error) {
		throw new Error(`updateGeneWithVersioning failed: ${error.message}`);
	}
}

/**
 * Demo: Rollback to previous version
 */
export async function rollbackGeneDemo(domain, targetVersion, env) {
	const result = await F.rollbackToVersion(domain, targetVersion, env);

	// Get diff to show what changed
	const oldGene = await env.HYDRA_DB.prepare(
		'SELECT gene_blob FROM versioned_genes WHERE domain = ? AND version = ?'
	).bind(domain, targetVersion).first();

	const newGene = await env.HYDRA_DB.prepare(
		'SELECT gene_blob FROM site_registry WHERE domain = ?'
	).bind(domain).first();

	const diff = F.diffVersions(
		typeof oldGene?.gene_blob === 'string' ? JSON.parse(oldGene.gene_blob) : oldGene?.gene_blob,
		typeof newGene?.gene_blob === 'string' ? JSON.parse(newGene.gene_blob) : newGene?.gene_blob
	);

	return { rollback: result, changes: diff };
}

// ============================================================================
// EXAMPLE 3: Route with Fallback & Rate Limiting
// ============================================================================

/**
 * Production pattern: Route request with fallback and rate limiting
 */
export async function routeWithFallback(request, env) {
	const context = F.createContext(env);

	// Rate limiter middleware
	const limiter = F.rateLimiter(100, 60000, env.RATE_LIMIT_KV); // 100 req/min
	const rateCheckResult = await limiter(request);

	if (!rateCheckResult.allowed) {
		return new Response(
			JSON.stringify({ error: 'Rate limit exceeded' }),
			{
				status: 429,
				headers: {
					'Retry-After': rateCheckResult.retryAfter,
					'Content-Type': 'application/json',
				},
			}
		);
	}

	// Primary route: try routing rules
	const primaryRoute = async (req) => {
		const target = await F.hostHeaderRoute(req, env);
		return env.HYDRA_DB.prepare(
			'SELECT gene_blob FROM site_registry WHERE domain = ?'
		).bind(target).first();
	};

	// Fallback route: default domain
	const fallback = async (req) => {
		return env.HYDRA_DB.prepare(
			'SELECT gene_blob FROM site_registry WHERE domain = ?'
		).bind('default.example.com').first();
	};

	const router = F.fallbackRoute(primaryRoute, fallback);

	try {
		const gene = await router(request);
		return new Response(JSON.stringify(gene), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: 'No route available' }),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

// ============================================================================
// EXAMPLE 4: Comprehensive Request Logging & Monitoring
// ============================================================================

/**
 * Production pattern: Full request lifecycle with logging and metrics
 */
export async function monitoredHandler(request, env, ctx) {
	const context = F.createContext(env);

	// Main handler with logging
	const handler = async (req) => {
		// CORS check
		const corsCheck = F.corsMiddleware(['*']);
		const corsResult = corsCheck(req);

		if (req.method === 'OPTIONS') {
			return new Response(null, { headers: corsResult.headers });
		}

		// Route and retrieve
		const url = new URL(req.url);
		const domain = url.hostname;

		const geneRecord = await context.executeWithMetrics(
			'gene_retrieval',
			async () => {
				const stmt = env.HYDRA_DB.prepare(
					'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
				).bind(domain);
				return stmt.first();
			}
		);

		if (!geneRecord) {
			return new Response(
				JSON.stringify({ error: 'Not found' }),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		return new Response(JSON.stringify(geneRecord), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'max-age=300',
				...corsResult.headers,
			},
		});
	};

	// Wrap with logging
	return F.logRequest(request, handler);
}

// ============================================================================
// EXAMPLE 5: Signed Responses for External Validation
// ============================================================================

/**
 * Production pattern: Return signed responses for external validation
 * Useful for downstream systems that need to verify authenticity
 */
export async function signedGeneResponse(domain, env) {
	const geneRecord = await env.HYDRA_DB.prepare(
		'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
	).bind(domain).first();

	if (!geneRecord) {
		throw new Error('Gene not found');
	}

	const geneData = {
		domain,
		gene: geneRecord.gene_blob,
		version: geneRecord.version,
		timestamp: new Date().toISOString(),
	};

	// Sign the response
	const signedResponse = await F.signResponse(geneData, env.MASCOM_SECRET);

	return signedResponse;
}

// ============================================================================
// EXAMPLE 6: Parallel Gene Lookups with Error Handling
// ============================================================================

/**
 * Production pattern: Fetch multiple genes in parallel
 * Useful for multi-domain operations or caching warm-up
 */
export async function parallelGeneLookup(domains, env) {
	const lookupFunctions = domains.map(domain => async () => {
		const stmt = env.HYDRA_DB.prepare(
			'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
		).bind(domain);
		return { domain, data: await stmt.first() };
	});

	const result = await F.parallel(...lookupFunctions)();

	return {
		requested: domains.length,
		successful: result.successful,
		failed: result.failed,
		genes: result.results
			.filter(r => r.status === 'fulfilled')
			.map(r => r.value),
		errors: result.results
			.filter(r => r.status === 'rejected')
			.map(r => r.error),
	};
}

// ============================================================================
// EXAMPLE 7: Retry Logic for Transient Failures
// ============================================================================

/**
 * Production pattern: Retry gene updates with exponential backoff
 * Handles transient D1 or network failures
 */
export async function resilientGeneUpdate(domain, newGene, env) {
	// Wrap update in retry logic
	const retryableUpdate = F.retry(
		async () => {
			return env.HYDRA_DB.prepare(`
				UPDATE site_registry
				SET gene_blob = ?, last_updated = CURRENT_TIMESTAMP
				WHERE domain = ?
			`).bind(JSON.stringify(newGene), domain).run();
		},
		3, // max attempts
		100 // initial backoff ms
	);

	try {
		const result = await retryableUpdate();
		return { success: true, domain, updated: true };
	} catch (error) {
		return { success: false, domain, error: error.message };
	}
}

// ============================================================================
// EXAMPLE 8: Conditional Execution Flows
// ============================================================================

/**
 * Production pattern: Different handling based on domain state
 */
export async function conditionalGeneHandler(request, env) {
	const url = new URL(request.url);
	const domain = url.hostname;

	// Fetch current gene to check status
	const gene = await env.HYDRA_DB.prepare(
		'SELECT gene_blob, status FROM site_registry WHERE domain = ?'
	).bind(domain).first();

	// Conditional flow: Premium domains get caching, others don't
	const handler = F.ifThen(
		() => gene?.status === 'premium',
		// Then: Aggressive caching for premium
		async () => {
			return new Response(JSON.stringify(gene), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'max-age=3600',
				},
			});
		},
		// Else: Light caching for others
		async () => {
			return new Response(JSON.stringify(gene), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'max-age=60',
				},
			});
		}
	);

	return handler(request);
}

// ============================================================================
// EXAMPLE 9: Full Audit Trail with Versioning
// ============================================================================

/**
 * Production pattern: Complete audit trail of all gene modifications
 */
export async function auditedGeneUpdate(domain, changes, metadata, env) {
	try {
		// Get current state
		const current = await env.HYDRA_DB.prepare(
			'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
		).bind(domain).first();

		const oldVersion = current?.version || 0;
		const oldGene = typeof current?.gene_blob === 'string'
			? JSON.parse(current.gene_blob)
			: current?.gene_blob;

		// Merge changes
		const newGene = { ...oldGene, ...changes };

		// Calculate diff
		const changeDiff = F.diffVersions(oldGene, newGene);

		// Store audit entry
		await env.HYDRA_DB.prepare(`
			INSERT INTO gene_audit (domain, old_version, new_version, changes, metadata, timestamp)
			VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		`).bind(
			domain,
			oldVersion,
			oldVersion + 1,
			JSON.stringify(changeDiff),
			JSON.stringify(metadata)
		).run();

		// Update gene with versioning
		const result = await updateGeneWithVersioning(domain, newGene, env);

		// Return comprehensive audit result
		return {
			...result,
			changeSummary: {
				added: Object.keys(changeDiff.added).length,
				removed: Object.keys(changeDiff.removed).length,
				changed: Object.keys(changeDiff.changed).length,
			},
			auditedBy: metadata.user,
			reason: metadata.reason,
		};
	} catch (error) {
		throw new Error(`auditedGeneUpdate failed: ${error.message}`);
	}
}

// ============================================================================
// EXAMPLE 10: Cache Warm-up & Invalidation
// ============================================================================

/**
 * Production pattern: Bulk cache operations
 */
export async function warmupCache(domains, env) {
	const lookups = domains.map(domain => async () => {
		const gene = await env.HYDRA_DB.prepare(
			'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
		).bind(domain).first();

		if (gene && env.CACHE) {
			const key = F.cacheKey(domain, gene.version);
			const response = new Response(JSON.stringify(gene), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'max-age=3600',
				},
			});
			await env.CACHE.put(key, response);
		}

		return { domain, cached: !!gene };
	});

	const result = await F.parallel(...lookups)();

	return {
		total: domains.length,
		cached: result.results.filter(r => r.status === 'fulfilled').length,
		failed: result.results.filter(r => r.status === 'rejected').length,
	};
}

/**
 * Invalidate cache for domain pattern
 */
export async function invalidateDomainCache(domainPattern, env) {
	const pattern = `mascom:${domainPattern}:*`;
	const count = await F.invalidateCache(pattern, env.CACHE_KV);

	return {
		pattern,
		invalidated: count,
		timestamp: new Date().toISOString(),
	};
}

// ============================================================================
// EXAMPLE 11: Complex Multi-Step Orchestration
// ============================================================================

/**
 * Production pattern: Complex workflow combining multiple operations
 * Fetch domain → Validate → Enrich → Cache → Sign → Return
 */
export async function complexOrchestration(domain, env) {
	const context = F.createContext(env);

	// Build composable pipeline
	const pipeline = F.pipe(
		// Step 1: Fetch with metrics
		async (d) => {
			const gene = await context.executeWithMetrics('fetch_gene', async () => {
				const stmt = env.HYDRA_DB.prepare(
					'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
				).bind(d);
				return stmt.first();
			});

			if (!gene) throw new Error('Not found');
			return { domain: d, gene };
		},

		// Step 2: Validate structure
		async ({ domain, gene }) => {
			if (!gene.gene_blob) throw new Error('Invalid gene structure');
			const parsed = typeof gene.gene_blob === 'string'
				? JSON.parse(gene.gene_blob)
				: gene.gene_blob;
			return { domain, gene: parsed, version: gene.version };
		},

		// Step 3: Enrich with metadata
		async ({ domain, gene, version }) => {
			const enriched = {
				...gene,
				_metadata: {
					domain,
					version,
					fetched: new Date().toISOString(),
					enriched: true,
				},
			};
			return enriched;
		},

		// Step 4: Sign
		async (enriched) => {
			return F.signResponse(enriched, env.MASCOM_SECRET);
		}
	);

	return pipeline(domain);
}

// ============================================================================
// EXAMPLE 12: Timeout & Reliability Patterns
// ============================================================================

/**
 * Production pattern: Fetch gene with timeout protection
 */
export async function timeoutProtectedLookup(domain, env, timeoutMs = 5000) {
	const timedLookup = F.timeout(
		async () => {
			const stmt = env.HYDRA_DB.prepare(
				'SELECT gene_blob FROM site_registry WHERE domain = ?'
			).bind(domain);
			return stmt.first();
		},
		timeoutMs
	);

	try {
		const gene = await timedLookup();
		return { success: true, gene, domain };
	} catch (error) {
		if (error.message.includes('Timeout')) {
			return { success: false, error: 'Lookup timeout', domain };
		}
		throw error;
	}
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Simple JSON hash for checksums
 */
function hashJson(obj) {
	const json = JSON.stringify(obj);
	let hash = 0;

	for (let i = 0; i < json.length; i++) {
		const char = json.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}

	return Math.abs(hash).toString(16);
}

export default {
	// Examples
	securedGeneLookup,
	updateGeneWithVersioning,
	rollbackGeneDemo,
	routeWithFallback,
	monitoredHandler,
	signedGeneResponse,
	parallelGeneLookup,
	resilientGeneUpdate,
	conditionalGeneHandler,
	auditedGeneUpdate,
	warmupCache,
	invalidateDomainCache,
	complexOrchestration,
	timeoutProtectedLookup,
};
