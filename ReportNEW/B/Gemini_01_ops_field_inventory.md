| Field | Meaning | Type | Unit | Required? | Source (SSOT) | Live JSONPath | Publish Source | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `runtime.env` | Runtime environment identifier (preview vs production) | string | enum[production, preview] | Yes | logic:summary.js:detectPreviewMode | `data.runtime.env` | runtime logic | CONFLICT |
| `health.api.status` | Status of OPS API | string | enum[OK,WARN,FAIL] | Yes | hardcoded:OK | `data.health.api.status` | logic:summary.js:1510 | CORRECT |
| `health.platform.status` | Status of KV binding | string | enum[OK,CRITICAL] | Yes | check:env.RV_KV | `data.health.platform.status` | logic:summary.js:1502 | CORRECT |
| `health.prices.status` | Price Truth Chain verdict | string | enum[OK,WARN,CRITICAL] | Yes | logic:buildPricesHealth | `data.health.prices.status` | logic:summary.js:1517 | CORRECT |
| `health.pipeline.status` | Pipeline Data Verdict | string | enum[OK,WARN,CRITICAL] | Yes | logic:computePipelineStatus | `data.health.pipeline.status` | logic:summary.js:1529 | CORRECT |
| `budgets.workersRequests.usedToday` | Cloudflare Workers requests used (calculated) | integer | count | No | telemetry:KV | `data.budgets.workersRequests.usedToday` | KV:dash.callsDay | UNKNOWN (No SSOT) |
| `meta.status` | Aggregate System Status | string | enum[ok,degraded,error] | Yes | logic:metaStatus | `meta.status` | logic:summary.js:1540 | CORRECT |
