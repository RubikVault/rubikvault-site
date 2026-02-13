# Data Pipeline Rescue (eod-latest -> ops-daily -> forecast)

## 1) eod-latest recovery
- Old failure signature: run `21844075239` -> `FAIL: expected=100 but fetched=0`.
- Fixes:
  - Provider diagnostics in workflow (`.github/workflows/eod-latest.yml:73-86`).
  - EODHD fetch support (`scripts/eod/build-eod-latest.mjs:190-212`).
  - Previous pipeline fallback reference (`scripts/eod/build-eod-latest.mjs:307-353`).
  - Provider-empty interlock writes degraded metadata, no empty overwrite (`scripts/eod/build-eod-latest.mjs:518-526`).
- Verified: run `21921265115` succeeded.

## 2) ops-daily status
- Current blocker: missing Cloudflare API token in this execution context.
- Evidence: run `21921377474` -> `BLOCKING KV_UNAVAILABLE: CF_API_TOKEN is missing`.
- Preflight source: `scripts/ops/preflight-check.mjs:85-91` + fail exit `117-123`.
- Classification: `BLOCKED_EXTERNAL` (config/secrets).

## 3) forecast chain
- Prior failure evidence: run `21766433410` had `Missing price data 80.7%` and circuit open.
- After EOD recovery: run `21921267096` logs `Loaded prices for 517 tickers` and `Missing price data: 0.0%`.
- Workflow hardening: `forecast-daily` and `forecast-weekly` permissions+concurrency (`.github/workflows/forecast-daily.yml:14-20`, `.github/workflows/forecast-weekly.yml:14-20`).

## 4) Outcome
- Core publish path recovered for EOD + forecast daily on branch.
- Remaining red in ops is explicit external-secret dependency, not silent failure.
