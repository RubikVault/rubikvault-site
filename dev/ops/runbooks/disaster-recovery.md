# Disaster Recovery Playbook — Forecast System

**Severity:** CRITICAL
**Scope:** Forecast System v3.4

## 1. Scene Assessment
If the Forecast System is showing blank data, 404s, or stale data (> 48h old):

1. **Check Dashboard:** `dev/ops/forecast/index.html` (Local) or `/forecast.html` (Prod).
2. **Check Cloudflare Pages Deployment:** Verify latest commit was built successfully.
3. **Check GitHub Actions:** Look for failure in `forecast-daily.yml` or `eod-history-refresh.yml`.

## 2. Emergency Recovery Steps

### Scenario A: Data Stale / Pipeline Failed
If `last_updated` is old but site is loading:

1. **Manual Trigger:**
   Go to GitHub Actions -> `Forecast Daily Pipeline` -> Run workflow.
   
2. **Local Run (If GitHub Actions Fails):**
   ```bash
   # 1. Fetch latest data
   node scripts/providers/eodhd-backfill-bars.mjs --universe public/data/universe/nasdaq100.json
   
   # 2. Run Pipeline
   node scripts/forecast/run_daily.mjs
   
   # 3. Publish Artifacts
   git add public/data/forecast
   git commit -m "fix(ops): manual pipeline run"
   git push
   ```

### Scenario B: Site 404 / Blank
The `latest.json` or `status.json` might be missing.

1. **Bootstrap Fix:**
   ```bash
   node scripts/forecast/bootstrap_init.mjs
   git add public/data/forecast
   git commit -m "fix(ops): emergency bootstrap"
   git push
   ```

### Scenario C: Bad Model / Degradation
The system promoted a bad model.

1. **Rollback:**
   ```bash
   # Revert to known good commit or use rollback script
   node scripts/forecast/rollback.mjs --commit <SHA>
   ```

## 3. Verification
After recovery:
1. Visit `/forecast.html`.
2. Ensure Status is not "BOOTSTRAP" (unless Scenario B).
3. Check `latest_bar` date on Stock Analyzer.

## 4. Contacts
- Michael Puchowezki (Lead)
- Ops Bot (Automated)
