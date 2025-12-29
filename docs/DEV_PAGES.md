RubikVault Pages Functions - Local Development

This project uses Cloudflare Pages + Pages Functions (not a standalone Worker).

QUICK START (RECOMMENDED)
Persistent local KV (cache survives restarts):

npx wrangler pages dev public --ip 127.0.0.1 --port 8788 --kv RV_KV --persist-to .wrangler/state --compatibility-date=2025-12-29 --inspector-port 0

Open: http://127.0.0.1:8788

KV MODES

Mode 1: Ephemeral local KV (cache resets every run)
npx wrangler pages dev public --ip 127.0.0.1 --port 8788 --kv RV_KV --compatibility-date=2025-12-29 --inspector-port 0

Mode 2: Persistent local KV (recommended)
npx wrangler pages dev public --ip 127.0.0.1 --port 8788 --kv RV_KV --persist-to .wrangler/state --compatibility-date=2025-12-29 --inspector-port 0

Mode 3: Remote KV (preview/prod-like)
npx wrangler pages dev public --ip 127.0.0.1 --port 8788 --binding RV_KV=<KV_NAMESPACE_ID> --compatibility-date=2025-12-29 --inspector-port 0

Get KV namespace ID from:
Cloudflare Dashboard -> Workers & Pages -> KV -> Namespace -> Copy ID

TROUBLESHOOTING
- Inspector conflicts: always use --inspector-port 0
- Log permission errors: ensure $HOME/Library/Preferences/.wrangler/logs is writable
- Port conflicts: check with lsof before starting

PORT CONFLICTS (SAFE)
Check port:
lsof -nP -iTCP:8788 -sTCP:LISTEN || true

Use another port:
npx wrangler pages dev public --ip 127.0.0.1 --port 8790 --kv RV_KV --compatibility-date=2025-12-29 --inspector-port 0

Stop stuck wrangler:
pkill -SIGTERM wrangler || true
pkill -f workerd || true

TESTING ENDPOINTS
curl --max-time 12 -i http://127.0.0.1:8788/api/news

With jq:
curl -s http://127.0.0.1:8788/api/news | jq '{ok, feature, dataQuality, error}'

Batch test:
for p in news hype-divergence congress-trading breakout-energy volume-anomaly market-regime; do
  echo "== /api/$p =="
  RESP="$(curl -s --max-time 25 "http://127.0.0.1:8788/api/$p")"
  echo "$RESP" | jq -r '.ok, (.error.code // "none"), (.data.dataQuality // .dataQuality // "n/a")' 2>/dev/null || echo "NON_JSON_OR_PARSE_FAIL"
done

EXPECTED:
- error.code is NOT BINDING_MISSING
- ok may be true even with NO_DATA

DASHBOARD BINDINGS (PREVIEW + PROD)
Cloudflare Dashboard -> Pages -> rubikvault-site -> Settings -> Functions -> Bindings

Add binding:
Variable name: RV_KV
Type: KV namespace
Select existing namespace
Apply to Preview AND Production

END OF FILE

DEBUG COMMAND CENTER
- Open: https://<site>/?debug=1
- Toggle: Cmd/Ctrl+Shift+D
- Copy report: Click "Copy All" in the debug drawer
- BINDING_MISSING means RV_KV is not bound in the Pages Functions bindings for that environment.
