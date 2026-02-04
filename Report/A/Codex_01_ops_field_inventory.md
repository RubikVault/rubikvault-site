# OPS Field Inventory (LIVE_URL: https://638a1962.rubikvault-site.pages.dev)

## Evidence anchors (repo + live)
- Repo state: `/Users/peterklein/Dev/rubikvault-site` @ `6212e9971baf1312b0d49e4c7b4c6f2d63c4ca77` (branch `main`)
- OPS UI reads `/api/mission-control/summary` and `/data/build-info.json` (UI code: `public/ops/index.html:1082-1125`, `public/ops/index.html:868-883`).
- Mission-control summary payload shape: `functions/api/mission-control/summary.js:1591-1678`.
- SSOT for ops shapes (bars + truthChains): `docs/ops/ops-shapes.ssot.md:7-58`.
- Envelope contract doc (legacy meta.status values): `docs/ops/contract.md:34-51`.
- Live summary excerpt: see `03_ops_findings_and_fixplan.md` → **Live Evidence Excerpts**.

## Field Inventory (UI-visible + OPS payload fields)
| field | meaning | type | unit | required? | source (SSOT/OBSERVED) | live JSONPath/DOM ref | publish source |
|---|---|---|---|---|---|---|---|
| schema_version | OPS summary schema version | string | n/a | required | SSOT (summary.js) | `$.schema_version` | `/api/mission-control/summary` |
| meta.status | envelope status | string | n/a | required | **CONFLICT** (ops/contract.md vs summary.js) | `$.meta.status` | `/api/mission-control/summary` |
| meta.reason | envelope reason | string/null | n/a | optional | OBSERVED (summary.js) | `$.meta.reason` | `/api/mission-control/summary` |
| meta.asOf | summary timestamp | ISO string | UTC | required | SSOT (summary.js) | `$.meta.asOf` | `/api/mission-control/summary` |
| meta.baselineAsOf | baseline snapshot timestamp | ISO string/null | UTC | optional | OBSERVED (summary.js) | `$.meta.baselineAsOf` | `/api/mission-control/summary` |
| meta.liveAsOf | live timestamp | ISO string | UTC | optional | OBSERVED (summary.js) | `$.meta.liveAsOf` | `/api/mission-control/summary` |
| metadata.served_from | runtime vs asset source | string | n/a | required | OBSERVED (summary.js) | `$.metadata.served_from` | `/api/mission-control/summary` |
| metadata.fetched_at | fetch time | ISO string | UTC | optional | OBSERVED (summary.js) | `$.metadata.fetched_at` | `/api/mission-control/summary` |
| data.asOf | data timestamp | ISO string | UTC | optional | OBSERVED (summary.js) | `$.data.asOf` | `/api/mission-control/summary` |
| data.hasKV | KV binding presence | boolean | n/a | optional | OBSERVED (summary.js) | `$.data.hasKV` | `/api/mission-control/summary` |
| data.health.platform.status | platform health | enum (OK/INFO/WARNING/CRITICAL) | n/a | required | OBSERVED (summary.js) | `$.data.health.platform.status` | `/api/mission-control/summary` |
| data.health.platform.reason | platform reason | string | n/a | optional | OBSERVED (summary.js) | `$.data.health.platform.reason` | `/api/mission-control/summary` |
| data.health.api.status | API health | enum | n/a | required | OBSERVED (summary.js) | `$.data.health.api.status` | `/api/mission-control/summary` |
| data.health.api.reason | API reason | string | n/a | optional | OBSERVED (summary.js) | `$.data.health.api.reason` | `/api/mission-control/summary` |
| data.health.prices.status | prices health | enum | n/a | required | SSOT (summary.js + ops-shapes) | `$.data.health.prices.status` | `/api/mission-control/summary` |
| data.health.prices.reason | prices reason | string | n/a | required | SSOT (summary.js + ops-shapes) | `$.data.health.prices.reason` | `/api/mission-control/summary` |
| data.health.prices.checked_path | bar path validated | string | n/a | required | SSOT (ops-shapes) | `$.data.health.prices.checked_path` | `/api/mission-control/summary` |
| data.health.prices.required_fields | bar required fields | array<string> | n/a | required | SSOT (ops-shapes) | `$.data.health.prices.required_fields` | `/api/mission-control/summary` |
| data.health.prices.per_ticker.*.sample_values | sample values for contract check | object | n/a | optional | SSOT (summary.js) | `$.data.health.prices.per_ticker.*.sample_values` | `/api/mission-control/summary` |
| data.health.freshness.asOf | snapshot asOf | ISO string/null | UTC | optional | OBSERVED (summary.js) | `$.data.health.freshness.asOf` | `/api/mission-control/summary` |
| data.health.freshness.age_hours | snapshot age | number/null | hours | optional | OBSERVED (summary.js) | `$.data.health.freshness.age_hours` | `/api/mission-control/summary` |
| data.health.pipeline.status | pipeline health | enum | n/a | optional | OBSERVED (summary.js) | `$.data.health.pipeline.status` | `/api/mission-control/summary` |
| data.health.pipeline.reason | pipeline reason | string | n/a | optional | OBSERVED (summary.js) | `$.data.health.pipeline.reason` | `/api/mission-control/summary` |
| data.pipeline.counts.expected | pipeline expected count | number | tickers | optional | OBSERVED (summary.js) | `$.data.pipeline.counts.expected` | `/api/mission-control/summary` |
| data.pipeline.counts.fetched | pipeline fetched count | number | tickers | optional | OBSERVED (summary.js) | `$.data.pipeline.counts.fetched` | `/api/mission-control/summary` |
| data.pipeline.counts.validated | pipeline validated count | number | tickers | optional | OBSERVED (summary.js) | `$.data.pipeline.counts.validated` | `/api/mission-control/summary` |
| data.pipeline.counts.computed | pipeline computed count | number | tickers | optional | OBSERVED (summary.js) | `$.data.pipeline.counts.computed` | `/api/mission-control/summary` |
| data.pipeline.counts.static_ready | pipeline static-ready count | number | tickers | optional | OBSERVED (summary.js) | `$.data.pipeline.counts.static_ready` | `/api/mission-control/summary` |
| data.coverage.computed | computed coverage | number | tickers | optional | OBSERVED (summary.js) | `$.data.coverage.computed` | `/api/mission-control/summary` |
| data.coverage.missing | missing coverage | number | tickers | optional | OBSERVED (summary.js) | `$.data.coverage.missing` | `/api/mission-control/summary` |
| data.eod.counts.expected | EOD expected | number | tickers | optional | OBSERVED (summary.js) | `$.data.eod.counts.expected` | `/api/mission-control/summary` |
| data.eod.counts.fetched | EOD fetched | number | tickers | optional | OBSERVED (summary.js) | `$.data.eod.counts.fetched` | `/api/mission-control/summary` |
| data.eod.counts.validated | EOD validated | number | tickers | optional | OBSERVED (summary.js) | `$.data.eod.counts.validated` | `/api/mission-control/summary` |
| data.opsBaseline.overall.verdict | baseline verdict | string | n/a | optional | OBSERVED (summary.js) | `$.data.opsBaseline.overall.verdict` | `/api/mission-control/summary` |
| data.opsBaseline.overall.reason | baseline reason | string | n/a | optional | OBSERVED (summary.js) | `$.data.opsBaseline.overall.reason` | `/api/mission-control/summary` |
| data.opsBaseline.baseline.pipeline.* | baseline pipeline counts | numbers | tickers | optional | OBSERVED (summary.js) | `$.data.opsBaseline.baseline.pipeline.*` | `/api/mission-control/summary` |
| data.opsBaseline.baseline.providers[] | provider budgets | array | n/a | optional | OBSERVED (summary.js) | `$.data.opsBaseline.baseline.providers[]` | `/api/mission-control/summary` |
| data.budgets.workersRequests.usedToday | workers requests | number | count | optional | OBSERVED (summary.js) | `$.data.budgets.workersRequests.usedToday` | `/api/mission-control/summary` |
| data.opsLive.cloudflare.requestsLast24h | CF requests 24h | number | count | optional | OBSERVED (summary.js) | `$.data.opsLive.cloudflare.requestsLast24h` | `/api/mission-control/summary` |
| data.runtime.env | runtime mode | string | n/a | required | SSOT (summary.js) | `$.data.runtime.env` | `/api/mission-control/summary` |
| data.runtime.schedulerExpected | scheduler expected | boolean | n/a | required | SSOT (ops/contract.md) | `$.data.runtime.schedulerExpected` | `/api/mission-control/summary` |
| data.runtime.schedulerExpectedReason | scheduler expected reason | string | n/a | required | SSOT (ops/contract.md) | `$.data.runtime.schedulerExpectedReason` | `/api/mission-control/summary` |
| data.runtime.pipelineExpected | pipeline expected | boolean | n/a | optional | OBSERVED (summary.js) | `$.data.runtime.pipelineExpected` | `/api/mission-control/summary` |
| data.runtime.hostname | runtime hostname | string | n/a | optional | OBSERVED (summary.js) | `$.data.runtime.hostname` | `/api/mission-control/summary` |
| data.sourceMap.entries[] | source-map entries | array | n/a | optional | OBSERVED (summary.js) | `$.data.sourceMap.entries[]` | `/api/mission-control/summary` |
| data.truthChains.prices.steps[] | prices truth chain | array | n/a | required | SSOT (ops-shapes) | `$.data.truthChains.prices.steps[]` | `/api/mission-control/summary` |
| data.truthChains.indicators.steps[] | indicators truth chain | array | n/a | required | SSOT (ops-shapes) | `$.data.truthChains.indicators.steps[]` | `/api/mission-control/summary` |
| build-info.git_sha | build SHA | string | n/a | optional | OBSERVED (build-info.json) | `/data/build-info.json -> .git_sha` | `/data/build-info.json` |
| build-info.build_time_utc | build time | ISO string | UTC | optional | OBSERVED (build-info.json) | `/data/build-info.json -> .build_time_utc` | `/data/build-info.json` |
