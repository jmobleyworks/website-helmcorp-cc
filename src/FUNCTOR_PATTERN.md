# Functor Flow Pattern — MASCOM Hydra

## Philosophy

The shift from **object-oriented workers** to **functional edge compute** is a mechanical necessity. Classes introduce state-heavy overhead that contradicts the serverless and no-dependency ethos of Cloudflare Workers.

**Core Vision:**
- D1 database as the **source of truth**
- Workers as a **transparent, stateless pipe**
- Compute stays **light** (binary size, memory footprint)
- Data stays **mobile** (easily transferable local ↔ edge)
- Avoids the **Memory Wall** by keeping compute near-zero overhead

---

## Pattern: Seven Layers

Every Hydra worker follows this composable functor structure:

### 1. Context Extractors (Input)

Extract request metadata without side effects.

```javascript
const getPath = (req) => new URL(req.url).pathname;
const getParam = (req, key) => new URL(req.url).searchParams.get(key);
const getAuth = (req) => req.headers.get('X-MASCOM-SECRET');
const getBody = (req) => req.json().catch(() => ({}));
```

**Purpose:** Isolate request parsing from business logic.

---

### 2. Result Monad (State + Error Handling)

Wrap D1 operations in a Result type to avoid nested try-catch chains.

```javascript
const withDB = (env) => async (queryFn) => {
	try {
		const data = await queryFn(env.HYDRA_DB);
		return { success: true, data };
	} catch (err) {
		return { success: false, error: err.message };
	}
};
```

**Return Type:**
```javascript
{ success: true, data: any }
{ success: false, error: string }
```

**Usage:**
```javascript
const run = withDB(env);
const result = await run(findAllDomains());
if (!result.success) return asError(result.error, 500);
```

**Purpose:** Eliminate async/await nesting, make errors first-class values.

---

### 3. Pure Query Functors (Logic)

Write parameterized queries as functions that accept a D1 instance.

```javascript
const findAllDomains = () => (db) =>
	db.prepare(`SELECT domain FROM site_registry WHERE status = 'active'`).all();

const findGene = (domain) => (db) =>
	db.prepare(`SELECT gene_blob FROM site_registry WHERE domain = ?`)
		.bind(domain)
		.first();

const upsertGene = (domain, gene_blob) => (db) =>
	db.prepare(`
		INSERT INTO site_registry (domain, gene_blob, version)
		VALUES (?, ?, 1)
		ON CONFLICT(domain) DO UPDATE SET
			gene_blob = excluded.gene_blob,
			version = version + 1
		RETURNING *
	`).bind(domain, JSON.stringify(gene_blob)).first();
```

**Signature:** `(params...) => (db) => Promise<any>`

**Purpose:**
- Pure functions (testable, no side effects)
- Parameterized (reusable)
- Lazy evaluation (only executed when called with a db)

---

### 4. Pure Validators (Middleware)

Validate inputs and return Result types.

```javascript
const validateSecret = (secret, envSecret) => {
	return secret === envSecret
		? { valid: true }
		: { valid: false, error: 'Unauthorized' };
};

const validatePayload = (body) => {
	if (!body.domain) return { valid: false, error: 'Missing domain' };
	if (!body.gene_blob) return { valid: false, error: 'Missing gene_blob' };
	return { valid: true };
};
```

**Return Type:**
```javascript
{ valid: true }
{ valid: false, error: string }
```

**Purpose:** Guard against invalid state before hitting D1.

---

### 5. Transformers (Data Shape Conversion)

Convert D1 results → application domain shapes.

```javascript
const parseGeneBlob = (row) => {
	try {
		const gene = typeof row.gene_blob === 'string'
			? JSON.parse(row.gene_blob)
			: row.gene_blob;
		return {
			domain: row.domain,
			site_name: gene.site_name || 'Unnamed',
			description: gene.description || 'No description',
		};
	} catch (e) {
		return {
			domain: row.domain,
			site_name: 'Parse Error',
			description: 'Could not parse gene blob',
		};
	}
};

const toVenturesArray = (result) => {
	if (!result.success) return [];
	return result.data.results.map(parseGeneBlob);
};
```

**Purpose:** Separate data fetching from data shaping.

---

### 6. Response Transformers (Output)

Convert application shapes → HTTP responses.

```javascript
const asJSON = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
	status,
	headers: {
		'Content-Type': 'application/json',
		'Cache-Control': 'max-age=300, stale-while-revalidate=3600',
		'Access-Control-Allow-Origin': '*',
	},
});

const asError = (message, status = 500) => new Response(JSON.stringify({ error: message }), {
	status,
	headers: { 'Content-Type': 'application/json' },
});
```

**Purpose:** Separate response formatting from logic.

---

### 7. Route Handlers + Simple Router (Composition)

Compose all layers into route handlers, use object literal router (no dependencies).

```javascript
const handleGetVentures = async (env) => {
	const run = withDB(env);
	const result = await run(findAllVentures());
	const ventures = toVenturesArray(result);
	return asJSON(ventures, result.success ? 200 : 500);
};

const handleSetGene = async (request, env) => {
	// Validate auth
	const authCheck = validateSecret(getAuth(request), env.MASCOM_SECRET);
	if (!authCheck.valid) return asError(authCheck.error, 403);

	// Parse body
	const body = await getBody(request);

	// Validate payload
	const payloadCheck = validatePayload(body);
	if (!payloadCheck.valid) return asError(payloadCheck.error, 400);

	// Upsert
	const run = withDB(env);
	const result = await run(upsertGene(body.domain, body.gene_blob));
	if (!result.success) return asError(result.error, 500);

	return asJSON({ success: true, version: result.data.version });
};

// Simple switch-based router (no itty-router dependency)
const routes = {
	'/getventures': (req, env) => handleGetVentures(env),
	'/setgene': (req, env) => handleSetGene(req, env),
};

export default {
	async fetch(request, env) {
		const path = getPath(request);
		const handler = routes[path];
		return handler ? handler(request, env) : asError('Not Found', 404);
	},
};
```

**Purpose:** Compose all layers; avoid external router libraries to keep binary size minimal.

---

## API Contract: Separation of Concerns

To keep Hydra agile at scale (100+ domains), split list and detail into separate endpoints:

### `/getventures` (Discovery Functor — Lightweight List)

Returns normalized metadata only for all active ventures.

```json
[
  {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "description": "MASCOM unified API gateway...",
    "version": "1.0"
  },
  ...
]
```

**Purpose:** Dashboard/listing views, initial discovery. ~100 bytes per domain, cacheable.

**Cache:** 300s fresh + 3600s stale-while-revalidate.

### `/getventure?domain=X` (Detail Functor — Full Context)

Returns both normalized summary (`meta`) and raw blueprint (`dna`).

```json
{
  "meta": {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "version": "1.0",
    "status": "active",
    "checksum": "abc123..."
  },
  "dna": {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "description": "MASCOM unified API gateway...",
    "endpoints": {
      "api_base": "https://mascom-api.mobleysoft.com/api",
      "rest": { ... }
    },
    "services": [ ... ]
  }
}
```

**Purpose:** Deep dives into specific ventures. Clients pull this only when needed (e.g., user clicks into a domain card).

**Cache:** 300s fresh + 3600s stale-while-revalidate (same as list, but smaller request volume due to on-demand nature).

---

## Strategic Deployment Order (Phase 1: Core)

| Order | Endpoint | Critical? | Rationale |
|-------|----------|-----------|-----------|
| 1 | `/getdomains` | YES | Simple domain listing for basic clients |
| 2 | `/getventures` | YES | Lightweight venture discovery (meta only) |
| 3 | `/getventure` | YES | Full venture detail with `dna` (on-demand) |
| 4 | `/setgene` | YES | Enables mascom_push.py to push mutations to D1 |

These four cover:
- **Read (Lightweight)**: `/getdomains`, `/getventures`
- **Read (Full Context)**: `/getventure`
- **Write**: `/setgene`
- **Auth**: X-MASCOM-SECRET validation on `/setgene`

**Why this order:**
1. List endpoints are stateless and scale linearly
2. Detail endpoint is on-demand, so it adds minimal overhead
3. Write endpoint requires security validation, so it's last

---

## Transferability: Local ↔ Edge

Since all functors are pure and dependency-free, the same code runs identically:

**On Cloudflare Workers:**
```javascript
const env = {
	HYDRA_DB: D1 binding,
	MASCOM_SECRET: CF secret,
};
```

**On localhost (local-runtime.js):**
```javascript
const env = {
	HYDRA_DB: new D1Adapter('./hydra-local.db'),  // SQLite wrapper
	MASCOM_SECRET: process.env.MASCOM_SECRET,
};
```

Same `handleGetVentures()`, `handleSetGene()`, `routes` object. **Zero code duplication.**

---

## No-Import Constraint

To minimize binary size and avoid dependency bloat:

1. ❌ No `itty-router` (or similar)
2. ❌ No `zod` validation (use hand-rolled validators)
3. ❌ No middleware frameworks
4. ✅ Vanilla JavaScript only
5. ✅ Object literal router for small worker counts

**Result:** Worker bundles <10KB, edge latency <50ms.

---

## Testing Locally

```bash
# Start local runtime
node ~/mascom/hydra/local-runtime.js

# Test /getdomains
curl http://localhost:3000/getdomains

# Test /setgene
curl -X POST http://localhost:3000/setgene \
  -H "X-MASCOM-SECRET: $(echo $MASCOM_SECRET)" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "gene_blob": {"site_name": "Example"}}'

# Test /getventures
curl http://localhost:3000/getventures
```

---

## Extending the Pattern

To add new endpoints:

1. **Create query functor:**
   ```javascript
   const findByStatus = (status) => (db) =>
   	db.prepare(`SELECT domain FROM site_registry WHERE status = ?`).bind(status).all();
   ```

2. **Create transformer (if needed):**
   ```javascript
   const toDomainList = (result) => result.success ? result.data.results.map(r => r.domain) : [];
   ```

3. **Create handler:**
   ```javascript
   const handleGetByStatus = async (env, status) => {
   	const run = withDB(env);
   	const result = await run(findByStatus(status));
   	return asJSON(toDomainList(result));
   };
   ```

4. **Add route:**
   ```javascript
   const routes = {
   	// ... existing
   	'/get-by-status': (req, env) => handleGetByStatus(env, getParam(req, 'status')),
   };
   ```

---

## Summary

| Layer | Type | Example |
|-------|------|---------|
| 1. Extractors | Input | `getPath`, `getAuth`, `getBody` |
| 2. Monad | Effect | `withDB` |
| 3. Queries | Logic | `findAllDomains`, `upsertGene` |
| 4. Validators | Middleware | `validateSecret`, `validatePayload` |
| 5. Transformers | Logic | `parseGeneBlob`, `toVenturesArray` |
| 6. Response | Output | `asJSON`, `asError` |
| 7. Router | Composition | Object literal + simple switch |

**Deploy the same code to:**
- Cloudflare Workers (CF-bound env)
- Localhost (SQLite-bound env)
- Any other cloud (custom env adapter)

**Result:** Unified architecture, maximum transferability, zero vendor lock-in.
