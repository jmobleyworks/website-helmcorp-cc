# Hydra Local Runtime — Development Guide

## Overview

The **Hydra Local Runtime** enables local development and testing of MASCOM edge functors with **identical behavior** to Cloudflare Workers + D1 in production.

**Key principle**: The same `routes.js` and `functors.js` code runs identically on:
- ✅ `localhost:3000` (development)
- ✅ `getventures.johnmobley.workers.dev` (production CF edge)

## Architecture

### Three-Layer Design

```
Express.js (HTTP Server)
    ↓
WorkerRuntime (CF Worker emulation)
    ↓
D1Adapter + routes.js (business logic)
    ↓
SQLite (database)
```

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **WorkerRuntime** | Emulates CF Worker `fetch(request, env, ctx)` interface | `local-runtime.js` |
| **D1Adapter** | Maps SQLite to CF D1 API (`.prepare().bind().all()`) | `local-runtime.js` |
| **LocalServer** | Express.js wrapper, routes to WorkerRuntime | `local-runtime.js` |
| **routes.js** | Pure functor handlers (identical on CF + local) | `routes.js` |
| **functors.js** | FP utilities (Either, Option, pipe, etc.) | `functors.js` |
| **EnvBuilder** | Creates `env` object matching CF bindings | `local-runtime.js` |

## Quick Start

### 1. Install

```bash
cd ~/mascom/hydra
bash local-setup.sh
```

This will:
- Check Node.js installation
- Install `express` and `better-sqlite3`
- Initialize `hydra-local.db` with schema
- Insert sample data

### 2. Start Server

```bash
npm start
# or
npm run dev     # with logging
```

Output:
```
✓ Hydra Local Runtime listening on http://localhost:3000
  Endpoints:
    GET  /api/domains    - List all domains
    GET  /api/ventures   - List ventures (with descriptions)
    GET  /api/config/:domain  - Get gene for domain
    GET  /api/stats      - Database statistics
    POST /api/register   - Register new domain
    GET  /health         - Health check
```

### 3. Test Endpoints

```bash
# Health check
curl http://localhost:3000/health

# List ventures
curl http://localhost:3000/api/ventures

# List domains
curl http://localhost:3000/api/domains

# Get config for domain
curl http://localhost:3000/api/config/getventures.example.com

# Register new domain
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -H "X-MASCOM-SECRET: local-dev-secret-12345" \
  -d '{
    "domain": "newsite.example.com",
    "gene_blob": {
      "site_name": "New Site",
      "description": "A new venture",
      "version": "1.0",
      "species": "explorer"
    }
  }'
```

## Environment Configuration

### Local Environment (`.env` or shell)

```bash
# Set database path (default: ./hydra-local.db)
export HYDRA_DB_PATH="/path/to/hydra-local.db"

# Set secret for /api/register (default: "local-dev-secret-12345")
export MASCOM_SECRET="my-secret-key-here"

# Set port (default: 3000)
export PORT=3000

# Start server
npm start
```

### Cloudflare Workers Environment (wrangler.toml)

```toml
[env.production]
vars = { MASCOM_SECRET = "production-secret-xyz" }

[[env.production.d1_databases]]
binding = "HYDRA_DB"
database_name = "mascom-hydra"
```

**Key**: The `env` object structure is identical, so code doesn't change.

## API Reference

### Health Check

```http
GET /health

HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "healthy",
  "service": "mascom-hydra",
  "timestamp": "2025-05-11T10:30:45.123Z",
  "version": "1.0"
}
```

### List Domains

```http
GET /api/domains

HTTP/1.1 200 OK
Content-Type: application/json

["domain1.com", "domain2.com", "domain3.com"]
```

### List Ventures

```http
GET /api/ventures

HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "domain": "getventures.example.com",
    "site_name": "GetVentures",
    "description": "Venture discovery platform",
    "version": "1.0",
    "species": "venture-scout"
  },
  ...
]
```

### Get Config

```http
GET /api/config/:domain

HTTP/1.1 200 OK
Content-Type: application/json
X-Gene-Domain: getventures.example.com

{
  "site_name": "GetVentures",
  "description": "Venture discovery platform",
  "version": "1.0",
  "species": "venture-scout",
  ...
}
```

### Register Domain

```http
POST /api/register
X-MASCOM-SECRET: [your-secret]
Content-Type: application/json

{
  "domain": "newdomain.com",
  "gene_blob": {
    "site_name": "New Site",
    "description": "Description",
    "version": "1.0",
    "species": "explorer"
  },
  "status": "active"
}

HTTP/1.1 201 Created
Content-Type: application/json

{
  "success": true,
  "domain": "newdomain.com",
  "message": "Domain registered successfully",
  "timestamp": "2025-05-11T10:30:45.123Z"
}
```

### Get Stats

```http
GET /api/stats

HTTP/1.1 200 OK
Content-Type: application/json
X-Stats-Timestamp: 2025-05-11T10:30:45.123Z

{
  "active_domains": 5,
  "total_history_records": 12
}
```

## File Structure

```
~/mascom/hydra/
├── local-runtime.js          # Main runtime (WorkerRuntime, D1Adapter, LocalServer)
├── local-setup.sh            # One-time setup script
├── package.json              # npm dependencies
├── routes.js                 # Pure functor handlers (CF-identical)
├── functors.js               # FP utilities (Either, Option, pipe, etc.)
├── schema.sql                # Database schema
├── hydra-local.db            # SQLite database (created by setup)
├── LOCAL_RUNTIME.md          # This file
├── QUICKSTART.md             # Quick reference
├── DESIGN.md                 # Architecture details
├── getventures-worker.js     # CF Worker (production)
├── getdomains-worker.js      # CF Worker (production)
└── ...
```

## Development Workflow

### 1. Make Changes to `routes.js`

Edit route handlers:
```javascript
export const getDomains = async (db) => {
  // Your code here
};
```

### 2. Test Locally

```bash
npm start
curl http://localhost:3000/api/domains
```

### 3. Deploy to Cloudflare

```bash
npm run deploy
# or
wrangler deploy
```

**No code changes needed** — the same routes work on both.

### 4. Debug in Node.js

```bash
npm run dev
# Logs all requests
# [2025-05-11T10:30:45.123Z] GET /api/ventures
```

## D1Adapter API

The D1Adapter maps SQLite to Cloudflare D1:

### Before (CF D1)
```javascript
const stmt = env.HYDRA_DB.prepare(sql);
const result = stmt.bind(...params).all();
// result.results → Array<Object>
```

### After (Local SQLite)
```javascript
const stmt = db.prepare(sql);
const result = stmt.bind(...params).all();
// result.results → Array<Object>  (identical!)
```

### Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `prepare(sql)` | `string → Statement` | Statement object |
| `bind(...params)` | `...any → Statement` | Self (chainable) |
| `all()` | `() → { success, results: [] }` | All rows |
| `run()` | `() → { success, meta: {...} }` | Execution result |
| `first()` | `() → { success, results: [one_row] }` | First row |

## Troubleshooting

### "Cannot find module 'express'"

```bash
npm install
```

### "hydra-local.db not found"

```bash
bash local-setup.sh
# or
node local-runtime.js  # auto-initializes
```

### "Port 3000 already in use"

```bash
export PORT=3001
npm start
```

### "X-MASCOM-SECRET" 401 error on POST

Check your secret matches env var:
```bash
export MASCOM_SECRET="my-secret"
npm start

# Then in another terminal:
curl -X POST http://localhost:3000/api/register \
  -H "X-MASCOM-SECRET: my-secret" \
  ...
```

### Database locked error

Close other connections:
```bash
# Kill any running local-runtime processes
pkill -f local-runtime.js

# Delete and reinitialize
rm hydra-local.db
node local-runtime.js
```

## Performance Notes

- **Local SQLite**: ~1-2ms queries (vs ~10-50ms CF edge)
- **D1Adapter overhead**: <1ms (pure synchronous wrapper)
- **Startup time**: ~500ms (vs ~10ms CF Workers)

For production benchmarks, test against actual CF Workers + D1.

## Next Steps

1. ✅ Install: `bash local-setup.sh`
2. ✅ Start: `npm start`
3. ✅ Test: `curl http://localhost:3000/api/ventures`
4. ✅ Modify: Edit `routes.js`, test locally
5. ✅ Deploy: `wrangler deploy` (code unchanged)

## See Also

- **QUICKSTART.md** — 2-minute getting started
- **DESIGN.md** — Architecture & design decisions
- **routes.js** — All endpoint implementations
- **functors.js** — FP utilities (Either, Option, etc.)
- **schema.sql** — Database schema

---

**Last updated**: 2025-05-11
**Status**: Production-ready ✅
