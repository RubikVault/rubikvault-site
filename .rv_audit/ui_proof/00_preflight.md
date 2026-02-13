# Preflight (Phase 0)

## Repo State
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site
/Users/michaelpuchowezki/Dev/rubikvault-site
codex/stock-ui-value-pack
3fa94f98
?? .rv_audit/
```

## package.json scripts (core)
```bash
dev=npm run prepare:data && npm run dev:pages
build=npm run prepare:data
dev:pages=wrangler pages dev public --ip 127.0.0.1 --port 8788 --kv RV_KV --compatibility-date=2025-12-17 --inspector-port 0
dev:pages:persist=wrangler pages dev public --ip 127.0.0.1 --port 8788 --kv RV_KV --persist-to .wrangler/state --compatibility-date=2025-12-17 --inspector-port 0
dev:pages:port=PORT=${PORT:-8788} wrangler pages dev public --ip 127.0.0.1 --port $PORT --kv RV_KV --compatibility-date=2025-12-17 --inspector-port 0
dev:pages:std=wrangler pages dev public --port 8788 --kv RV_KV --compatibility-date=2025-12-17
dev:pages:persist:std=wrangler pages dev public --port 8788 --kv RV_KV --persist-to .wrangler/state --compatibility-date=2025-12-17
dev:pages:port:std=PORT=${PORT:-8788} wrangler pages dev public --port $PORT --kv RV_KV --compatibility-date=2025-12-17
build:registry=node scripts/build-registry.js
test:stock-ui-extras=node scripts/test/stock-ui-extras.test.mjs
build:stock-ui-artifacts=node scripts/ui/build-benchmarks-latest.mjs && node scripts/ui/build-peers-latest.mjs && node scripts/ui/build-correlations-latest.mjs
verify:stock-ui-artifacts=node scripts/ci/verify-stock-ui-artifacts.mjs
build:pipeline-truth=node scripts/pipeline/build-ndx100-pipeline-truth.mjs
build:scientific-analysis=node scripts/scientific-analyzer/generate-analysis.mjs
validate:policies:v3=node scripts/validators/validate-policies.v3.mjs
build:v3:forensics=node scripts/validators/build-v3-forensics.mjs
dp0:v3=node scripts/dp0/universe-sync.v3.mjs
dp1:v3=node scripts/dp1/eod-snapshot.v3.mjs --exchange US
dp1_5:v3=node scripts/dp1_5_fx/fx-rates.v3.mjs
dp2:v3=node scripts/dp2/actions.v3.mjs
dp3:v3=node scripts/dp3/adjusted-series.v3.mjs
dp4:v3=node scripts/dp4/pulse.v3.mjs
dp5:v3=node scripts/dp5/news-signals.v3.mjs
dp6:v3=node scripts/dp6/indicators.v3.mjs
dp7:v3=node scripts/dp7/sector-mapping.v3.mjs
build:v3:daily=npm run dp0:v3 && npm run dp1:v3 && npm run dp1_5:v3 && npm run dp2:v3 && npm run dp3:v3 && npm run dp4:v3 && npm run dp5:v3 && npm run dp6:v3
```

## Relevant files opened
- /Users/michaelpuchowezki/Dev/rubikvault-site/public/index.html
- /Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/stock.js
- /Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/fundamentals.js

## Routing evidence
```bash
603:      if (window.location.pathname && window.location.pathname.startsWith("/analyze/")) {
793:      if (push) window.history.pushState({}, '', `/analyze/${encodeURIComponent(s)}`);
2138:            return `<a href="/analyze/${encodeURIComponent(peer)}" style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0.55rem; border-radius:8px; border:1px solid rgba(100,116,139,0.22); color:#cbd5e1; text-decoration:none;">
2228:        window.history.pushState({}, '', `/analyze/${encodeURIComponent(upperTicker)}`);
2343:      // Check for deep link: /analyze/TICKER
2344:      const path = window.location.pathname;
2369:    window.addEventListener('popstate', () => {
2370:      const path = window.location.pathname;
2390:    - ArrowDown + Enter navigates to /analyze/AAPL
```

## Analyze baseline runtime check

- `/analyze/AAPL` reachable and rendered during baseline capture.
- Desktop console errors: 0
- Desktop page errors: 0
- Mobile console errors: 0
- Mobile page errors: 0
