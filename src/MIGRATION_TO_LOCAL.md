# Migration to Local Development — From CF-Only Setup

## Situation

You have existing Cloudflare Workers that use D1, and you want to:
- ✅ Develop locally without pushing to CF every time
- ✅ Run tests without CF API calls
- ✅ Debug with breakpoints and logging
- ✅ Share development environment with team

## Solution: Hydra Local Runtime

The local runtime lets you run **the exact same code** on `localhost:3000` that runs on `getventures.johnmobley.workers.dev`.

## Migration Steps

### Step 1: Install Local Runtime

```bash
cd ~/mascom/hydra
bash local-setup.sh
```

This creates:
- `hydra-local.db` (SQLite database)
- `node_modules/` (express, better-sqlite3)
- `package.json` (npm configuration)

### Step 2: Verify Existing Code

Your existing CF Workers are already compatible. Check:

```bash
# Look for these files
ls -la getventures-worker.js
ls -la getdomains-worker.js
ls -la routes.js
ls -la functors.js
ls -la schema.sql
```

All of these work with the local runtime.

### Step 3: Start Local Server

```bash
npm start
```

You should see:
```
✓ Hydra Local Runtime listening on http://localhost:3000
  Endpoints:
    GET  /api/domains
    GET  /api/ventures
    GET  /api/config/:domain
    ...
```

### Step 4: Test Existing Routes

```bash
# In another terminal
curl http://localhost:3000/api/ventures
```

This uses your existing `routes.js` and database schema, but runs locally.

### Step 5: Migrate Your Workflow

**Before**: Edit → Push to CF → Test on CF Workers
```bash
# Old workflow
vim routes.js
git add routes.js
git commit -m "Update routes"
wrangler deploy
# Wait 5-10 seconds for CF
curl https://getventures.johnmobley.workers.dev/api/ventures
```

**After**: Edit → Test locally → Push to CF
```bash
# New workflow
npm start  # Terminal 1

# Terminal 2
vim routes.js
curl http://localhost:3000/api/ventures  # Test immediately
git add routes.js
git commit -m "Update routes"
wrangler deploy  # Deploy when happy
```

## Comparison: Local vs Cloudflare

| Feature | Local | Cloudflare |
|---------|-------|-----------|
| Database | SQLite (hydra-local.db) | CF D1 |
| Runtime | Node.js + Express | CF Workers |
| Startup | ~500ms | ~10ms |
| Query latency | ~1-2ms | ~10-50ms |
| Cost | Free (local) | Free tier available |
| Debugging | Full Node.js debugging | CF Analytics logs |
| Code | Identical | Identical |

## Important: Environment Variables

### Local: `.env.local` (not committed)

```bash
# Create .env.local
cat > .env.local << 'EOF'
MASCOM_SECRET="dev-secret-12345"
PORT=3000
EOF

# Load before starting
source .env.local
npm start
```

### Production: `wrangler.toml` or CF Dashboard

```toml
[env.production]
vars = { MASCOM_SECRET = "production-secret" }

[[env.production.d1_databases]]
binding = "HYDRA_DB"
database_name = "mascom-hydra"
database_id = "xxxxx"
```

## Code Compatibility

Your existing code works as-is. No changes needed to:
- `routes.js` ✅
- `functors.js` ✅
- `getventures-worker.js` ✅
- `getdomains-worker.js` ✅

The local runtime provides compatible interfaces:

```javascript
// Your existing code in routes.js
export const getVentures = async (db) => {
  // Same on localhost AND Cloudflare
  const result = await queryDB(db, sql, params);
  // ...
};

// On localhost: db = D1Adapter (SQLite wrapper)
// On Cloudflare: db = CF D1 binding
// ^ Same API, different backend
```

## Database Schema Synchronization

### First Time

The schema is created automatically from `schema.sql`:

```bash
bash local-setup.sh
# Creates hydra-local.db with all tables
```

### Updating Schema

If you update `schema.sql`:

```bash
# Option 1: Reset local database
rm hydra-local.db
npm start  # Auto-initializes

# Option 2: Manually apply changes
sqlite3 hydra-local.db < schema.sql
```

For production, update CF D1:
```bash
wrangler d1 execute mascom-hydra --file schema.sql --env production
```

## Data Synchronization

### Local Development

You can work with sample data:
```bash
sqlite3 hydra-local.db "SELECT * FROM site_registry;"
```

### Sync from Production to Local

```bash
# Export production data
wrangler d1 execute mascom-hydra \
  --command "SELECT * FROM site_registry;" \
  --env production > prod_data.json

# Import to local (requires JSON to SQL conversion)
# Script: scripts/sync-from-production.sh
```

## Testing

### Local Testing (no CF calls)

```bash
# Run test suite
node test-local-runtime.js

# Write integration tests
cat > test/routes.test.js << 'EOF'
import { routes } from '../routes.js';
import { D1Adapter } from '../local-runtime.js';

// Your tests here
EOF

npm test
```

### Production Testing (uses CF D1)

```bash
# Test on production after deployment
curl https://getventures.johnmobley.workers.dev/api/ventures
```

## Debugging

### Local Debugging

Full Node.js debugging available:

```bash
# Terminal 1: Start with debugging
node --inspect-brk local-runtime.js

# Terminal 2: Chrome DevTools
# Visit: chrome://inspect
```

Or use VS Code:
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/local-runtime.js",
      "console": "integratedTerminal"
    }
  ]
}
```

Press F5 to start debugging with breakpoints.

### Production Debugging

Limited to CF Analytics:
```bash
wrangler tail --env production
```

## Deployment Checklist

- [ ] Code works locally: `curl http://localhost:3000/api/ventures`
- [ ] Tests pass: `node test-local-runtime.js`
- [ ] Secret is set: `echo $MASCOM_SECRET`
- [ ] Schema is synced: `wrangler d1 execute mascom-hydra ...`
- [ ] Deploy: `wrangler deploy --env production`
- [ ] Test production: `curl https://getventures.johnmobley.workers.dev/...`

## Common Migration Issues

### "Module not found: express"

```bash
npm install
```

### "HYDRA_DB is not a D1Adapter"

Check that local-runtime.js is loading correctly:
```bash
node -e "import('./local-runtime.js').then(m => console.log(m))"
```

### Secrets not working

Verify secret matches:
```bash
echo $MASCOM_SECRET

# In curl
curl -X POST http://localhost:3000/api/register \
  -H "X-MASCOM-SECRET: $MASCOM_SECRET" \
  ...
```

### Database locked

Close all connections:
```bash
pkill -f local-runtime.js
pkill -f sqlite3
npm start
```

## Team Collaboration

### Sharing Local Setup

Everyone on the team:
```bash
cd ~/mascom/hydra
bash local-setup.sh
npm start
```

Each developer gets their own `hydra-local.db` (isolated).

### Shared Schema

`schema.sql` is in version control — everyone uses the same schema:
```bash
git pull  # Gets latest schema
rm hydra-local.db  # Clear local
npm start  # Reinitialize with new schema
```

### Code Reviews

Same code path for local and production → confident code reviews:

```
PR changes routes.js
Reviewer tests locally: curl http://localhost:3000/...
Verifies behavior
Approves
Deploys to CF
```

## Performance Optimization

### Local vs Production

- **Local queries**: ~1-2ms (vs ~10-50ms on CF)
- **Startup**: ~500ms (vs ~10ms on CF)
- **Development is fast**: Test many iterations locally

### Before Optimization

Test on production to confirm perf issues (not local limitations):
```bash
curl https://getventures.johnmobley.workers.dev/...
# Time response in production
```

## Next Steps

1. ✅ Run `bash local-setup.sh`
2. ✅ Start `npm start`
3. ✅ Test `curl http://localhost:3000/api/ventures`
4. ✅ Develop locally, deploy when ready
5. ✅ Read LOCAL_RUNTIME.md for detailed docs

## Support

- **LOCAL_RUNTIME.md** — Full runtime documentation
- **DEPLOYMENT_GUIDE.md** — Deployment details
- **LOCAL_DEVELOPMENT.md** — Overview & API reference
- **QUICKSTART_LOCAL.md** — 2-minute setup

---

**Status**: Ready for production use ✅
**Compatibility**: 100% code-identical ✅
