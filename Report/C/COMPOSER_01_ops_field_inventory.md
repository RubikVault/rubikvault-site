# OPS Field Inventory

**Note:** LIVE_URL not provided. This inventory is based on code analysis. Live evidence will be added once LIVE_URL is provided.

## Field Inventory Table

| field | meaning | type | unit | required? | source (SSOT/OBSERVED) | live JSONPath/DOM ref | publish source |
|-------|---------|------|------|-----------|------------------------|----------------------|----------------|
| runtime.env | Runtime environment mode (production/preview) | string | enum | yes | OBSERVED | data.runtime.env | functions/api/mission-control/summary.js:1619 |
| runtime.schedulerExpected | Whether cron scheduler is expected | boolean | - | yes | OBSERVED | data.runtime.schedulerExpected | functions/api/mission-control/summary.js:1460 |
| runtime.schedulerExpectedReason | Reason for scheduler expectation | string | - | no | OBSERVED | data.runtime.schedulerExpectedReason | functions/api/mission-control/summary.js:1461-1463 |
| runtime.hostname | Current hostname | string | - | yes | OBSERVED | data.runtime.hostname | functions/api/mission-control/summary.js:1625 |
| health.platform.status | Platform health status | string | enum (OK/INFO/WARNING/CRITICAL) | yes | OBSERVED | data.health.platform.status | functions/api/mission-control/summary.js:1502 |
| health.platform.reason | Platform health reason | string | - | no | OBSERVED | data.health.platform.reason | functions/api/mission-control/summary.js:1503 |
| health.api.status | API health status | string | enum | yes | OBSERVED | data.health.api.status | functions/api/mission-control/summary.js:1510 |
| health.prices.status | Prices health status | string | enum | yes | OBSERVED | data.health.prices.status | functions/api/mission-control/summary.js:1517 |
| health.pipeline.status | Pipeline health status | string | enum | yes | OBSERVED | data.health.pipeline.status | functions/api/mission-control/summary.js:1528 |
| health.freshness.status | Freshness health status | string | enum | yes | OBSERVED | data.health.freshness.status | functions/api/mission-control/summary.js:1519 |
| budgets.workersRequests.usedToday | Workers requests used today | number | count | no | OBSERVED | data.budgets.workersRequests.usedToday | functions/api/mission-control/summary.js:632 |
| opsLive.cloudflare.requestsLast24h | Cloudflare requests last 24h | number | count | no | OBSERVED | data.opsLive.cloudflare.requestsLast24h | functions/api/mission-control/summary.js:1584 |
| opsBaseline.baseline.safety.kvWritesToday | KV writes today | number | count | no | OBSERVED | data.opsBaseline.baseline.safety.kvWritesToday | functions/api/mission-control/summary.js:658 |
| pipeline.counts.fetched | Pipeline fetched count | number | count | no | OBSERVED | data.pipeline.counts.fetched | functions/api/mission-control/summary.js:686 |
| pipeline.counts.validated | Pipeline validated count | number | count | no | OBSERVED | data.pipeline.counts.validated | functions/api/mission-control/summary.js:689 |
| pipeline.counts.computed | Pipeline computed count | number | count | no | OBSERVED | data.pipeline.counts.computed | functions/api/mission-control/summary.js:690 |
| pipeline.counts.static_ready | Pipeline static-ready count | number | count | no | OBSERVED | data.pipeline.counts.static_ready | functions/api/mission-control/summary.js:691 |
| coverage.computed | Coverage computed count | number | count | yes | OBSERVED | data.coverage.computed | functions/api/mission-control/summary.js:1651 |
| coverage.missing | Coverage missing count | number | count | yes | OBSERVED | data.coverage.missing | functions/api/mission-control/summary.js:1652 |
| metadata.fetched_at | When summary was fetched | string | ISO8601 | yes | OBSERVED | metadata.fetched_at | functions/api/mission-control/summary.js:1606 |
| meta.asOf | Summary timestamp | string | ISO8601 | yes | OBSERVED | meta.asOf | functions/api/mission-control/summary.js:1594 |

## SSOT Status

**SSOT Missing (P0):** No explicit contract/schema found for OPS fields. Fields are derived from:
- `public/data/ops/health-profiles.v1.json` (defines expected flags per profile)
- `functions/api/mission-control/summary.js` (implements field computation)
- `public/ops/index.html` (displays fields)

## RUNTIME_MODE Semantics

**Implemented Semantic:** Deployment-mode semantics (based on hostname detection)

**Detection Logic:** `detectPreviewMode(url, env)` (functions/api/mission-control/summary.js:744-756)
- `.pages.dev` hostname → `isPreview: true`
- `rubikvault.com` or `www.rubikvault.com` → `isProduction: true`
- `localhost` → `isPreview: true`

**Profile Selection:** `pickProfile(previewMode, profiles)` (functions/api/mission-control/summary.js:760-764)
- If `isProduction` → `production` profile → `runtime.env = "production"`
- Else → `preview` profile → `runtime.env = "preview"`

**Evidence:** 
- `functions/api/mission-control/summary.js:744-756` (detectPreviewMode)
- `functions/api/mission-control/summary.js:760-764` (pickProfile)
- `functions/api/mission-control/summary.js:1619` (runtime.env assignment)
- `public/data/ops/health-profiles.v1.json` (profile definitions)
