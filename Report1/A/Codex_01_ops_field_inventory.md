# OPS Field Inventory (v5.1) — LIVE_URL https://638a1962.rubikvault-site.pages.dev

## Evidence anchors
- OPS UI reads `/api/mission-control/summary` (UI code: `public/ops/index.html:1082-1125`).
- OPS summary payload shape: `functions/api/mission-control/summary.js:1591-1678`.
- Ops SSOT for bars/truthChains: `docs/ops/ops-shapes.ssot.md:7-58`.
- Legacy envelope contract: `docs/ops/contract.md:34-51` (meta.status tokens).
- Live summary excerpt: see `03_ops_findings_and_fixplan.md` (section **Live Evidence Excerpts**).

## Field inventory table (all fields shown in /ops UI)
| field_name | ops_display_label | current_semantics (FC) | expected_type | allowed_values | status (CORRECT/CONFLICT/UNKNOWN) | JSON pointer |
|---|---|---|---|---|---|---|
| meta.status | (implicit) | envelope status of ops summary | string | `LIVE|STALE|ERROR|EMPTY` per legacy contract | CONFLICT | $.meta.status |
| meta.reason | (implicit) | envelope reason | string|null | any | UNKNOWN | $.meta.reason |
| meta.asOf | Runtime asOf | summary timestamp | ISO string | ISO8601 | CORRECT | $.meta.asOf |
| meta.baselineAsOf | Baseline asOf | baseline timestamp | ISO string|null | ISO8601 or null | UNKNOWN | $.meta.baselineAsOf |
| meta.liveAsOf | Runtime asOf | live timestamp | ISO string | ISO8601 | UNKNOWN | $.meta.liveAsOf |
| metadata.served_from | Served from | RUNTIME vs ASSET | string | ASSET/RUNTIME | CORRECT | $.metadata.served_from |
| data.health.platform.status | Platform | KV/platform health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.platform.status |
| data.health.platform.reason | Platform reason | KV status reason | string | any | UNKNOWN | $.data.health.platform.reason |
| data.health.api.status | API | summary health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.api.status |
| data.health.api.reason | API reason | summary reason | string | any | UNKNOWN | $.data.health.api.reason |
| data.health.prices.status | Prices | product-path health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.prices.status |
| data.health.prices.reason | Prices reason | contract verdict | string | any | CORRECT | $.data.health.prices.reason |
| data.health.prices.checked_path | Prices contract path | bar location | string | `data.latest_bar` | CORRECT | $.data.health.prices.checked_path |
| data.health.prices.required_fields | Prices contract fields | required bar fields | array<string> | date, close, volume | CORRECT | $.data.health.prices.required_fields |
| data.health.freshness.status | Freshness | snapshot freshness | string | OK/INFO/WARNING/CRITICAL | UNKNOWN | $.data.health.freshness.status |
| data.health.freshness.reason | Freshness reason | reason text | string | any | UNKNOWN | $.data.health.freshness.reason |
| data.health.freshness.asOf | Freshness | snapshot asOf | string|null | ISO or null | UNKNOWN | $.data.health.freshness.asOf |
| data.health.freshness.age_hours | Freshness | snapshot age | number|null | number or null | UNKNOWN | $.data.health.freshness.age_hours |
| data.health.pipeline.status | Pipeline | pipeline health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.pipeline.status |
| data.health.pipeline.reason | Pipeline reason | pipeline reason | string | any | UNKNOWN | $.data.health.pipeline.reason |
| data.runtime.env | Runtime mode | preview/prod | string | preview/production | CORRECT (hostname semantics) | $.data.runtime.env |
| data.runtime.schedulerExpected | Scheduler expected | cron expected? | boolean | true/false | CORRECT | $.data.runtime.schedulerExpected |
| data.runtime.schedulerExpectedReason | Scheduler reason | reason text | string | any | CORRECT | $.data.runtime.schedulerExpectedReason |
| data.runtime.pipelineExpected | Pipeline expected | pipeline expected? | boolean | true/false | CORRECT | $.data.runtime.pipelineExpected |
| data.runtime.hostname | Runtime host | hostname | string | any | CORRECT | $.data.runtime.hostname |
| data.pipeline.counts.expected | Pipeline counts | expected tickers | number | >=0 | UNKNOWN | $.data.pipeline.counts.expected |
| data.pipeline.counts.fetched | Pipeline counts | fetched tickers | number | >=0 | UNKNOWN | $.data.pipeline.counts.fetched |
| data.pipeline.counts.validated | Pipeline counts | validated tickers | number | >=0 | UNKNOWN | $.data.pipeline.counts.validated |
| data.pipeline.counts.computed | Pipeline counts | computed tickers | number | >=0 | UNKNOWN | $.data.pipeline.counts.computed |
| data.pipeline.counts.static_ready | Pipeline counts | static-ready tickers | number | >=0 | UNKNOWN | $.data.pipeline.counts.static_ready |
| data.coverage.computed | Coverage | computed count | number | >=0 | UNKNOWN | $.data.coverage.computed |
| data.coverage.missing | Coverage | missing count | number | >=0 | UNKNOWN | $.data.coverage.missing |
| data.eod.counts.expected | EOD pipeline | expected symbols | number | >=0 | UNKNOWN | $.data.eod.counts.expected |
| data.eod.counts.fetched | EOD pipeline | fetched symbols | number | >=0 | UNKNOWN | $.data.eod.counts.fetched |
| data.eod.counts.validated | EOD pipeline | validated symbols | number | >=0 | UNKNOWN | $.data.eod.counts.validated |
| data.opsBaseline.overall.verdict | Overall status | baseline verdict | string | any | UNKNOWN | $.data.opsBaseline.overall.verdict |
| data.opsBaseline.overall.reason | Overall reason | baseline reason | string | any | UNKNOWN | $.data.opsBaseline.overall.reason |
| data.opsBaseline.baseline.pipeline.* | Baseline pipeline | baseline counts | numbers | >=0 | UNKNOWN | $.data.opsBaseline.baseline.pipeline.* |
| data.opsBaseline.baseline.providers[] | Provider budgets | per-provider counts | array | any | UNKNOWN | $.data.opsBaseline.baseline.providers[] |
| data.budgets.workersRequests.usedToday | Workers costs | requests today | number | >=0 | UNKNOWN | $.data.budgets.workersRequests.usedToday |
| data.opsLive.cloudflare.requestsLast24h | Workers costs | CF requests last 24h | number | >=0 | UNKNOWN | $.data.opsLive.cloudflare.requestsLast24h |
| data.truthChains.prices.steps[] | Prices truth chain | steps array | array | {id,status,evidence} | CORRECT | $.data.truthChains.prices.steps[] |
| data.truthChains.indicators.steps[] | Indicators truth chain | steps array | array | {id,status,evidence} | CORRECT | $.data.truthChains.indicators.steps[] |
| data.sourceMap.entries[] | Source map | mapping entries | array | {id,sources,depends} | UNKNOWN | $.data.sourceMap.entries[] |
| build-info.git_sha | Build info | git SHA (UI line) | string | hex | UNKNOWN | /data/build-info.json -> $.git_sha |
| build-info.build_time_utc | Build info | build time (UI line) | ISO string | ISO8601 | UNKNOWN | /data/build-info.json -> $.build_time_utc |
