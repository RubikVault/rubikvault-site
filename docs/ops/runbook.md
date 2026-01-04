# Runbook

## Reality Snapshot (Always First)
```bash
git status -sb
git diff --name-only | sed -n '1,120p'
ls -la
find docs -maxdepth 3 -type f 2>/dev/null | sed -n '1,200p' || true
find scripts -maxdepth 2 -type f 2>/dev/null | sed -n '1,200p' || true
```

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
```

## Preview vs Prod Drift Checklist
- Verify Cloudflare Pages Preview bindings/variables vs Prod.
- Confirm KV namespace binding exists (`RV_KV`).
- Expected Preview behavior: `writeMode=READONLY`, `MIRROR_FALLBACK` allowed.
- Do not misreport missing bindings as upstream failures.

## Logging and Debugging Principles
- Evidence-based: show real outputs; do not assume.
- Minimal diffs; isolate fixes; keep commits small.
- Always show retest commands and outputs.
