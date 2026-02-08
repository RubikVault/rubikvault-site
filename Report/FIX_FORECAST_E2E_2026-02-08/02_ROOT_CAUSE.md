# Root Cause Analysis

## RC1 — Forecast DQ gate depended on missing EOD batch files
Evidence:
- Previous ingest implementation loaded prices only from EOD batches:
  - `scripts/forecast/snapshot_ingest.mjs` (pre-fix):
    - `git show HEAD~1:scripts/forecast/snapshot_ingest.mjs | nl -ba | sed -n '250,271p'`
    - line `258`: `const prices = loadEodBatches(repoRoot);`
- Baseline pipeline output showed no usable coverage:
  - `node scripts/forecast/run_daily.mjs --date=2026-02-08` (before seeded snapshot had 517 rows)
  - output: `Missing price data: 100.0%` and `CIRCUIT OPEN`.

Impact:
- `run_daily` opened circuit and published empty/bootstrap fallback when `last_good` was empty.

## RC2 — Market-prices acceptance threshold could degrade to effectively 1 row
Evidence:
- Previous min-count logic:
  - `git show HEAD~1:scripts/providers/market-prices-v3.mjs | nl -ba | sed -n '1158,1169p'`
  - line `1165`: `const minCount = Number.isFinite(config.counts?.min) ? config.counts.min : symbols.length;`
- Fallback module config includes small defaults when registry missing (same file function `loadModuleConfig`, pre-existing behavior).
- Baseline preview probe showed accepted low-coverage payload:
  - `/data/snapshots/market-prices/latest.json` -> `prices_count=1`, `asof=null`.

Impact:
- Low-coverage market-prices snapshots could pass basic checks and still break downstream forecast quality semantics.

## RC3 — First fallback path could remain empty
Evidence:
- Previous fallback behavior when no `last_good` existed:
  - `git show HEAD~1:scripts/forecast/report_generator.mjs | nl -ba | sed -n '364,396p'`
  - lines `387-394`: bootstrap fallback created `forecasts: []`.
- Baseline live output:
  - `/data/forecast/latest.json` had `rows_len=0` and `meta.status=circuit_open`.

Impact:
- UI rendered empty forecasts with circuit-open state; no data-preserving degraded mode for first-run or missing-history conditions.

## RC4 — Monitoring/gating was structural, not semantic
Evidence:
- Old gate script only checked basic shape (`data` array exists) and not meaningful counts/asof invariants:
  - `scripts/ci/verify-artifacts.mjs` (pre-fix, replaced in this patch).
- Prod monitor previously checked HTTP success and staleness only, not semantic row/asof thresholds.

Impact:
- Empty/wrong-shape artifacts could still survive to deployment.
