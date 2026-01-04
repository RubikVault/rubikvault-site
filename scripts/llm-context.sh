#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "AI_CONTEXT.md"
  "docs/ops/contract.md"
  "docs/ops/runbook.md"
  "docs/ops/architecture.md"
  "docs/ops/decisions.md"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

echo "== git status =="
git status -sb

echo
echo "== changed files =="
git diff --name-only

echo
echo "== AI_CONTEXT.md (head) =="
sed -n '1,80p' AI_CONTEXT.md

echo
echo "== docs/ops headings =="
grep -hE '^#{1,2} ' docs/ops/*.md

echo
echo "== Standard Validation Commands =="
cat <<'EOC'
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
EOC
