# 07_VALIDATION_PROOFS

## Validation Standard
A change is accepted only if all relevant checks below pass.

## A) Repo + Artifact Existence Checks

### A1. Required core artifacts exist and are non-empty
```bash
test -s public/data/universe/all.json
test -s public/data/snapshots/stock-analysis.json
test -s public/data/forecast/latest.json
test -s public/data/forecast/system/status.json
```
Expected: exit code `0` for all.

### A2. Universe count contract
```bash
jq 'length' public/data/universe/all.json
```
Expected: `517` (current canonical expectation).

### A3. Critical semantic checks (existing repo gate)
```bash
node scripts/ci/verify-artifacts.mjs
```
Expected:
- market-prices rows >= configured minimum
- forecast rows > 0
- status contract valid with reason on circuit-open

## B) Schema / Contract Checks

### B1. JSON parseability and required keys
```bash
jq -e 'type=="array" and length>0' public/data/universe/all.json >/dev/null
jq -e '._meta != null' public/data/snapshots/stock-analysis.json >/dev/null
jq -e '.meta != null and .data.forecasts != null' public/data/forecast/latest.json >/dev/null
jq -e '(.status // .meta.status) != null' public/data/forecast/system/status.json >/dev/null
```
Expected: all pass.

### B2. Ops/mission-control gate consistency
```bash
node scripts/ci/assert-mission-control-gate.mjs
```
Expected:
- strict mode fails when blocking codes present
- non-strict mode documents degradations per policy.

## C) last_good / stale / fallback behavior

### C1. Forecast fallback behavior proof
Evidence source in code:
- `scripts/forecast/report_generator.mjs:411-473`
- `scripts/forecast/report_generator.mjs:479-505`

Runtime check:
```bash
jq -r '.meta.status,.meta.reason' public/data/forecast/latest.json
jq -r '.status,.reason' public/data/forecast/system/status.json
```
Expected:
- If stale/fallback path used, reason is explicit and non-empty.

### C2. Never-empty publish (EOD path)
Evidence source:
- `scripts/eod/build-eod-latest.mjs:530-535` (provider empty fallback)
- `scripts/eod/build-eod-latest.mjs:670-673` (hard block on zero fetched)

Runtime check:
```bash
jq '.data | length' public/data/eod/batches/eod.latest.000.json
jq '.counts.fetched' public/data/pipeline/nasdaq100.latest.json
```
Expected: no empty replacement publish when provider empty path is triggered.

## D) No runtime external provider calls from UI

### D1. Scan check
```bash
rg -n "https?://(api\.)?(eodhd|eodhistoricaldata|tiingo|stooq|polygon|alphavantage|finnhub|twelvedata|fred)" public src
rg -n "fetch\(['\"]https?://" public src
```
Expected: no matches.

### D2. CI enforcement (to be added)
```bash
bash scripts/ci/forbid-provider-urls-in-ui.sh
```
Expected: pass when no direct provider URLs in UI runtime code.

## E) Tier-compatibility checks (EODHD)

### E1. Forbidden endpoint scan
```bash
rg -n "fundamentals/|technical|calendar|tick|exchange-details" scripts functions .github/workflows
```
Expected after remediation:
- no EODHD forbidden endpoint usage in active producers.

Current known violation to fix first:
- `scripts/universe/fetch-constituents.mjs:50` (`/fundamentals/`).

## F) Parallel Producer / Race Checks

### F1. Overlapping write targets
```bash
rg -n "git add public/data/pipeline|git add public/data/ops" .github/workflows/*.yml
rg -n "^concurrency:" .github/workflows/eod-latest.yml .github/workflows/ops-daily.yml
```
Expected after mitigation:
- shared writer concurrency group for overlapping outputs.

## G) UI Verification Checklist (Manual + deterministic)

For each page:
- `public/index.html`
- `public/elliott.html`
- `public/scientific.html`
- `public/forecast.html`

Verify:
1. Page loads without JS fetch errors.
2. Data age/fallback indicator present (after implementation).
3. Existing key tables/cards still render.
4. No provider URLs appear in browser network requests from client code.

## H) Debug / Lineage Proofs

### H1. Build metadata present where required
```bash
jq -r '.meta.build_id,.meta.commit,.meta.generatedAt' public/data/ops/pulse.json
```
Expected: all non-empty (or explicit null policy for local mode only).

### H2. Global pointer (target)
```bash
jq -e '.currentVersion and .lastGoodVersion and (.usingFallback!=null)' public/data/_meta/latest.json
```
Expected: pass once implemented.

## I) Proof Output Format (for run logs)
Every execution run should append:
- command
- exit code
- key extracted values
- pass/fail
- artifact path

Recommended location for implementation phase logs:
- `Report/A/validation-runs/<timestamp>.md` (or CI step summary if file output is constrained).
