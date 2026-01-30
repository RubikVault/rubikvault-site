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

# Missing mirror semantic equivalence (ignores extra top-level metadata)
node scripts/ops/verify-missing-mirror-semantic.mjs

# Preview semantic check (download then compare)
# BASE="https://<preview>.pages.dev"
# curl -fsS "$BASE/data/marketphase/missing.json" > /tmp/marketphase-missing.json
# curl -fsS "$BASE/data/pipeline/missing.json" > /tmp/pipeline-missing.json
# node scripts/ops/verify-missing-mirror-semantic.mjs /tmp/marketphase-missing.json /tmp/pipeline-missing.json
```

## Preview vs Prod Drift Checklist
- Verify Cloudflare Pages Preview bindings/variables vs Prod.
- Confirm KV namespace binding exists (`RV_KV`).
- Expected Preview behavior: `writeMode=READONLY`, `MIRROR_FALLBACK` allowed.
- Do not misreport missing bindings as upstream failures.

 ## Provider Auth + Env/KV Diagnosis (EOD Stock Analyzer)
 ```bash
 # Base URLs
 DEV_BASE="http://127.0.0.1:8788"
 PREVIEW_BASE="https://<preview>.pages.dev"
 PROD_BASE="https://rubikvault.com"
 
 # Primary debug target
 TICKER="AAPL"
 ```

 ### Known Provider Request Shapes (authoritative)
 - Tiingo EOD (primary)
   - URL: `https://api.tiingo.com/tiingo/daily/<SYMBOL>/prices`
   - Auth (as implemented in code): query param `token=$TIINGO_API_KEY`
   - Params: `resampleFreq=daily`, optional `startDate=YYYY-MM-DD`
   - Common auth failure: `HTTP 403` => normalized to `AUTH_FAILED`
 - Twelve Data EOD (secondary)
   - URL: `https://api.twelvedata.com/time_series`
   - Params: `symbol=<SYMBOL>`, `interval=1day`, `outputsize=260`, `apikey=$TWELVEDATA_API_KEY`
   - Common auth failure: HTTP `401` or payload `{status:"error"}` => normalized to `AUTH_FAILED`

 Note on Tiingo auth probes:
 - If you test Tiingo manually using `Authorization: Token ...`, that is a Tiingo-supported pattern.
 - Our production code path uses the `token=` query param.
 - If the token is invalid, both patterns will fail, but the error shape/message can differ.

 ### 0) Confirm Local Server + Binding Basics (dev)
 ```bash
 curl -fsS "$DEV_BASE/api/health" | jq '{ok, feature, status:(.data?.status // null), err:(.error // null)}'
 
 # KV binding sanity comes from debug bundle (binding presence + opsWorking)
 curl -fsS "$DEV_BASE/api/debug-bundle" | jq '{hasKV:.infra.kv.hasKV, bindingPresent:.infra.kv.bindingPresent, opsWorking:.infra.kv.opsWorking, errors:.infra.kv.errors}'
 ```

 ### 1) Observe Current Provider Failures from the Contract (no guessing)
```bash
 curl -fsS "$DEV_BASE/api/stock?ticker=$TICKER" \
   | jq '{
     status:.metadata.status,
     forced:(.metadata.source_chain.forced//null),
     selected:(.metadata.source_chain.selected//null),
     fallbackUsed:(.metadata.source_chain.fallbackUsed//null),
     failureReason:(.metadata.source_chain.failureReason//null),
     primaryFailure:(.metadata.source_chain.primaryFailure.code//null),
     error:(.error.code//null)
   }'
 ```

 ### Stock Status Semantics (Option 1: index-only market-*)
 - `metadata.status=ERROR` when `error` payload is present (wins over anything).
 - `metadata.status=PARTIAL` only when `metadata.reasons` includes `INSUFFICIENT_HISTORY`.
 - `metadata.status=OK` when EOD bars + indicators are complete, even if `metadata.reasons` includes `DATA_NOT_READY`.
 - `market-prices` and `market-stats` snapshots are index-proxy scoped (e.g. `SPY/QQQ/DIA/IWM`).
   - For equities like `AAPL`, snapshot lookup is expected to fail (`record_found=false`).
   - This may add `DATA_NOT_READY` to `metadata.reasons` but does not block `OK`.

 Deterministic attribution proof (dev):
 ```bash
 curl -fsS "$DEV_BASE/api/stock?ticker=$TICKER" \
   | jq '{
     status:.metadata.status,
     reasons:(.metadata.reasons//[]),
     mp:(.metadata.sources["market-prices"]//null),
     ms:(.metadata.sources["market-stats"]//null)
   }'
 
 # Narrow view: lookup attribution fields
 curl -fsS "$DEV_BASE/api/stock?ticker=$TICKER" \
   | jq '{
     market_prices:{lookup_key:.metadata.sources["market-prices"].lookup_key, record_found:.metadata.sources["market-prices"].record_found, note:(.metadata.sources["market-prices"].note//null)},
     market_stats:{lookup_key:.metadata.sources["market-stats"].lookup_key, record_found:.metadata.sources["market-stats"].record_found, note:(.metadata.sources["market-stats"].note//null)}
   }'
 ```

 ### 2) Isolate Provider Auth with Forced Mode (dev)
 Use forced mode to remove ambiguity in failover logic.

 Important: `RV_FORCE_PROVIDER=... curl ...` only sets an env var for the `curl` process.
 The running Wrangler dev server will not see it.

 Deterministic local forced-mode options:
 - Option A (recommended): set `RV_FORCE_PROVIDER` in `.dev.vars` and (re)start Wrangler.
 - Option B: start Wrangler from a shell where `RV_FORCE_PROVIDER` is exported (only works if Wrangler maps process env into `context.env` for Pages dev; `.dev.vars` is the reliable path).

 ```bash
 # Create/overwrite local dev vars file (do not commit it)
 cat > .dev.vars <<'EOF'
 RV_FORCE_PROVIDER=tiingo
 # TIINGO_API_KEY=... (optional)
 # TWELVEDATA_API_KEY=... (optional)
 EOF

 # Restart Wrangler after changing .dev.vars
 pkill -f "wrangler pages dev" 2>/dev/null || true
 pkill -f "workerd" 2>/dev/null || true
 nohup npm run dev:pages:std > /tmp/rv_wrangle.log 2>&1 &

 # Proof: forced must show up in payload
 curl -fsS "$DEV_BASE/api/stock?ticker=$TICKER" \
   | jq '{forced:(.metadata.source_chain.forced//null), selected:(.metadata.source_chain.selected//null), failureReason:(.metadata.source_chain.failureReason//null), primaryFailure:(.metadata.source_chain.primaryFailure.code//null), status:(.metadata.status//null)}'

 # Switch forced provider to Twelve Data: update .dev.vars, restart, and re-check
 perl -0777 -i -pe 's/RV_FORCE_PROVIDER=tiingo/RV_FORCE_PROVIDER=twelvedata/g' .dev.vars
 pkill -f "wrangler pages dev" 2>/dev/null || true
 pkill -f "workerd" 2>/dev/null || true
 nohup npm run dev:pages:std > /tmp/rv_wrangle.log 2>&1 &
 curl -fsS "$DEV_BASE/api/stock?ticker=$TICKER" \
   | jq '{forced:(.metadata.source_chain.forced//null), selected:(.metadata.source_chain.selected//null), failureReason:(.metadata.source_chain.failureReason//null), primaryFailure:(.metadata.source_chain.primaryFailure.code//null), status:(.metadata.status//null)}'
 ```

 Expected:
 - If the forced provider key is missing/invalid, you should see:
   - `metadata.status=ERROR`
   - `source_chain.failureReason=FORCED_PROVIDER_FAILED`
   - `source_chain.primaryFailure.code` is one of:
     - `MISSING_API_KEY`
     - `AUTH_FAILED`

 ### 3) Verify Env Vars in Local Wrangler
 Local Pages dev reads secrets from your shell environment.

 ```bash
 # Confirm they exist in your current shell session (do NOT paste values into logs)
 test -n "$TIINGO_API_KEY" && echo "OK: TIINGO_API_KEY set" || echo "MISSING: TIINGO_API_KEY"
 test -n "$TWELVEDATA_API_KEY" && echo "OK: TWELVEDATA_API_KEY set" || echo "MISSING: TWELVEDATA_API_KEY"
 
 # If keys are set but you still see AUTH_FAILED:
 # - Tiingo 403 usually means token invalid / wrong product / quota / account issue.
 # - TwelveData 401 usually means missing/invalid key or plan restriction.
 ```

 ### 4) Preview vs Prod: Binding & Env Drift Checklist (Cloudflare Pages)
 In Cloudflare Pages Dashboard (Preview + Prod):
 - Ensure KV binding `RV_KV` is present and points to the correct namespace.
 - Ensure env vars are set (Preview + Prod separately):
   - `TIINGO_API_KEY`
   - `TWELVEDATA_API_KEY`
   - Optional: `RV_FORCE_PROVIDER` should generally be unset.

 Validate via behavior (no secrets):
 ```bash
 curl -fsS "$PREVIEW_BASE/api/debug-bundle" | jq '{bindingPresent:.infra.kv.bindingPresent, opsWorking:.infra.kv.opsWorking, errors:.infra.kv.errors}'
 curl -fsS "$PROD_BASE/api/debug-bundle" | jq '{bindingPresent:.infra.kv.bindingPresent, opsWorking:.infra.kv.opsWorking, errors:.infra.kv.errors}'
 
 curl -fsS "$PREVIEW_BASE/api/stock?ticker=$TICKER" | jq '{status:.metadata.status, failureReason:(.metadata.source_chain.failureReason//null), primaryFailure:(.metadata.source_chain.primaryFailure.code//null), err:(.error.code//null)}'
 curl -fsS "$PROD_BASE/api/stock?ticker=$TICKER" | jq '{status:.metadata.status, failureReason:(.metadata.source_chain.failureReason//null), primaryFailure:(.metadata.source_chain.primaryFailure.code//null), err:(.error.code//null)}'
 ```

 Interpretation:
 - **`MISSING_API_KEY`** in `source_chain.primaryFailure.code` => env var not available in that environment.
 - **`AUTH_FAILED`** => env var present but rejected upstream.
 - **`NETWORK_ERROR`** => outbound connectivity/DNS/egress issue.
 - **`BOTH_FAILED`** => both providers rejected/failed (check `error.details.upstream.details.primary/secondary`).

## Logging and Debugging Principles
- Evidence-based: show real outputs; do not assume.
- Minimal diffs; isolate fixes; keep commits small.
- Always show retest commands and outputs.

## How to Run (Ops Contract + E2E)
Verify contracts (PROD, and PREVIEW if provided):
```bash
./scripts/ops/rv_verify_contracts.sh
PREVIEW_BASE="https://<preview>.pages.dev" ./scripts/ops/rv_verify_contracts.sh
```

Run Ops E2E locally (base URL override):
```bash
BASE_URL="https://<preview>.pages.dev" npx playwright test
BASE_URL="https://rubikvault.com" npx playwright test
```

CI workflow (manual):
- GitHub Actions → `e2e-playwright` → Run workflow
