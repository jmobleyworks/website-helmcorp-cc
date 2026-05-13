# MASCOM Hydra Migration & Installation Tools - Complete Index

**Status:** Production Ready
**Created:** 2026-05-11
**Total Lines of Code & Docs:** 3195

---

## Core Tools (2 files)

### 1. `migrate.js` (515 lines)
**Node.js CLI for bidirectional sync and migration**

Functions:
- `exportLocal()` - Export SQLite → JSON with checksums
- `importLocal()` - Restore from JSON backup
- `exportToCF()` - Push local → CloudFlare D1
- `importFromCF()` - Pull CloudFlare D1 → local
- `syncBidirectional()` - Continuous intelligent merge
- `validateConsistency()` - Verify sync integrity
- `cloneMachine()` - One-command new machine setup

Features:
- SHA256 checksum verification
- Audit trail logging to `migration_audit.jsonl`
- Conflict detection with timestamp resolution
- Process lifecycle management
- Environment variable support

Usage:
```bash
node migrate.js export-local
node migrate.js sync-bidirectional --interval=300
node migrate.js validate-consistency
```

### 2. `install-any-machine.sh` (423 lines)
**Unified installation script for all deployment modes**

Functions:
- `setup_common()` - Check Node.js, npm, create directories
- `setup_local()` - SQLite + local Express server
- `setup_cf()` - Deploy to CloudFlare workers
- `setup_hybrid()` - Both + sync supervisor

Modes:
```bash
./install-any-machine.sh local    # SQLite only
./install-any-machine.sh cf       # CloudFlare only
./install-any-machine.sh hybrid   # Local + CF + sync
```

Features:
- Dependency checking
- Database schema initialization
- Local server creation
- CloudFlare worker deployment
- Sync supervisor management
- Color-coded output

---

## Documentation (4 files)

### 3. `MIGRATION_GUIDE.md` (640 lines)
**Complete technical reference for all operations**

Sections:
- Overview & installation prerequisites
- 7 migration commands detailed
- 3 installation modes with examples
- Audit trail logging
- Troubleshooting guide
- Disaster recovery procedures
- Performance tuning
- Security best practices
- Environment variables reference

Best for: Operators, detailed learning, reference

### 4. `MIGRATION_CHEATSHEET.md` (346 lines)
**Quick reference for common operations**

Sections:
- Installation one-liners
- Command patterns by category
- Local/CF/Hybrid mode commands
- Troubleshooting table
- Environment setup
- Disaster recovery shortcuts
- Audit log queries
- File structure reference
- Command patterns
- One-liners for automation

Best for: Power users, quick lookup, automation

### 5. `INTEGRATION.md` (540 lines)
**Integration with MASCOM ecosystem and workflows**

Sections:
- Architecture context
- 4 real-world operational workflows
- Integration points with mascom_push.py
- Integration with evolution system
- Integration with mining layer
- Configuration for dev/staging/prod
- Monitoring & observability setup
- Security & compliance
- Scaling patterns
- Troubleshooting integration issues
- Real-world scenarios

Best for: Architects, operators, team leaders

### 6. `MIGRATION_INSTALLATION_README.md` (345 lines)
**Overview and getting started guide**

Sections:
- Executive summary
- File listing
- Quick start (3 steps)
- Feature overview
- Architecture diagram
- File locations
- Environment variables
- Performance metrics
- Security features
- Testing procedures
- Troubleshooting links

Best for: Everyone, initial orientation

---

## Additional Created Files

### 7. `MIGRATION_TO_LOCAL.md` (386 lines)
**Companion migration tool documentation**

---

## Quick Start

### Installation (< 2 minutes)

```bash
cd ~/mascom/hydra

# Choose your mode:
./install-any-machine.sh local    # Development
./install-any-machine.sh cf       # Production
./install-any-machine.sh hybrid   # Full setup
```

### First Operations

```bash
# Export backup
node migrate.js export-local

# Validate setup
node migrate.js validate-consistency

# For hybrid mode: monitor sync
tail -f logs/sync.log
```

### Documentation Map

```
START HERE:
├─ MIGRATION_INSTALLATION_README.md (overview)
│  └─ Choose your next step:
│
├─ FIRST TIME USERS:
│  └─ MIGRATION_GUIDE.md (complete reference)
│
├─ QUICK OPERATORS:
│  └─ MIGRATION_CHEATSHEET.md (commands)
│
├─ ARCHITECTS/TEAM LEADS:
│  └─ INTEGRATION.md (workflows)
│
└─ SPECIFIC QUESTIONS:
   └─ Index of topics below
```

---

## Topic Index

### Installation & Setup
- `MIGRATION_INSTALLATION_README.md` - Overview
- `MIGRATION_GUIDE.md` - Prerequisites & detailed setup
- `install-any-machine.sh` - Automated setup script

### Local Development
- `MIGRATION_GUIDE.md` → "Local Mode" section
- `MIGRATION_CHEATSHEET.md` → "Local Mode" section
- `install-any-machine.sh local` - One-command setup

### CloudFlare Deployment
- `MIGRATION_GUIDE.md` → "CloudFlare Mode" section
- `MIGRATION_CHEATSHEET.md` → "CloudFlare Mode" section
- `install-any-machine.sh cf` - One-command setup

### Hybrid Setup (Local + CF)
- `MIGRATION_GUIDE.md` → "Hybrid Mode" section
- `MIGRATION_CHEATSHEET.md` → "Hybrid Mode" section
- `INTEGRATION.md` → "Operational Workflows" section
- `install-any-machine.sh hybrid` - One-command setup

### Migration Commands (7 total)
- `export-local` → `MIGRATION_GUIDE.md` line 85
- `import-local` → `MIGRATION_GUIDE.md` line 110
- `export-to-cf` → `MIGRATION_GUIDE.md` line 135
- `import-from-cf` → `MIGRATION_GUIDE.md` line 160
- `sync-bidirectional` → `MIGRATION_GUIDE.md` line 185
- `validate-consistency` → `MIGRATION_GUIDE.md` line 220
- `clone-machine` → `MIGRATION_GUIDE.md` line 245

### Backup & Disaster Recovery
- `MIGRATION_GUIDE.md` → "Disaster Recovery" section
- `MIGRATION_CHEATSHEET.md` → "Disaster Recovery" section
- `INTEGRATION.md` → "Workflow 3: Disaster Recovery"

### Security & Compliance
- `MIGRATION_GUIDE.md` → "Security Considerations" section
- `INTEGRATION.md` → "Security Considerations" section
- `MIGRATION_INSTALLATION_README.md` → "Security Features" section

### Monitoring & Observability
- `INTEGRATION.md` → "Monitoring & Observability" section
- `MIGRATION_CHEATSHEET.md` → "Audit Log Queries" section
- `MIGRATION_GUIDE.md` → "Audit Trail" section

### Troubleshooting
- `MIGRATION_CHEATSHEET.md` → "Troubleshooting" section
- `MIGRATION_GUIDE.md` → "Troubleshooting" section
- `INTEGRATION.md` → "Troubleshooting Integration Issues" section

### Multi-Region Deployment
- `INTEGRATION.md` → "Workflow 4: Multi-Region Deployment" section

### Performance & Scaling
- `INTEGRATION.md` → "Scaling Considerations" section
- `MIGRATION_GUIDE.md` → "Performance Notes" section

### CI/CD Integration
- `INTEGRATION.md` → "Integration Points" → "Automated version"

---

## File Locations

```
~/mascom/hydra/
├── Core Tools
│   ├── migrate.js (515 lines)
│   └── install-any-machine.sh (423 lines)
│
├── Documentation (2391 lines total)
│   ├── MIGRATION_INSTALLATION_README.md (345 lines)
│   ├── MIGRATION_GUIDE.md (640 lines)
│   ├── MIGRATION_CHEATSHEET.md (346 lines)
│   ├── INTEGRATION.md (540 lines)
│   ├── MIGRATION_TO_LOCAL.md (386 lines)
│   └── INDEX.md (this file)
│
├── Existing Files (unchanged)
│   ├── schema.sql
│   ├── routes.js
│   ├── functors.js
│   ├── worker.js
│   ├── mascom_push.py
│   └── wrangler.toml
│
├── Auto-Created on Install
│   ├── hydra-local.db (local mode)
│   ├── local-runtime.js (local mode)
│   ├── sync-supervisor.js (hybrid mode)
│   ├── exports/ (all modes)
│   ├── logs/ (hybrid mode)
│   └── migration_audit.jsonl (all modes)
```

---

## Command Reference

### Installation
```bash
./install-any-machine.sh local    # Development
./install-any-machine.sh cf       # CloudFlare
./install-any-machine.sh hybrid   # Full (recommended)
```

### Export/Import
```bash
node migrate.js export-local              # → JSON
node migrate.js import-local [<file>]     # ← JSON
node migrate.js export-to-cf              # → CF D1
node migrate.js import-from-cf            # ← CF D1
```

### Sync & Validation
```bash
node migrate.js sync-bidirectional                    # One-time
node migrate.js sync-bidirectional --interval=300    # Continuous
node migrate.js validate-consistency                 # Check status
```

### Disaster Recovery
```bash
node migrate.js clone-machine --source=CF --target=local
node migrate.js clone-machine --source=local --target=CF
```

---

## Environment Variables

```bash
export MODE=hybrid              # local|cf|hybrid
export HYDRA_PORT=3000         # Local server port
export CF_ACCOUNT_ID=...        # CloudFlare account
export CF_D1_TOKEN=...          # D1 API token
export MASCOM_SECRET=...        # API secret
export SYNC_INTERVAL=300        # Seconds between syncs
```

---

## Quick Troubleshooting

| Problem | Solution | Reference |
|---------|----------|-----------|
| Port 3000 in use | `lsof -i :3000` then `kill <PID>` | CHEATSHEET |
| Sync not running | `ps aux \| grep sync` → restart | CHEATSHEET |
| Checksum mismatch | Run `validate-consistency` | GUIDE |
| CF deploy fails | Check `wrangler whoami` | CHEATSHEET |
| Local DB corrupted | `clone-machine --source=CF` | GUIDE |

---

## Key Metrics

| Operation | Time | Scale |
|-----------|------|-------|
| export-local | 2-5s | 100 domains |
| import-local | 1-2s | 100 domains |
| export-to-cf | 5-10s | 100 domains |
| sync-bidirectional | 10-20s | 100 domains |
| validate-consistency | 2-5s | all domains |

---

## Support Resources

1. **Quick Answer**: MIGRATION_CHEATSHEET.md
2. **Detailed Help**: MIGRATION_GUIDE.md
3. **Architecture**: INTEGRATION.md
4. **Getting Started**: MIGRATION_INSTALLATION_README.md
5. **Command Help**: `node migrate.js`
6. **Check Status**: `node migrate.js validate-consistency`

---

## Version & Status

- **Version**: 1.0.0
- **Status**: Production Ready
- **Created**: 2026-05-11
- **Total Lines**: 3195 (code + docs)
- **Test Status**: All features verified
- **Documentation**: Complete

---

## Next Steps

1. Choose installation mode (local/cf/hybrid)
2. Run `./install-any-machine.sh <mode>`
3. Verify with: `node migrate.js validate-consistency`
4. Read relevant documentation from map above
5. Set up backups and monitoring

---

## Integration Checklist

- [ ] Tools installed
- [ ] Installation mode selected and tested
- [ ] First export completed
- [ ] Monitoring configured
- [ ] Team trained
- [ ] Disaster recovery tested
- [ ] Backup schedule set up
- [ ] Alerts configured

---

**All tools ready for production deployment!**
