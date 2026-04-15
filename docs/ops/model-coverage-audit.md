# Model Coverage Audit

## Coverage Promises

| Module | Current Promise | Scope | Asset Classes | Markets | Promotion Allowed |
| --- | --- | --- | --- | --- | --- |
| `hist_probs` | US+EU historical context | `US_EU_STOCK_ETF` | STOCK, ETF | US, EU | only when zero-coverage guard passes |
| `forecast_daily` | public forecast batch | `US_STOCK` | STOCK | US | only for supported scope |
| `quantlab_daily_report` | published quantlab scope | `PUBLISHED_QUANTLAB_SCOPE` | STOCK, ETF | US, EU | yes when fresh |
| `scientific_summary` | scientific context | `SCIENTIFIC_CONTEXT` | STOCK, ETF | US, EU | advisory unless current |
| `snapshot` | promotion/output layer | `PROMOTION_READY_SCOPE` | STOCK, ETF | US, EU | only when upstream gates pass |
| `market_data_refresh` | US+EU market history | `US_EU_MARKET_HISTORY` | STOCK, ETF | US, EU | gating upstream |
| `q1_delta_ingest` | US+EU raw bars | `US_EU_RAW_BARS` | STOCK, ETF | US, EU | gating upstream |

## Scope Boundaries

| Scope | Current Status | Promotion Gate |
| --- | --- | --- |
| US Stocks | fully supported | promotable when fresh |
| EU Stocks | supported (hist_probs, market_data) | promotable when fresh |
| US ETFs | hist_probs supported, forecast not first-class | promotable for hist_probs context only |
| EU ETFs | hist_probs supported, forecast not first-class | promotable for hist_probs context only |
| Non-US/EU | not covered | `not_promotable` — no calendar, no lookup |
| Indices | not covered in hist_probs/forecast | `not_promotable` |

## Compute Resource Reference

| Runner | Default Workers | Peak RSS (observed) | Mac Budget | Scaling Gate |
| --- | --- | --- | --- | --- |
| `hist_probs` turbo | 1 | ~670 MB (small scope) | 1.5 GiB (full-universe) | compute-audit gated 1→2→4 |
| `forecast_daily` | 1 (single-process) | ~642 MB (sample) | 1.0 GiB | — |
| `build-system-status-report` | 1 | negligible | — | — |
| `build-best-setups-v4` | 1 | `--max-old-space-size=8192` | — | — |

## Hard Rules

1. Unsupported scope may render as `degraded` or `empty_state`, but may **never** promote.
2. `forecast_daily` remains `not_promotable` for ETF and non-US assets until calendar and lookup support land.
3. `hist_probs` coverage is blocking only when:
   - The required universe is non-empty, AND
   - The run still reports `tickers_total === 0` or `tickers_covered === 0`
4. Frontpage and BUY surfaces must use the analyzer contract path, not raw symbol membership alone.
5. `latest`-snapshots are **forbidden** for matured evaluation — only `history_pack` data or v3 adjusted-series.
6. Coverage-Promise fields (`coverage_promise`, `coverage_observed`) in `epoch.json` must be machine-readable and honest.
7. External TA libraries and Arrow/Parquet optimizations remain optional until correctness parity and benchmark evidence exist.

## Version Tracking

| Runner | Schema Version Field | Feature Version Field | Outcome Version Field |
| --- | --- | --- | --- |
| `hist_probs` | `schema_version` (`rv_hist_probs_run_summary_v2`) | `feature_core_version` (`hist_probs_feature_core_v1`) | `outcome_logic_version` (`hist_probs_outcome_logic_v1`) |
| `forecast_daily` | `schema_version` (`forecast_record_v3` / `outcome_record_v3`) | `feature_version` (`forecast_feature_snapshot_v1`) | `model_version` propagated from champion |

## Incompatible Version Handling

- Version mismatch between checkpoint and current runner → force cold-rebuild (plan: `checkpoint-store.mjs`)
- Pending-/Maturity entries with mismatched `schema_version`/`model_version` → `deprecated`/`superseded`, never silently reused
