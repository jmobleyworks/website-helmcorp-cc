/**
 * HYDRA: getventures-worker.js
 * Stateless Functor Flow — D1 → Monad → Response
 *
 * API Contract:
 *   GET /getventures              → List view (meta only, lightweight)
 *   GET /getventure?domain=X      → Detail view (meta + dna, complete)
 */

// --- 1. Monadic Core (Universal) ---
const Success = (data) => ({ success: true, data });
const Failure = (error) => ({ success: false, error });

// --- 2. Pure Query Functors ---
const queryAllVentures = (db) =>
	db.prepare(`
		SELECT domain, gene_blob, version
		FROM site_registry
		WHERE status = 'active'
		ORDER BY domain ASC
	`).all();

const querySingleVenture = (db, domain) =>
	db.prepare(`
		SELECT domain, gene_blob, version, checksum, status
		FROM site_registry
		WHERE domain = ? LIMIT 1
	`).bind(domain).first();

// --- 3. Parse Gene Safely ---
const parseGene = (geneBlob) => {
	try {
		return typeof geneBlob === 'string'
			? JSON.parse(geneBlob)
			: geneBlob;
	} catch (_) {
		return null;
	}
};

// --- 4. Lightweight Mapping Functor (List View) ---
const normalizeVenture = (row) => {
	const gene = parseGene(row.gene_blob);

	if (!gene) {
		return {
			domain: row.domain,
			site_name: 'Parse Error',
			species: 'error',
			description: 'Could not parse gene_blob',
			version: row.version || '0.0',
		};
	}

	return {
		domain: row.domain,
		site_name: gene.site_name || 'Unnamed',
		species: gene.species || 'unknown',
		description: gene.description || 'No description available',
		version: gene.version || row.version || '1.0',
	};
};

// --- 5. Detailed Mapping Functor (Detail View) ---
const detailedVenture = (row) => {
	const gene = parseGene(row.gene_blob);

	return {
		meta: {
			domain: row.domain,
			site_name: gene?.site_name || 'Unnamed',
			species: gene?.species || 'unknown',
			version: gene?.version || row.version || '1.0',
			status: row.status || 'active',
			checksum: row.checksum || 'unknown',
		},
		dna: gene || { error: 'Parse failed' },
	};
};

// --- 6. The Orchestrators (Pure Transformation) ---
const processVentures = async (env) => {
	try {
		const result = await queryAllVentures(env.HYDRA_DB);
		if (!result.results) return Failure('Empty result set');

		const ventures = result.results.map(normalizeVenture);
		return Success(ventures);
	} catch (err) {
		return Failure(err.message);
	}
};

const processVenture = async (env, domain) => {
	if (!domain) return Failure('Missing domain parameter');

	try {
		const result = await querySingleVenture(env.HYDRA_DB, domain);
		if (!result) return Failure(`Domain ${domain} not found`);

		return Success(detailedVenture(result));
	} catch (err) {
		return Failure(err.message);
	}
};

// --- 7. Response Transformers ---
const asJSON = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
	status,
	headers: {
		'Content-Type': 'application/json',
		'Cache-Control': 'max-age=300, stale-while-revalidate=3600',
		'Access-Control-Allow-Origin': '*',
		'X-Hydra-Compute': 'functional-monad-v2',
	},
});

const asError = (message, status = 500) => new Response(JSON.stringify({ error: message }), {
	status,
	headers: { 'Content-Type': 'application/json' },
});

// --- 8. Simple Router (No Dependencies) ---
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;
		const domain = url.searchParams.get('domain');

		let result;

		if (path === '/getventures') {
			result = await processVentures(env);
		} else if (path === '/getventure') {
			result = await processVenture(env, domain);
		} else {
			return asError('Not Found', 404);
		}

		if (!result.success) {
			return asError(result.error, 500);
		}

		return asJSON(result.data);
	},
};
