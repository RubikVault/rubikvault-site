# 02 Writer/Reader Matrix

## Existing Forecast Stack (Pre-v6)

### Writers (evidence)
- `scripts/forecast/run_daily.mjs:270-273` writes forecast ledger/outcomes pipeline.
- `scripts/forecast/report_generator.mjs:263-279` writes `public/data/forecast/system/status.json`.
- `scripts/forecast/report_generator.mjs:287-312` writes `public/data/forecast/latest.json` envelope.
- `scripts/forecast/report_generator.mjs:319-332` writes `public/data/forecast/system/last_good.json`.
- `scripts/forecast/ledger_writer.mjs:13` ledger base is `mirrors/forecast/ledger`.

### Readers (evidence)
- `public/forecast.html:574-579` reads `/data/forecast/system/status.json` + `/data/forecast/latest.json`.
- `public/forecast.html:592-599` reads latest daily report referenced in latest envelope.

## New v6 Stack

### v6 Writers (evidence)
- `scripts/forecast/v6/run_daily_v6.mjs:567-571` writes bars manifest ledger.
- `scripts/forecast/v6/run_daily_v6.mjs:702-704` writes candidates ledger.
- `scripts/forecast/v6/run_daily_v6.mjs:783-784` appends predictions ledger (`mirrors/forecast/ledgers/predictions/YYYY-MM-DD.ndjson.zst`).
- `scripts/forecast/v6/run_daily_v6.mjs:912-936` publishes atomic outputs to `public/data/forecast/v6/daily/YYYY-MM-DD/`.
- `scripts/forecast/v6/run_daily_v6.mjs:942-955` updates last_good pointers + feasibility diagnostics.
- `scripts/forecast/v6/run_daily_v6.mjs:967-975` runs outcome maturation with manifest binding.

### v6 Readers (evidence)
- `scripts/forecast/v6/run_daily_v6.mjs:787-789` CI reads predictions from committed ledger/input fixture.
- `scripts/forecast/v6/lib/validate_published_v6.mjs:42-56` reads published date/files for contract validation.
- `scripts/forecast/v6/lib/rollback.mjs:103` reads prior published artifacts for last_good restore.

## Workflow Touchpoints
- Existing v3 daily workflow writes `mirrors/forecast/ledger`, `mirrors/forecast/snapshots`, `public/data/forecast` (`.github/workflows/forecast-daily.yml:72-75`).
- New v6 workflow writes `mirrors/forecast/ledgers`, `mirrors/forecast/last_good/pointers.json`, `public/data/forecast/v6` (`.github/workflows/forecast-v6-publish.yml:75-77`).
