# 03 v6 Laws Checkpoint

## SSOT + Two-Phase + Determinism
Evidence:
- `policies/forecast/v6/policy.v6.json:31-35` sets paths (`ssot=mirrors/forecast`, `published=public/data/forecast/v6`) and `option_a_two_phase=true`.
- `policies/forecast/v6/policy.v6.json:15-21` sets determinism (`global_seed`, `f64`, canonical sort).
- `policies/forecast/v6/policy.v6.json:23-29` sets mode law (`LOCAL allow_weights=true`, `CI allow_weights=false`).

## Feature/Store Laws
Evidence:
- `policies/forecast/v6/feature_policy.v6.json:5-12` forbids raw absolute price/volume columns.
- `policies/forecast/v6/feature_policy.v6.json:22-31` enforces winsorization and circuit-open on violation.
- `policies/forecast/v6/feature_store_policy.v6.json:5-14` sets SSOT=by_date, by_symbol local-only, CI forbidden paths.

## Monitoring/Rollback Laws
Evidence:
- `policies/forecast/v6/monitoring_policy.v6.json:5-10` thresholds + `ROLLBACK_TO_LAST_GOOD`.
- `scripts/forecast/v6/lib/rollback.mjs:63-69` last_good pointer update schema.
- `scripts/forecast/v6/lib/rollback.mjs:186-195` rollback history + stats updates.

## Calendar/Trading-Date Law
Evidence:
- `policies/forecast/v6/trading_calendar_policy.v6.json:5-9` exchange NYSE, holiday source, fallback fail-mode.
- `scripts/forecast/v6/lib/trading_date.mjs:85-104` trading_date resolver with timezone + calendar-based rollback to previous trading day.
- `scripts/forecast/v6/lib/calendar/nyse_holidays.json:4-13` pinned holiday coverage years 2024-2030.

## MoE/Outcomes Laws
Evidence:
- `policies/forecast/v6/moe_policy.v6.json:5-11` soft/hard + hysteresis.
- `policies/forecast/v6/moe_state_policy.v6.json:5-9` persistent ledger path + read previous day.
- `policies/forecast/v6/outcome_policy.v6.0.json:5-12` immutable outcomes + bars manifest binding + revision stream naming.
