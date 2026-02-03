| Field | Meaning | Type | Unit | Required? | Source (SSOT) | Live JSONPath | Publish Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `runtime.env` | Runtime environment mode (PREVIEW/PRODUCTION) | string | enum | Yes | logic:summary.js:detectPreviewMode | `data.runtime.env` | runtime calculation (hostname) |
| `runtime.schedulerExpected` | Whether cron jobs are expected in this environment | boolean | flag | Yes | logic:summary.js:profile | `data.runtime.schedulerExpected` | logic:summary.js:profile |
| `health.api.status` | Status of the Mission Control API itself | string | status | Yes | hardcoded:OK | `data.health.api.status` | logic:summary.js:apiStatus |
| `health.platform.status` | Status of the underlying platform (KV binding) | string | status | Yes | check:KV | `data.health.platform.status` | logic:summary.js:platformStatus |
| `health.freshness.status` | Freshness status of market data | string | status | Yes | logic:computeFreshnessStatus | `data.health.freshness.status` | logic:summary.js |
| `health.prices.status` | Status of Price Truth Chain | string | status | Yes | logic:buildPricesHealth | `data.health.prices.status` | logic:summary.js |
| `health.pipeline.status` | Status of NASDAQ-100 Pipeline | string | status | Yes | logic:computePipelineStatus | `data.health.pipeline.status` | logic:summary.js |
| `pipeline.counts.fetched` | Count of fetched EOD snapshots | integer | count | Yes | artifact:nasdaq100.fetched.json | `data.pipeline.counts.fetched` | `/data/pipeline/nasdaq100.fetched.json` |
| `pipeline.counts.validated` | Count of validated EOD snapshots | integer | count | Yes | artifact:nasdaq100.validated.json | `data.pipeline.counts.validated` | `/data/pipeline/nasdaq100.validated.json` |
| `pipeline.counts.computed` | Count of computed indicator sets | integer | count | Yes | artifact:nasdaq100.computed.json | `data.pipeline.counts.computed` | `/data/pipeline/nasdaq100.computed.json` |
| `pipeline.counts.static_ready` | Count of static-ready artifacts | integer | count | Yes | artifact:nasdaq100.static-ready.json | `data.pipeline.counts.static_ready` | `/data/pipeline/nasdaq100.static-ready.json` |
| `budgets.workersRequests.usedToday` | Cloudflare Workers requests used today | integer | count | No | telemetry:KV | `data.budgets.workersRequests.usedToday` | `KV:dash.callsDay` |
| `safety.kvWritesToday` | KV Write operations count today | integer | count | No | telemetry:KV | `data.safety.kvWritesToday` | `KV:kvOpsDay` (via ops-daily.json or runtime) |
| `meta.status` | Overall OPS Status Aggregate | string | status | Yes | logic:metaStatus | `meta.status` | logic:summary.js:metaStatus |
