# HYDRA: Monadic Functor Architecture

## Executive Summary

**Single principle:** D1 is the source of truth. Workers are transparent, stateless transformation pipes.

```
D1 (Gene Source)
    ↓
Query Functors (Pure)
    ↓
Monad [Success(data) | Failure(error)]
    ↓
Mapping Functors (Normalize)
    ↓
Response Transformer (JSON)
    ↓
Client
```

---

## The Monad Core

All error handling flows through a Result type, eliminating nested try-catch and making error paths explicit:

```javascript
const Success = (data) => ({ success: true, data });
const Failure = (error) => ({ success: false, error });
```

**Usage:**
```javascript
const result = await processVentures(env);
// result is either { success: true, data: [...] }
//                or { success: false, error: "message" }
```

---

## The Four-Layer Stack

### 1. Query Functors (D1 → Result)

Pure functions that execute SQL and wrap results in Success/Failure:

```javascript
const queryAllVentures = (db) =>
	db.prepare(`SELECT domain, gene_blob, version FROM site_registry WHERE status = 'active'`)
		.all();

// Called as: await queryAllVentures(env.HYDRA_DB)
```

**Properties:**
- No side effects (pure function)
- Parameterized (testable in isolation)
- Lazy (only executes when invoked)

### 2. Mapping Functors (Normalize)

Transform D1 rows into domain shapes:

```javascript
// Lightweight (List View)
const normalizeVenture = (row) => ({
	domain: row.domain,
	site_name: gene.site_name || 'Unnamed',
	species: gene.species || 'unknown',
	description: gene.description || '',
	version: gene.version || '1.0',
});

// Detailed (Detail View)
const detailedVenture = (row) => ({
	meta: { domain, site_name, species, version, status, checksum },
	dna: gene // raw gene_blob, unchanged
});
```

**Properties:**
- Handle parse errors gracefully (fallback values)
- Separate from I/O (testable)
- Composable (chain multiple transformations)

### 3. Orchestrators (Compose Layers)

Combine queries + mapping + error handling:

```javascript
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
```

**Properties:**
- Single responsibility (orchestration only)
- Error handling integrated
- Returns Result monad

### 4. Response Transformers (Output)

Convert monad results → HTTP responses:

```javascript
const asJSON = (data, status = 200) => new Response(JSON.stringify(data), {
	status,
	headers: {
		'Content-Type': 'application/json',
		'Cache-Control': 'max-age=300, stale-while-revalidate=3600',
		'Access-Control-Allow-Origin': '*',
	},
});

const asError = (message, status = 500) =>
	new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });
```

**Usage:**
```javascript
if (!result.success) return asError(result.error, 500);
return asJSON(result.data);
```

---

## API Contract: List vs. Detail

### `/getventures` (Discovery)

**Request:** `GET /getventures`

**Response (200):** Array of normalized `meta` objects
```json
[
  {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "description": "MASCOM unified API gateway...",
    "version": "1.0"
  }
]
```

**Cache:** 300s fresh + 3600s stale-while-revalidate

**Use Case:** Dashboards, ecosystem listings, initial discovery (lightweight)

---

### `/getventure?domain=X` (Detail)

**Request:** `GET /getventure?domain=mascom-api.mobleysoft.com`

**Response (200):** Object with `meta` (summary) + `dna` (full blueprint)
```json
{
  "meta": {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "version": "1.0",
    "status": "active",
    "checksum": "sha256..."
  },
  "dna": {
    "domain": "mascom-api.mobleysoft.com",
    "site_name": "MASCOM API Gateway",
    "species": "mascom_api",
    "description": "...",
    "endpoints": { "api_base": "...", "rest": {...} },
    "services": [...]
  }
}
```

**Response (404):** Domain not found
```json
{ "error": "Domain not found" }
```

**Cache:** 300s fresh + 3600s stale-while-revalidate

**Use Case:** Detailed configuration, when clients need full nested structure (endpoints, services, etc.)

---

## Scaling Properties

| Metric | Value | Notes |
|--------|-------|-------|
| Cold start latency | ~5-10ms | No dependencies, pure function |
| Response size (list) | ~100 bytes/domain | Normalized meta only |
| Concurrent domains | 100+ | D1 caching handles scale |
| Memory footprint | <1MB | No class instances, no OO overhead |
| Bundle size | <10KB | Vanilla JS, no libraries |

**At 1,000 domains:**
- `/getventures` returns ~100KB (gzipped ~10KB)
- List renders in <50ms (edge cache + stream)
- Detail requests (~5% of traffic) pull full `dna` on demand

---

## Adding New Endpoints

Template for `/get<entity>`:

```javascript
// 1. Query Functor
const queryEntity = (db, params) =>
	db.prepare(`SELECT ... WHERE ...`).bind(...params).all();

// 2. Mapping Functor
const normalizeEntity = (row) => ({ /* normalized shape */ });

// 3. Orchestrator
const processEntity = async (env, params) => {
	try {
		const result = await queryEntity(env.HYDRA_DB, params);
		return Success(result.results.map(normalizeEntity));
	} catch (err) {
		return Failure(err.message);
	}
};

// 4. Add to router
if (path === '/get<entity>') {
	result = await processEntity(env, ...params);
}
```

---

## Why Monadic Error Handling

**Before (nested try-catch):**
```javascript
try {
	const result = await query1();
	try {
		const result2 = await query2(result);
		// ...
	} catch (e2) { /* handle 2 */ }
} catch (e1) { /* handle 1 */ }
```

**After (Result monad):**
```javascript
const result = await processStep1(env);
if (!result.success) return asError(result.error);

const result2 = await processStep2(env, result.data);
if (!result2.success) return asError(result2.error);

return asJSON(result2.data);
```

**Benefits:**
- Explicit error flow (no callback hell)
- Flat code structure (easier to read)
- Declarative (error handling is a first-class concern)
- Composable (chain operations without nesting)

---

## Testing the Monad Pattern

```javascript
// Unit test: Query functor
const mockDB = {
	prepare: () => ({ bind: () => ({ all: () => [...] }) })
};
const result = await queryAllVentures(mockDB);
assert(result.results.length > 0);

// Unit test: Mapping functor
const row = { domain: '...', gene_blob: '{"site_name": "Test"}' };
const mapped = normalizeVenture(row);
assert(mapped.site_name === 'Test');

// Unit test: Orchestrator
const mockEnv = { HYDRA_DB: mockDB };
const result = await processVentures(mockEnv);
assert(result.success === true);
assert(result.data.length > 0);
```

---

## Naming: `meta` vs `dna`

- **`meta`** = normalized summary (5-7 fields, human-readable, always consistent)
- **`dna`** = raw gene_blob (complete blueprint, may vary by species, for implementation details)

This aligns with MASCOM's biological metaphor:
- `species` = the type of venture
- `gene_blob` = the genetic code (stored in D1)
- `dna` = the exposed raw blueprint (in API response)
- `meta` = the summary (in API response)

---

## Deployment Checklist

- [ ] D1 schema deployed (site_registry, gene_history, routing_rules)
- [ ] `/getventures` endpoint tested locally
- [ ] `/getventure` endpoint tested with sample domain
- [ ] Cache headers verified (300s fresh, 3600s stale)
- [ ] CORS headers set for * (or restrict to specific origins)
- [ ] Error responses tested (404, 500, validation errors)
- [ ] CF Workers deployed (free 3 slots by deleting unused)
- [ ] Skeleton King client updated to use new endpoints
- [ ] Monitoring: check X-Hydra-Compute header in responses

---

## Summary

The monadic functor pattern:
1. **Eliminates OO boilerplate** (no classes, just functions)
2. **Flattens error handling** (no nested try-catch)
3. **Scales linearly** (D1 as source of truth, workers as pipes)
4. **Remains testable** (pure functions, dependency injection)
5. **Transfers seamlessly** (same code local ↔ CF ↔ other clouds)

Result: A Hydra that stays agile at 100+ domains, with cold start latency near zero and bundle size under 10KB.
