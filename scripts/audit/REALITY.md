Audit Reality Snapshot

REPO_ROOT: (captured at runtime; do not hardcode absolute paths)
TOPLEVEL: (captured at runtime; do not hardcode absolute paths)
BRANCH: main
GIT_SHA: 0164b992abbbdcdd82df089945d50f360beb7c93
GIT_STATUS_PORCELAIN:
M public/data/feature-registry.v1.json
 M public/mirrors/_health.json
 M public/mirrors/manifest.json
 M scripts/audit/REALITY.md

NODE_VERSION: v25.2.1
NPM_VERSION: 11.6.2

MIRRORS_DIR_EXISTS: yes
MIRRORS_DIR: (repo_root)/public/mirrors

MIRROR_FILES:
public/mirrors/_health.json
public/mirrors/alpha-performance.json
public/mirrors/alpha-radar.json
public/mirrors/analyst-stampede.json
public/mirrors/arb-breadth-lite.json
public/mirrors/arb-liquidity-pulse.json
public/mirrors/arb-risk-regime.json
public/mirrors/breakout-energy.json
public/mirrors/central-bank-watch.json
public/mirrors/congress-trading.json

FEATURES_DIR_EXISTS: yes
SCRIPTS_DIR_EXISTS: yes
FUNCTIONS_DIR_EXISTS: yes

HTML_FEATURE_COUNT: 32
HTML_FEATURE_SAMPLE:
rv-market-cockpit
rv-yield-curve
rv-sector-rotation
rv-central-bank-watch
rv-market-health
rv-price-snapshot
rv-top-movers
rv-earnings-calendar
rv-news-headlines
rv-news-intelligence
rv-watchlist-local
rv-export-csv
rv-macro-rates
rv-sp500-sectors
rv-market-regime
rv-arb-risk-regime
rv-arb-liquidity-pulse
rv-arb-breadth-lite
rv-why-moved
rv-volume-anomaly

MIRROR_FEATURE_COUNT: 38
MIRROR_FEATURE_SAMPLE:
alpha-performance
alpha-radar
analyst-stampede
arb-breadth-lite
arb-liquidity-pulse
arb-risk-regime
breakout-energy
central-bank-watch
congress-trading
crypto-snapshot
daily-digest
earnings-calendar
earnings-reality
earnings
export-csv
hype-divergence
insider-cluster
macro-rates
market-cockpit
market-health

DRIFT_HTML_NOT_IN_MIRRORS:
rv-market-cockpit
rv-yield-curve
rv-sector-rotation
rv-central-bank-watch
rv-market-health
rv-price-snapshot
rv-top-movers
rv-earnings-calendar
rv-news-headlines
rv-news-intelligence
rv-watchlist-local
rv-export-csv
rv-macro-rates
rv-sp500-sectors
rv-market-regime
rv-arb-risk-regime
rv-arb-liquidity-pulse
rv-arb-breadth-lite
rv-why-moved
rv-volume-anomaly

DRIFT_MIRRORS_NOT_IN_HTML:
alpha-performance
alpha-radar
analyst-stampede
arb-breadth-lite
arb-liquidity-pulse
arb-risk-regime
breakout-energy
central-bank-watch
congress-trading
crypto-snapshot
daily-digest
earnings-calendar
earnings-reality
earnings
export-csv
hype-divergence
insider-cluster
macro-rates
market-cockpit
market-health

TREE_PUBLIC_MAXDEPTH3_FILES:
public/build-info.json
public/index.html
public/posts/.gitkeep
public/.DS_Store
public/_redirects
public/_headers
public/mirrors/smart-money.json
public/mirrors/alpha-performance.json
public/mirrors/sector-rotation.json
public/mirrors/export-csv.json
public/mirrors/sentiment.json
public/mirrors/breakout-energy.json
public/mirrors/news-headlines.json
public/mirrors/arb-risk-regime.json
public/mirrors/macro-rates.json
public/mirrors/market-health.json
public/mirrors/analyst-stampede.json
public/mirrors/volume-anomaly.json
public/mirrors/daily-digest.json
public/mirrors/market-cockpit.json
public/mirrors/price-snapshot.json
public/mirrors/earnings.json
public/mirrors/quotes.json
public/mirrors/arb-liquidity-pulse.json
public/mirrors/_health.json
public/mirrors/why-moved.json
public/mirrors/news.json
public/mirrors/tech-signals.json
public/mirrors/yield-curve.json
public/mirrors/hype-divergence.json
public/mirrors/news-intelligence.json
public/mirrors/top-movers.json
public/mirrors/sentiment-barometer.json
public/mirrors/manifest.json
public/mirrors/insider-cluster.json
public/mirrors/sp500-sectors.json
public/mirrors/market-regime.json
public/mirrors/earnings-reality.json
public/mirrors/earnings-calendar.json
public/mirrors/alpha-radar.json
public/mirrors/crypto-snapshot.json
public/mirrors/watchlist-local.json
public/mirrors/arb-breadth-lite.json
public/mirrors/system-health.json
public/mirrors/central-bank-watch.json
public/mirrors/congress-trading.json
public/diagnose.js

TREE_SCRIPTS_MAXDEPTH4_FILES:
scripts/audit-site.mjs
scripts/seed-mirrors.mjs
scripts/validate-mirrors.mjs
scripts/smoke-debug.mjs
scripts/generate-crypto-snapshot.mjs
scripts/generate-eod-market.mjs
scripts/dev-local.sh
scripts/generate-event-mirrors.mjs
scripts/generate-eod-mirrors.mjs
scripts/utils/stooq-fetch.mjs
scripts/utils/market-rsi.mjs
scripts/utils/eod-market-symbols.mjs
scripts/utils/market-indicators.mjs
scripts/utils/mirror-builders.mjs
scripts/utils/eod-market-mirrors.mjs
scripts/utils/universe.mjs
scripts/utils/mirror-io.mjs
scripts/move-repo-out-of-cloud.sh
scripts/audit/generate-stub-mirrors.mjs
scripts/audit/REALITY.md
scripts/audit/generate-reality.mjs
scripts/audit/build-artifacts.mjs
scripts/audit/build-feature-registry.mjs
scripts/mirror-breakout-energy.mjs
scripts/alpha-radar-debug.js
scripts/build-mirrors-manifest.mjs
scripts/generate-posts.js
scripts/test-api.sh
scripts/healthcheck.sh
scripts/dev-pages.sh

PACKAGE_JSON_PRESENT: yes

ISSUES DETECTED:
- [WARN] HTML features missing mirrors: count=32 sample=rv-market-cockpit, rv-yield-curve, rv-sector-rotation, rv-central-bank-watch, rv-market-health, rv-price-snapshot, rv-top-movers, rv-earnings-calendar, rv-news-headlines, rv-news-intelligence
- [WARN] Mirrors not in HTML: count=38 sample=alpha-performance, alpha-radar, analyst-stampede, arb-breadth-lite, arb-liquidity-pulse, arb-risk-regime, breakout-energy, central-bank-watch, congress-trading, crypto-snapshot
