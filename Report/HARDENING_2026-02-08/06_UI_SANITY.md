# 06_UI_SANITY

## Runtime smoke evidence (headless)
Command (Playwright eval):
- `node <<'NODE' ... goto('http://localhost:8788/forecast') ... read bootstrap/status DOM ...`

Observed JSON:
```json
{
  "bootstrap_display": "block",
  "bootstrap_text": "⚠️ Circuit Open: Missing price data 100.0% exceeds threshold 5%",
  "system_status": "● Circuit Open",
  "forecast_count": "0 stocks",
  "circuit_state": "OPEN",
  "circuit_reason": "Missing price data 100.0% exceeds threshold 5%"
}
```

Interpretation:
- Forecast page shows `0 stocks` with explicit reason text (not silent empty state).
- State labeling visible as `Circuit Open` and `OPEN`.

## Existing repository smoke test behavior
Command:
- `npm run test:forecast-ui`

Observed failure:
- `Forecast table has 1 rows, expected ≥100`

Interpretation:
- Existing smoke test encodes a hard expectation of large non-empty forecast rows; this is incompatible with intentional circuit-open/bootstrap behavior.
- The new hardening path still provides visible explanation text for empty forecast state.
