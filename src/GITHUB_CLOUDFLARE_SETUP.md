# GitHub → Cloudflare CI/CD Setup

This guide sets up automatic deployment of HYDRA workers to Cloudflare on every `git push` to main.

## Prerequisites

- GitHub repository with this code
- Cloudflare account with API token access
- Workers and D1 databases already created in Cloudflare

## Step 1: Get Cloudflare API Credentials

### Create a Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Account Profile → API Tokens
2. Click **"Create Token"**
3. Choose **"Edit Cloudflare Workers"** template
4. Permissions:
   - `Workers Scripts - Edit`
   - `Workers Scripts - Read`
   - `Workers Routes - Edit`
   - `Workers Routes - Read`
   - `D1 - Read` (for database access)
5. Account Resources: Select your account
6. Copy the token (you'll need it in the next step)

### Get Your Account ID

In the Cloudflare Dashboard:
- URL shows: `https://dash.cloudflare.com/[ACCOUNT_ID]/`
- Or go to **Workers & Pages** → Your worker page → right sidebar shows Account ID
- Copy it

## Step 2: Add GitHub Secrets

In your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"** and add:

   | Secret Name | Value | Source |
   |-------------|-------|--------|
   | `CLOUDFLARE_API_TOKEN` | Your API token from Step 1 | Cloudflare Dashboard |
   | `CF_ACCOUNT_ID` | Your account ID from Step 1 | Cloudflare Dashboard |
   | `MASCOM_SECRET` | Your PSK for X-MASCOM-SECRET | Generated (use strong random value) |

3. Click **"Add secret"** for each one

## Step 3: Verify Workflow

Once secrets are added:

1. Push a test commit to main:
   ```bash
   cd ~/mascom
   git add hydra/.github/workflows/deploy-workers.yml
   git commit -m "Add GitHub Actions deployment workflow"
   git push origin main
   ```

2. Go to your GitHub repository → **Actions** tab
3. Watch the workflow run:
   - 3 jobs in parallel (getdomains, getventures, setgene)
   - Should complete in ~30 seconds
   - All should show ✅ green

4. Verify on Cloudflare:
   ```bash
   wrangler list
   ```
   All three workers should show version updates

## Step 4: Automatic Deployments

Now, any push to `main` that modifies:
- `hydra/**/*.js` (worker code)
- `hydra/wrangler*.toml` (configs)
- `.github/workflows/deploy-workers.yml` (workflow)

...will automatically trigger a deployment.

### Example Workflow

```bash
# Make a change to a worker
vim hydra/getventures-worker.js

# Commit and push (no manual wrangler deploy needed!)
git add hydra/getventures-worker.js
git commit -m "Optimize getventures query"
git push origin main

# → GitHub Actions automatically runs
# → wrangler deploys all three workers
# → Live on Cloudflare Edge within 30 seconds
```

## Environment Variables in CI/CD

The workflow automatically provides:
- `CLOUDFLARE_API_TOKEN` — Authentication for wrangler
- `CF_ACCOUNT_ID` — Account targeting
- `MASCOM_SECRET` — Passed to wrangler for worker environment variables

These are injected into the `wrangler deploy` command via the `wrangler.toml` environment variable section.

## Troubleshooting

### Workflow Failed to Deploy

1. Check **Actions** tab → click the failed run
2. Expand the failed job step
3. Look for error messages from wrangler
4. Common issues:
   - `CLOUDFLARE_API_TOKEN` missing or invalid
   - `CF_ACCOUNT_ID` wrong
   - Worker name doesn't match `*-worker.js` file
   - D1 database ID incorrect in wrangler config

### Secrets Not Available

If wrangler can't find secrets:
1. Verify secrets are in **Settings → Secrets and variables → Actions**
2. Secrets must be added to the repository, not the organization
3. Test locally first:
   ```bash
   export CLOUDFLARE_API_TOKEN="your-token"
   export CF_ACCOUNT_ID="your-id"
   export MASCOM_SECRET="your-secret"
   wrangler deploy --name getventures
   ```

### Manual Trigger

To trigger a deployment without pushing code:
1. Go to **Actions** → **Deploy HYDRA Workers to Cloudflare**
2. Click **"Run workflow"** → **Run workflow**
3. Deployment starts immediately

## Future: Add Smoke Tests

Once deployments are automatic, add smoke tests to the workflow:

```yaml
      - name: Smoke Test Endpoints
        run: |
          sleep 5  # Wait for DNS propagation
          curl -s https://getventures.johnmobley99.workers.dev/getventures | jq . || exit 1
          curl -s https://getdomains.johnmobley99.workers.dev/getdomains | jq . || exit 1
          echo "✅ All endpoints responding"
```

This ensures broken code never reaches production.

## Notes

- Deployments are parallelized (all 3 workers at once)
- Workflow runs on pushes to `main` only
- Secrets are never logged (GitHub Actions hides them)
- Each deployment takes ~30 seconds (mostly Cloudflare propagation)
- You can still use `wrangler deploy` locally for testing

## Security Best Practices

✅ **Doing right:**
- Secrets stored in GitHub (not in code)
- API token scoped to Workers only
- MASCOM_SECRET is strong random value
- Workflow only triggers on protected branch (main)

⚠️ **Future improvements:**
- Require approvals before deploying to production
- Add environment-specific tokens (dev vs. prod)
- Rotate MASCOM_SECRET quarterly
- Log deployment history in a separate audit database

---

Once this is set up, you have a fully automated CI/CD pipeline. Just code → git push → live on the Edge.
