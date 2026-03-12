# RUNBLOCK v3.0 Config Fields

## `pipeline_config.yaml`

- `pipeline_order`: enforced execution order
- `data_integrity.price_deviation_tolerance_pct`: reconciliation tolerance
- `data_integrity.stale_threshold_minutes`: stale bar threshold
- `leakage_guards.purge_period_days`: training purge window
- `leakage_guards.embargo_period_days`: validation embargo window
- `walk_forward.*`: rolling validation defaults

## `regime_config.yaml`

- `fast_regime.thresholds.*`: daily fast regime triggers
- `weekly_regime.model`: weekly model family
- `weekly_regime.min_confidence`: fallback threshold
- `weekly_regime.fallback_global_state`: minimum state on low confidence
- `weekly_regime.model_fail_global_state`: minimum state on hard failure
- `regime_break.*`: cooldown and break confirmation settings

## `promotion_config.yaml`

- `shadow_mode_min_days`: minimum challenger shadow period
- `scientific_gates.*`: Scientific hard gates
- `forecast_gates.*`: Forecast hard gates
- `elliott_gates.*`: Elliott V1/V2 gates
- `structural_instability.*`: governance escalation settings

## `liquidity_buckets.yaml`

- `buckets.A-D`: tradability, spread, slippage and impact assumptions

## `audit_config.yaml`

- `decision_log.path`: append-only decision storage
- `incident_path`: append-only incident storage
- `failure_pattern_detection.*`: structural instability detector settings
- `explainability.*`: explainability enforcement rules

## `fallback_config.yaml`

- `scientific_suppressed.*`: explicit scientific fallback behavior
- `forecast_suppressed.*`: explicit forecast fallback behavior
- `elliott_invalidated.*`: passive-only Elliott behavior
- `global_red/global_orange/global_yellow.*`: UI and system-state fallback rules
