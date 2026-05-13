# MASCOM Hydra Migration Cheatsheet

Quick reference for common operations.

## Installation

```bash
cd ~/mascom/hydra

# Local development (SQLite only)
./install-any-machine.sh local

# CloudFlare edge (no local DB)
./install-any-machine.sh cf

# Hybrid (local + CF sync)
./install-any-machine.sh hybrid
```

## Migration Operations

### Export / Import

```bash
# Export local to JSON
node migrate.js export-local

# Import from JSON (auto-detects latest)
node migrate.js import-local

# Import specific file
node migrate.js import-local ./exports/local-2026-05-11-143022.json
```

### Sync with CloudFlare

```bash
# Push local → CF D1
node migrate.js export-to-cf

# Pull CF D1 → local
node migrate.js import-from-cf

# Bidirectional sync (one-time)
node migrate.js sync-bidirectional

# Continuous bidirectional sync (every 5 min)
node migrate.js sync-bidirectional --interval=300

# Every 1 minute
node migrate.js sync-bidirectional --interval=60
```

### Validation & Cloning

```bash
# Verify consistency
node migrate.js validate-consistency

# Clone from CF to new local machine
node migrate.js clone-machine --source=CF --target=local

# Clone from local to CF (disaster recovery)
node migrate.js clone-machine --source=local --target=CF
```

## Local Mode

```bash
# Start local server (if not running)
node local-runtime.js

# Test API
curl http://localhost:3000/health
curl http://localhost:3000/api/getdomains

# Stop server
kill $(cat .local-server.pid)

# View database
sqlite3 ~/mascom/hydra-local.db ".tables"
sqlite3 ~/mascom/hydra-local.db "SELECT domain FROM site_registry LIMIT 10;"
```

## CloudFlare Mode

```bash
# Deploy all workers
wrangler deploy --name mascom-hydra
wrangler deploy --name getdomains --env getdomains
wrangler deploy --name getventures --env getventures

# Deploy staging only
wrangler deploy --env staging

# View logs
wrangler tail mascom-hydra
wrangler tail getdomains --env getdomains

# Query D1 database
wrangler d1 execute hydra_db --command "SELECT COUNT(*) FROM site_registry"

# List databases
wrangler d1 list

# Get database info
wrangler d1 info hydra_db
```

## Hybrid Mode

```bash
# Monitor sync
tail -f logs/sync.log

# Check last sync state
cat .sync-state.json

# View all audit entries
tail -f migration_audit.jsonl

# Stop local server
kill $(cat .local-server.pid)

# Stop sync supervisor
kill $(cat .sync-supervisor.pid)

# Stop everything
kill $(cat .local-server.pid .sync-supervisor.pid)
```

## Troubleshooting

```bash
# Check all processes
ps aux | grep "node\|wrangler"

# Check if port is in use
lsof -i :3000

# View recent errors in audit log
grep "ERROR" migration_audit.jsonl | tail -20

# Validate consistency
node migrate.js validate-consistency

# Check database
sqlite3 ~/mascom/hydra-local.db "SELECT COUNT(*) FROM site_registry;"

# View CF credentials
echo $CF_ACCOUNT_ID
echo $MASCOM_SECRET
```

## Environment Setup

```bash
# Set credentials
export CF_ACCOUNT_ID="your-account-id"
export CF_D1_TOKEN="your-api-token"
export MASCOM_SECRET="your-secret"
export HYDRA_PORT=3000

# Verify setup
wrangler whoami
node local-runtime.js
```

## Disaster Recovery

```bash
# Local database corrupted
rm ~/mascom/hydra-local.db
node migrate.js clone-machine --source=CF --target=local

# Lost CF database - redeploy and push
wrangler deploy
node migrate.js export-to-cf

# Restore from backup
node migrate.js import-local ./exports/local-2026-05-10-120000.json

# Verify after recovery
node migrate.js validate-consistency
```

## Audit Log Queries

```bash
# All operations
tail -f migration_audit.jsonl

# Specific operation type
grep "EXPORT_LOCAL" migration_audit.jsonl
grep "SYNC_BIDIRECTIONAL" migration_audit.jsonl
grep "EXPORT_TO_CF" migration_audit.jsonl

# Errors only
grep "ERROR" migration_audit.jsonl

# Last 10 operations
tail -n 10 migration_audit.jsonl | jq '.'

# Pretty-print audit log
cat migration_audit.jsonl | jq '.'

# Count operations by type
grep -o '"operation":"[^"]*"' migration_audit.jsonl | sort | uniq -c
```

## File Structure

```
~/mascom/hydra/
├── schema.sql                 # Database schema
├── routes.js                  # API routes
├── functors.js                # Functional utilities
├── worker.js                  # CF worker code
├── wrangler.toml              # CF configuration
├── mascom_push.py             # Push to D1
│
├── migrate.js                 # Migration tool (NEW)
├── install-any-machine.sh     # Installation script (NEW)
├── local-runtime.js           # Local server (auto-created)
├── sync-supervisor.js         # Sync process (auto-created)
│
├── exports/                   # JSON dumps
│   ├── local-2026-05-11-143022.json
│   └── ...
│
├── logs/
│   └── sync.log              # Sync supervisor logs
│
├── migration_audit.jsonl      # Audit trail
├── .sync-state.json           # Sync state
├── .local-server.pid          # Local server PID
├── .sync-supervisor.pid       # Sync supervisor PID
│
├── MIGRATION_GUIDE.md         # Full documentation (NEW)
└── MIGRATION_CHEATSHEET.md    # This file (NEW)
```

## Command Patterns

### Daily operations

```bash
# Check sync health
node migrate.js validate-consistency

# Export backup
node migrate.js export-local

# View recent operations
tail -n 20 migration_audit.jsonl | jq '.operation'
```

### Weekly maintenance

```bash
# Full validation
node migrate.js validate-consistency

# Archive old exports
tar czf exports-2026-04.tar.gz exports/local-2026-04-*.json
rm exports/local-2026-04-*.json

# Check audit log size
wc -l migration_audit.jsonl
```

### Before deploying

```bash
# Validate consistency
node migrate.js validate-consistency

# Export backup
node migrate.js export-local

# Test CF connectivity
wrangler tail mascom-hydra

# Deploy
wrangler deploy --env production
```

### After deploying

```bash
# Wait for sync
sleep 5

# Verify consistency
node migrate.js validate-consistency

# View deployment logs
wrangler tail mascom-hydra
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Port 3000 in use | `lsof -i :3000` then `kill <PID>` |
| Sync not running | `ps aux \| grep sync` → restart with `node sync-supervisor.js` |
| Checksum mismatch | Run `node migrate.js validate-consistency` to diagnose |
| CF deploy fails | Check `wrangler whoami` and `CF_ACCOUNT_ID` |
| Local DB corrupted | `node migrate.js clone-machine --source=CF --target=local` |
| Lost recent changes | Restore from `exports/local-YYYY-MM-DD-*.json` |

## Performance Tips

```bash
# Run exports during low-traffic
0 2 * * * cd ~/mascom/hydra && node migrate.js export-local

# Adjust sync frequency if needed
# More frequent: --interval=60
# Less frequent: --interval=600

# Archive old exports monthly
0 0 1 * * cd ~/mascom/hydra && tar czf exports-$(date +%Y-%m).tar.gz exports/local-$(date +%Y-%m)-*.json
```

## One-Liners

```bash
# Quick status check
echo "Local:" && sqlite3 ~/mascom/hydra-local.db "SELECT COUNT(*) FROM site_registry" && echo "CF:" && wrangler d1 execute hydra_db --command "SELECT COUNT(*) FROM site_registry"

# Watch sync in real-time
watch -n 5 'tail -1 migration_audit.jsonl | jq'

# Count domains by status
sqlite3 ~/mascom/hydra-local.db "SELECT status, COUNT(*) FROM site_registry GROUP BY status"

# List recent exports
ls -lrt exports/local-*.json | tail -5

# Clean up old exports (keep last 10)
ls -t exports/local-*.json | tail -n +11 | xargs rm

# Full backup to external drive
rsync -av ~/mascom/hydra /Volumes/backup/
```
