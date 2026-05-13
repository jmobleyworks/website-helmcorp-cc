# MASCOM Advanced Functors Library Reference

Comprehensive functor library for edge compute orchestration on Cloudflare Workers.
**File:** `functors-advanced.js` (895 lines) | **Examples:** `examples-advanced-flows.js` (630 lines)

---

## Quick Start

```javascript
import * as F from './functors-advanced.js';

// Create context for request lifecycle
const ctx = F.createContext(env);

// Use functors in composition
const handler = F.pipe(
  validateRequest,
  enrichData,
  cacheResult
);
```

---

## API Categories

### 1. CACHING FUNCTORS

#### `edgeCache(fn, ttl, key, cacheApi)`
Wraps functors with Cloudflare Cache API for persistent caching.

```javascript
const cachedLookup = F.edgeCache(
  async (domain) => {
    return await db.prepare('SELECT * FROM registry WHERE domain = ?')
      .bind(domain).first();
  },
  3600,  // 1 hour TTL
  `gene:${domain}`,
  env.CACHE
);
```

#### `memoize(fn, ttl)`
In-memory result caching for repeated calls within a TTL window.

```javascript
const memoizedFetch = F.memoize(
  async (url) => fetch(url).then(r => r.json()),
  300  // 5 min cache
);
```

#### `cacheKey(domain, version)`
Generate versioned cache keys for consistent cache hits.

```javascript
const key = F.cacheKey('example.com', 42);
// Returns: mascom:example.com:v42:1715424000000
```

#### `invalidateCache(pattern, kv)`
Pattern-based cache invalidation via KV metadata.

```javascript
const count = await F.invalidateCache(
  'mascom:example.com:*',
  env.CACHE_KV
);
// Invalidates all versions of example.com
```

---

### 2. VERSIONING FUNCTORS

#### `versionedQuery(sql, domain, db)`
Execute query with version awareness and metadata.

```javascript
const result = await F.versionedQuery(
  'SELECT * FROM genes WHERE active = 1',
  'example.com',
  env.HYDRA_DB
);
// Returns: { data: [...], version: 42, domain, timestamp }
```

#### `incrementVersion(domain, env)`
Auto-increment domain version on write operations.

```javascript
const newVersion = await F.incrementVersion('example.com', env);
// Returns: 43 (incremented from previous)
```

#### `rollbackToVersion(domain, targetVersion, env)`
Restore previous gene_blob from version history.

```javascript
const restored = await F.rollbackToVersion(
  'example.com',
  40,  // Restore to version 40
  env
);
// Returns: { domain, version: 40, restored: true }
```

#### `getVersionHistory(domain, limit, env)`
Fetch version audit trail.

```javascript
const history = await F.getVersionHistory('example.com', 50, env);
// Returns: { domain, history: [...], count }
```

#### `diffVersions(v1, v2)`
JSON diff between two versions.

```javascript
const diff = F.diffVersions(oldGene, newGene);
// Returns: { added: {...}, removed: {...}, changed: {...} }
```

---

### 3. ROUTING FUNCTORS

#### `matchRoutingRule(domain, env)`
Look up routing rule for domain in routing_rules table.

```javascript
const rule = await F.matchRoutingRule('api.example.com', env);
// Returns: { pattern, domain_target, priority, enabled }
```

#### `resolveTarget(domain, env)`
Resolve domain to target via routing rules or direct lookup.

```javascript
const target = await F.resolveTarget('api.example.com', env);
// Returns: 'primary.example.com' or domain if no rule
```

#### `fallbackRoute(primaryRoute, fallbackRoute)`
Try primary route, fallback on 404 or error.

```javascript
const router = F.fallbackRoute(
  async (req) => primaryLookup(req),
  async (req) => defaultFallback(req)
);
```

#### `hostHeaderRoute(req, env)`
Route by Host header with routing_rules fallback.

```javascript
const target = await F.hostHeaderRoute(request, env);
// Extracts Host header, checks routing_rules
```

---

### 4. SECURITY FUNCTORS

#### `validatePSK(req, expectedSecret)`
Verify X-MASCOM-SECRET header with timing-safe comparison.

```javascript
if (!F.validatePSK(request, env.MASCOM_SECRET)) {
  return new Response('Unauthorized', { status: 403 });
}
```

#### `rateLimiter(maxReq, windowMs, kv)`
Simple rate limiting by client IP.

```javascript
const limiter = F.rateLimiter(100, 60000, env.RATE_LIMIT_KV);
const result = await limiter(request);

if (!result.allowed) {
  return new Response('Rate limited', {
    status: 429,
    headers: { 'Retry-After': result.retryAfter }
  });
}
```

#### `corsMiddleware(origins)`
CORS validation and header generation.

```javascript
const cors = F.corsMiddleware(['https://example.com', '*']);
const corsResult = cors(request);

if (!corsResult.allowed) {
  return new Response('CORS blocked', { status: 403 });
}

return new Response(body, { headers: corsResult.headers });
```

#### `signResponse(json, secret)`
HMAC-SHA256 signature for response validation.

```javascript
const signed = await F.signResponse(
  { data: 'payload' },
  env.MASCOM_SECRET
);
// Returns: { data, signature, algorithm }
```

---

### 5. MONITORING FUNCTORS

#### `logRequest(req, handler, logger)`
Log all requests with timing and status.

```javascript
const response = await F.logRequest(
  request,
  async (req) => await mainHandler(req),
  console  // optional logger
);
// Logs: timestamp, method, path, status, duration, IP
```

#### `metricsCollector(name, fn, metricsStore)`
Collect execution metrics: calls, successes, failures, duration.

```javascript
const metricsStore = {};
const tracked = F.metricsCollector('gene_lookup', lookupFn, metricsStore);
await tracked('example.com');

console.log(metricsStore.gene_lookup);
// { calls: 1, successes: 1, failures: 0, totalDuration, minDuration, maxDuration }
```

#### `errorTracker(error, context, reporter)`
Track and report errors with context.

```javascript
await F.errorTracker(
  new Error('Database failed'),
  { domain: 'example.com', operation: 'gene_update' },
  console
);
```

#### `perfTiming(name)`
Performance timing decorator.

```javascript
const result = await F.perfTiming('gene_parse')(async () => {
  return JSON.parse(geneBlob);
});
// Returns: { result, timing: { name, duration, timestamp } }
```

---

### 6. COMPOSITION HELPERS

#### `ifThen(condition, thenFn, elseFn)`
Conditional branching with async support.

```javascript
const handler = F.ifThen(
  () => isPremium(domain),
  async () => aggressiveCache(),
  async () => lightCache()
);
```

#### `retry(fn, maxAttempts, backoffMs)`
Retry with exponential backoff.

```javascript
const resilient = F.retry(
  async () => db.prepare('UPDATE ...').run(),
  3,      // max attempts
  100     // initial backoff ms
);
```

#### `timeout(fn, ms)`
Timeout wrapper for long-running operations.

```javascript
const timedFetch = F.timeout(
  async () => fetch(url).then(r => r.json()),
  5000  // 5 second timeout
);

try {
  const data = await timedFetch();
} catch (e) {
  // "Timeout after 5000ms"
}
```

#### `parallel(...fns)`
Run functors in parallel, collect results.

```javascript
const result = await F.parallel(
  () => fetchGene('a.com'),
  () => fetchGene('b.com'),
  () => fetchGene('c.com')
)();

// Returns: { results, successful, failed }
```

#### `pipe(...fns)`
Pipe composition: run sequentially, pass output to next.

```javascript
const flow = F.pipe(
  validateRequest,
  extractDomain,
  resolveDomain,
  fetchGene,
  enrichData,
  cacheResult
);
```

#### `compose(...fns)`
Compose (reverse pipe order, right-to-left).

```javascript
const flow = F.compose(
  formatResponse,
  enrichData,
  fetchGene,
  resolveDomain
);
```

---

### 7. UTILITY HELPERS

#### `createContext(env)`
Create a functor context with bound environment.

```javascript
const ctx = F.createContext(env);

// Execute with automatic metrics
const gene = await ctx.executeWithMetrics('lookup', async () => {
  return db.prepare('SELECT ...').first();
});

// Get metrics
console.log(ctx.getMetrics('lookup'));

// Execute with in-memory cache
const result = await ctx.executeWithCache('key', fn, 300);
```

---

## Production Patterns

### Pattern 1: Secured Gene Retrieval with Caching

```javascript
export async function securedLookup(request, env, ctx) {
  const flow = F.pipe(
    req => {
      if (!F.validatePSK(req, env.MASCOM_SECRET)) throw new Error('Unauthorized');
      return req;
    },
    req => ({ domain: new URL(req.url).hostname, req }),
    async ({ domain, req }) => {
      const target = await F.resolveTarget(domain, env);
      return { domain, target, req };
    },
    async ({ domain, target, req }) => {
      const gene = await env.HYDRA_DB.prepare(
        'SELECT gene_blob FROM site_registry WHERE domain = ?'
      ).bind(target).first();
      return { domain, target, gene, req };
    }
  );

  return flow(request);
}
```

### Pattern 2: Versioned Updates with Audit Trail

```javascript
async function auditedUpdate(domain, changes, metadata, env) {
  const current = await env.HYDRA_DB.prepare(
    'SELECT gene_blob, version FROM site_registry WHERE domain = ?'
  ).bind(domain).first();

  const oldVersion = current.version;
  const oldGene = JSON.parse(current.gene_blob);
  const newGene = { ...oldGene, ...changes };

  const diff = F.diffVersions(oldGene, newGene);

  // Store audit entry
  await env.HYDRA_DB.prepare(
    'INSERT INTO gene_audit (domain, old_version, changes, metadata, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).bind(domain, oldVersion, JSON.stringify(diff), JSON.stringify(metadata)).run();

  // Increment version
  const newVersion = await F.incrementVersion(domain, env);

  return { domain, oldVersion, newVersion, changes: diff };
}
```

### Pattern 3: Rate-Limited with Fallback Routing

```javascript
async function rateLimitedRoute(request, env) {
  const limiter = F.rateLimiter(100, 60000, env.RATE_LIMIT_KV);
  const rateCheck = await limiter(request);

  if (!rateCheck.allowed) {
    return new Response('Rate limited', { status: 429 });
  }

  const router = F.fallbackRoute(
    req => F.hostHeaderRoute(req, env),
    req => Promise.resolve('default.example.com')
  );

  const target = await router(request);
  const gene = await env.HYDRA_DB.prepare(
    'SELECT gene_blob FROM site_registry WHERE domain = ?'
  ).bind(target).first();

  return new Response(JSON.stringify(gene), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Pattern 4: Multi-Domain Parallel Warmup

```javascript
async function warmupCache(domains, env) {
  const lookups = domains.map(domain => async () => {
    const gene = await env.HYDRA_DB.prepare(
      'SELECT gene_blob FROM site_registry WHERE domain = ?'
    ).bind(domain).first();

    if (gene && env.CACHE) {
      const key = F.cacheKey(domain, gene.version);
      await env.CACHE.put(key, new Response(JSON.stringify(gene)));
    }

    return { domain, cached: !!gene };
  });

  const result = await F.parallel(...lookups)();

  return {
    total: domains.length,
    cached: result.successful,
    failed: result.failed
  };
}
```

---

## Database Schema Requirements

```sql
-- Main registry
CREATE TABLE site_registry (
  domain TEXT PRIMARY KEY,
  gene_blob TEXT,
  version INTEGER,
  status TEXT,
  last_updated TIMESTAMP,
  checksum TEXT
);

-- Version history (for rollback)
CREATE TABLE versioned_genes (
  domain TEXT,
  version INTEGER,
  gene_blob TEXT,
  timestamp TIMESTAMP,
  PRIMARY KEY (domain, version)
);

-- Routing rules
CREATE TABLE routing_rules (
  id INTEGER PRIMARY KEY,
  pattern TEXT,
  domain_target TEXT,
  priority INTEGER,
  enabled INTEGER,
  created_at TIMESTAMP
);

-- Audit trail
CREATE TABLE gene_audit (
  id INTEGER PRIMARY KEY,
  domain TEXT,
  old_version INTEGER,
  new_version INTEGER,
  changes TEXT,
  metadata TEXT,
  timestamp TIMESTAMP
);
```

---

## Error Handling

All functors include error handling. Common patterns:

```javascript
try {
  const result = await F.versionedQuery(sql, domain, db);
} catch (error) {
  console.error(error.message);  // Descriptive error messages
  // Recover gracefully or escalate
}
```

---

## Performance Notes

- **Memoization**: In-memory only, ~300s default TTL
- **Edge Cache**: Cloudflare Cache API, persistent across requests
- **Rate Limiting**: KV-backed, per-IP tracking
- **Retry Backoff**: Exponential (100ms → 200ms → 400ms)
- **Parallel**: Uses Promise.allSettled for fault tolerance
- **Metrics**: Low overhead, suitable for high-frequency endpoints

---

## See Also

- `/Users/johnmobley/mascom/hydra/worker.js` - Main edge handler
- `/Users/johnmobley/mascom/hydra/examples-advanced-flows.js` - 12 production patterns
- `/Users/johnmobley/mascom/hydra/DESIGN.md` - Architecture overview
