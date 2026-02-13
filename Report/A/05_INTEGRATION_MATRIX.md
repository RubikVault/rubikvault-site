# 05_INTEGRATION_MATRIX

Sources:
- Hash/parity raw values: `Report/A/04_SSOT_EVIDENCE/29_matrix_values.txt`
- Deployed probe summaries: `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md`
- Local published contracts: `Report/A/03_PUBLISHED_EVIDENCE/03_critical_contracts.txt`

## Hash Equivalence (INTEGRATION_CHECK)

| Artifact | Local Published Hash | Preview Hash | Prod Hash | Result |
|---|---|---|---|---|
| `universe/all.json` | `2672904c...1252f` | `2672904c...1252f` | `2672904c...1252f` | PASS |
| `snapshots/market-prices/latest.json` | `2f6e9eaf...b2cb3` | `2f6e9eaf...b2cb3` | `2f6e9eaf...b2cb3` | PASS |
| `forecast/latest.json` | `85659fdb...9b2d1` | `85659fdb...9b2d1` | `85659fdb...9b2d1` | PASS |
| `forecast/system/status.json` | `4b1cb422...84f3e` | `4b1cb422...84f3e` | `4b1cb422...84f3e` | PASS |

## Preview vs Prod Parity (INTEGRATION_CHECK)

| Endpoint | Preview | Prod | Classification |
|---|---|---|---|
| `/data/universe/all.json` | len=517, KO=true, BRK.B=true | len=517, KO=true, BRK.B=true | PARITY PASS |
| `/data/snapshots/market-prices/latest.json` | asof=2026-02-07, count=517, status=OK | asof=2026-02-07, count=517, status=OK | PARITY PASS |
| `/data/forecast/latest.json` | asof=2026-02-08, forecasts=517, status=stale | asof=2026-02-08, forecasts=517, status=stale | PARITY PASS |
| `/data/forecast/system/status.json` | stale/closed + same reason/timestamp | stale/closed + same reason/timestamp | PARITY PASS |
| `/api/elliott-scanner` | count=100, setups=100 | count=517, setups=517 | PARITY FAIL (P0) |

## Cohesion Matrix (INTEGRATION_CHECK)

| Feature set | Preview | Prod | Cohesion |
|---|---|---|---|
| Universe | hash equal + full 517 set | hash equal + full 517 set | PASS |
| Market Prices | same hash and generated marker | same hash and generated marker | PASS |
| Forecast | same hash and generated marker | same hash and generated marker | PASS |
| Elliott Scanner API | generated timestamp differs and payload cardinality differs (100 vs 517) | generated timestamp differs and payload cardinality differs | FAIL |

## Cache Divergence Notes
- Static JSON artifacts (`/data/universe/all.json`, `/data/snapshots/market-prices/latest.json`, `/data/forecast/latest.json`, `/data/forecast/system/status.json`) are `default == no-cache` hashes.
- Dynamic API/debug endpoints show hash drift between default and no-cache (mostly timestamp/meta churn). Classified as expected dynamic drift unless tied to semantic mismatch.

## Universe ↔ Feature Join Integrity
- Universe, market-prices, and forecast artifacts are set/count aligned at 517 symbols.
- Elliott API breaks join integrity on preview (`100`) despite canonical universe being 517.
