# RubikVault Runbook (Preview)

## Env Vars (Cloudflare Pages)
- Required: `RV_KV` (KV binding)
- Optional: `FINNHUB_API_KEY` (earnings/quotes enrichment)
- Optional: `MARKETAUX_KEY` (news intelligence sentiment)
- Optional: `FMP_API_KEY` (sector rotation/proxies)

## KV / Stale Mode
- Functions use KV-first caching. When upstream fails, stale KV (or client shadow cache) is returned.
- UI shows stale/partial badges instead of empty cells.
- If KV binding is missing, APIs return `BINDING_MISSING` and UI falls back to local shadow cache when available.

## Quick Checks
- `/api/yield-curve` and `/api/sector-rotation` should return numbers or `isStale: true`.
- `/api/news` and `/api/news-intelligence` should always return JSON (never HTML).
- Phase 1–3 endpoints (all return HTTP 200 JSON):
  - `/api/market-regime`
  - `/api/why-moved`
  - `/api/volume-anomaly`
  - `/api/hype-divergence`
  - `/api/congress-trading`
  - `/api/insider-cluster`
  - `/api/analyst-stampede`
  - `/api/smart-money`
  - `/api/alpha-performance`
  - `/api/earnings-reality`

## Mission Control Smoke (Ops)
```bash
BASE_URL="http://127.0.0.1:${PORT:-8788}"

# 1) Mission Control page is static (and should not auto-poll)
curl -fsS -I "$BASE_URL/mission-control" | tr -d "\r" | sed -n '1,15p'
curl -fsS "$BASE_URL/mission-control.html" | rg -n 'setInterval\(|Polling: OFF|/api/mission-control/summary' | head -n 40

# 2) Summary endpoint works and returns strict v3 envelope + budgets
curl -fsS "$BASE_URL/api/mission-control/summary" | jq '{schema_version, metaStatus:(.metadata.status//null), hasKV:(.data.hasKV//null), asOf:(.data.asOf//null), budgets:(.data.budgets//null)}'

# 3) Debug gating: only debug should include heavy sections
curl -fsS "$BASE_URL/api/mission-control/summary" | jq '{hasFailures:(.data.failures.day|length), hasLive:(.data.liveApis.items|length)}'
curl -fsS "$BASE_URL/api/mission-control/summary?debug=1" | jq '{hasFailures:(.data.failures.day|length), hasLive:(.data.liveApis.items|length)}'

# 4) Cache headers (CDN + server-side cache): should be >= 10s
curl -fsS -I "$BASE_URL/api/mission-control/summary" | tr -d "\r" | rg -n 'cache-control|etag|cf-cache-status' || true
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

rv_start_local_pages
rv_wait_health "$BASE_URL"

curl -fsS "$BASE_URL/api/resolve?q=Apple" | jq '{ok:(.error==null), data:.data, error:.error, metaStatus:(.metadata.status//null)}'
curl -fsS "$BASE_URL/api/stock?ticker=AAPL" | jq '{ok:(.error==null), status:(.metadata.status//null), source_chain:(.metadata.source_chain//null), latest_bar:(.data.latest_bar//null), indicatorsCount:(.data.indicators|length), error:(.error//null)}'
curl -fsS -I "$BASE_URL/analyze/AAPL" | tr -d "\r" | sed -n '1,12p'
```

## Social Output (Local)
- Generate daily summaries into `public/posts/`:
  - `node scripts/generate-posts.js http://localhost:8788`
- Output files: `<feature>_YYYY-MM-DD.json` (text-only captions for Twitter/LinkedIn/IG).

## New Files Added
- `functions/api/_shared/feature-contract.js` (dataQuality + confidence helpers)
- `functions/api/_shared/stooq.js` (keyless daily CSV fetch helper)
- `functions/api/*` (phase 1–3 endpoints)
- `features/rv-*` (phase 1–3 renderers)
- `assets/js/rv-*.js` (thin wrappers)
- `scripts/generate-posts.js` (social summary generator)
- `public/posts/.gitkeep` (posts directory placeholder)
