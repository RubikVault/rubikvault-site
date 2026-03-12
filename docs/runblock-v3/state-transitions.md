# RUNBLOCK v3.0 State Transitions

## Global States

- `GREEN`: all critical systems healthy
- `YELLOW`: warning mode, outputs allowed only where feature state permits
- `ORANGE`: degraded core mode, explicit disclaimer required
- `RED`: hard stop, no directional output, no promotion

## Escalation Triggers

- Data Integrity `FAIL` -> `RED`
- Leakage assertion failure -> `RED`
- Snapshot or audit immutability failure -> `RED`
- Weekly regime model hard failure -> minimum `ORANGE`
- Weekly regime low confidence fallback -> minimum `YELLOW`
- Confirmed regime break -> promotion freeze, governance escalation
- Scientific suppression -> at least `ORANGE`
- Elliott invalidation alone -> at most `YELLOW`

## Feature State Rules

- Scientific `SUPPRESSED` -> no expected return output
- Forecast `SUPPRESSED` -> no directional probability or bullish/bearish label
- Elliott `INVALIDATED` -> passive structure only, no directional interpretation

## Promotion Rules

- No promotion during regime-break cooldown
- No promotion with structural instability
- No promotion after leakage failure
- No promotion with negative net return after costs
