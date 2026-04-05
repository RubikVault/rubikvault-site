## Project DNA
- Budget: 0€ (free-tier only).
- Team: 1 person; AI writes code, user reviews and pushes (Git-native).
- Stack: Cloudflare Pages + Pages Functions + KV; static output in `public/`.
- Static-first: UI consumes `public/data/*.json` via CDN; `/api` is not required for initial page load.
- Reliability: Misstrauens-Architektur, KV-first but never KV-only, Mirror Fallback required.

## Hard Constraints
- No paid services or new external dependencies.
- Do not re-architect the product or change working endpoints.
- Minimal diffs; keep patches small and safe.

## Read First
- `docs/ops/contract.md`
- `docs/ops/runbook.md`
- `docs/ops/architecture.md`
- `docs/ops/decisions.md`
- `docs/ops/nas-runbook.md`
- `docs/ops/nas-benchmark-plan.md`
- `docs/ops/nas-migration-journal.md`

## Non-Negotiables (Engineering Rules)
- Before any change: run Reality Snapshot.
- Envelope Contract: meta must never be null; all `/api/*` return `{ok, feature, data, error, meta}`.
- KV truthiness: do not conflate missing debug token with missing KV binding.
- Mirror Fallback required; Preview can be READONLY; do not fail hard if upstream missing.
- Debugging must be deterministic and evidence-based; no hallucinated fixes.
- Middleware is Content-Type gated only; never parse or wrap non-JSON responses.
- NAS rule: no deletes, no Photos/QuickConnect/SMB disruption, and no heavy pipeline migration without explicit validation.
- NAS migration rule: Mac stays primary until a NAS stage has 3 matching shadow runs, stable metrics, and a documented rollback.
- NAS benchmark rule: the Mac-built input manifest must be verified on the NAS before any shadow job starts, and overlapping benchmark runs are forbidden.
- NAS dataset rule: `CONFIG` and `SAMSUNG` are bootstrap-only sources; overnight benchmarks must not depend on those drives remaining mounted on the Mac.
- Current NAS benchmark verdict:
  - `stage1`, `stage2`, `stage3`, `stage4:scientific_summary` are benchmarked NAS offload candidates
  - `stage4:etf_diagnostic` is benchmarked `mac_only`
- `stage4:daily_audit_report` and `stage4:cutover_readiness_report` are seeded but still `insufficient_data`
- Benchmark SSOT outputs live in `tmp/nas-benchmarks/` and must be checked before proposing any NAS production migration.
- Pipeline SSOT outputs for NAS decision-making are:
  - `tmp/nas-benchmarks/pipeline-census-latest.json`
  - `tmp/nas-benchmarks/nas-main-device-feasibility-latest.json`
  - `tmp/nas-benchmarks/pipeline-proof-matrix-latest.md`

## Standard Workflow
1) Reality Snapshot first.
2) Make the smallest possible change (no re-architecture).
3) Run Standard Validation Commands and report outputs.
4) Do not claim fixed until validations pass.
5) Keep commits scoped and separate per concern.

## Standard Validation Commands
```bash
PREVIEW="https://<preview>.pages.dev"

# Envelope must have meta
curl -fsS "$PREVIEW/api/price-snapshot?debug=1" | jq '{feature, ok, hasMeta:(.meta!=null), metaStatus:(.meta.status//null), metaReason:(.meta.reason//null)}'
curl -fsS "$PREVIEW/api/alpha-radar?debug=1" | jq '{feature, ok, hasMeta:(.meta!=null), metaStatus:(.meta.status//null), metaReason:(.meta.reason//null)}'

# Debug-bundle KV truthiness
curl -fsS "$PREVIEW/api/debug-bundle" | jq '{hasKV:.infra.kv.hasKV, bindingPresent:.infra.kv.bindingPresent, opsWorking:.infra.kv.opsWorking, errors:.infra.kv.errors}'

# Sentiment header must be a single JSON content-type
curl -fsS -D- "$PREVIEW/api/sentiment-barometer?debug=1" -o /dev/null | sed -n '1,25p' | egrep -i 'HTTP/|content-type' || true

# Static MIME smoke checks
bash scripts/smoke-static-mime.sh "$PREVIEW"

# Health summary check
curl -fsS "$PREVIEW/api/health-report" | jq '{ok, feature, status:.data?.status, summary:.data?.summary}'

# JSON envelope smoke
curl -fsS "$PREVIEW/api/top-movers?debug=1" | jq '{ok, feature, metaStatus:.meta.status, hasItems:(.data.items|type)}'

# og-image passthrough (must be 200 + image/svg+xml)
curl -sS -D - "$PREVIEW/api/og-image?symbol=AAPL" -o /dev/null | sed -n '1,10p'
```

## Middleware Rules (Non-Negotiable)

- Middleware must NEVER parse or wrap non-JSON responses.
- Binary endpoints (e.g. /api/og-image) are passthrough, even with ?debug=1.
- Content-Type decides behavior, not heuristics.
- Parse errors must degrade gracefully (return original response).
- Smoke tests are authoritative over assumptions.
