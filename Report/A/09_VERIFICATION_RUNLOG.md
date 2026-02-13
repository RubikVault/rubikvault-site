# Verification Runlog (Before/After)

## Main merge verification addendum (post-PR #112 / #113)
- PR #112 merged: `e985a5a5`
- PR #113 merged (Universe Refresh push-race fix): `42a09c17`
- `CI Gates - Quality & Budget Checks` on merge commit: `21952677031` => success
- `Universe Refresh` main verification after fix: `21952842847` => success
- Core manual dispatch verification on `main`:
  - `EOD Latest (NASDAQ-100)` `21952539563` => success
  - `Scientific Daily Snapshot` `21952542000` => success
  - `Forecast Daily Pipeline` `21952544760` => success
  - `Ops Daily Snapshot` `21952547452` => success
  - `Monitor Production Artifacts` `21952549970` => success
  - `Forecast Weekly Training` `21952890652` => success
- Notes:
  - One earlier `Universe Refresh` run failed before the push-race fix: `21952552212`.
  - A later manual `Universe Refresh` run was cancelled by workflow concurrency replacement before completion: `21952835836`.
  - `EOD History Refresh` manual run `21952554851` was cancelled during long backfill verification; this run was not a red failure in branch protection and does not block the active short-cycle pipeline.

## Branch + context
- Branch: `codex/p0p1-hardening`
- Head: `87fe721b`

## Baseline failure signatures (before fixes)
- Scheduler WAF block:
  - Run `21919890642`
  - Signature: `HTTP 403` + Cloudflare challenge HTML (`Just a moment...`).
- Monitor WAF block:
  - Run `21918758188`
  - Signature: curl 403 on artifact endpoint.
- EOD empty fetch interlock:
  - Run `21844075239`
  - Signature: `FAIL: expected=100 but fetched=0`.
- Forecast circuit open from missing prices:
  - Run `21766433410`
  - Signature: `Missing price data: 80.7%`.
- v3 modules path drift:
  - Run `21885900868`
  - Signature: `Cannot find module './public/data/registry/modules.json'`.

## Post-fix branch runs (key)
- `Scheduler Kick` success: `21921261343`.
- `Monitor Production Artifacts` success: `21921263170`.
- `EOD Latest (NASDAQ-100)` success: `21921265115`.
- `Forecast Daily Pipeline` success: `21921267096`.
- `Refresh Health Assets` success: `21921271185`.
- `v3 Finalizer` success: `21921485186`.
- `Ops Daily Snapshot` failure: `21921377474` (explicit `CF_API_TOKEN` missing).
- `WP16 Manual - Market Prices (Stooq)` failure: `21922259282` (`VALIDATION_FAILED` drop-threshold).
- `v3 Scrape Template` latest: `21922258342` failed in market-stats/finalization quality path after scrape success.

## 30-run health snapshot (at capture time)
- `scheduler-kick.yml`: 6.7% (historically poor, latest branch run green).
- `monitor-prod.yml`: 33.3% (historical WAF reds, latest branch run green).
- `eod-latest.yml`: 20.0% (historical reds, latest branch run green).
- `ops-daily.yml`: 16.7% (currently blocked external by secret config).
- `v3-scrape-template.yml`: 0.0% (active repair path, root causes identified).
- `wp16-manual-market-prices.yml`: 0.0% (manual workflow, quality-gate blocked).

## Root-cause closure status
- UNKNOWN root causes remaining: **0** in executed KEEP/REPAIR set.
- Remaining failures are explicit and reproducible:
  - `CF_API_TOKEN missing` (external config).
  - `VALIDATION_FAILED drop_threshold` (provider quality gate).
