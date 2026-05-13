# GitHub + Cloudflare Integration Checklist

Follow these steps to enable automatic deployments:

## ✅ Quick Setup (5 minutes)

### 1. **Get Cloudflare Credentials**
   - [ ] Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - [ ] Create API Token (Workers & D1 permissions)
   - [ ] Copy token → save temporarily
   - [ ] Find your Account ID (Settings or worker page)

### 2. **Add GitHub Secrets**
   - [ ] Go to GitHub repo → Settings → Secrets and variables → Actions
   - [ ] Click "New repository secret"
   - [ ] Add `CLOUDFLARE_API_TOKEN` = (your token)
   - [ ] Add `CF_ACCOUNT_ID` = (your account ID)
   - [ ] Add `MASCOM_SECRET` = (your PSK, e.g., `4f810ba59e8b08d07eb08b64e1e9f8b7211a05c58326bf7b603f095b690f94ad`)

### 3. **Commit Workflow to GitHub**
   ```bash
   cd ~/mascom
   git add hydra/.github/workflows/deploy-workers.yml
   git add hydra/GITHUB_CLOUDFLARE_SETUP.md
   git add hydra/GITHUB_SETUP_CHECKLIST.md
   git commit -m "Add GitHub → Cloudflare CI/CD pipeline"
   git push origin main
   ```

### 4. **Verify Deployment**
   - [ ] Go to GitHub → Actions tab
   - [ ] Watch workflow run (should show 3 parallel jobs)
   - [ ] All jobs should complete with ✅ green status
   - [ ] Verify on Cloudflare: `wrangler list`

### 5. **Test Automatic Deployment**
   ```bash
   # Make a small change to any worker file
   echo "// CI/CD test" >> hydra/getventures-worker.js

   # Push it
   git add hydra/getventures-worker.js
   git commit -m "Test: Trigger automatic deployment"
   git push origin main

   # Watch Actions tab—deployment should start automatically!
   ```

## 🔐 Security Checklist

- [ ] API token is scoped to Workers + D1 only (not full account access)
- [ ] MASCOM_SECRET is strong random value (not "placeholder")
- [ ] Secrets are in GitHub (not in code/config files)
- [ ] Only `main` branch triggers deployments
- [ ] Old placeholder secrets are rotated out

## 🚀 From Now On

**Before:** Manual deployments
```bash
wrangler deploy getventures-worker.js --name getventures -c wrangler-getventures.toml
wrangler deploy setgene-worker.js --name setgene -c wrangler-setgene.toml
wrangler deploy getdomains-worker.js --name getdomains -c wrangler-getdomains.toml
```

**After:** Automatic deployments
```bash
git push origin main
# → Actions runs automatically
# → All workers deployed in parallel
# → Live on Edge in ~30 seconds
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Workflow shows "Failed" | Check Actions logs, verify secrets are set correctly |
| "CLOUDFLARE_API_TOKEN not found" | Go to Settings → Secrets → verify token is set |
| Deployment times out | Check if wrangler is timing out; increase timeout in workflow |
| Workers not updated after push | Check GitHub Actions log; worker names must match filenames |

## Next Steps (After CI/CD is Live)

Once this is working:
1. ✅ Deploy Species 6 Ecosystem Monitor
2. ✅ Create local-runtime.js for development
3. ✅ Set up bidirectional sync (local ↔ Edge)
4. Add smoke tests to GitHub Actions workflow
5. Set up deployment notifications (Slack, email)

---

**Questions?** See `GITHUB_CLOUDFLARE_SETUP.md` for detailed guide.
