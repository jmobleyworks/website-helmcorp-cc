# Hydra Local Runtime — Quick Start (2 minutes)

## Install & Run

```bash
cd ~/mascom/hydra
bash local-setup.sh
npm start
```

## Test (in another terminal)

```bash
# Health
curl http://localhost:3000/health

# List ventures
curl http://localhost:3000/api/ventures

# Get config
curl http://localhost:3000/api/config/getventures.example.com

# Register domain (with secret)
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -H "X-MASCOM-SECRET: local-dev-secret-12345" \
  -d '{
    "domain": "test.com",
    "gene_blob": {
      "site_name": "Test",
      "description": "Test site",
      "version": "1.0",
      "species": "test"
    }
  }'
```

## Edit Code

Modify `/routes.js` and `/functors.js` — changes apply immediately to next request.

## Deploy

Same code works on Cloudflare Workers:
```bash
wrangler deploy
```

## See Also

- **LOCAL_RUNTIME.md** — Full documentation
- **DESIGN.md** — Architecture details
