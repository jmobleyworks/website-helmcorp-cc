# Hydra Quick Start (5 Minutes)

## What You Have

```
/Users/johnmobley/mascom/hydra/
├── schema.sql           ← D1 table definitions
├── worker.js            ← Cloudflare Worker (edge orchestrator)
├── wrangler.toml        ← Worker + D1 bindings config
├── mascom_push.py       ← Local → D1 sync script
├── README.md            ← Full documentation
├── DESIGN.md            ← Architecture deep dive
└── QUICKSTART.md        ← This file
```

---

## Step 1: Create D1 Database (1 min)

```bash
cd ~/mascom/hydra

# Create database
wrangler d1 create hydra_db

# Note the database_id from output (you'll need it)
# Example: 512e3762-cf86-4e81-9d6b-abc123456789
```

## Step 2: Initialize Schema (1 min)

```bash
# Create tables
wrangler d1 execute hydra_db --file ./schema.sql

# Verify
wrangler d1 execute hydra_db --command "SELECT name FROM sqlite_master WHERE type='table'"

# Output should show: site_registry, gene_history, routing_rules
```

## Step 3: Update wrangler.toml (1 min)

```toml
[[d1_databases]]
binding = "HYDRA_DB"
database_name = "hydra_db"
database_id = "YOUR-UUID-FROM-STEP-1"  # ← REPLACE THIS
```

## Step 4: Set Secret (1 min)

```bash
# Generate a strong secret
openssl rand -base64 32
# Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

# Store in Wrangler
wrangler secret put MASCOM_SECRET --env production

# Prompt will ask for the value - paste it

# Export locally for mascom_push.py
export MASCOM_SECRET="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

## Step 5: Deploy Worker (1 min)

```bash
wrangler deploy --env production

# Output:
# ✓ Deployed mascom-hydra to mascom-hydra.johnmobley.workers.dev
#   https://mascom-hydra.johnmobley.workers.dev
```

---

## Step 6: Sync Your First Gene

```bash
# Push all domains
python3 mascom_push.py push-all

# Or push one
python3 mascom_push.py push mascom-api.mobleysoft.com

# Output:
# ✓ Loaded gene: mascom-api.mobleysoft.com (4892 bytes)
# ✓ Pushed mascom-api.mobleysoft.com v1 (checksum: a1b2c3d4...)
```

---

## Step 7: Test It

```bash
# Query D1 to confirm gene is there
wrangler d1 execute hydra_db --command "SELECT domain, version, status FROM site_registry LIMIT 5"

# Test worker locally (if using wrangler dev)
wrangler dev --env production
# Then in browser: http://localhost:8787/

# Or test live domain (once DNS is configured)
curl https://mascom-api.mobleysoft.com/api/config

# Should return JSON with your gene payload
```

---

## Automate Syncing

```bash
# Add to crontab
crontab -e

# Add this line (syncs every 30 minutes)
*/30 * * * * cd ~/mascom/hydra && export MASCOM_SECRET="..." && python3 mascom_push.py push-all >> ~/mascom/hydra/sync.log 2>&1

# Or use bash for easier env var handling
*/30 * * * * source ~/.bash_profile && cd ~/mascom/hydra && python3 mascom_push.py push-all
```

---

## Monitor It

```bash
# Watch sync logs
tail -f ~/mascom/hydra/sync.log

# Check gene versions (live)
wrangler d1 execute hydra_db --command "SELECT domain, version, last_updated FROM site_registry ORDER BY last_updated DESC"

# Watch worker logs
wrangler tail --env production

# Detect stale genes (not synced in 24h)
wrangler d1 execute hydra_db --command "
  SELECT domain, last_updated
  FROM site_registry
  WHERE datetime(last_updated) < datetime('now', '-1 day')
"
```

---

## Troubleshooting

### Push fails with 403
```bash
echo $MASCOM_SECRET  # Check it's exported
wrangler secret list --env production  # Verify in Worker
```

### Gene doesn't show up
```bash
# Check D1 directly
wrangler d1 execute hydra_db --command "SELECT * FROM site_registry WHERE domain = 'your-domain.com'"

# If missing, push again
python3 mascom_push.py push your-domain.com
```

### Worker not responding
```bash
# Check deployment
wrangler list  # Should show mascom-hydra

# Check routes in wrangler.toml
# Make sure DNS is configured (Cloudflare dashboard)
```

---

## Next: Integration

Once Hydra is live, integrate with MASCOM controller:

1. **After evolution commit**: `mascom_push.py push <domain>`
2. **Monitor version drift**: Alert if local ≠ D1
3. **Track sync latency**: Log to ecosystem_monitor

See: `~/mascom/evolution_executor.py` integration points.

---

## Architecture Summary

```
~/mascom/sites/
    ↓ (gene.json files)
mascom_push.py
    ↓ POST /hydra/registry-update
D1 (hydra_db)
    ↓ SELECT * FROM site_registry
Cloudflare Worker
    ↓ (serves at edge)
User Browser (HTTPS, automatic)
```

**That's it!** Atomic, versioned, consistent edge projection.
