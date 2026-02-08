# 08 Outcome Revision and Manifest Binding

## Bars Manifest Contract
Evidence:
- `schemas/forecast/v6/bars.schema.json:5-19` requires `provider`, `provider_revision`, `partitions`, `hashes`, `bars_manifest_hash`.
- `scripts/forecast/v6/run_daily_v6.mjs:184-227` constructs manifest from consumed bar partitions + hashes.
- `scripts/forecast/v6/run_daily_v6.mjs:568-571` writes daily bars manifest ledger.

## Outcome Contract Binding to Bars Manifest
Evidence:
- `policies/forecast/v6/outcome_policy.v6.0.json:10-12` sets `bars_manifest_binding` and revision naming law.
- `schemas/forecast/v6/outcomes.schema.v6.json:13-24` requires `bars_manifest_hash` and `algorithm_hash` on every outcome row.
- `scripts/forecast/v6/lib/outcome_engine.mjs:167-180` writes matured outcome rows including `bars_manifest_hash`.

## Revision Stream Logic
Evidence:
- `scripts/forecast/v6/lib/outcome_engine.mjs:69-103` determines revision (`v6.0-rN`) by manifest-map drift.
- `scripts/forecast/v6/lib/outcome_engine.mjs:16-20` stream path includes revision directory.
- `scripts/forecast/v6/lib/outcome_engine.mjs:195-201` append-only writes by stream partition.

## Pending Queue + Backlog
Evidence:
- `scripts/forecast/v6/lib/outcome_engine.mjs:7-10` pending queue path.
- `scripts/forecast/v6/lib/outcome_engine.mjs:139-151` pending/matured split logic.
- `scripts/forecast/v6/lib/outcome_engine.mjs:204-208` backlog days metric derivation.

## Runtime Determinism Evidence
Command:
```bash
node scripts/forecast/v6/lib/test_determinism.mjs --date=2026-02-06
```
Output excerpt:
```json
{
  "ok": true,
  "pass": true,
  "report": "mirrors/forecast/ledgers/diagnostics/determinism/2026-02-06.md"
}
```
Hash report evidence:
- `mirrors/forecast/ledgers/diagnostics/determinism/2026-02-06.md` contains identical run1/run2 hashes for candidates/features/predictions/publish inputs.
