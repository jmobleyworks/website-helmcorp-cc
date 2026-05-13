# MASCOM Hydra Migration Integration Guide

How the migration tools integrate with MASCOM's broader architecture and operational workflows.

## Architecture Context

```
MASCOM Ecosystem
├── Mining Layer (mascom_nerve + orchestrator)
├── Evolution Layer (tripartite flow system)
└── Hydra Edge Projection ← YOU ARE HERE
    ├── Local Layer (SQLite)
    ├── CF Edge Layer (Workers + D1)
    └── Sync Layer (bidirectional)
```

The Hydra migration tools ensure the edge projection stays synchronized across all operational environments.

## Operational Workflows

### Workflow 1: New Developer Onboarding

**Objective:** Get a new developer's machine configured in < 5 minutes

**Steps:**
```bash
# 1. Clone mascom repo (if needed)
cd ~/mascom

# 2. Run hybrid installation (gets both local + CF)
cd hydra
./install-any-machine.sh hybrid

# 3. Verify both sides are connected
curl http://localhost:3000/health
wrangler tail mascom-hydra

# 4. Developer is ready
# Local: http://localhost:3000
# CF: https://mascom-hydra.mobleysoft.com
```

**What happens under the hood:**
1. npm installs dependencies
2. SQLite database created at `~/mascom/hydra-local.db`
3. Local Express.js server starts on port 3000
4. CF workers deployed (if credentials set)
5. Sync supervisor starts, running `/sync-bidirectional` every 5 minutes

**Time breakdown:**
- npm install: ~30s
- Database creation: ~2s
- CF deployment: ~30s (parallel)
- Sync supervisor startup: ~2s
- **Total: ~60 seconds**

### Workflow 2: Production Deployment

**Objective:** Deploy changes to production safely, keeping CF and local in sync

**Scenario:** You've modified routing rules or gene templates locally

**Steps:**
```bash
# 1. Ensure local changes are saved
node migrate.js validate-consistency

# 2. Export local as backup
node migrate.js export-local

# 3. Verify exported state
ls -lrt exports/local-*.json | tail -1

# 4. Push to CF production
node migrate.js export-to-cf

# 5. Verify CF received changes
wrangler d1 execute hydra_db --command "SELECT COUNT(*) FROM site_registry"

# 6. Monitor CF logs for errors
wrangler tail mascom-hydra --env production

# 7. Final validation
node migrate.js validate-consistency
```

**Automated version (CI/CD):**
```bash
# In your deployment script
set -e
node migrate.js validate-consistency || exit 1
node migrate.js export-local
node migrate.js export-to-cf
node migrate.js validate-consistency || exit 1
echo "Deployment successful"
```

### Workflow 3: Disaster Recovery - Lost CF Database

**Objective:** Recover from accidental CF database deletion

**Scenario:** Someone accidentally deleted the hydra_db

**Steps:**
```bash
# 1. Immediate: Check audit trail
grep "ERROR\|DELETED" migration_audit.jsonl | tail -20

# 2. Confirm local database is intact
node migrate.js validate-consistency 2>&1 | grep "Local Database"

# 3. Redeploy D1 database
wrangler deploy

# 4. Verify new empty database
wrangler d1 info hydra_db

# 5. Push local to new CF instance
node migrate.js export-to-cf

# 6. Final validation
node migrate.js validate-consistency

# 7. Alert team
echo "CF recovery complete at $(date)" | mail -s "Hydra Recovery" team@example.com
```

**Recovery time:** ~2 minutes (depends on domain count)

### Workflow 4: Multi-Region Deployment

**Objective:** Sync Hydra across multiple regions/accounts

**Setup (one-time):**
```bash
# Designated sync machine in region 1
CF_ACCOUNT_ID=account-1 CF_D1_TOKEN=token-1 ./install-any-machine.sh hybrid

# Designated sync machine in region 2
CF_ACCOUNT_ID=account-2 CF_D1_TOKEN=token-2 ./install-any-machine.sh hybrid
```

**Continuous operation:**
- Each region runs its own `sync-bidirectional --interval=300`
- Conflict resolution: newer timestamp wins
- Audit log shows all cross-region changes

**Verification:**
```bash
# On region 1
node migrate.js export-local > /tmp/r1.json

# On region 2
node migrate.js export-local > /tmp/r2.json

# Compare
diff /tmp/r1.json /tmp/r2.json
```

## Integration Points

### With mascom_push.py

The migration tool calls mascom_push.py internally during `export-to-cf`:

```javascript
// migrate.js
execSync(`python3 "${path.join(__dirname, 'mascom_push.py')}" push-all`, {
  encoding: 'utf-8',
  stdio: 'inherit',
});
```

**Shared configuration:**
- Both use `HYDRA_ENDPOINT` (for local server)
- Both use `MASCOM_SECRET` (for authentication)
- Both write to the same D1 database

**Why this design:**
- mascom_push.py: Focused on pushing individual domains
- migrate.js: Focused on bulk sync and bidirectional updates

### With Evolution System

The Hydra registry contains genes that the evolution system processes:

```bash
# Evolution system reads from Hydra
curl http://localhost:3000/api/getventures/example.com
# Returns: { gene_blob: { /* computed gene */ } }

# Evolution updates gene, pushes back
python3 mascom_push.py push example.com
# Calls /hydra/registry-update → updates D1

# Migration detects and syncs
node migrate.js sync-bidirectional
# Compares local vs CF, keeps newer version
```

**Integration point:** Both systems use same database schema

### With Mining Layer

Mining output generates domain statistics that feed into gene versioning:

```bash
# Mining produces metrics at ~/mascom/mining/metrics.json
# Evolution system reads metrics
# Hydra captures versioned genes with metrics

# Migration preserves full history
node migrate.js export-local
# Exports gene_history with timestamps
# Enables rollback to pre-mining states

# Sync ensures gene history is preserved
node migrate.js sync-bidirectional
# gene_history fully synced to CF
```

## Configuration for Different Environments

### Development (Local Only)

```bash
# ~/mascom/hydra/.env.development
MODE=local
HYDRA_PORT=3000
DEBUG=true
```

```bash
./install-any-machine.sh local
```

### Staging (Hybrid - Testing Before Prod)

```bash
# ~/mascom/hydra/.env.staging
MODE=hybrid
CF_ACCOUNT_ID=staging-account-id
HYDRA_PORT=3001
SYNC_INTERVAL=60  # More frequent sync for testing
```

```bash
./install-any-machine.sh hybrid
```

### Production (Hybrid - Maximal Redundancy)

```bash
# ~/mascom/hydra/.env.production
MODE=hybrid
CF_ACCOUNT_ID=prod-account-id
HYDRA_PORT=3000
SYNC_INTERVAL=300
LOG_LEVEL=warn
```

```bash
./install-any-machine.sh hybrid
```

## Monitoring & Observability

### Key Metrics to Track

```bash
# Sync health
grep "SYNC_BIDIRECTIONAL" migration_audit.jsonl | tail -20

# Error rate
echo "Errors in last hour:"
grep "ERROR" migration_audit.jsonl | awk -v now=$(date +%s) -v hour=3600 \
  '{gsub(/T|Z/, " "); t=mktime($2); if (now-t < hour) print}' | wc -l

# Sync lag
grep "SYNC_BIDIRECTIONAL" migration_audit.jsonl | \
  tail -2 | \
  awk '{gsub(/[-:T]/," "); print}' | \
  awk '{print $1,$2,$3}' | \
  xargs -I{} date -d{} +%s | \
  awk '{if(NR==1) t=$1; else print $1-t " seconds lag"}'

# Database growth
sqlite3 ~/mascom/hydra-local.db "SELECT COUNT(*) as domains, SUM(LENGTH(gene_blob)) as size FROM site_registry"
```

### Alert Conditions

Create alerts for:

```bash
# 1. Sync failures (consecutive errors)
tail -100 migration_audit.jsonl | grep "ERROR" | wc -l > 5 && alert "Sync failures"

# 2. Consistency drift (mismatched row counts)
node migrate.js validate-consistency 2>&1 | grep "mismatch" && alert "Consistency drift"

# 3. Local database bloat (> 500MB)
du -m ~/mascom/hydra-local.db | awk '$1 > 500 {print "Database growing"}' && alert "DB bloat"

# 4. Audit log size (> 100MB)
du -m migration_audit.jsonl | awk '$1 > 100 {print "Audit log full"}' && alert "Audit log"
```

### Dashboards (Example Prometheus Metrics)

```bash
# Extract metrics for monitoring system
grep "EXPORT_LOCAL\|SYNC_BIDIRECTIONAL" migration_audit.jsonl | \
  jq -r '[.timestamp, .operation, .details.registry_rows // 0] | @csv' | \
  awk -F, '{
    print "hydra_registry_rows{operation=\"" $2 "\"} " $3 " " ($(NF))*1000
  }'
```

## Security Considerations

### Access Control

```bash
# Restrict migration tools to authorized users
chmod 700 migrate.js install-any-machine.sh
chmod 700 migration_audit.jsonl exports/

# Audit who runs migration commands
grep "user" migration_audit.jsonl | sort | uniq -c

# Rotate MASCOM_SECRET regularly
wrangler secret put MASCOM_SECRET --env production
```

### Compliance & Auditing

```bash
# Full audit trail preserved
migration_audit.jsonl contains:
- timestamp
- operation (EXPORT, IMPORT, SYNC, etc.)
- details (rows affected, checksums)
- hostname & user

# Archive audit logs for compliance
tar czf audit-logs-2026-05.tar.gz migration_audit.jsonl
s3 cp audit-logs-2026-05.tar.gz s3://compliance-archive/

# Verify integrity of audit logs
find exports/ -name "*.json" -exec sha256sum {} \; > checksums.txt
```

### Secure Backup Strategy

```bash
# 1. Regular exports (automated)
0 2 * * * cd ~/mascom/hydra && node migrate.js export-local

# 2. Encrypted backup to S3
0 3 * * * gpg --encrypt --recipient KEY_ID migrations_audit.jsonl && \
           aws s3 cp migration_audit.jsonl.gpg s3://backups/hydra/

# 3. Offsite replication
0 4 * * * rsync -av --encrypt exports/ backuphost:/backups/hydra/
```

## Scaling Considerations

### Performance at Scale

For 1000+ domains:

```bash
# Export time: ~30-60 seconds
# Import time: ~20-40 seconds
# Sync time: ~45-90 seconds

# Optimize by running during low-traffic periods
0 2 * * * node migrate.js sync-bidirectional --interval=60
```

### Database Optimization

```bash
# Check SQLite performance
sqlite3 ~/mascom/hydra-local.db "PRAGMA optimize; PRAGMA integrity_check;"

# Vacuum database monthly
sqlite3 ~/mascom/hydra-local.db "VACUUM;"

# Monitor file size growth
du -h ~/mascom/hydra-local.db | head -1
```

### Horizontal Scaling Pattern

For multiple machines in hybrid mode:

```bash
# Machine 1: Primary (writes)
./install-any-machine.sh hybrid
# Runs sync every 300s

# Machine 2: Secondary (read-heavy)
./install-any-machine.sh local
# Imports from Machine 1's exports via cron

# Sync pattern:
# M1 → CF (every 300s)
# CF → M2 (every 600s via import-from-cf)
```

## Troubleshooting Integration Issues

### Sync loop conflicts

**Symptom:** Same domain updated on two machines simultaneously

**Detection:**
```bash
grep "conflict" migration_audit.jsonl | grep -o "domain:[^,]*"
```

**Resolution:**
- Conflict resolution is deterministic (newer timestamp wins)
- Check `.sync-state.json` to see which version was chosen
- Manually merge if needed: `node migrate.js validate-consistency`

### mascom_push.py failures

**Symptom:** `export-to-cf` fails partway through

**Debugging:**
```bash
# Run mascom_push.py directly
python3 mascom_push.py push-all

# Check MASCOM_SECRET
echo $MASCOM_SECRET | wc -c

# Test endpoint
curl -X POST http://localhost:3000/hydra/registry-update \
  -H "X-MASCOM-SECRET: $MASCOM_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"domain":"test.com","gene_blob":{}}'
```

### Network partition recovery

**Scenario:** CF becomes unreachable for 1+ hours

**Automatic recovery:**
```bash
# sync-bidirectional will retry on next interval
# Failed syncs logged to migration_audit.jsonl
# No data loss (local copy is authoritative)

# Manual recovery
node migrate.js sync-bidirectional  # One-time retry
node migrate.js validate-consistency  # Verify state
```

## Examples: Real-World Scenarios

### Scenario 1: Rolling Out Gene Changes to Edge

```bash
# Developer changes gene template
# $ vim ~/mascom/sites/example.com/data.json

# Developer tests locally
curl http://localhost:3000/api/getventures/example.com

# Push to CF
node migrate.js export-to-cf

# Verify edge picked it up (may take 30s)
curl https://example.com/static/gene
```

### Scenario 2: Rollback After Botched Deployment

```bash
# Deployment went wrong, need to rollback

# Check audit log for previous good state
tail -20 migration_audit.jsonl | grep "EXPORT_TO_CF"

# Find previous export
ls -t exports/local-*.json | head -5

# Restore
node migrate.js import-local exports/local-2026-05-11-120000.json

# Push restored version to CF
node migrate.js export-to-cf

# Verify
node migrate.js validate-consistency
```

### Scenario 3: Migrate Entire Hydra to New CF Account

```bash
# Old account: export everything
CF_ACCOUNT_ID=old-account node migrate.js export-local > migration-backup.json

# New account: setup
CF_ACCOUNT_ID=new-account ./install-any-machine.sh hybrid

# New account: restore
node migrate.js import-local migration-backup.json
node migrate.js export-to-cf

# New account: verify
node migrate.js validate-consistency
```

## Integration Checklist

- [ ] Migration tools installed (`migrate.js`, `install-any-machine.sh`)
- [ ] Environment variables set (`CF_ACCOUNT_ID`, `MASCOM_SECRET`, etc.)
- [ ] One installation mode tested (local / cf / hybrid)
- [ ] First export completed and verified
- [ ] Sync cycle running (if hybrid mode)
- [ ] Audit logs being written to `migration_audit.jsonl`
- [ ] Backup strategy configured (daily exports)
- [ ] Monitoring/alerting configured
- [ ] Team trained on troubleshooting
- [ ] Disaster recovery plan tested

## Further Integration

See also:
- `MIGRATION_GUIDE.md` - Full technical reference
- `MIGRATION_CHEATSHEET.md` - Quick command reference
- `mascom_push.py` - Individual domain push tool
- `routes.js` - API endpoint implementations
- `~/mascom/wiki/` - MASCOM architecture docs
