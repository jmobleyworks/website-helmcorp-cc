/**
 * MASCOM Integrated Hydra — Edge Orchestrator (D1-only)
 *
 * Philosophy: Single source of truth in D1
 * - D1 = Nervous System (metadata + gene payloads combined)
 * - No R2 dependency (eliminates eventual consistency issues)
 * - Atomic transactions ensure gene versions stay in sync
 *
 * Flow:
 * 1. Extract Host header from request
 * 2. Query D1 site_registry for domain → gene_blob (JSON stored directly)
 * 3. Inject gene_blob into index.html as window.MASCOM_GENES
 * 4. Serve with proper cache headers
 */

export default {
	async fetch(request, env, ctx) {
		try {
			// Extract host from request
			const url = new URL(request.url);
			const host = url.hostname;

			// Attempt routing rule lookup first (for subdomains, patterns)
			let domainTarget = await checkRoutingRules(env, host);

			// Fallback to direct domain lookup
			if (!domainTarget) {
				domainTarget = host;
			}

			// Query D1 for gene (metadata + payload combined)
			const geneRecord = await lookupGeneRecord(env, domainTarget);

			if (!geneRecord) {
				// Domain not found in registry
				return new Response(
					JSON.stringify({
						error: 'Domain not registered',
						domain: domainTarget,
						timestamp: new Date().toISOString(),
					}),
					{
						status: 404,
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'max-age=60, stale-while-revalidate=3600',
						},
					}
				);
			}

			// Gene blob is already in D1, parse it
			let genePayload;
			try {
				genePayload = typeof geneRecord.gene_blob === 'string'
					? JSON.parse(geneRecord.gene_blob)
					: geneRecord.gene_blob;
			} catch (e) {
				return new Response(
					JSON.stringify({
						error: 'Gene JSON parse failed',
						domain: domainTarget,
						message: e.message,
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}

			// Route based on path
			const pathname = url.pathname;

			// /api/config returns gene as JSON
			if (pathname === '/api/config') {
				return new Response(JSON.stringify(genePayload), {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control': 'max-age=300, stale-while-revalidate=3600',
						'X-Gene-Version': geneRecord.version.toString(),
						'X-Gene-Updated': geneRecord.last_updated,
						'X-Gene-Checksum': geneRecord.checksum || '',
					},
				});
			}

			// Root or index.html serves Skeleton King template with injected gene
			if (pathname === '/' || pathname === '/index.html') {
				const html = await serveSkeletonKingWithGene(genePayload);
				return new Response(html, {
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						'Cache-Control': 'max-age=300, stale-while-revalidate=3600',
						'X-Gene-Version': geneRecord.version.toString(),
					},
				});
			}

			// 404: Asset or path not found
			return new Response(
				JSON.stringify({
					error: 'Not found',
					path: pathname,
					domain: domainTarget,
					available: ['/', '/index.html', '/api/config'],
				}),
				{
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: 'Internal server error',
					message: error.message,
					timestamp: new Date().toISOString(),
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	},

	/**
	 * Optional: Handle /hydra/registry-update POST endpoint
	 * Protected by X-MASCOM-SECRET header PSK
	 */
	async updateRegistry(request, env, ctx) {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		// Verify PSK
		const secret = request.headers.get('X-MASCOM-SECRET');
		if (secret !== env.MASCOM_SECRET) {
			return new Response(
				JSON.stringify({ error: 'Unauthorized' }),
				{ status: 403, headers: { 'Content-Type': 'application/json' } }
			);
		}

		try {
			const payload = await request.json();
			const { domain, gene_object_key, status } = payload;

			if (!domain || !gene_object_key) {
				return new Response(
					JSON.stringify({ error: 'Missing domain or gene_object_key' }),
					{ status: 400, headers: { 'Content-Type': 'application/json' } }
				);
			}

			// Insert or update in D1
			const result = await env.HYDRA_DB.prepare(`
				INSERT INTO site_registry (domain, gene_object_key, status, version)
				VALUES (?, ?, ?, 1)
				ON CONFLICT(domain) DO UPDATE SET
					gene_object_key = excluded.gene_object_key,
					status = excluded.status,
					version = version + 1,
					last_updated = CURRENT_TIMESTAMP
			`).bind(domain, gene_object_key, status || 'active').run();

			return new Response(
				JSON.stringify({
					success: true,
					domain,
					gene_object_key,
					status: status || 'active',
					timestamp: new Date().toISOString(),
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					error: 'Update failed',
					message: error.message,
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	},
};

/**
 * Query D1 for gene record by domain
 * Returns: { domain, gene_blob (JSON), status, version, last_updated, checksum }
 */
async function lookupGeneRecord(env, domain) {
	try {
		const stmt = env.HYDRA_DB.prepare(`
			SELECT domain, gene_blob, status, version, last_updated, checksum
			FROM site_registry
			WHERE domain = ? AND status = 'active'
		`).bind(domain);

		const result = await stmt.first();
		return result || null;
	} catch (error) {
		console.error('D1 lookup failed:', error);
		return null;
	}
}

/**
 * Check routing rules for pattern-based matching
 */
async function checkRoutingRules(env, host) {
	try {
		// For now, simple implementation. Can extend to regex matching.
		const stmt = env.HYDRA_DB.prepare(`
			SELECT domain_target
			FROM routing_rules
			WHERE pattern = ? AND enabled = 1
			ORDER BY priority DESC
			LIMIT 1
		`).bind(host);

		const result = await stmt.first();
		return result?.domain_target || null;
	} catch (error) {
		console.error('Routing rule lookup failed:', error);
		return null;
	}
}

/**
 * Inject gene into Skeleton King HTML template
 */
async function serveSkeletonKingWithGene(genePayload) {
	const geneJSON = JSON.stringify(genePayload);

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${genePayload.site_name || 'MASCOM Site'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1a3e 100%);
            color: #00ff88;
            line-height: 1.6;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { border-bottom: 2px solid #00ff88; padding-bottom: 20px; margin-bottom: 30px; }
        h1 { color: #00ff88; font-size: 2.5em; text-shadow: 0 0 10px #00ff88; }
        h2 { color: #ffaa00; margin-top: 30px; border-left: 3px solid #ffaa00; padding-left: 10px; }
        .status-badge { display: inline-block; padding: 5px 10px; border-radius: 3px; font-weight: bold; }
        .status-operational { background: #00ff88; color: #0a0e27; }
        .endpoints-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .endpoint-card { border: 1px solid #00ff88; padding: 20px; background: rgba(0, 255, 136, 0.05); border-radius: 5px; }
        .endpoint-card h4 { color: #00ff88; margin-bottom: 10px; }
        .endpoint-path { background: rgba(0, 0, 0, 0.5); padding: 10px; border-radius: 3px; font-size: 0.85em; color: #00ff88; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #00ff88; }
        th { background: rgba(0, 255, 136, 0.1); color: #00ff88; font-weight: bold; }
        tr:hover { background: rgba(0, 255, 136, 0.05); }
        footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #00ff88; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>⚡ ${genePayload.site_name || 'MASCOM Edge Node'}</h1>
            <p>${genePayload.description || 'Powered by Cloudflare Hydra'}</p>
        </header>

        <section>
            <h2>System Status</h2>
            <table>
                <tr><td><strong>Domain</strong></td><td>${genePayload.domain}</td></tr>
                <tr><td><strong>Status</strong></td><td><span class="status-badge status-operational">${genePayload.status?.health || 'OPERATIONAL'}</span></td></tr>
                <tr><td><strong>Papers Generated</strong></td><td>${genePayload.status?.papers_generated || 0}</td></tr>
                <tr><td><strong>Amplification Factor</strong></td><td>${genePayload.status?.amplification_factor || 1.0}x</td></tr>
            </table>
        </section>

        <section>
            <h2>API Endpoints</h2>
            <div class="endpoints-grid">
                ${
					(genePayload.services || [])
						.map(
							(svc) => `
                    <div class="endpoint-card">
                        <h4>${svc.name}</h4>
                        <p>${svc.description}</p>
                        <div class="endpoint-path">${svc.path}</div>
                    </div>
                `
						)
						.join('')
				}
            </div>
        </section>

        <section>
            <h2>Architecture</h2>
            <p><strong>Type:</strong> ${genePayload.architecture?.type || 'Standard'}</p>
            ${
				genePayload.architecture?.loops
					? `
                <h3>Operational Loops</h3>
                <table>
                    <thead><tr><th>Loop</th><th>Cycle (min)</th><th>Status</th></tr></thead>
                    <tbody>
                        ${genePayload.architecture.loops
							.map(
								(loop) => `
                            <tr>
                                <td>${loop.name}</td>
                                <td>${loop.cycle_minutes}</td>
                                <td><span class="status-badge ${loop.status === 'operational' ? 'status-operational' : ''}">${loop.status.toUpperCase()}</span></td>
                            </tr>
                        `
							)
							.join('')}
                    </tbody>
                </table>
            `
					: ''
			}
        </section>
    </div>

    <footer>
        <p>MASCOM Hydra Edge Orchestrator • Cloudflare D1 + R2 • Skeleton King Framework</p>
        <p>Gene loaded at ${new Date().toISOString()}</p>
    </footer>

    <script>
        // Inject gene as global for client-side applications
        window.MASCOM_GENES = ${geneJSON};
        console.log('Gene injected:', window.MASCOM_GENES);
    </script>
</body>
</html>`;
}

/**
 * Detect MIME type from file extension
 */
function getMimeType(path) {
	const ext = path.split('.').pop().toLowerCase();
	const mimeTypes = {
		html: 'text/html',
		css: 'text/css',
		js: 'application/javascript',
		json: 'application/json',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		pdf: 'application/pdf',
		woff: 'font/woff',
		woff2: 'font/woff2',
	};
	return mimeTypes[ext] || 'application/octet-stream';
}
