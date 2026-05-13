# MASCOM Hydra Migration & Installation Guide

## Overview

The migration tools enable bidirectional synchronization between local SQLite and CloudFlare D1, with support for multiple deployment modes:

- **Local**: Pure SQLite development environment (no CF dependencies)
- **CF**: Deployed edge workers on CloudFlare (no local dependencies)
- **Hybrid**: Combined local + CF with automatic 5-minute sync cycles

## Installation

### One-Command Setup

```bash
cd ~/mascom/hydra
./install-any-machine.sh [local|cf|hybrid]
```

**Choose mode based on your environment:**

| Mode | Use Case | Dependencies |
|------|----------|--------------|
| `local` | Development on single machine | Node.js, sqlite3 |
| `cf` | Production edge deployment | Wrangler CLI, CF credentials |
| `hybrid` | Multi-machine with sync | All of above |

### Prerequisites

- **Node.js** 16+: Install from https://nodejs.org
- **npm**: Comes with Node.js
- **sqlite3** CLI: For local mode
  - macOS: `brew install sqlite3`
  - Linux: `apt-get install sqlite3`
- **Wrangler** 3+: For CF mode
  ```bash
  npm install -g wrangler
  ```
- **Environment variables** (for CF modes):
  ```bash
  export CF_ACCOUNT_ID="your-account-id"
  export CF_D1_TOKEN="your-d1-api-token"
  export MASCOM_SECRET="your-secret-key"
  export HYDRA_PORT=3000  # Optional, default: 3000
  ```

## Migration Commands

### Export Local Database

Export local SQLite to timestamped JSON dump with integrity checksums:

```bash
node migrate.js export-local
```

**Output:**
- Location: `~/mascom/hydra/exports/local-<timestamp>.json`
- Contains:
  - `site_registry`: All domains and their current gene blobs
  - `gene_history`: Complete version history for rollback
  - `routing_rules`: All configured routing patterns
  - `checksums`: SHA256 hashes for verification

**Example:**
```bash
$ node migrate.js export-local

=== EXPORT LOCAL DATABASE ===

✓ Exported to: /Users/john/mascom/hydra/exports/local-2026-05-11-143022.json
  - Registry: 10 domains
  - History: 47 entries
  - Rules: 5 routing patterns
```

### Import Local Database

Restore from exported JSON dump, validating checksums:

```bash
node migrate.js import-local [<filepath>]
```

If no filepath provided, uses most recent export automatically.

**Examples:**
```bash
# Import specific file
node migrate.js import-local ./exports/local-2026-05-11-143022.json

# Import latest (auto-detected)
node migrate.js import-local
```

**Validation:**
- Verifies SHA256 checksums match
- Warns on mismatches but continues
- Suitable for disaster recovery

### Export to CloudFlare D1

Sync local database to CF D1, pushing via `mascom_push.py`:

```bash
node migrate.js export-to-cf
```

**Process:**
1. Exports local database (same as `export-local`)
2. Calls `mascom_push.py push-all` to sync to CF
3. Verifies checksums in transit
4. Logs audit trail

**Example:**
```bash
$ node migrate.js export-to-cf

=== EXPORT LOCAL → CF D1 ===

=== EXPORT LOCAL DATABASE ===
✓ Exported to: /Users/john/mascom/hydra/exports/local-2026-05-11-143101.json
  - Registry: 10 domains
  - History: 47 entries
  - Rules: 5 routing patterns

Pushing to CF D1...
✓ Pushed api.example.com v7 (checksum: abc12345...)
✓ Pushed cdn.example.com v4 (checksum: def67890...)
...
✓ Pushed 10/10
```

### Import from CloudFlare D1

Pull complete registry from CF D1 to reconstruct local database:

```bash
node migrate.js import-from-cf
```

**Use case:** Setting up a new machine with existing CF registry

**Process:**
1. Queries `/api/getventures` for all domains
2. Queries `/api/gethistory` for each domain's version history
3. Reconstructs local SQLite database
4. Validates checksums

**Requirements:**
- CF_D1_TOKEN environment variable set
- CF_ACCOUNT_ID environment variable set

### Bidirectional Sync (Continuous)

Start automatic sync cycle comparing local and CF, keeping newer version:

```bash
# One-time sync
node migrate.js sync-bidirectional

# Continuous sync every 5 minutes
node migrate.js sync-bidirectional --interval=300

# Continuous sync every 1 minute
node migrate.js sync-bidirectional --interval=60
```

**Conflict Resolution:**
- Compares checksums across local/CF
- Keeps version with newer timestamp
- Detects conflicts (same domain, different content)
- Logs all merge decisions to `migration_audit.jsonl`

**Example:**
```bash
$ node migrate.js sync-bidirectional --interval=300

=== BIDIRECTIONAL SYNC ===

Starting continuous sync every 300s...
Sync running in background (Ctrl+C to stop)

[2026-05-11T14:30:22Z] Starting sync cycle...
  1. Exporting local database...
  2. Querying CF D1...
  3. Merging and detecting conflicts...
✓ Sync complete at 2026-05-11T14:30:27Z

[2026-05-11T14:35:22Z] Starting sync cycle...
...
```

### Validate Consistency

Verify local and CF databases are in sync:

```bash
node migrate.js validate-consistency
```

**Checks:**
- Row count: registry, history, rules
- Checksums: all gene_blobs match
- Versions: consistent across systems
- Detailed diff if mismatch found

**Example:**
```bash
$ node migrate.js validate-consistency

=== VALIDATE CONSISTENCY ===

Checking local database...
Checking CF D1...

Local Database:
  Registry: 10 domains
  History: 47 entries
  Rules: 5 patterns

Cloudflare D1:
  Registry: 10 domains
  History: 47 entries
  Rules: 5 patterns

✓ Databases are consistent
```

### Clone Machine

One-command installation on new machine, pulling from source:

```bash
# Clone from CF to new local machine
node migrate.js clone-machine --source=CF --target=local

# Clone from local to CF (disaster recovery)
node migrate.js clone-machine --source=local --target=CF
```

**Process:**
1. Validates source has data
2. Creates target database schema
3. Imports data with integrity verification
4. Tests connectivity
5. Logs completion to audit trail

**Example:**
```bash
# On new machine (no existing DB)
$ node migrate.js clone-machine --source=CF --target=local

=== CLONE MACHINE ===

Source: CF, Target: local
1. Querying CF D1 for complete registry...
2. Creating local database schema...
3. Importing registry to local SQLite...
4. Verifying checksum integrity...
✓ Clone complete - local database ready
```

## Installation Modes

### Local Mode

Pure SQLite development without CF dependencies:

```bash
./install-any-machine.sh local
```

**What's installed:**
- SQLite database at `~/mascom/hydra-local.db`
- Local Express.js API server on `http://localhost:3000`
- Routes: `/api/getventures/:domain`, `/api/getdomains`
- No CF connectivity required

**File structure:**
```
hydra/
├── hydra-local.db          # SQLite database
├── schema.sql              # Database schema
├── local-runtime.js        # Local server (auto-created)
├── .local-server.pid       # Server PID
└── exports/                # JSON dumps
```

**Test connectivity:**
```bash
curl http://localhost:3000/health
# {"status":"ok","mode":"local","port":3000}

curl http://localhost:3000/api/getdomains
# {"success":true,"count":10,"domains":[...]}
```

**Stop server:**
```bash
kill $(cat .local-server.pid)
```

### CloudFlare Mode

Deploy edge workers to CF without local database:

```bash
./install-any-machine.sh cf
```

**What's deployed:**
- `mascom-hydra`: Main orchestrator worker
- `getdomains`: Query worker for domain listing
- `getventures`: Query worker for domain details
- D1 database: `hydra_db` (auto-created by wrangler)

**Routes deployed:**
```
*.mobleysoft.com/*              → mascom-hydra
*.helmcorp.cc/*                 → mascom-hydra
stream.filmline.cc/*            → mascom-hydra
hal.halside.com/*               → mascom-hydra
getdomains.johnmobley99.workers.dev/*
getventures.johnmobley99.workers.dev/*
```

**View logs:**
```bash
wrangler tail mascom-hydra
wrangler tail getdomains
wrangler tail getventures
```

**Deploy staging:**
```bash
wrangler deploy --env staging
```

**Execute D1 queries:**
```bash
wrangler d1 execute hydra_db --command "SELECT COUNT(*) FROM site_registry"
```

### Hybrid Mode

Combined local + CF with bidirectional sync:

```bash
./install-any-machine.sh hybrid
```

**What's installed:**
- Everything from `local` mode
- Everything from `cf` mode
- Sync supervisor process
- Auto-sync every 5 minutes

**Processes running:**
```
local-runtime.js      (PID in .local-server.pid)
sync-supervisor.js    (PID in .sync-supervisor.pid)
```

**Files created:**
```
hydra/
├── hydra-local.db
├── local-runtime.js
├── sync-supervisor.js
├── logs/
│   └── sync.log       # Sync cycle logs
├── exports/
├── .local-server.pid
├── .sync-supervisor.pid
└── .sync-state.json   # Last sync state
```

**Monitor sync:**
```bash
tail -f logs/sync.log

# Watch for:
# [2026-05-11T14:35:00Z] Starting sync cycle...
# ✓ Sync complete at 2026-05-11T14:35:05Z
```

**Adjust sync interval:**
```bash
SYNC_INTERVAL=60 node sync-supervisor.js  # Every 1 minute
```

**Stop all processes:**
```bash
kill $(cat .local-server.pid .sync-supervisor.pid)
```

## Audit Trail

All operations logged to `migration_audit.jsonl` (one JSON object per line):

```json
{
  "timestamp": "2026-05-11T14:30:22.123Z",
  "operation": "EXPORT_LOCAL",
  "details": {
    "file": "local-2026-05-11-143022.json",
    "registry_rows": 10,
    "history_rows": 47,
    "rules_rows": 5,
    "total_size": 125432
  },
  "hostname": "macbook.local",
  "user": "john"
}
```

**View audit log:**
```bash
tail -f migration_audit.jsonl
```

**Query specific operations:**
```bash
grep "SYNC_BIDIRECTIONAL" migration_audit.jsonl
grep "EXPORT_TO_CF" migration_audit.jsonl
grep "ERROR" migration_audit.jsonl
```

## Troubleshooting

### Local mode won't start

```bash
# Check Node.js
node --version

# Check sqlite3
sqlite3 --version

# Check database
sqlite3 ~/mascom/hydra-local.db ".tables"

# Check port
lsof -i :3000

# Start with debug
DEBUG=* node local-runtime.js
```

### CF deployment fails

```bash
# Check credentials
wrangler whoami

# Check database exists
wrangler d1 list

# Verify account ID
echo $CF_ACCOUNT_ID

# Test D1 connectivity
wrangler d1 execute hydra_db --command "SELECT 1"
```

### Sync conflicts

```bash
# View conflict details
grep "conflict" migration_audit.jsonl -i

# Check .sync-state.json for last sync status
cat .sync-state.json

# Manual validation
node migrate.js validate-consistency
```

### Checksum mismatches

```bash
# Export both sides
node migrate.js export-local

# Check for differences
diff exports/local-*.json exports/cf-*.json

# Re-sync with validation
node migrate.js sync-bidirectional
node migrate.js validate-consistency
```

## Environment Variables Reference

| Variable | Purpose | Required | Default |
|----------|---------|----------|---------|
| `MODE` | Installation mode | No | `hybrid` |
| `HYDRA_PORT` | Local server port | No | `3000` |
| `HYDRA_SECRET` | API authentication secret | No (but recommended) | `""` |
| `CF_ACCOUNT_ID` | CloudFlare account ID | For CF/hybrid modes | `""` |
| `CF_D1_TOKEN` | CloudFlare D1 API token | For CF/hybrid modes | `""` |
| `MASCOM_SECRET` | Gene push authentication | For CF deployment | `""` |
| `SYNC_INTERVAL` | Bidirectional sync interval (seconds) | No | `300` |

**Set permanently (.zshrc / .bashrc):**

```bash
export CF_ACCOUNT_ID="f07be5f84583d0d100b05aeeae56870b"
export CF_D1_TOKEN="your-token-here"
export MASCOM_SECRET="your-secret"
export HYDRA_PORT=3000
```

## Disaster Recovery

### Complete local database corruption

```bash
# 1. Remove corrupted database
rm ~/mascom/hydra-local.db

# 2. Clone from CF (requires CF credentials)
node migrate.js clone-machine --source=CF --target=local

# 3. Verify
node migrate.js validate-consistency
```

### Lost CF database

```bash
# 1. Ensure latest local export exists
node migrate.js export-local

# 2. Redeploy D1 (will create new empty database)
wrangler deploy

# 3. Push local to new CF instance
node migrate.js export-to-cf

# 4. Verify
node migrate.js validate-consistency
```

### Corrupted on both sides

```bash
# 1. Check exports directory for recent clean backup
ls -lrt exports/

# 2. Restore from backup
node migrate.js import-local exports/local-2026-05-10-120000.json

# 3. Resync to both local and CF
node migrate.js export-to-cf

# 4. Validate
node migrate.js validate-consistency
```

## Performance Notes

**Export time:** ~2-5 seconds per 100 domains
**Import time:** ~1-2 seconds per 100 domains
**Sync time:** ~5-10 seconds per 100 domains
**Checksum calculation:** ~50ms per MB of data

**Optimization tips:**
- Run exports during low-traffic periods
- Use smaller `--interval` for sync only if changes are frequent
- Archive old exports monthly to save disk space:
  ```bash
  tar czf exports-2026-04.tar.gz exports/local-2026-04-*.json
  rm exports/local-2026-04-*.json
  ```

## Security Considerations

1. **Secrets in environment variables:**
   - Store `MASCOM_SECRET` in secure vault
   - Don't commit `.env` files
   - Use `wrangler secret put` for CF deployments

2. **Audit logging:**
   - All operations logged to `migration_audit.jsonl`
   - Rotate logs monthly to prevent disk bloat
   - Back up audit logs for compliance

3. **Network security:**
   - Local mode runs on `localhost` only (not exposed)
   - CF deployments use HTTPS automatically
   - Add rate limiting to getventures/getdomains workers

4. **Database backups:**
   - Exports serve as atomic backups
   - Keep exports directory on separate disk if possible
   - Test restore procedures monthly

## Integration with MASCOM

**mascom_push.py compatibility:**
- The `export-to-cf` command uses mascom_push.py internally
- Ensure `MASCOM_SECRET` is set before pushing
- Verify with: `python3 mascom_push.py status`

**CI/CD integration:**
```bash
# In your deployment script:
node migrate.js export-local
node migrate.js export-to-cf
node migrate.js validate-consistency
```

## Getting Help

**Check logs:**
```bash
tail -f logs/sync.log           # Sync supervisor logs
tail -f migration_audit.jsonl   # All operations audit trail
```

**Test connectivity:**
```bash
curl http://localhost:3000/health                    # Local
curl https://mascom-hydra.mobleysoft.com/health      # CF
```

**View configuration:**
```bash
cat wrangler.toml               # CF worker config
cat schema.sql                  # Database schema
```

**Run diagnostics:**
```bash
node migrate.js validate-consistency
sqlite3 ~/mascom/hydra-local.db ".schema"
wrangler d1 info hydra_db
```
