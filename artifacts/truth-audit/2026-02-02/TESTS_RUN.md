# Truth Audit Commands (2026-02-02)

Commands executed:

```
BASE_URL="https://rubikvault.com" node scripts/truth-audit/fetch_raw.mjs
node scripts/truth-audit/static_scan.mjs
BASE_URL="https://rubikvault.com" node scripts/truth-audit/run_scenarios.mjs
node -e "import('./scripts/truth-audit/inspect_shapes.mjs').then(()=>console.log('inspect_shapes ok'))"
```

Outputs:
- `RAW_INDEX.json` created under `artifacts/truth-audit/2026-02-02/raw/`.
- `STATIC_REFERENCES.json` created under `artifacts/truth-audit/2026-02-02/`.
- `RUNTIME_TELEMETRY.json` and `SCENARIO_MATRIX.md` created under `artifacts/truth-audit/2026-02-02/`.

Notes:
- Scenario S3 reports OPS P6 status as FAIL (see `SCENARIO_MATRIX.md`).
