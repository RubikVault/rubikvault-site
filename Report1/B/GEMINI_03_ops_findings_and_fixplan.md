# OPS Findings & Fix Plan (Audit v6.0)

## Executive Summary
*   **Audit Target:** `https://638a1962.rubikvault-site.pages.dev` (Live)
*   **Verdict:** Ops UI is "Not Green" due to 3 specific integration disconnects, despite the underlying system working correctly.
*   **Primary Failures:**
    1.  **Build Info Nulls:** The `build-info.json` asset uses keys (`commitSha`, `generatedAt`) that the `summary.js` reader does not recognize.
    2.  **Debug Bundle Error:** The static asset is legacy format, but the API endpoint enforces Schema v3, causing validation failure.
    3.  **Ops 404:** The `/api/ops` endpoint is checked by UI but does not exist.

## Fix Plan

### P0: Fix Build Info Display (Quick Win)
**Location:** `functions/api/mission-control/summary.js`
**Change:** Update `fetchBuildInfo` to accept `commitSha` and `generatedAt`.

```javascript
// functions/api/mission-control/summary.js : line 941
const sha = json?.gitSha || json?.git_sha || json?.sha || json?.commit || json?.commitSha || null;
const ts = json?.buildTs || json?.build_ts || json?.builtAt || json?.built_at || json?.timestamp || json?.generatedAt || null;
```

### P1: Correct Runtime Semantics
**Location:** `functions/api/mission-control/summary.js`
**Change:** Update `detectPreviewMode` to trust `*.pages.dev` if it is the main deployment.

### P2: Resolve Debug Bundle Schema
**Option:** Downgrade API validation temporarily OR (Preferred) Update the build script generating `debug-bundle.json` to match the v3 schema expected by `contracts.js`.

### P3: Remove Ghost Endpoint
**Action:** Remove the UI check for `/api/ops` in `public/ops/index.html` if this endpoint is deprecated, or implement a basic `version.js` handler if it is required.

## DONE ✅
Timestamp: 2026-02-03T17:15:00+01:00
