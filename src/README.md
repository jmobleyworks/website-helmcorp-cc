# MASCOM Integrated Hydra (D1 Edition)

## Overview

**Hydra** is the MASCOM projection layer at the Cloudflare Edge. It syncs site configurations (genes) from your local Mac mini to a serverless D1 database, serving them dynamically at the edge.

**Design Philosophy**: Single source of truth in D1 (no R2 dependency).
- **D1 = Nervous System**: Atomic routing, fast lookups, transactional consistency
- **Local Mac → D1**: Sync via `mascom_push.py` script
- **Cloudflare Worker**: Queries D1 on every request, injects gene into Skeleton King

---

## Architecture

```
┌──────────────────────┐
│  ~/mascom/sites/     │
│  ├─ domain1/         │
│  │  └─ data.json     │
│  └─ domain2/         │
│     └─ data.json     │
└────────┬─────────────┘
         │ mascom_push.py (sync)
         ↓
┌──────────────────────┐
│   D1 (hydra_db)      │
│                      │
│  site_registry       │
│  ├─ domain: TEXT PK  │
│  ├─ gene_blob: JSON  │
│  ├─ version: INT     │
│  └─ checksum: TEXT   │
│                      │
│  gene_history        │
│  routing_rules       │
└────────┬─────────────┘
         │ (D1 SQL queries)
         ↓
┌──────────────────────┐
│ Cloudflare Worker    │
│ (mascom-hydra)       │
│                      │
│ 1. Extract Host      │
│ 2. Query D1          │
│ 3. Load gene_blob    │
│ 4. Inject into HTML  │
│ 5. Serve via CF Edge │
└────────┬─────────────┘
         │
         ↓
   User Browser
   (HTTPS, auto SSL)
```

---

## Setup

### 1. Create D1 Database

```bash
# Create new D1 database
wrangler d1 create hydra_db

# Or if already exists, get the ID from:
wrangler d1 list
```

### 2. Initialize Schema

```bash
# Run schema.sql to create tables
wrangler d1 execute hydra_db --file ./schema.sql

# Verify tables created
wrangler d1 execute hydra_db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### 3. Configure wrangler.toml

Update `database_id` with your D1 database UUID:

```toml
[[d1_databases]]
binding = "HYDRA_DB"
database_name = "hydra_db"
database_id = "YOUR-DB-UUID-HERE"
```

### 4. Set MASCOM_SECRET

```bash
# Store PSK for /hydra/registry-update endpoint
wrangler secret put MASCOM_SECRET --env production

# Then export for mascom_push.py
export MASCOM_SECRET="<same-value>"
```

### 5. Deploy Worker

```bash
wrangler deploy --env production
```

---

## Usage

### Push All Domains

```bash
python3 mascom_push.py push-all

# Output:
# Found 6 domain(s):
#   - mascom-api.mobleysoft.com
#   - mascom-api.helmcorp.cc
#   - ...
# ========================================
# ✓ Loaded gene: mascom-api.mobleysoft.com (4892 bytes)
# ✓ Pushed mascom-api.mobleysoft.com v1 (checksum: a1b2c3d4...)
# ...
# ✓ Pushed 6/6
```

### Push Single Domain

```bash
python3 mascom_push.py push mascom-api.mobleysoft.com
```

### Check Registry Status

```bash
# Query D1 directly
wrangler d1 execute hydra_db --command "SELECT domain, version, status, last_updated FROM site_registry LIMIT 10"

# Output:
# ┌─────────────────────────────┬────────┬─────────┬──────────────────────┐
# │ domain                      │ version│ status  │ last_updated         │
# ├─────────────────────────────┼────────┼─────────┼──────────────────────┤
# │ mascom-api.mobleysoft.com   │ 1      │ active  │ 2026-05-11T20:30:00Z │
# │ mascom-api.helmcorp.cc      │ 1      │ active  │ 2026-05-11T20:30:15Z │
# └─────────────────────────────┴────────┴─────────┴──────────────────────┘
```

---

## API Endpoints (Worker)

### GET / (or /index.html)
Returns HTML with injected gene as `window.MASCOM_GENES`.

**Headers**:
- `X-Gene-Version`: Current version number
- `Cache-Control`: 300s + SWR

### GET /api/config
Returns gene as JSON.

**Example Response**:
```json
{
  "domain": "mascom-api.mobleysoft.com",
  "site_name": "MASCOM API Gateway",
  "version": "1.0",
  "services": [...],
  "status": {...}
}
```

### POST /hydra/registry-update (Protected)
Update D1 registry entry.

**Headers**:
- `X-MASCOM-SECRET`: PSK (must match env var)

**Body**:
```json
{
  "domain": "new-domain.example.com",
  "gene_blob": { ... },
  "status": "active"
}
```

---

## Gene Schema

Each `gene_blob` (JSON) should contain:

```json
{
  "domain": "mascom-api.mobleysoft.com",
  "site_name": "MASCOM API Gateway",
  "version": "1.0",
  "description": "Operational hub",
  "services": [
    {
      "name": "Mining Pool Orchestrator",
      "path": "/api/mining",
      "description": "Real-time mining status"
    }
  ],
  "status": {
    "health": "OPERATIONAL",
    "mining_active": false,
    "papers_generated": 11,
    "amplification_factor": 1.0,
    "last_evolution_cycle": "2026-05-11T20:30:21.882469Z"
  },
  "architecture": {
    "type": "Tripartite Arc Reactor",
    "loops": [
      {
        "name": "Mining Loop",
        "cycle_minutes": 1,
        "status": "pending_activation"
      }
    ],
    "integration_bridges": [...]
  }
}
```

---

## Versioning & Rollback

Every push increments the version automatically:

```bash
# Push v1 of mascom-api.mobleysoft.com
python3 mascom_push.py push mascom-api.mobleysoft.com
# → Version: 1

# Edit ~/mascom/sites/mascom-api.mobleysoft.com/data.json
# Push again
python3 mascom_push.py push mascom-api.mobleysoft.com
# → Version: 2 (auto-increment)

# Previous version is in gene_history table for audit/rollback
wrangler d1 execute hydra_db --command "SELECT version, published_at FROM gene_history WHERE domain = 'mascom-api.mobleysoft.com'"
```

---

## Monitoring

### View Gene Checksums (detect changes)

```bash
wrangler d1 execute hydra_db --command "SELECT domain, version, checksum, last_updated FROM site_registry"
```

### Watch Sync History

```bash
wrangler d1 execute hydra_db --command "SELECT domain, version, published_at FROM gene_history ORDER BY published_at DESC LIMIT 20"
```

### Check Worker Logs

```bash
wrangler tail --env production
```

---

## Costs

- **D1**: $0.75/month + $0.20 per million read/write operations
- **Worker**: Included in free tier (10M requests/month)
- **Bandwidth**: $0.20/GB (egress from Cloudflare)

At typical usage (1K sites, 10 requests/sec): **~$10-20/month**

---

## Troubleshooting

### Gene not found
```bash
# Check site_registry
wrangler d1 execute hydra_db --command "SELECT * FROM site_registry WHERE domain = 'your-domain.com'"

# If missing, push it
python3 mascom_push.py push your-domain.com
```

### Push fails with 403
```bash
# Check MASCOM_SECRET is set correctly
echo $MASCOM_SECRET

# Verify it matches the Worker environment variable
wrangler secret list --env production
```

### D1 connection timeout
```bash
# Verify database_id in wrangler.toml
wrangler d1 list

# Test D1 access
wrangler d1 execute hydra_db --command "SELECT 1"
```

---

## Integration with MASCOM

The Hydra system is designed to be updated automatically by the MASCOM controller:

1. **Evolution Analyzer** detects parameter changes
2. **Evolution Executor** applies them to local gene files
3. **mascom_push.py** (scheduled cron) syncs to D1
4. **Worker** serves new gene at the edge (no restart needed)

Example automation:

```bash
# Cron: Every 30 minutes, sync all genes to D1
*/30 * * * * cd ~/mascom/hydra && python3 mascom_push.py push-all

# Cron: Tail worker logs for errors
0 * * * * wrangler tail --env production | grep -i error >> ~/mascom/hydra/worker-errors.log
```

---

## Philosophy

**Why D1-only?**

1. **Atomic Transactions**: Gene version + metadata always in sync (no race conditions)
2. **No External Dependencies**: R2 adds eventual consistency issues
3. **Simpler**: One database binding instead of two
4. **Cheaper**: No R2 storage/egress costs
5. **Faster**: D1 queries are edge-local (no cross-service latency)

**Trade-off**: Gene blobs stored as JSON in D1 (not external binary). Fine for config files (typical 5-50KB). If genes grow to MB+ size, could refactor to hybrid D1+R2 later.

---

## Next: Integration with MASCOM Controller

Once Hydra is live, the control plane should:

1. **Auto-push on evolution**: When Evolution Executor commits a change, trigger `mascom_push.py push <domain>`
2. **Monitor version drift**: Alert if local gene ≠ D1 gene
3. **Track metrics**: Store sync latency in ecosystem_monitor

See: `~/mascom/evolution_executor.py` for integration points.
