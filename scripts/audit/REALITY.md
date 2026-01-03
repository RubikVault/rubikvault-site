Audit Reality Snapshot

REPO_ROOT: /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site
TOPLEVEL: /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site
BRANCH: main
GIT_SHA: 33c5a42f8960c3e3abe4ead63b84ce66110a7174
GIT_STATUS_PORCELAIN:
M .github/workflows/seed-mirrors.yml
 M features/schema-registry.js
 M package.json
 M public/mirrors/_health.json
 M public/mirrors/manifest.json
 M scripts/audit-site.mjs
 M scripts/audit/REALITY.md
 M scripts/audit/generate-reality.mjs
?? features/feature-registry.json
?? public/mirrors/arb-breadth-lite.json
?? public/mirrors/arb-liquidity-pulse.json
?? public/mirrors/arb-risk-regime.json
?? public/mirrors/export-csv.json
?? public/mirrors/news-headlines.json
?? public/mirrors/sentiment-barometer.json
?? public/mirrors/watchlist-local.json
?? scripts/audit/build-artifacts.mjs
?? scripts/audit/build-feature-registry.mjs
?? scripts/audit/generate-stub-mirrors.mjs
?? tests/

NODE_VERSION: v25.2.1
NPM_VERSION: 11.6.2

MIRRORS_DIR_EXISTS: yes
MIRRORS_DIR: /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors

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
scripts/move-repo-out-of-icloud.sh
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

POST-PHASE-4 LOCAL VERIFICATION
node -v
v25.2.1
npm -v
11.6.2
git status --porcelain
 M .github/workflows/seed-mirrors.yml
 M features/schema-registry.js
 M package.json
 M public/mirrors/_health.json
 M public/mirrors/manifest.json
 M scripts/audit-site.mjs
 M scripts/audit/REALITY.md
 M scripts/audit/generate-reality.mjs
?? features/feature-registry.json
?? public/mirrors/arb-breadth-lite.json
?? public/mirrors/arb-liquidity-pulse.json
?? public/mirrors/arb-risk-regime.json
?? public/mirrors/export-csv.json
?? public/mirrors/news-headlines.json
?? public/mirrors/sentiment-barometer.json
?? public/mirrors/watchlist-local.json
?? scripts/audit/build-artifacts.mjs
?? scripts/audit/build-feature-registry.mjs
?? scripts/audit/generate-stub-mirrors.mjs
?? tests/
node scripts/audit/generate-reality.mjs
Wrote scripts/audit/REALITY.md
node scripts/audit/build-feature-registry.mjs --mode discover
Registry written: /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/features/feature-registry.json
Summary: total=38 deprecated=0
node scripts/audit/generate-stub-mirrors.mjs
Stub mirrors created: 0
node scripts/audit/build-artifacts.mjs
Artifacts written.
node scripts/audit-site.mjs --mode local --base public --format table
Blocks: 38 | Issues: 437
BySeverity: {"INFO":0,"WARN":143,"ERROR":140,"CRITICAL":154}
ByReasonCode: {"DATA_EMPTY":109,"FIELD_MISSING":62,"FIELD_NULLISH":58,"LIMIT_EXCEEDED":3,"STALE_DATA":49,"TYPE_MISMATCH":2,"UI_MAPPING_MISMATCH":154}

[alpha-performance] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/alpha-performance.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[alpha-radar] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/alpha-radar.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[analyst-stampede] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/analyst-stampede.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[breakout-energy] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/breakout-energy.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[central-bank-watch] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/central-bank-watch.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[congress-trading] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/congress-trading.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[crypto-snapshot] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/crypto-snapshot.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[daily-digest] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/daily-digest.json
  - /actionableSignals: DATA_EMPTY (WARN)
  - /changesVsYesterday: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[earnings] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/earnings.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[earnings-calendar] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/earnings-calendar.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[earnings-reality] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/earnings-reality.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[hype-divergence] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/hype-divergence.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[insider-cluster] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/insider-cluster.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[macro-rates] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/macro-rates.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[market-cockpit] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/market-cockpit.json
  - /items/0/items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[market-health] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/market-health.json
  - /commodities: DATA_EMPTY (WARN)
  - /indices: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)

[market-regime] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/market-regime.json
  - /errors: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[news] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/news.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[news-intelligence] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/news-intelligence.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[price-snapshot] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/price-snapshot.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[quotes] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/quotes.json
  - /context/skippedSymbols: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[sector-rotation] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/sector-rotation.json
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)

[sentiment] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/sentiment.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[smart-money] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/smart-money.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[sp500-sectors] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/sp500-sectors.json
  - /data/items: DATA_EMPTY (WARN)
  - /data/metrics: DATA_EMPTY (WARN)
  - /data/quotes: DATA_EMPTY (WARN)
  - /data/signals: DATA_EMPTY (WARN)
  - /data/stocks/gainers: DATA_EMPTY (WARN)
  - /data/stocks/volumeLeaders: DATA_EMPTY (WARN)
  - /data/trades: DATA_EMPTY (WARN)
  - /dataQuality/missingFields: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[system-health] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/system-health.json
  - /alerts: DATA_EMPTY (WARN)
  - /jobs/0/notes: DATA_EMPTY (WARN)
  - /jobs/1/errors: DATA_EMPTY (WARN)
  - /jobs/1/notes: DATA_EMPTY (WARN)
  - /jobs/2/notes: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /mirrors/0/updatedAt: STALE_DATA (ERROR)
  - /mirrors/1/updatedAt: STALE_DATA (ERROR)
  - /mirrors/10/updatedAt: STALE_DATA (ERROR)
  - /mirrors/11/updatedAt: STALE_DATA (ERROR)
  - /mirrors/12/updatedAt: STALE_DATA (ERROR)
  - /mirrors/13/updatedAt: STALE_DATA (ERROR)
  - /mirrors/14/updatedAt: STALE_DATA (ERROR)
  - /mirrors/15/updatedAt: STALE_DATA (ERROR)
  - /mirrors/16/updatedAt: STALE_DATA (ERROR)
  - /mirrors/17/updatedAt: STALE_DATA (ERROR)
  - /mirrors/18/updatedAt: STALE_DATA (ERROR)
  - /mirrors/19/updatedAt: STALE_DATA (ERROR)
  - /mirrors/2/updatedAt: STALE_DATA (ERROR)
  - /mirrors/20/updatedAt: STALE_DATA (ERROR)
  - /mirrors/3/updatedAt: STALE_DATA (ERROR)
  - /mirrors/4/updatedAt: STALE_DATA (ERROR)
  - /mirrors/5/updatedAt: STALE_DATA (ERROR)
  - /mirrors/6/updatedAt: STALE_DATA (ERROR)
  - /mirrors/7/updatedAt: STALE_DATA (ERROR)
  - /mirrors/8/updatedAt: STALE_DATA (ERROR)
  - /mirrors/9/updatedAt: STALE_DATA (ERROR)
  - /skippedSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[tech-signals] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/tech-signals.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[top-movers] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/top-movers.json
  - /crypto: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /stocks/gainers/0/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/1/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/2/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/3/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/4/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/5/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/6/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/7/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/8/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/gainers/9/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/0/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/1/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/2/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/3/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/4/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/5/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/6/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/7/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/8/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/losers/9/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/0/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/1/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/2/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/3/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/4/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/5/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/6/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/7/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/8/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLaggards/9/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/0/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/1/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/2/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/3/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/4/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/5/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/6/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/7/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/8/lastClose: FIELD_NULLISH (ERROR)
  - /stocks/volumeLeaders/9/lastClose: FIELD_NULLISH (ERROR)

[volume-anomaly] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/volume-anomaly.json
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /notes: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[why-moved] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/why-moved.json
  - /context/lastEventAt: FIELD_NULLISH (ERROR)
  - /context/lastEventSummary: FIELD_NULLISH (ERROR)
  - /errors: DATA_EMPTY (WARN)
  - /items: DATA_EMPTY (WARN)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /missingSymbols: DATA_EMPTY (WARN)
  - /updatedAt: STALE_DATA (ERROR)

[yield-curve] /Users/michaelpuchowezki/Documents/GitHub/rubikvault-site/public/mirrors/yield-curve.json
  - /inversion/tenThreeMonth: TYPE_MISMATCH (ERROR)
  - /inversion/tenTwo: TYPE_MISMATCH (ERROR)
  - /meta/status: FIELD_MISSING (ERROR)
  - /meta/updatedAt: FIELD_MISSING (WARN)
  - /updatedAt: STALE_DATA (ERROR)
