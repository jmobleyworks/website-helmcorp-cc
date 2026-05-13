# Hydra Local Development — Complete Reference

## What Is This?

**Hydra Local Runtime** enables development and testing of MASCOM edge functors with **identical behavior** to production Cloudflare Workers + D1.

```
Same code, multiple targets:
  localhost:3000                    ← Local development
  getventures.johnmobley.workers.dev ← Production CF edge
  getdomains.johnmobley.workers.dev  ← Production CF edge
```

## Quick Start

```bash
# 1. Setup (one-time)
cd ~/mascom/hydra
bash local-setup.sh

# 2. Start server
npm start

# 3. Test (in another terminal)
curl http://localhost:3000/api/ventures
```

**Done!** You now have a full local Hydra environment.

## What Got Created

| File | Purpose |
|------|---------|
| **local-runtime.js** | WorkerRuntime + D1Adapter + LocalServer (350+ lines) |
| **local-setup.sh** | One-time setup script (installs deps, creates DB) |
| **package.json** | npm dependencies (express, better-sqlite3) |
| **LOCAL_RUNTIME.md** | Full documentation |
| **DEPLOYMENT_GUIDE.md** | Local ↔ Cloudflare integration |
| **test-local-runtime.js** | Test suite for verification |

## Architecture

### Three-Layer Design

```
Layer 1: HTTP Server (Express.js)
  ↓ (only on localhost)
Layer 2: Worker Runtime (Emulates CF Workers)
  ↓ (runs on localhost AND CF)
Layer 3: Routes + Functors (Pure business logic)
  ↓ (runs on localhost AND CF)
Layer 4: D1Adapter / SQLite (Identical API)
  ↓
Database: hydra-local.db (local) or CF D1 (production)
```

### Key Components

**WorkerRuntime**
- Emulates CF Worker `fetch(request, env, ctx)` interface
- Called identically by Express.js (local) and CF (production)
- Returns Promise<Response>

**D1Adapter**
- Wraps SQLite with D1 API
- Methods: `prepare(sql).bind(...).all()` (identical to CF D1)
- Returns: `{ success: true, results: [...] }`

**LocalServer**
- Express.js wrapper
- Routes all requests → WorkerRuntime
- Sets CORS headers, logging, middleware

**EnvBuilder**
- Creates `env` object: `{ HYDRA_DB, MASCOM_SECRET }`
- Matches CF Worker environment structure

## Development Workflow

### 1. Develop Locally

Edit `routes.js`:
```javascript
export const getVentures = async (db) => {
  const result = await queryDB(db,
    `SELECT domain, gene_blob FROM site_registry WHERE status = 'active'`
  );
  // Your logic here
};
```

Test locally:
```bash
npm start
curl http://localhost:3000/api/ventures
```

### 2. Test Routes

All routes available:
- `GET /api/domains` — List domains
- `GET /api/ventures` — List ventures with descriptions
- `GET /api/config/:domain` — Get gene for domain
- `POST /api/register` — Register new domain (requires secret)
- `GET /health` — Health check
- `GET /api/stats` — Database stats

### 3. Deploy to Cloudflare

Same code works on CF:
```bash
wrangler deploy
```

**No code changes** — the `routes.js` is identical.

## API Reference

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "mascom-hydra",
  "timestamp": "2025-05-11T10:30:45.123Z",
  "version": "1.0"
}
```

### List Ventures

```bash
curl http://localhost:3000/api/ventures
```

Response:
```json
[
  {
    "domain": "getventures.example.com",
    "site_name": "GetVentures",
    "description": "Venture discovery platform",
    "version": "1.0",
    "species": "venture-scout"
  }
]
```

### Get Domain Config

```bash
curl http://localhost:3000/api/config/getventures.example.com
```

Response:
```json
{
  "site_name": "GetVentures",
  "description": "Venture discovery platform",
  "version": "1.0",
  "species": "venture-scout"
}
```

### Register Domain

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -H "X-MASCOM-SECRET: local-dev-secret-12345" \
  -d '{
    "domain": "mydomain.com",
    "gene_blob": {
      "site_name": "My Site",
      "description": "Description here",
      "version": "1.0",
      "species": "explorer"
    }
  }'
```

Response:
```json
{
  "success": true,
  "domain": "mydomain.com",
  "message": "Domain registered successfully",
  "timestamp": "2025-05-11T10:30:45.123Z"
}
```

## Environment Variables

### Local Development

```bash
# Database path (default: ./hydra-local.db)
export HYDRA_DB_PATH="./hydra-local.db"

# API secret for /api/register (default: local-dev-secret-12345)
export MASCOM_SECRET="my-secret-key"

# Server port (default: 3000)
export PORT=3000

# Start
npm start
```

### Production (Cloudflare)

Set via `wrangler.toml` or CF dashboard:
```toml
[env.production]
vars = { MASCOM_SECRET = "production-secret" }

[[env.production.d1_databases]]
binding = "HYDRA_DB"
database_name = "mascom-hydra"
```

## Testing

Run test suite:
```bash
node test-local-runtime.js
```

Tests verify:
- D1Adapter SQL execution
- Database schema creation
- Routes import successfully
- WorkerRuntime fetch() works
- Environment binding creation

## Troubleshooting

### Port Already in Use

```bash
export PORT=3001
npm start
```

### Database Locked

```bash
pkill -f local-runtime.js
rm hydra-local.db
npm start  # Auto-initializes
```

### Module Not Found

```bash
npm install
```

### Secret 401 Error

Verify header matches env variable:
```bash
export MASCOM_SECRET="my-secret"
npm start

# In another terminal:
curl -X POST http://localhost:3000/api/register \
  -H "X-MASCOM-SECRET: my-secret" \
  ...
```

## File Structure

```
~/mascom/hydra/
├── local-runtime.js              # Main runtime (WorkerRuntime, D1Adapter, etc.)
├── local-setup.sh                # One-time setup
├── package.json                  # npm dependencies
├── test-local-runtime.js         # Test suite
├── hydra-local.db                # SQLite database (created by setup)
├── LOCAL_RUNTIME.md              # Full runtime documentation
├── DEPLOYMENT_GUIDE.md           # Local ↔ Cloudflare integration
├── LOCAL_DEVELOPMENT.md          # This file
├── QUICKSTART_LOCAL.md           # 2-minute quick start
│
├── routes.js                     # Pure functor handlers (CF-identical)
├── functors.js                   # FP utilities (Either, pipe, etc.)
├── schema.sql                    # Database schema
│
├── getventures-worker.js         # CF Worker (production)
├── getdomains-worker.js          # CF Worker (production)
├── getventures-wrangler.toml     # CF config (getventures)
├── getdomains-wrangler.toml      # CF config (getdomains)
└── ...
```

## Key Concepts

### Write Once, Deploy Everywhere

The same `routes.js` and `functors.js` files run on:
1. **Local**: WorkerRuntime + D1Adapter (via Express.js)
2. **CF Workers**: CF Worker runtime + D1 binding

No adaptation layer needed — API is identical.

### D1Adapter = SQLite with D1 API

```javascript
// Local (SQLite)
const db = new D1Adapter('./hydra-local.db');
const result = db.prepare(sql).bind(...params).all();

// Production (CF D1)
const result = env.HYDRA_DB.prepare(sql).bind(...params).all();

// ^ Same call, different backend
```

### Environment Binding

```javascript
// Local
const env = {
  HYDRA_DB: new D1Adapter('./hydra-local.db'),
  MASCOM_SECRET: 'dev-secret',
};

// Production (CF injects this)
const env = {
  HYDRA_DB: <D1 binding>,
  MASCOM_SECRET: 'prod-secret',
};

// Code sees the same interface
```

## Next Steps

1. ✅ **Install**: `bash local-setup.sh`
2. ✅ **Run**: `npm start`
3. ✅ **Test**: `curl http://localhost:3000/api/ventures`
4. ✅ **Edit**: Modify `routes.js`, test locally
5. ✅ **Deploy**: `wrangler deploy`

## Learn More

- **QUICKSTART_LOCAL.md** — 2-minute setup
- **LOCAL_RUNTIME.md** — Full runtime documentation (250+ lines)
- **DEPLOYMENT_GUIDE.md** — Local ↔ CF integration details
- **routes.js** — All endpoint implementations
- **functors.js** — Functional programming utilities
- **schema.sql** — Database schema

---

**Status**: Production-ready ✅
**Last updated**: 2025-05-11
**Author**: MASCOM Edge Infrastructure
