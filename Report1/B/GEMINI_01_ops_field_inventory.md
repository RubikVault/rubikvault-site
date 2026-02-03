# OPS Field Inventory (Audit v6.0)

## Overview
This inventory maps fields visible in the Ops UI to their backend sources and indicates their correctness status based on live evidence.

| Field | Display Label | Source Type | Source Path | Status | SSOT Contract |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `runtime.env` | Runtime Mode | Runtime Logic | `summary.js:detectPreviewMode` | **WRONG** | *Implicit* (Code Logic) |
| `runtime.schedulerExpected` | Cron Expected? | Runtime Logic | `summary.js:profile` | CORRECT | *Implicit* |
| `deploy.gitSha` | Build SHA | Static Asset | `/build-info.json` | **WRONG** | `contracts/build-info-schema.json` (Missing) |
| `deploy.buildTs` | Build Timestamp | Static Asset | `/build-info.json` | **WRONG** | `contracts/build-info-schema.json` (Missing) |
| `debug_bundle.status` | Debug Bundle | API/Asset | `/api/debug-bundle` | **FAIL** | `contracts/debug-bundle-schema.json` (v3 mismatch) |
| `ops.status` | Ops Self-Check | API | `/api/ops` | **FAIL** (404) | *None* |
| `meta.status` | System Status | Aggregate | `summary.js:metaStatus` | CORRECT | *Implicit* |
| `health.api.status` | API Health | Self-Report | `summary.js` | CORRECT | *Implicit* |

## Missing SSOT
The following artifacts rely on implicit code contracts rather than formal schemas:
1.  **Build Info:** No schema defines `gitSha` vs `commitSha`.
2.  **Telemetry:** `budgets.workersRequests` relies on KV keys without a defined data dictionary.
