/**
 * setgene.johnmobley.workers.dev
 * Functor flow: Extract → Validate → Mutate D1 → Transform → Respond
 * Atomically updates gene_blob for domain with version increment and checksum
 */

// 1. Context Extractors (Input)
const getPath = (req) => new URL(req.url).pathname;
const getAuth = (req) => req.headers.get('X-MASCOM-SECRET');
const getBody = (req) => req.json().catch(() => ({}));

// 2. Result Monad (State + Error Handling)
const withDB = (env) => async (queryFn) => {
	try {
		const data = await queryFn(env.HYDRA_DB);
		return { success: true, data };
	} catch (err) {
		return { success: false, error: err.message };
	}
};

// 3. Pure Validators (Middleware)
const validateSecret = (secret, envSecret) => {
	return secret === envSecret ? { valid: true } : { valid: false, error: 'Unauthorized' };
};

const validatePayload = (body) => {
	if (!body.domain) return { valid: false, error: 'Missing domain' };
	if (!body.gene_blob) return { valid: false, error: 'Missing gene_blob' };
	if (typeof body.gene_blob !== 'object') return { valid: false, error: 'gene_blob must be JSON object' };
	return { valid: true };
};

// Use SubtleCrypto for checksum (CF Workers compatible)
const calculateChecksum = async (gene) => {
	const data = new TextEncoder().encode(JSON.stringify(gene));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
};

// 4. Pure Query Functors (Logic)
const upsertGene = (domain, gene_blob, status = 'active') => async (db) => {
	const checksum = await calculateChecksum(gene_blob);
	const stmt = db.prepare(`
		INSERT INTO site_registry (domain, gene_blob, status, checksum, version)
		VALUES (?, ?, ?, ?, 1)
		ON CONFLICT(domain) DO UPDATE SET
			gene_blob = excluded.gene_blob,
			status = excluded.status,
			checksum = excluded.checksum,
			version = version + 1,
			last_updated = CURRENT_TIMESTAMP
		RETURNING domain, version, checksum, last_updated
	`);

	return stmt.bind(domain, JSON.stringify(gene_blob), status, checksum).first();
};

const recordHistory = (domain, gene_blob, version) => async (db) => {
	const stmt = db.prepare(`
		INSERT INTO gene_history (domain, gene_blob, version, status, published_at)
		VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
	`);

	return stmt.bind(domain, JSON.stringify(gene_blob), version).run();
};

// 5. Transformers (Logic)
const toUpdateResponse = (result) => {
	if (!result.success) return { success: false, error: result.error };
	const data = result.data;
	return {
		success: true,
		domain: data.domain,
		version: data.version,
		checksum: data.checksum,
		timestamp: data.last_updated,
	};
};

// 6. Response Transformer (Output)
const asJSON = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
	status,
	headers: {
		'Content-Type': 'application/json',
		'Cache-Control': 'no-cache, no-store, must-revalidate',
		'Access-Control-Allow-Origin': '*',
	},
});

const asError = (message, status = 500) => new Response(JSON.stringify({ error: message }), {
	status,
	headers: { 'Content-Type': 'application/json' },
});

// 7. Route Handlers (Composition)
const handleSetGene = async (request, env) => {
	// Validate auth
	const authCheck = validateSecret(getAuth(request), env.MASCOM_SECRET);
	if (!authCheck.valid) return asError(authCheck.error, 403);

	// Parse body
	const body = await getBody(request);

	// Validate payload
	const payloadCheck = validatePayload(body);
	if (!payloadCheck.valid) return asError(payloadCheck.error, 400);

	// Upsert gene
	const run = withDB(env);
	const upsertResult = await run(upsertGene(body.domain, body.gene_blob, body.status || 'active'));

	if (!upsertResult.success) {
		return asError(upsertResult.error, 500);
	}

	// Record in history (fire and forget, don't block response)
	recordHistory(body.domain, body.gene_blob, upsertResult.data.version)
		.then((fn) => fn(env.HYDRA_DB))
		.catch((err) => console.error(`History record failed for ${body.domain}:`, err));

	// Return success
	const response = toUpdateResponse(upsertResult);
	return asJSON(response, 200);
};

// 8. Simple Switch Router (No Dependencies)
const routes = {
	'/setgene': (req, env) => handleSetGene(req, env),
};

export default {
	async fetch(request, env) {
		const path = getPath(request);

		// Only allow POST for mutations
		if (path === '/setgene' && request.method !== 'POST') {
			return asError('Method not allowed', 405);
		}

		const handler = routes[path];

		if (!handler) {
			return asError('Not Found', 404);
		}

		return handler(request, env);
	},
};
