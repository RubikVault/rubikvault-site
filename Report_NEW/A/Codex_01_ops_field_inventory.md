# OPS Field Inventory (LIVE: https://638a1962.rubikvault-site.pages.dev)

## Scope & Evidence
- **OPS UI entrypoint:** `public/ops/index.html` (labels + render logic) — see line ranges below.
- **OPS payload source:** `/api/mission-control/summary?debug=1` (live excerpt in 03_ops_findings_and_fixplan.md).
- **SSOT definitions:**
  - `docs/ops/ops-shapes.ssot.md:7-58` (canonical bar path `data.latest_bar`, truthChains location `data.truthChains`).
  - `docs/ops/contract.md:34-51` (legacy envelope status tokens LIVE/STALE/ERROR/EMPTY).
- **Runtime mode semantics:** hostname-based preview detection (`functions/api/mission-control/summary.js:744-763`).

## Field Inventory (UI-visible + OPS payload)

| field_name | ops_display_label | current_semantics (FC) | expected_type | allowed_values | status (CORRECT/CONFLICT/UNKNOWN) | JSON pointer |
|---|---|---|---|---|---|---|
| schema_version | (implicit) | Ops summary schema version | string | "3.0" | CORRECT | $.schema_version |
| meta.status | (implicit) | envelope status for OPS summary | string | SSOT conflict: `LIVE|STALE|ERROR|EMPTY` vs implementation `ok|degraded|error` | CONFLICT | $.meta.status |
| meta.reason | (implicit) | envelope reason | string/null | any | UNKNOWN (no SSOT) | $.meta.reason |
| meta.asOf | Runtime asOf | summary timestamp | ISO string | ISO8601 | CORRECT | $.meta.asOf |
| meta.baselineAsOf | Baseline asOf | baseline timestamp | ISO string/null | ISO8601 or null | UNKNOWN (no SSOT) | $.meta.baselineAsOf |
| meta.liveAsOf | Runtime asOf | live timestamp | ISO string | ISO8601 | UNKNOWN (no SSOT) | $.meta.liveAsOf |
| metadata.served_from | Served from | source of summary payload | string | ASSET/RUNTIME | CORRECT | $.metadata.served_from |
| data.health.platform.status | Platform | KV/platform health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.platform.status |
| data.health.platform.reason | Platform reason | KV status reason | string | any | UNKNOWN (no SSOT) | $.data.health.platform.reason |
| data.health.api.status | API | summary API health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.api.status |
| data.health.api.reason | API reason | summary reason | string | any | UNKNOWN (no SSOT) | $.data.health.api.reason |
| data.health.prices.status | Prices | product-path health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.prices.status |
| data.health.prices.reason | Prices reason | contract verdict | string | any | CORRECT | $.data.health.prices.reason |
| data.health.prices.checked_path | Prices contract path | canonical bar location | string | `data.latest_bar` | CORRECT (SSOT) | $.data.health.prices.checked_path |
| data.health.prices.required_fields | Prices contract fields | required bar fields | array<string> | date, close, volume | CORRECT | $.data.health.prices.required_fields |
| data.health.freshness.asOf | Freshness | market-prices snapshot asOf | string/null | ISO or null | UNKNOWN (SSOT missing) | $.data.health.freshness.asOf |
| data.health.freshness.age_hours | Freshness | snapshot age hours | number/null | number or null | UNKNOWN (SSOT missing) | $.data.health.freshness.age_hours |
| data.health.pipeline.status | Pipeline | pipeline health | string | OK/INFO/WARNING/CRITICAL | CORRECT | $.data.health.pipeline.status |
| data.health.pipeline.reason | Pipeline reason | pipeline health reason | string | any | UNKNOWN | $.data.health.pipeline.reason |
| data.pipeline.counts.expected | Pipeline counts | expected ticker count | number | >=0 | UNKNOWN (SSOT missing for ops counts) | $.data.pipeline.counts.expected |
| data.pipeline.counts.fetched | Pipeline counts | fetched ticker count | number | >=0 | UNKNOWN | $.data.pipeline.counts.fetched |
| data.pipeline.counts.validated | Pipeline counts | validated ticker count | number | >=0 | UNKNOWN | $.data.pipeline.counts.validated |
| data.pipeline.counts.computed | Pipeline counts | computed ticker count | number | >=0 | UNKNOWN | $.data.pipeline.counts.computed |
| data.pipeline.counts.static_ready | Pipeline counts | static-ready ticker count | number | >=0 | UNKNOWN | $.data.pipeline.counts.static_ready |
| data.coverage.computed | Coverage | computed count | number | >=0 | UNKNOWN | $.data.coverage.computed |
| data.coverage.missing | Coverage | missing count | number | >=0 | UNKNOWN | $.data.coverage.missing |
| data.eod.counts.expected | EOD pipeline | expected symbols | number | >=0 | UNKNOWN | $.data.eod.counts.expected |
| data.eod.counts.fetched | EOD pipeline | fetched symbols | number | >=0 | UNKNOWN | $.data.eod.counts.fetched |
| data.eod.counts.validated | EOD pipeline | validated symbols | number | >=0 | UNKNOWN | $.data.eod.counts.validated |
| data.opsBaseline.overall.verdict | Baseline verdict | overall status of baseline | string | OK/RISK/DEGRADED/etc | UNKNOWN (SSOT missing) | $.data.opsBaseline.overall.verdict |
| data.opsBaseline.overall.reason | Baseline reason | overall reason | string | any | UNKNOWN (SSOT missing) | $.data.opsBaseline.overall.reason |
| data.opsBaseline.baseline.pipeline.* | Baseline pipeline | baseline counts | numbers | >=0 | UNKNOWN (SSOT missing) | $.data.opsBaseline.baseline.pipeline.* |
| data.opsBaseline.baseline.providers[] | Provider budgets | per-provider counts | array | any | UNKNOWN (SSOT missing) | $.data.opsBaseline.baseline.providers[] |
| data.budgets.workersRequests.usedToday | Workers costs | requests today | number | >=0 | UNKNOWN (SSOT missing) | $.data.budgets.workersRequests.usedToday |
| data.opsLive.cloudflare.requestsLast24h | Workers costs | CF requests last 24h | number | >=0 | UNKNOWN (SSOT missing) | $.data.opsLive.cloudflare.requestsLast24h |
| data.runtime.env | Runtime mode | preview/production | string | preview/production | CORRECT (by implementation semantics) | $.data.runtime.env |
| data.runtime.schedulerExpected | Scheduler expected | cron expected? | boolean | true/false | CORRECT | $.data.runtime.schedulerExpected |
| data.runtime.schedulerExpectedReason | Scheduler reason | reason text | string | any | CORRECT | $.data.runtime.schedulerExpectedReason |
| data.runtime.pipelineExpected | Pipeline expected | pipeline expected? | boolean | true/false | CORRECT | $.data.runtime.pipelineExpected |
| data.runtime.hostname | Runtime hostname | hostname string | string | any | CORRECT | $.data.runtime.hostname |
| data.truthChains.prices.steps[] | Prices truth chain | array of steps | array | {id,status,evidence} | CORRECT (SSOT) | $.data.truthChains.prices.steps[] |
| data.truthChains.indicators.steps[] | Indicators truth chain | array of steps | array | {id,status,evidence} | CORRECT (SSOT) | $.data.truthChains.indicators.steps[] |
| data.sourceMap.entries[] | Source map | mapping entries | array | {id,sources,depends} | UNKNOWN (SSOT missing) | $.data.sourceMap.entries[] |
| build-info.git_sha | Build info | git SHA of build | string | hex string | UNKNOWN (SSOT missing) | /data/build-info.json -> $.git_sha |
| build-info.build_time_utc | Build info | build time | ISO string | ISO8601 | UNKNOWN (SSOT missing) | /data/build-info.json -> $.build_time_utc |

## Debug endpoints (not used by OPS UI, but probed as required)
- `/api/ops?debug=1` returns debug envelope for module `ops` (served by static-only handler). See live excerpt in 03_ops_findings_and_fixplan.md.
- `/api/build-info?debug=1` returns debug envelope for module `build-info`. See live excerpt in 03_ops_findings_and_fixplan.md.
- `/api/debug-bundle?debug=1` returns debug envelope for module `debug-bundle`. See live excerpt in 03_ops_findings_and_fixplan.md.
