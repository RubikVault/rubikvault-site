# 07 Feature Store SSOT Proof

## Policy SSOT Definition
Evidence:
- `policies/forecast/v6/feature_store_policy.v6.json:5-7` declares SSOT=`by_date` and write template `mirrors/forecast/ledgers/features/by_date/YYYY-MM-DD.parquet.zst`.
- `policies/forecast/v6/feature_store_policy.v6.json:10-14` by_symbol local-only + CI forbidden paths.

## Implementation Writes by_date Only
Evidence:
- `scripts/forecast/v6/lib/feature_build.mjs:172-177` resolves by_date SSOT output path and writes it atomically (unless dry-run).
- `scripts/forecast/v6/lib/feature_build.mjs:127-133` chunked symbol processing from memory policy.
- `scripts/forecast/v6/lib/feature_build.mjs:155-169` canonical sort + f64 metadata in output document.

## CI Blocking of by_symbol Writes
Evidence:
- `scripts/forecast/v6/lib/feature_cache_sync.mjs:4-7` explicit CI guard throws `CI_CACHE_WRITE_FORBIDDEN`.
- `scripts/forecast/v6/run_daily_v6.mjs:734-741` cache sync is called only in LOCAL mode.

## Git Hygiene for Local Cache
Evidence:
- `.gitignore:95-98` ignores `mirrors/forecast/cache/**` and `mirrors/forecast/ledgers/features/by_symbol/**`.

## Feature Policy Gate Coupled to Stage2
Evidence:
- `policies/forecast/v6/feature_policy.v6.json:27-31` enforce step and circuit-open reason.
- `scripts/forecast/v6/run_daily_v6.mjs:718-732` stage2 feature policy enforcement immediately after build.
