# 07_BINDINGS_AND_STATE

## Repo Binding Evidence (SSOT_CHECK)
Sources:
- `Report/A/04_SSOT_EVIDENCE/21_wrangler_full.txt`
- `Report/A/04_SSOT_EVIDENCE/16_key_snippets.txt`
- `Report/A/04_SSOT_EVIDENCE/09_debug_kv_rg.txt`

### Declared bindings
- `wrangler.toml:9-12` declares KV binding `RV_KV` with `id` and `preview_id`.

### Runtime code semantics
- `functions/api/_shared/cache-law.js:70` says: `KV writes are disabled in functions; keep cache read-only.`
- `functions/api/_shared/resilience.js:185-186` reads `env?.RV_KV` and computes `hasKV`.
- `functions/api/_shared/resilience.js:248-264` emits explicit reasons (`BINDING_MISSING`, `MIRROR_FALLBACK`) when fallback path is used.

## Deployed Binding/State Evidence (DEPLOYED_CHECK)
Sources:
- `Report/A/02_DEPLOYED_EVIDENCE/*/api_mission-control_summary_debug_1/default/body.raw`
- `Report/A/02_DEPLOYED_EVIDENCE/*/api_debug-bundle/default/body.raw`
- `Report/A/02_DEPLOYED_EVIDENCE/*/api_scheduler_health/default/body.raw`
- `Report/A/02_DEPLOYED_EVIDENCE/*/api_universe_debug_1/default/body.raw`

### Preview base (`71d62877...`)
- Mission-control summary reports:
  - `data.hasKV=true`
  - `data.runtime.kvExpected=false`
  - `data.runtime.schedulerExpected=false`
  - `data.runtime.env="preview"`
- Scheduler health: HTTP 503 with `error.code="SCHEDULER_STALE"`, `status="never_ran"`.

### Prod base (`rubikvault.com`)
- Mission-control summary reports:
  - `data.hasKV=true`
  - `data.runtime.kvExpected=true`
  - `data.runtime.schedulerExpected=true`
  - `data.opsBaseline.runtime.isProduction=true`
  - `data.runtime.env="preview"` (inconsistent with `isProduction=true`)
- Scheduler health: HTTP 503 with `error.code="SCHEDULER_STALE"`, `status="never_ran"`.

### Debug bundle / universe debug endpoints
- `/api/debug-bundle` responds `ok=true` but `metadata.reason="ASSET_FETCH_FAILED"` and runtime block says `env="preview"` on both bases.
- `/api/universe?debug=1` responds `ok=false`, `error.code="NOT_FOUND"`, and references legacy snapshot path `/data/snapshots/universe/latest.json`.

## Binding/State Mismatch Classification (INTEGRATION_CHECK)
- `RV_KV` binding is declared and runtime-visible (`hasKV=true`) on both bases.
- State diagnostics are not cohesive:
  - Scheduler is expected on prod but reports stale/no heartbeat.
  - Runtime env labeling conflicts (`runtime.env="preview"` while production flags are true).
  - Universe debug path expects missing legacy artifact path.

Implication:
- Binding exists, but observability/state pathways are partially legacy and inconsistent across diagnostics.
