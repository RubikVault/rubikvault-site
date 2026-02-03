# OPS Field Inventory

**Live URL:** https://638a1962.rubikvault-site.pages.dev  
**Audit Date:** 2026-02-03T16:14:06Z  
**Evidence Source:** `/api/mission-control/summary?debug=1`

## Field Inventory Table

| field_name | ops_display_label | current_semantics (FC) | expected_type | allowed_values | status | source_category | live JSONPath |
|------------|-------------------|------------------------|---------------|----------------|--------|-----------------|---------------|
| runtime.env | Runtime mode | Deployment-mode: "preview" if hostname ends with `.pages.dev` | string | "production"\|"preview" | CORRECT | RUNTIME | $.data.runtime.env |
| runtime.schedulerExpected | Scheduler expected | Boolean: true if production profile, false if preview | boolean | true\|false | CORRECT | RUNTIME | $.data.runtime.schedulerExpected |
| runtime.schedulerExpectedReason | Scheduler expected reason | Explanation string | string | - | CORRECT | RUNTIME | $.data.runtime.schedulerExpectedReason |
| health.platform.status | Platform | Health status enum. INFO in preview mode (KV not expected) | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT (but yellow) | RUNTIME | $.data.health.platform.status |
| health.platform.reason | Platform (reason) | "NOT_EXPECTED" in preview mode | string | - | CORRECT | RUNTIME | $.data.health.platform.reason |
| health.api.status | API | Always "OK" (hardcoded) | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | RUNTIME | $.data.health.api.status |
| health.api.reason | API (reason) | Always "SUMMARY_OK" | string | "SUMMARY_OK" | CORRECT | RUNTIME | $.data.health.api.reason |
| health.prices.status | Prices | Health status enum. OK if P6 contract passes | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | RUNTIME | $.data.health.prices.status |
| health.prices.reason | Prices (reason) | "CONTRACT_OK" if P6 step passes | string | - | CORRECT | RUNTIME | $.data.health.prices.reason |
| health.pipeline.status | Pipeline | Health status enum. INFO in preview mode (pipeline not expected) | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT (but yellow) | RUNTIME | $.data.health.pipeline.status |
| health.pipeline.reason | Pipeline (reason) | "NOT_EXPECTED" in preview mode | string | - | CORRECT | RUNTIME | $.data.health.pipeline.reason |
| health.freshness.status | Freshness | Health status enum. INFO in preview mode (freshness not expected) | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT (but yellow) | RUNTIME | $.data.health.freshness.status |
| health.freshness.reason | Freshness (reason) | "NOT_EXPECTED" in preview mode | string | - | CORRECT | RUNTIME | $.data.health.freshness.reason |
| health.freshness.age_hours | Age (hours) | Age of snapshot in hours | number | >= 0 | CORRECT | ASSET | $.data.health.freshness.age_hours |
| health.freshness.asOf | Market-prices snapshot asOf | ISO timestamp of snapshot | string | ISO8601 | CORRECT | ASSET | $.data.health.freshness.asOf |
| budgets.workersRequests.usedToday | Costs today (Workers) | Workers requests used today | number | >= 0 | CORRECT | KV | $.data.budgets.workersRequests.usedToday |
| budgets.workersRequests.limitToday | (not displayed) | Daily limit for workers requests | number | 100000 | CORRECT | STATIC | $.data.budgets.workersRequests.limitToday |
| opsLive.cloudflare.requestsLast24h | Last 24h (Workers) | Cloudflare requests last 24h | number\|null | >= 0 or null | CORRECT | RUNTIME | $.data.opsLive.cloudflare.requestsLast24h |
| opsBaseline.baseline.safety.kvWritesToday | Safety locks | KV writes today from baseline | number\|null | >= 0 or null | CORRECT | ASSET | $.data.opsBaseline.baseline.safety.kvWritesToday |
| opsBaseline.baseline.providers[].name | Provider | Provider name | string | - | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].name |
| opsBaseline.baseline.providers[].usedMonth | Used | Monthly usage | number\|null | >= 0 or null | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].usedMonth |
| opsBaseline.baseline.providers[].limitMonth | Limit | Monthly limit | number\|null | >= 0 or null | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].limitMonth |
| opsBaseline.baseline.providers[].remainingMonth | Remaining | Monthly remaining | number\|null | >= 0 or null | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].remainingMonth |
| opsBaseline.baseline.providers[].remainingPct | Remaining % | Percentage remaining | number\|null | 0-100 or null | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].remainingPct |
| opsBaseline.baseline.providers[].resetDate | Reset | Reset date | string\|null | ISO8601 date or null | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].resetDate |
| opsBaseline.baseline.providers[].runtimeCallsToday | Runtime calls today | Calls today | number | >= 0 | CORRECT | ASSET | $.data.opsBaseline.baseline.providers[*].runtimeCallsToday |
| pipeline.counts.expected | Expected | Expected pipeline count | number\|null | >= 0 or null | CORRECT | ASSET | $.data.pipeline.counts.expected |
| pipeline.counts.fetched | Fetched | Fetched stage count | number\|null | >= 0 or null | CORRECT | ASSET | $.data.pipeline.counts.fetched |
| pipeline.counts.validated | Validated | Validated stage count | number\|null | >= 0 or null | CORRECT | ASSET | $.data.pipeline.counts.validated |
| pipeline.counts.computed | Computed | Computed stage count | number\|null | >= 0 or null | CORRECT | ASSET | $.data.pipeline.counts.computed |
| pipeline.counts.static_ready | Static-ready | Static-ready stage count | number\|null | >= 0 or null | CORRECT | ASSET | $.data.pipeline.counts.static_ready |
| coverage.computed | Coverage computed | Computed coverage count | number | >= 0 | CORRECT | RUNTIME | $.data.coverage.computed |
| coverage.missing | Coverage missing | Missing coverage count | number | >= 0 | CORRECT | RUNTIME | $.data.coverage.missing |
| metadata.fetched_at | Last summary fetch | ISO timestamp of fetch | string | ISO8601 | CORRECT | RUNTIME | $.metadata.fetched_at |
| meta.asOf | (not displayed) | ISO timestamp of summary | string | ISO8601 | CORRECT | RUNTIME | $.meta.asOf |
| meta.baselineAsOf | Baseline asOf | ISO timestamp of baseline | string\|null | ISO8601 or null | CORRECT | ASSET | $.meta.baselineAsOf |
| meta.status | (not displayed) | Overall meta status | string | "ok"\|"degraded"\|"error" | CORRECT | RUNTIME | $.meta.status |
| meta.reason | (not displayed) | Overall meta reason | string\|null | - | CORRECT | RUNTIME | $.meta.reason |
| metadata.served_from | Served from | Source indicator | string | "RUNTIME"\|"ASSET" | CORRECT | RUNTIME | $.metadata.served_from |
| deploy.gitSha | (not displayed) | Git SHA from build-info.json | string\|null | Git SHA or null | WRONG | ASSET | $.data.deploy.gitSha |
| deploy.buildTs | (not displayed) | Build timestamp from build-info.json | string\|null | ISO8601 or null | WRONG | ASSET | $.data.deploy.buildTs |

## SSOT Status

**SSOT Found:** 
- `public/data/ops/health-profiles.v1.json`: Defines expected flags per profile (production/preview)
- `public/data/ops/thresholds.v1.json`: Defines freshness thresholds per profile

**SSOT Missing (P0):**
- No explicit contract file defines all OPS field semantics, types, units, required/optional
- No contract for build-info.json schema (field name mappings)

**Evidence:**
- `public/data/ops/health-profiles.v1.json:14-22` (preview profile: `not_expected_status: "INFO"`)
- `functions/api/mission-control/summary.js:794` (`computePipelineStatus`: returns `INFO` if `!isExpected`)
- `functions/api/mission-control/summary.js:784` (`computeFreshnessStatus`: returns `INFO` if `!expected`)
- `functions/api/mission-control/summary.js:1502` (`platformStatus`: returns `INFO` if `!expectedFlags.kv`)
- `public/ops/index.html:595` (`statusClass('INFO')` returns `'warn'` → yellow)

## Non-Green Indicators Analysis

**Why OPS UI is not fully green:**

1. **INFO status displayed as yellow (warn):**
   - `statusClass('INFO')` returns `'warn'` (public/ops/index.html:595)
   - In preview mode, platform/freshness/pipeline return `INFO` with reason `"NOT_EXPECTED"`
   - This is CORRECT behavior per health-profiles.v1.json (`not_expected_status: "INFO"`)
   - But UI displays INFO as yellow, making it appear "not green"

2. **deploy.gitSha/buildTs are null:**
   - Live `/build-info.json` has `commitSha` and `generatedAt`
   - Code expects `gitSha` and `buildTs` (functions/api/mission-control/summary.js:941-942)
   - Code checks aliases but misses `commitSha`/`generatedAt`
   - Result: null values → displayed as "unknown" in UI

3. **Debug endpoints show FAILED:**
   - `/api/build-info`: `VALIDATION_FAILED_SCHEMA` (schema_version null)
   - `/api/debug-bundle`: `VALIDATION_FAILED_SCHEMA` (schema_version null)
   - `/api/ops`: `ASSET_FETCH_FAILED` (NOT_FOUND)
   - These are legacy artifacts without v3.0 schema
   - Not critical for OPS UI display, but show as errors in debug mode

## Source Categories

- **RUNTIME:** Computed at request time from env/request context
- **ASSET:** Read from static files in `/data/` or `/data/snapshots/`
- **KV:** Read from Cloudflare KV (if available)
- **STATIC:** Hardcoded constants or config files
