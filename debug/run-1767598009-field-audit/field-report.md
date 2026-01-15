# RubikVault Field/Block Audit
Generated: 2026-01-05T07:26:58.102Z

## Matrix health
- PROD matrix ok: true (status 200)
- PREVIEW matrix ok: true (status 200)

## Problem buckets (prod+preview)
| key | count |
| --- | --- |
| THRESHOLD | 21 |
| LEGIT_EMPTY | 12 |
| CACHE_EMPTY | 9 |
| NO_SOURCE | 2 |
| STALE | 2 |
| COVERAGE_LIMIT | 2 |
| AUTH_UPSTREAM | 2 |

## Top reasons
| key | count |
| --- | --- |
| THRESHOLD:gates/thresholds filter everything out | 21 |
| LEGIT_EMPTY:no events right now (valid empty) | 12 |
| CACHE_EMPTY:cache empty + no live fill | 9 |
| NO_SOURCE:no provider configured/available | 2 |
| STALE:stale data not refreshed | 2 |
| COVERAGE_LIMIT:coverage restricted (likely auth/plan/rate-limit) | 2 |
| AUTH_UPSTREAM:missing_key/plan/blocked | 2 |

## Actionable issues (per endpoint)
| env | feature | endpoint | bucket | why | http | metaStatus | metaReason | emptyReason | cacheLayer | ttl | items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| prod | rv-alpha-performance | /api/alpha-performance | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 |  |
| prod | rv-alpha-radar | /api/alpha-radar | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | none | 0 |  |
| prod | rv-analyst-stampede | /api/analyst-stampede | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 |  |
| prod | rv-arb-breadth-lite | /api/arb-breadth-lite | NO_SOURCE | no provider configured/available | 200 | LIVE |  |  | kv | 1800 |  |
| prod | rv-breakout-energy | /api/breakout-energy | STALE | stale data not refreshed | 200 | STALE | STALE |  | kv | 3600 | 1 |
| prod | rv-congress-trading | /api/congress-trading | COVERAGE_LIMIT | coverage restricted (likely auth/plan/rate-limit) | 200 | LIVE |  |  | none | 604800 |  |
| prod | rv-crypto-snapshot | /api/crypto-snapshot | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 90 |  |
| prod | rv-earnings-calendar | /api/earnings-calendar | AUTH_UPSTREAM | missing_key/plan/blocked | 200 | ERROR | UPSTREAM_4XX |  | none | 0 |  |
| prod | rv-earnings-reality | /api/earnings-reality | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 | 0 |
| prod | rv-hype-divergence | /api/hype-divergence | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 1800 |  |
| prod | rv-insider-cluster | /api/insider-cluster | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | none | 0 |  |
| prod | rv-macro-rates | /api/macro-rates | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 21600 |  |
| prod | rv-market-cockpit | /api/market-cockpit | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 900 |  |
| prod | rv-market-health | /api/market-health | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| prod | rv-market-regime | /api/market-regime | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 1800 |  |
| prod | rv-news-intelligence | /api/news-intelligence | CACHE_EMPTY | cache empty + no live fill | 200 | STALE | STALE |  | none | 0 |  |
| prod | rv-price-snapshot | /api/price-snapshot | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 180 |  |
| prod | rv-sector-rotation | /api/sector-rotation | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| prod | rv-sentiment-barometer | /api/sentiment | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 1200 |  |
| prod | rv-smart-money | /api/smart-money | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 3600 |  |
| prod | rv-sp500-sectors | /api/sp500-sectors | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 21600 |  |
| prod | rv-tech-signals | /api/tech-signals | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 1800 |  |
| prod | rv-top-movers | /api/top-movers | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| prod | rv-volume-anomaly | /api/volume-anomaly | CACHE_EMPTY | cache empty + no live fill | 200 | LIVE |  |  | kv | 3600 |  |
| prod | rv-yield-curve | /api/yield-curve | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 259200 |  |
| preview | rv-alpha-performance | /api/alpha-performance | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 |  |
| preview | rv-alpha-radar | /api/alpha-radar | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | none | 0 |  |
| preview | rv-analyst-stampede | /api/analyst-stampede | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 |  |
| preview | rv-arb-breadth-lite | /api/arb-breadth-lite | NO_SOURCE | no provider configured/available | 200 | LIVE |  |  | kv | 1800 |  |
| preview | rv-breakout-energy | /api/breakout-energy | STALE | stale data not refreshed | 200 | STALE | STALE |  | kv | 3600 | 1 |
| preview | rv-congress-trading | /api/congress-trading | COVERAGE_LIMIT | coverage restricted (likely auth/plan/rate-limit) | 200 | LIVE |  |  | none | 604800 |  |
| preview | rv-crypto-snapshot | /api/crypto-snapshot | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 90 |  |
| preview | rv-earnings-calendar | /api/earnings-calendar | AUTH_UPSTREAM | missing_key/plan/blocked | 200 | ERROR | UPSTREAM_4XX |  | none | 0 |  |
| preview | rv-earnings-reality | /api/earnings-reality | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 21600 | 0 |
| preview | rv-hype-divergence | /api/hype-divergence | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 1800 |  |
| preview | rv-insider-cluster | /api/insider-cluster | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | none | 0 |  |
| preview | rv-macro-rates | /api/macro-rates | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 21600 |  |
| preview | rv-market-cockpit | /api/market-cockpit | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 900 |  |
| preview | rv-market-health | /api/market-health | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| preview | rv-market-regime | /api/market-regime | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 1800 |  |
| preview | rv-news-intelligence | /api/news-intelligence | CACHE_EMPTY | cache empty + no live fill | 200 | STALE | STALE |  | none | 0 |  |
| preview | rv-price-snapshot | /api/price-snapshot | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 180 |  |
| preview | rv-sector-rotation | /api/sector-rotation | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| preview | rv-sentiment-barometer | /api/sentiment | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 1200 |  |
| preview | rv-smart-money | /api/smart-money | LEGIT_EMPTY | no events right now (valid empty) | 200 | LIVE |  |  | kv | 3600 |  |
| preview | rv-sp500-sectors | /api/sp500-sectors | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 21600 |  |
| preview | rv-tech-signals | /api/tech-signals | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 1800 |  |
| preview | rv-top-movers | /api/top-movers | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 86400 |  |
| preview | rv-volume-anomaly | /api/volume-anomaly | THRESHOLD | gates/thresholds filter everything out | 200 | LIVE |  |  | kv | 3600 |  |
| preview | rv-yield-curve | /api/yield-curve | THRESHOLD | gates/thresholds filter everything out | 200 | STALE | MIRROR_FALLBACK |  | mirror | 259200 |  |

## Field null/missing hot spots (top 25 endpoints with field issues)
| env | feature | endpoint | topField | nulls | nullRatePct | types |
| --- | --- | --- | --- | --- | --- | --- |
| prod | rv-why-moved | /api/why-moved | earningsDate | 5 | 100 | null |
| preview | rv-why-moved | /api/why-moved | earningsDate | 5 | 100 | null |

---
Raw JSON report: field-report.json
