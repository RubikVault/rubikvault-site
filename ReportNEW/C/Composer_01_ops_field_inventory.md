# OPS Field Inventory

**Live URL:** https://638a1962.rubikvault-site.pages.dev  
**Audit Date:** 2026-02-03T15:47:37Z  
**Evidence Source:** `/api/mission-control/summary?debug=1`

## Field Inventory Table

| field_name | ops_display_label | current_semantics (FC) | expected_type | allowed_values | status | live JSONPath |
|------------|-------------------|------------------------|---------------|----------------|--------|---------------|
| runtime.env | Runtime mode | Deployment-mode: "preview" if hostname ends with `.pages.dev`, "production" if `rubikvault.com` | string | "production"\|"preview" | CORRECT | $.data.runtime.env |
| runtime.hostname | (not displayed) | Current request hostname | string | - | CORRECT | $.data.runtime.hostname |
| runtime.schedulerExpected | Scheduler expected | Boolean: true if production profile, false if preview | boolean | true\|false | CORRECT | $.data.runtime.schedulerExpected |
| runtime.schedulerExpectedReason | Scheduler expected reason | Explanation string for scheduler expectation | string | - | CORRECT | $.data.runtime.schedulerExpectedReason |
| runtime.kvExpected | (not displayed) | Boolean from profile.expected.kv | boolean | true\|false | CORRECT | $.data.runtime.kvExpected |
| runtime.pipelineExpected | (not displayed) | Boolean from profile.expected.pipeline | boolean | true\|false | CORRECT | $.data.runtime.pipelineExpected |
| runtime.pricesStaticRequired | (not displayed) | Boolean from profile.prices_static_required | boolean | true\|false | CORRECT | $.data.runtime.pricesStaticRequired |
| health.platform.status | Platform | Health status enum | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | $.data.health.platform.status |
| health.platform.reason | Platform (reason) | Explanation for platform status | string | - | CORRECT | $.data.health.platform.reason |
| health.api.status | API | Health status enum | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | $.data.health.api.status |
| health.api.reason | API (reason) | Always "SUMMARY_OK" | string | "SUMMARY_OK" | CORRECT | $.data.health.api.reason |
| health.prices.status | Prices | Health status enum | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | $.data.health.prices.status |
| health.prices.reason | Prices (reason) | "CONTRACT_OK" if P6 step passes | string | - | CORRECT | $.data.health.prices.reason |
| health.prices.checked_path | (not displayed) | JSONPath used for validation | string | "data.latest_bar" | CORRECT | $.data.health.prices.checked_path |
| health.prices.required_fields | (not displayed) | Required field names | array | ["date","close","volume"] | CORRECT | $.data.health.prices.required_fields |
| health.pipeline.status | Pipeline | Health status enum | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | $.data.health.pipeline.status |
| health.pipeline.reason | Pipeline (reason) | Explanation for pipeline status | string | - | CORRECT | $.data.health.pipeline.reason |
| health.pipeline.counts | Pipeline (counts) | Pipeline stage counts | object | {expected, fetched, validated, computed, static_ready} | CORRECT | $.data.health.pipeline.counts |
| health.freshness.status | Freshness | Health status enum | string | OK\|INFO\|WARNING\|CRITICAL | CORRECT | $.data.health.freshness.status |
| health.freshness.reason | Freshness (reason) | Age-based freshness reason | string | - | CORRECT | $.data.health.freshness.reason |
| health.freshness.age_hours | Age (hours) | Age of snapshot in hours | number | >= 0 | CORRECT | $.data.health.freshness.age_hours |
| health.freshness.asOf | Market-prices snapshot asOf | ISO timestamp of snapshot | string | ISO8601 | CORRECT | $.data.health.freshness.asOf |
| budgets.workersRequests.usedToday | Costs today (Workers) | Workers requests used today | number | >= 0 | CORRECT | $.data.budgets.workersRequests.usedToday |
| budgets.workersRequests.limitToday | (not displayed) | Daily limit for workers requests | number | 100000 | CORRECT | $.data.budgets.workersRequests.limitToday |
| budgets.workersRequests.pctUsed | (not displayed) | Percentage used | number | 0-100 | CORRECT | $.data.budgets.workersRequests.pctUsed |
| budgets.workersRequests.pctRemaining | (not displayed) | Percentage remaining | number | 0-100 | CORRECT | $.data.budgets.workersRequests.pctRemaining |
| budgets.kvReads.usedToday | (not displayed) | KV reads used today | number\|null | >= 0 or null | CORRECT | $.data.budgets.kvReads.usedToday |
| budgets.kvReads.limitToday | (not displayed) | Daily limit for KV reads | number | 20000 | CORRECT | $.data.budgets.kvReads.limitToday |
| budgets.kvWrites.usedToday | (not displayed) | KV writes used today | number\|null | >= 0 or null | CORRECT | $.data.budgets.kvWrites.usedToday |
| budgets.kvWrites.limitToday | (not displayed) | Daily limit for KV writes | number | 20000 | CORRECT | $.data.budgets.kvWrites.limitToday |
| opsLive.cloudflare.requestsLast24h | Last 24h (Workers) | Cloudflare requests last 24h | number\|null | >= 0 or null | CORRECT | $.data.opsLive.cloudflare.requestsLast24h |
| opsBaseline.baseline.safety.kvWritesToday | Safety locks | KV writes today from baseline | number\|null | >= 0 or null | CORRECT | $.data.opsBaseline.baseline.safety.kvWritesToday |
| opsBaseline.baseline.providers[].name | Provider | Provider name | string | - | CORRECT | $.data.opsBaseline.baseline.providers[*].name |
| opsBaseline.baseline.providers[].usedMonth | Used | Monthly usage | number\|null | >= 0 or null | CORRECT | $.data.opsBaseline.baseline.providers[*].usedMonth |
| opsBaseline.baseline.providers[].limitMonth | Limit | Monthly limit | number\|null | >= 0 or null | CORRECT | $.data.opsBaseline.baseline.providers[*].limitMonth |
| opsBaseline.baseline.providers[].remainingMonth | Remaining | Monthly remaining | number\|null | >= 0 or null | CORRECT | $.data.opsBaseline.baseline.providers[*].remainingMonth |
| opsBaseline.baseline.providers[].remainingPct | Remaining % | Percentage remaining | number\|null | 0-100 or null | CORRECT | $.data.opsBaseline.baseline.providers[*].remainingPct |
| opsBaseline.baseline.providers[].resetDate | Reset | Reset date | string\|null | ISO8601 date or null | CORRECT | $.data.opsBaseline.baseline.providers[*].resetDate |
| opsBaseline.baseline.providers[].runtimeCallsToday | Runtime calls today | Calls today | number | >= 0 | CORRECT | $.data.opsBaseline.baseline.providers[*].runtimeCallsToday |
| pipeline.counts.expected | Expected | Expected pipeline count | number\|null | >= 0 or null | CORRECT | $.data.pipeline.counts.expected |
| pipeline.counts.fetched | Fetched | Fetched stage count | number\|null | >= 0 or null | CORRECT | $.data.pipeline.counts.fetched |
| pipeline.counts.validated | Validated | Validated stage count | number\|null | >= 0 or null | CORRECT | $.data.pipeline.counts.validated |
| pipeline.counts.computed | Computed | Computed stage count | number\|null | >= 0 or null | CORRECT | $.data.pipeline.counts.computed |
| pipeline.counts.static_ready | Static-ready | Static-ready stage count | number\|null | >= 0 or null | CORRECT | $.data.pipeline.counts.static_ready |
| coverage.computed | Coverage computed | Computed coverage count | number | >= 0 | CORRECT | $.data.coverage.computed |
| coverage.missing | Coverage missing | Missing coverage count | number | >= 0 | CORRECT | $.data.coverage.missing |
| metadata.fetched_at | Last summary fetch | ISO timestamp of fetch | string | ISO8601 | CORRECT | $.metadata.fetched_at |
| meta.asOf | (not displayed) | ISO timestamp of summary | string | ISO8601 | CORRECT | $.meta.asOf |
| meta.baselineAsOf | Baseline asOf | ISO timestamp of baseline | string\|null | ISO8601 or null | CORRECT | $.meta.baselineAsOf |
| meta.status | (not displayed) | Overall meta status | string | "ok"\|"degraded"\|"error" | CORRECT | $.meta.status |
| meta.reason | (not displayed) | Overall meta reason | string\|null | - | CORRECT | $.meta.reason |
| metadata.served_from | Served from | Source indicator | string | "RUNTIME"\|"ASSET" | CORRECT | $.metadata.served_from |
| deploy.gitSha | (not displayed) | Git SHA from build-info.json | string\|null | Git SHA or null | UNDECIDABLE | $.data.deploy.gitSha |
| deploy.buildTs | (not displayed) | Build timestamp from build-info.json | string\|null | ISO8601 or null | UNDECIDABLE | $.data.deploy.buildTs |

## SSOT Status

**SSOT Found:** `public/data/ops/health-profiles.v1.json` defines expected flags per profile (production/preview).  
**SSOT Missing (P0):** No explicit contract file defines all OPS field semantics, types, units, required/optional status.

**Partial SSOT:**
- `public/data/ops/health-profiles.v1.json`: Defines expected flags (scheduler, kv, pipeline) per profile
- `public/data/ops/thresholds.v1.json`: Defines freshness thresholds per profile
- `public/data/ops/source-map.v1.json`: Defines source mappings (not field contracts)

**Evidence:** 
- `public/data/ops/health-profiles.v1.json:4-23` (profiles definition)
- `public/data/ops/thresholds.v1.json:4-11` (thresholds definition)
- `functions/api/mission-control/summary.js:1047-1051` (profile selection logic)

## RUNTIME_MODE Semantics (Proven)

**Implemented Semantic:** Deployment-mode semantics (hostname-based detection)

**Detection Logic:** `detectPreviewMode(url, env)` (functions/api/mission-control/summary.js:744-756)
- `.pages.dev` hostname → `isPreview: true`
- `rubikvault.com` or `www.rubikvault.com` → `isProduction: true`
- `localhost` → `isPreview: true`

**Profile Selection:** `pickProfile(previewMode, profiles)` (functions/api/mission-control/summary.js:760-764)
- If `isProduction` → `production` profile → `runtime.env = "production"`
- Else → `preview` profile → `runtime.env = "preview"`

**Live Evidence:**
- Hostname: `638a1962.rubikvault-site.pages.dev` (ends with `.pages.dev`)
- `runtime.env`: `"preview"` ✅ CORRECT
- `runtime.schedulerExpected`: `false` ✅ CORRECT
- `health.platform.status`: `"INFO"` ✅ CORRECT (preview mode, KV not expected)

**Evidence:**
- `functions/api/mission-control/summary.js:744-756` (detectPreviewMode)
- `functions/api/mission-control/summary.js:760-764` (pickProfile)
- `functions/api/mission-control/summary.js:1619` (runtime.env assignment)
- `public/data/ops/health-profiles.v1.json:14-22` (preview profile definition)
- Live JSON: `$.data.runtime.env = "preview"`, `$.data.runtime.hostname = "638a1962.rubikvault-site.pages.dev"`
