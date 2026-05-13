# Hydra Design Document: D1-Only Architecture

## Executive Summary

**Hydra** is the MASCOM edge projection layer. It was designed to use Cloudflare R2 + D1 (separation of concerns: metadata vs. payloads), but the D1-only variant eliminates R2 entirely, simplifying the system while maintaining atomic consistency.

**Key Decision**: Store gene blobs directly in D1 as JSON columns instead of offloading to R2.

---

## Design Evolution

### Original Design (D1 + R2)
```
D1 site_registry:
  domain → gene_object_key (FK)

R2 hydra_genes bucket:
  gene_object_key.json → { gene payload }
```

**Issues**:
- Two round-trips per request (D1 lookup + R2 fetch)
- Eventual consistency risk (gene_object_key points to stale R2 object)
- R2 not enabled in account → extra setup step
- Two systems to monitor/debug

### New Design (D1 Only)
```
D1 site_registry:
  domain → gene_blob (JSON column, stored inline)
  version → int
  checksum → text (SHA256)
```

**Benefits**:
1. **Atomicity**: Version + gene blob always in sync (single SQL transaction)
2. **Simplicity**: One service, one database binding
3. **Speed**: Single D1 query vs. D1 + R2 (async operations)
4. **Cost**: No R2 egress charges; D1 is cheaper at small scale
5. **Reliability**: No cross-service consistency issues

---

## Schema Design

### Tables

#### `site_registry` (Primary)
- `domain` (PK): Domain name
- `gene_blob` (JSON): Complete gene payload (stored inline)
- `version` (INT): Auto-incrementing version
- `status` (TEXT): active | staging | disabled | archived
- `checksum` (TEXT): SHA256 of gene_blob (for change detection)
- `last_updated` (DATETIME): Sync timestamp
- `metadata` (JSON): Extra fields (deployment info, tags, etc.)

#### `gene_history` (Audit Trail)
- `domain` (FK): Links back to site_registry
- `gene_blob` (JSON): Full gene at time of publish
- `version` (INT): Which version this was
- `checksum` (TEXT): Hash for verification
- `published_at` (DATETIME): When published

#### `routing_rules` (Optional Complexity)
- `pattern` (TEXT): Domain pattern (e.g., `*.subdomain.example.com`)
- `domain_target` (FK): Maps to actual site_registry domain
- `priority` (INT): Rule precedence
- `enabled` (BOOLEAN): On/off toggle

---

## Worker Logic

### Request Flow

```
1. Extract Host header
   host = request.headers.get("Host")

2. Check routing rules (optional pattern matching)
   domainTarget = checkRoutingRules(host) || host

3. Query D1 for gene record
   SELECT gene_blob, version, status, checksum FROM site_registry
   WHERE domain = domainTarget AND status = 'active'

4. Parse gene blob (already JSON in D1)
   genePayload = JSON.parse(record.gene_blob)

5. Route based on pathname
   /api/config → return gene as JSON
   / or /index.html → inject gene into Skeleton King HTML
   /api/anything → check gene.endpoints for mapping

6. Cache headers include version + checksum
   X-Gene-Version: 2
   X-Gene-Checksum: a1b2c3d4...
```

### Response Headers

```
X-Gene-Version: 2              ← Version for cache invalidation
X-Gene-Updated: 2026-05-11... ← When gene was last synced
X-Gene-Checksum: a1b2c3d4...   ← For detecting remote changes
Cache-Control: 300, SWR        ← 5 min + stale-while-revalidate
```

---

## Sync Bridge (mascom_push.py)

### Local → D1 Flow

```
1. Scan ~/mascom/sites/<domain>/data.json

2. Load gene JSON (validates JSON syntax)

3. Calculate checksum
   checksum = SHA256(json.dumps(gene))

4. POST /hydra/registry-update
   {
     "domain": "...",
     "gene_blob": { ... },
     "status": "active",
     "checksum": "..."
   }

5. Worker receives POST
   → Verify X-MASCOM-SECRET header (PSK)
   → INSERT or UPDATE site_registry
   → Auto-increment version
   → Archive old version to gene_history

6. Respond with success
   {
     "success": true,
     "domain": "...",
     "version": 2,
     "timestamp": "..."
   }
```

### Protection Mechanism

- POST endpoint requires `X-MASCOM-SECRET` header (PSK)
- Secret stored in Wrangler secrets (not in code)
- mascom_push.py loads secret from `$MASCOM_SECRET` env var
- No authentication bypass possible

---

## Data Size Constraints

### Per-Domain Gene Blob

Typical gene.json sizes:
- **Skeleton King config**: 2-5 KB
- **Services list**: 1-3 KB
- **Architecture loops**: 0.5-1 KB
- **Metadata**: 1-2 KB
- **Total**: **~10 KB per gene** (comfortable for D1)

### Scaling

- **1,000 domains**: ~10 MB total (trivial for D1)
- **10,000 domains**: ~100 MB (still within SQLite limits)
- **100,000 domains**: ~1 GB (D1 can handle; may need sharding)

**For MASCOM conglomerate**: D1-only is ideal up to 10,000+ domains.

---

## Versioning & Rollback

### Automatic Versioning

Each push auto-increments:

```sql
INSERT INTO site_registry (domain, gene_blob, version)
VALUES (?, ?, 1)
ON CONFLICT(domain) DO UPDATE SET
    gene_blob = excluded.gene_blob,
    version = version + 1,
    last_updated = CURRENT_TIMESTAMP
```

### History Preservation

Before updating, copy old version to gene_history:

```sql
INSERT INTO gene_history (domain, gene_blob, version, checksum, published_at)
SELECT domain, gene_blob, version, checksum, CURRENT_TIMESTAMP
FROM site_registry
WHERE domain = ?
```

### Rollback Strategy

Manual rollback via D1:

```bash
# Get previous version
SELECT gene_blob, version FROM gene_history
WHERE domain = 'mascom-api.mobleysoft.com'
ORDER BY published_at DESC LIMIT 1

# Restore
UPDATE site_registry
SET gene_blob = (SELECT gene_blob FROM gene_history WHERE ...)
WHERE domain = 'mascom-api.mobleysoft.com'
```

---

## Monitoring & Observability

### Key Metrics

1. **Gene Freshness**: `MAX(last_updated)` → time since last sync
2. **Version Drift**: `COUNT(DISTINCT version) per domain` → how many active versions
3. **Checksum Mismatches**: Local SHA256 ≠ D1 checksum → detect corruption
4. **Request Latency**: X-CF-Cache-Status + D1 query time
5. **Worker Errors**: Parse failures, DNS misses, etc.

### Queries

```bash
# Top 10 recently synced domains
wrangler d1 execute hydra_db --command "
  SELECT domain, version, checksum, last_updated
  FROM site_registry
  WHERE status = 'active'
  ORDER BY last_updated DESC
  LIMIT 10
"

# Detect stale genes (not synced in 24h)
wrangler d1 execute hydra_db --command "
  SELECT domain, last_updated
  FROM site_registry
  WHERE datetime(last_updated) < datetime('now', '-1 day')
"

# Gene history for audit
wrangler d1 execute hydra_db --command "
  SELECT domain, version, checksum, published_at
  FROM gene_history
  WHERE domain = 'mascom-api.mobleysoft.com'
  ORDER BY published_at DESC
  LIMIT 20
"
```

---

## Cost Analysis

### Monthly Cost (Small Scale)

| Component | Price | Usage | Cost |
|-----------|-------|-------|------|
| D1 Storage | $0.75/month base | included | $0.75 |
| D1 Reads | $0.20/M ops | 10M/month | $2.00 |
| D1 Writes | $0.20/M ops | 100K/month | $0.02 |
| Worker | Free | 10M req/month | $0 |
| Bandwidth | $0.20/GB | 100GB/month | $20 |
| **Total** | | | **~$23/month** |

### Comparison: D1 vs R2

| Metric | D1 Only | D1 + R2 |
|--------|---------|---------|
| DB | $0.75 | $0.75 |
| Reads | $2.00 | $2.00 |
| R2 Writes | $0 | $0.20 |
| R2 Storage | $0 | $0.15 |
| R2 Egress | $0 | $0.15 |
| **Total** | **$2.75** | **$3.25** |

**D1-only saves ~$0.50/month** (and eliminates consistency issues).

---

## Failover & Resilience

### Edge Cache

Worker response includes:
```
Cache-Control: max-age=300, stale-while-revalidate=3600
```

- **Fresh** (0-300s): Serve from cache
- **Stale** (300-3600s): Serve from cache while revalidating D1 in background
- **Expired** (>3600s): Force fetch from D1

If D1 is down during SWR window, edge serves stale gene (graceful degradation).

### Local Failover

If HYDRA_ENDPOINT is unreachable, mascom_push.py falls back to:
1. Retry with exponential backoff
2. Log error with timestamp
3. Queue for retry (optional: write to local .queue file)
4. Alert operator (optional: Slack/Discord webhook)

---

## Migration Path (If Needed)

If genes grow to MB+ sizes, migrate to hybrid:

1. **Phase 1**: Store large genes in R2, keep references in D1
   - D1: `{ domain, gene_object_key_r2, version, ... }`
   - Worker: Check size; fetch from R2 if >100KB

2. **Phase 2**: Async gene generation
   - D1: Store gen-in-progress flag
   - Background job: Generate large genes → R2
   - Worker: Detect flag, serve cached version

This design doesn't prevent future scaling; D1-only is just the MVP.

---

## Deployment Checklist

- [ ] Create D1 database (`wrangler d1 create hydra_db`)
- [ ] Run schema.sql (`wrangler d1 execute hydra_db --file schema.sql`)
- [ ] Update wrangler.toml with database_id
- [ ] Set MASCOM_SECRET (`wrangler secret put MASCOM_SECRET`)
- [ ] Deploy Worker (`wrangler deploy --env production`)
- [ ] Export MASCOM_SECRET locally (`export MASCOM_SECRET="..."`)
- [ ] Test push single domain (`python3 mascom_push.py push mascom-api.mobleysoft.com`)
- [ ] Verify edge response (`curl https://mascom-api.mobleysoft.com/api/config`)
- [ ] Set up cron for auto-sync (`*/30 * * * * cd ~/mascom/hydra && python3 mascom_push.py push-all`)
- [ ] Enable monitoring (Wrangler tail, D1 queries)

---

## References

- **Cloudflare D1 Docs**: https://developers.cloudflare.com/d1/
- **Worker Bindings**: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- **SQLite JSON1**: https://www.sqlite.org/json1.html
- **MASCOM Architecture**: `/Users/johnmobley/mascom/ARCHITECTURE.md`
