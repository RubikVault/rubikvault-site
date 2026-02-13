# 02_REUSE_GAP_MATRIX

## Reuse Classification Legend
- `REUSE AS-IS`: already present and aligned
- `EXTEND`: present but incomplete/misaligned
- `REPLACE (flagged)`: present but wrong for target policy; replace only behind shadow/flag
- `NOT PRESENT`: build required

## P0..P5 Matrix

| Point | Existing Evidence | Reuse Class | Gap | Risk | Next Action |
|---|---|---|---|---|---|
| P0.1 No-UI-break shadow path | UI hardcodes `/data/...` directly (`public/index.html:285,512,1801`; `public/scientific.html:671`; `public/forecast.html:421`) | EXTEND | No data-version switch/flag for shadow rollout | High | Add data-plane version switch in API/read resolver before cutover |
| P0.2 Forbid runtime external provider calls in UI | UI has no direct provider URLs (`rg` no matches) | EXTEND | No CI gate enforcing this invariant | Medium | Add CI script gate to fail on provider URLs in `public/`/`src/` |
| P0.3 last_good + stale semantics | Forecast has last_good pointers and stale/circuit states (`scripts/forecast/report_generator.mjs:14-17,411-505`; `public/forecast.html:655-680`) | EXTEND | No cross-feature global `_meta/latest.json` pointer | Medium | Introduce global metadata pointer while preserving existing forecast semantics |
| P0.4 publish quality gate | Artifact validator exists (`scripts/ci/verify-artifacts.mjs:1-107`) and used in CI (`.github/workflows/ci-gates.yml:121`) | EXTEND | No unified quality artifact at `public/data/quality/latest.json` | Medium | Add quality report artifact and wire into workflows |
| P0.5 budget/rate-limit accounting | Budget module exists (`functions/_shared/provider_budget.js:35-142`) | EXTEND | No run-level endpoint-by-endpoint budget ledger for data plane workflows | Medium | Add per-run call-accounting + budget envelope output |
| P1.1 DP1 EOD Snapshot Builder | `eod-latest` exists (`.github/workflows/eod-latest.yml:89`) writing `public/data/eod/*` and `pipeline/*` | REUSE AS-IS | Needs tighter metadata consistency (`asOf` null observed in market-prices snapshot) | Medium | Extend metadata contract and promote current builder |
| P1.2 DP2 Corporate Actions (splits/dividends) | Bars include fields (`scripts/providers/eodhd-backfill-bars.mjs` output uses `dividend/split`) but no dedicated split/div feed workflow | EXTEND | No dedicated backfill/delta corporate-actions product | Medium | Add split/dividend ingestion + incremental updater |
| P1.3 DP5 News Pack | News scripts exist (`scripts/update-news.mjs`, `functions/api/news.js`) but not integrated into 4-feature data-plane contract | EXTEND | Missing trigger-based, cached news pack for stock/forecast panels | Low/Med | Add optional triggered news pack with 24h cache + 3-day decay |
| P1.4 Exchanges list sync | No active exchanges-list ingestion found (`rg exchanges-list` in active workflows: none) | NOT PRESENT | Missing exchange-code coverage/validation sync | Low | Add validator-only exchanges-list sync job |
| P2.1 DP4 Market Pulse (derived) | `marketphase` + `pipeline truth` exist (`scripts/pipeline/build-marketphase-from-kv.mjs`, `build-ndx100-pipeline-truth.mjs`) | EXTEND | No unified deterministic pulse artifact for all 4 feature surfaces | Medium | Consolidate to one pulse artifact contract |
| P2.2 FX normalization (if multi-currency) | Canonical universe has only `ticker,name` and no exchange/currency (`jq keys`) | REUSE AS-IS (deferred) | Multi-currency not evidenced in current scope | Low | Track as P1 optional; skip implementation now |
| P2.3 Adjusted series from DP1+DP2 | EOD bars include `adjClose` fields | EXTEND | No explicit incremental adjusted-series rebuild policy from actions deltas | Medium | Add adjusted-series rebuild-on-affected-symbols only |
| P3.1 Global Data Age/Fallback Banner | Forecast has banner; stock/scientific/elliott do not share one global source | EXTEND | No shared global age/fallback UI component fed from `_meta/latest` | Medium | Add additive global badge/banner per feature page |
| P3.2 Stock Analyzer integration | Already consumes universe + stock-analysis + marketphase + /api/stock + /api/fundamentals | EXTEND | Needs additive pulse/news panels only via shadow path | Medium | Add non-breaking additive cards behind flag |
| P3.3 Elliott integration | Reads `/api/elliott-scanner` | EXTEND | Adjusted/unadjusted toggle absent in current UI | Low/Med | Add toggle only after adjusted-series pipeline exists |
| P3.4 Scientific integration | Reads `stock-analysis.json`; fundamentals not directly displayed on scientific page | EXTEND | Needs explicit data lineage/asOf display | Low | Add metadata display only |
| P3.5 Forecast trust UI | Existing status/degraded/last_good semantics are present | REUSE AS-IS | Needs stronger lineage + budget/fallback visibility | Low/Med | Extend metadata, keep current behavior |
| P4 Retention/Cleanup | Cleanup script exists (`scripts/cleanup-daily-snapshots.sh`) but no active workflow uses it | EXTEND | No active retention workflow for growing snapshots/mirrors | Medium | Add scheduled retention workflow with dry-run + guardrails |
| P5 Migration strategy | No repo-wide 30-day old-vs-new dual-run policy artifact | NOT PRESENT | Missing deterministic migration checklist/gates | High | Add explicit parallel-run + diff gates before switch |

## M1..M9 Added Missing Points Matrix

| Missing Point | Existing Evidence | Reuse Class | Gap | Next Action |
|---|---|---|---|---|
| M1 Symbol normalization mapping | Normalizers exist (`public/index.html:517-521`, `functions/api/_shared/symbol-normalize.mjs`) | EXTEND | No central cross-provider mapping policy artifact | Add mapping policy + validator |
| M2 JSON schema contracts for new DP outputs | Partial schema checks exist in CI (`.github/workflows/ci-gates.yml:149-176`) | EXTEND | Not all target DP artifacts covered | Add schemas + enforce for new paths |
| M3 Trading date resolution | Forecast trading-date resolver exists (`scripts/forecast/trading_date.mjs:12-26,138-165`) | EXTEND | Static holiday window ends at listed years; no global resolver for all DPs | Add shared resolver + yearly gate |
| M4 Lineage/provenance | Build metadata exists in ops pulse (`scripts/ops/build-ops-pulse.mjs:21-30`) | EXTEND | Not unified across all data products | Add mandatory meta `{build_id,commit,runId,generatedAt}` |
| M5 Circuit breaker + core-only mode | Forecast DQ circuit exists (`scripts/forecast/run_daily.mjs:41-53,225-245`) | EXTEND | No global core-only mode when budget constrained | Add global core-only mode policy |
| M6 Parallel producer detection | Multiple writers to overlapping paths (`eod-latest.yml:116` and `ops-daily.yml:112`) with different concurrency groups | EXTEND | Cross-workflow race potential | Add shared concurrency group for common write targets |
| M7 Secrets hygiene | Preflight checks exist (`scripts/ops/preflight-check.mjs:57-107`) | EXTEND | No centralized secret lint for all workflows | Add secrets contract checker |
| M8 UI layout consistency | Existing design system in feature pages | REUSE AS-IS | Need additive panels to reuse existing classes only | Enforce style/token reuse in UI plan |
| M9 Payload sizing/performance | Asset budget CI exists (`ci-gates.yml:17-95`) | EXTEND | No DP-partition/compression rulebook for new products | Add partitioning/compression standards |

## Key High-Risk Gaps Requiring First Action
1. Universe refresh currently calls EODHD fundamentals (tier-locked): `scripts/universe/fetch-constituents.mjs:50`.
2. No active producer workflow for `public/data/snapshots/market-prices/latest.json` (only monitor reads it in workflow): `.github/workflows/monitor-prod.yml:105` and no producer invocation found in workflow grep.
3. No global shadow data-path switch; current UI hardcodes `/data/...` paths.
