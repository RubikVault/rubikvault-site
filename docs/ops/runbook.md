# Runbook

## Reality Snapshot (Always First)
```bash
git status -sb
git diff --name-only | sed -n '1,120p'
ls -la
find docs -maxdepth 3 -type f 2>/dev/null | sed -n '1,200p' || true
find scripts -maxdepth 2 -type f 2>/dev/null | sed -n '1,200p' || true
```

## Local Proof Harness (Deterministic)
```bash
BASE_URL="http://127.0.0.1:${PORT:-8788}"
PIDFILE=".wrangler/dev-pages.pid"
LOGFILE=".wrangler/dev-pages.log"

rv_start_local_pages() {
  mkdir -p .wrangler

  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "wrangler already running (pid=$pid)"
      return 0
    fi
    rm -f "$PIDFILE"
  fi

  nohup npm run dev:pages:persist >"$LOGFILE" 2>&1 &
  echo $! >"$PIDFILE"
  echo "started wrangler (pid=$(cat "$PIDFILE")) log=$LOGFILE"
}

rv_wait_health() {
  local base="${1:-$BASE_URL}"
  local tries="${2:-80}"
  local sleep_s="${3:-0.25}"

  for ((i=1;i<=tries;i++)); do
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$base/api/health" || true)"
    if [[ "$code" == "200" ]]; then
      echo "health OK ($base/api/health)"
      return 0
    fi
    sleep "$sleep_s"
  done

  echo "health did not become ready: $base/api/health"
  tail -n 80 "$LOGFILE" 2>/dev/null || true
  return 1
}

rv_stop_local_pages() {
  if [[ ! -f "$PIDFILE" ]]; then
    echo "no pidfile: $PIDFILE"
    return 0
  fi
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
  fi
  rm -f "$PIDFILE"
}

rv_start_local_pages
rv_wait_health "$BASE_URL"

curl -fsS "$BASE_URL/api/resolve?q=Apple" | jq '{ok:(.error==null), data:.data, error:.error, metaStatus:(.metadata.status//null)}'
curl -fsS "$BASE_URL/api/stock?ticker=AAPL" | jq '{ok:(.error==null), status:(.metadata.status//null), source_chain:(.metadata.source_chain//null), latest_bar:(.data.latest_bar//null), indicatorsCount:(.data.indicators|length), error:(.error//null)}'
curl -fsS -I "$BASE_URL/analyze/AAPL" | tr -d "\r" | sed -n '1,12p'
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
