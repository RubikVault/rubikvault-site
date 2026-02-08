# 09 CI Workflow Behavior (Option A)

## Workflow Triggers + Scope
Evidence:
- `.github/workflows/forecast-v6-publish.yml:3-12` has `workflow_dispatch` and weekday schedule (`0 21 * * 1-5`).
- `.github/workflows/forecast-v6-publish.yml:27-31` single publish job.

## CI Publish-Only Steps
Evidence:
- `.github/workflows/forecast-v6-publish.yml:48-49` secrecy gate before publish.
- `.github/workflows/forecast-v6-publish.yml:59` invokes `node scripts/forecast/v6/run_daily_v6.mjs --mode=CI`.
- `.github/workflows/forecast-v6-publish.yml:61-68` validates published artifacts post-run.
- `.github/workflows/forecast-v6-publish.yml:75-77` commits only v6 output/ledger paths.

## Missing Predictions Degraded Success
Code evidence:
- `scripts/forecast/v6/run_daily_v6.mjs:787-798` CI reads predictions ledger; if missing returns degrade reason `MISSING_PREDICTIONS_OPTION_A`.
- `scripts/forecast/v6/run_daily_v6.mjs:1001-1013` CLI always exits 0 on handled result objects.

Runtime evidence command:
```bash
node scripts/forecast/v6/run_daily_v6.mjs --mode=CI --date=2026-02-06
```
Output excerpt:
```json
{
  "ok": true,
  "degraded": true,
  "reason": "MISSING_PREDICTIONS_OPTION_A",
  "published": {
    "target_dir": "public/data/forecast/v6/daily/2026-02-06"
  }
}
```

## Published Contract Validation
Command:
```bash
node scripts/forecast/v6/lib/validate_published_v6.mjs --date=2026-02-06
```
Output:
```json
{
  "ok": true,
  "date": "2026-02-06",
  "validated_files": ["hotset.json","watchlist.json","triggers.json","scorecard.json","model_card.json","diagnostics_summary.json"]
}
```

Validator evidence:
- `scripts/forecast/v6/lib/validate_published_v6.mjs:8-10` required files + required meta keys.
- `scripts/forecast/v6/lib/validate_published_v6.mjs:63-69` diagnostics schema gate.
