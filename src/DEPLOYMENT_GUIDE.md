# Hydra Deployment Guide — Local ↔ Cloudflare Workers

## Principle: Write Once, Deploy Everywhere

The **same functor code** runs identically on:
- `localhost:3000` (local development)
- `https://getventures.johnmobley.workers.dev` (CF Workers production)
- `https://getdomains.johnmobley.workers.dev` (CF Workers production)

## File Structure & Mapping

```
DEVELOPMENT (Local)        PRODUCTION (Cloudflare)
────────────────────────────────────────────────────
local-runtime.js     ←→  CF Worker runtime
  │ WorkerRuntime         (built-in fetch handler)
  │ D1Adapter             (CF D1 binding)
  └─ routes.js       ←→  routes.js (shared)
     └─ functors.js  ←→  functors.js (shared)
     └─ schema.sql   ←→  D1 database schema
```

## Key Integration Points

### 1. Request Flow

```
                LOCAL                    CLOUDFLARE WORKERS
                ────────────────────────────────────────────
Client request
    ↓
Express.js (local only) ────────→ Cloudflare network
    ↓
WorkerRuntime.fetch()  ────────→ CF Worker handler
    ↓
routes.js (IDENTICAL)
    ↓
D1Adapter ←─────────────→ D1 database binding
    ↓
Response
```

### 2. Environment Binding

**Local** (`env` object created by EnvBuilder):
```javascript
const env = {
  HYDRA_DB: new D1Adapter('./hydra-local.db'),  // SQLite
  MASCOM_SECRET: process.env.MASCOM_SECRET,
};
```

**Cloudflare** (`wrangler.toml`):
```toml
[env.production]
vars = { MASCOM_SECRET = "production-secret" }

[[env.production.d1_databases]]
binding = "HYDRA_DB"
database_name = "mascom-hydra"
database_id = "xxxxx"
```

**Result**: Same `env.HYDRA_DB` API in both cases.

### 3. Database Layer

**Local**: SQLite via `better-sqlite3`
```javascript
const db = new D1Adapter('./hydra-local.db');
const stmt = db.prepare('SELECT * FROM site_registry');
const result = stmt.all();  // { success: true, results: [...] }
```

**Cloudflare**: D1 via CF binding
```javascript
const stmt = env.HYDRA_DB.prepare('SELECT * FROM site_registry');
const result = stmt.all();  // { success: true, results: [...] }
```

**API is identical** — only storage backend differs.

## Deployment Workflow

### Phase 1: Local Development

```bash
cd ~/mascom/hydra

# One-time setup
bash local-setup.sh

# Start local server
npm start

# Test in another terminal
curl http://localhost:3000/api/ventures
```

**At this point**: You're running the full functor system locally.

### Phase 2: Code Changes

Edit `routes.js` or `functors.js`:

```javascript
// routes.js
export const getVentures = async (db) => {
  // Your changes here
  const result = await queryDB(db, sql, params);
  // ...
};
```

**Key**: This code is **unchanged for production** — no adaptations needed.

### Phase 3: Testing

Option A: Local testing
```bash
curl http://localhost:3000/api/ventures
# Response from SQLite
```

Option B: Integration testing (if CF Worker accessible)
```bash
curl https://getventures.johnmobley.workers.dev/api/ventures
# Response from D1
```

**Both use the exact same `routes.js`**.

### Phase 4: Deployment to Cloudflare

#### Option A: Using Wrangler CLI

```bash
# Install Wrangler if not already
npm install -D wrangler

# Deploy getventures worker
wrangler deploy -n getventures-worker

# Deploy getdomains worker
wrangler deploy -n getdomains-worker

# Check deployment
curl https://getventures.johnmobley.workers.dev/api/ventures
```

#### Option B: Manual via Cloudflare Dashboard

1. Go to Cloudflare Workers dashboard
2. Create/edit worker
3. Paste `getventures-worker.js` or `getdomains-worker.js`
4. Set bindings:
   - Add D1 database: `HYDRA_DB` → `mascom-hydra`
   - Add secret: `MASCOM_SECRET`
5. Deploy

#### Option C: Automated via Deploy Script

```bash
bash deploy-all.sh
# Deploys both workers automatically
```

## Configuration Management

### Local Development Secrets

Create `.env.local` (NOT committed):
```bash
MASCOM_SECRET="dev-secret-12345"
HYDRA_DB_PATH="./hydra-local.db"
PORT=3000
```

Load before starting:
```bash
source .env.local
npm start
```

### Production Secrets

Via `wrangler.toml`:
```toml
[env.production]
vars = { MASCOM_SECRET = "{{ secrets.MASCOM_SECRET }}" }
```

Or via Wrangler CLI:
```bash
wrangler secret put MASCOM_SECRET --env production
```

### Runtime Detection

**Optional**: Detect environment in code:
```javascript
export const getConfig = async (db, domain, env) => {
  const isDev = process.env.NODE_ENV === 'development';
  const isProd = typeof env.MASCOM_SECRET !== 'undefined';

  // Your logic here
};
```

**Best practice**: Keep code environment-agnostic.

## Testing Parity

### Local Test

```bash
npm start  # Terminal 1

# Terminal 2
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -H "X-MASCOM-SECRET: dev-secret-12345" \
  -d '{"domain":"test.local","gene_blob":{"site_name":"Test"}}'

# Response: 201 Created
```

### Production Test

```bash
curl -X POST https://getventures.johnmobley.workers.dev/api/register \
  -H "Content-Type: application/json" \
  -H "X-MASCOM-SECRET: [production-secret]" \
  -d '{"domain":"test.prod","gene_blob":{"site_name":"Test"}}'

# Response: 201 Created (same code path)
```

**Behavior is identical** because the code path is identical.

## Debugging Differences

If local and production behave differently, check:

### 1. Database State

**Local**:
```bash
sqlite3 hydra-local.db "SELECT * FROM site_registry;"
```

**Production**:
```bash
wrangler d1 execute mascom-hydra --command "SELECT * FROM site_registry;"
```

### 2. Environment Variables

**Local**:
```bash
echo $MASCOM_SECRET
```

**Production**:
```bash
wrangler secret list --env production
```

### 3. Request Headers

**Local** (check console logs):
```
[2025-05-11T10:30:45Z] GET /api/ventures
[2025-05-11T10:30:45Z] Headers: { ... }
```

**Production** (check CF Analytics):
Dashboard → Workers → Logs

### 4. Route Matching

Both use identical `routeKey()` and `matchPattern()` logic.

If routes differ:
1. Check `routes.js` is identical in both
2. Verify URL paths (trailing slashes, etc.)
3. Test with `curl -v` for full request details

## Rollback Procedure

### Local Rollback

```bash
# Revert changes to routes.js
git checkout routes.js

# Restart server
npm start
```

### Production Rollback

```bash
# Redeploy previous version
wrangler deploy --env production

# Or manually revert in CF dashboard
```

## Performance Tuning

### Local vs Production Differences

| Metric | Local | Production |
|--------|-------|------------|
| Query time | ~1-2ms | ~10-50ms (network) |
| Startup | ~500ms | ~10ms |
| Concurrency | Limited by Node.js | Unlimited (CF edge) |
| Memory | Process memory | Workers allocation |
| Cold starts | ~500ms | ~10ms |

**For production benchmarks**: Always test actual CF Workers.

### Optimization Targets

If optimizing, focus on:
1. **Database query efficiency** (affects both equally)
2. **JSON parsing/serialization** (client-side visible in both)
3. **Route matching logic** (microseconds, not bottleneck)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Hydra

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test  # Local tests

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run deploy  # Deploy to CF
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

## Migration Path: Existing CF Workers

If you have existing CF Workers, migrate to local testing:

1. **Extract routes** from existing worker:
   ```javascript
   // Before: Hardcoded in worker.js
   // After: routes.js (reusable)
   export const myRoute = async (db, request) => { ... };
   ```

2. **Create D1Adapter** matching your worker's D1 calls:
   ```javascript
   // Worker uses: env.HYDRA_DB.prepare(sql).all()
   // D1Adapter provides: new D1Adapter(path).prepare(sql).all()
   ```

3. **Test locally**, then redeploy.

## Support & Debugging

### Test Suite

Run comprehensive tests:
```bash
node test-local-runtime.js
```

### Documentation

- **LOCAL_RUNTIME.md** — Full runtime details
- **QUICKSTART_LOCAL.md** — 2-minute setup
- **DESIGN.md** — Architecture
- **routes.js** — All endpoints
- **functors.js** — FP utilities

### Common Issues

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `PORT=3001 npm start` |
| Secret mismatch | Verify `X-MASCOM-SECRET` header |
| Schema mismatch | Re-run `bash local-setup.sh` |
| Module not found | `npm install` |
| Database locked | `pkill -f local-runtime.js` |

---

**Principle**: Single codebase, multiple deployment targets. ✅
