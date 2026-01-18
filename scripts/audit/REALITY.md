Audit Reality Snapshot

REPO_ROOT: (captured at runtime; do not hardcode absolute paths)
TOPLEVEL: (captured at runtime; do not hardcode absolute paths)
BRANCH: main
GIT_SHA: 0164b992abbbdcdd82df089945d50f360beb7c93
GIT_STATUS_PORCELAIN:
M features/feature-registry.json
 M mirrors/_health.json
 M mirrors/manifest.json
 M scripts/audit/REALITY.md

NODE_VERSION: v25.2.1
NPM_VERSION: 11.6.2

MIRRORS_DIR_EXISTS: yes
MIRRORS_DIR: (repo_root)/mirrors

MIRROR_FILES:
mirrors/_health.json
mirrors/alpha-performance.json
mirrors/alpha-radar.json
mirrors/analyst-stampede.json
mirrors/arb-breadth-lite.json
mirrors/arb-liquidity-pulse.json
mirrors/arb-risk-regime.json
mirrors/breakout-energy.json
mirrors/central-bank-watch.json
mirrors/congress-trading.json

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
mirrors/smart-money.json
mirrors/alpha-performance.json
mirrors/sector-rotation.json
mirrors/export-csv.json
mirrors/sentiment.json
mirrors/breakout-energy.json
mirrors/news-headlines.json
mirrors/arb-risk-regime.json
mirrors/macro-rates.json
mirrors/market-health.json
mirrors/analyst-stampede.json
mirrors/volume-anomaly.json
mirrors/daily-digest.json
mirrors/market-cockpit.json
mirrors/price-snapshot.json
mirrors/earnings.json
mirrors/quotes.json
mirrors/arb-liquidity-pulse.json
mirrors/_health.json
mirrors/why-moved.json
mirrors/news.json
mirrors/tech-signals.json
mirrors/yield-curve.json
mirrors/hype-divergence.json
mirrors/news-intelligence.json
mirrors/top-movers.json
mirrors/sentiment-barometer.json
mirrors/manifest.json
mirrors/insider-cluster.json
mirrors/sp500-sectors.json
mirrors/market-regime.json
mirrors/earnings-reality.json
mirrors/earnings-calendar.json
mirrors/alpha-radar.json
mirrors/crypto-snapshot.json
mirrors/watchlist-local.json
mirrors/arb-breadth-lite.json
mirrors/system-health.json
mirrors/central-bank-watch.json
mirrors/congress-trading.json
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
