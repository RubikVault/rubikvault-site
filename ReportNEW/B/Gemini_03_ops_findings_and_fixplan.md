# OPS Findings & Fix Plan (Audit v5.1)

## A) Executive Summary
- **Audit Scope:** `https://638a1962.rubikvault-site.pages.dev` (Live Deployment).
- **Core Finding:** The environment is incorrectly classified as `PREVIEW` because the backend strictly requires `rubikvault.com` hostname for production mode.
- **SSOT Status:** Most OPS fields lack a formal schema file but follow a consistent "Observer Contract" in `summary.js`.
- **Verdict:** **WRONG** semantics for `runtime.env`. **CORRECT** implementation for Health/Pipeline logic relative to code.

## B) Proven Wrong Fields

| Field | Observed | Expected (SSOT) | Root Cause | Fix |
| :--- | :--- | :--- | :--- | :--- |
| `runtime.env` | `preview` | `production` | `summary.js:744` uses strictly hardcoded hostname allowlist (`rubikvault.com`) excluding `*.pages.dev`. | Update `detectPreviewMode` to respect `CF_PAGES_BRANCH` or expand allowlist. |

## C) Undecidable Fields

| Field | Why Undecidable | Minimal SSOT Artifact | Where Used |
| :--- | :--- | :--- | :--- |
| `budgets.workersRequests` | No formal contract defining if this should match Cloudflare Analytics or internal KV counters exactly. | `contracts/telemetry-schema.json` | OPS UI Cost Widget |

## D) Safe Removals (Parallel Paths)
*None identified in this specific view that are safe to remove without UI changes.*

## E) Fix Plan

### P0: Correct Runtime Semantics
**Issue:** `detectPreviewMode` in `functions/api/mission-control/summary.js` incorrectly flags the live deployment as PREVIEW.
**Fix:**
Modify `detectPreviewMode`:
```javascript
// functions/api/mission-control/summary.js
function detectPreviewMode(url, env) {
  const hostname = url?.hostname || '';
  const isProdHost = hostname === 'rubikvault.com' || hostname === 'www.rubikvault.com';
  // TRUST SPECIFIC PAGES URL OR ENV VAR
  const isPagesProd = hostname === 'rubikvault-site.pages.dev'; 
  const isProduction = isProdHost || isPagesProd; // Simple fix for this deployment
  // ...
  return { isPreview: !isProduction, isProduction, ... };
}
```

### P1: Contract Enforcement
Add a contract test that asserts `runtime.env` matches the deployment expectation (requires injecting expected env into build or runtime variables).

## Appendix: Evidence
### `/api/ops?debug=1` Excerpt
```json
{
  "schema_version": "3.0",
  "meta": {
    "status": "ok",
    "reason": "SUMMARY_OK"
  },
  "data": {
    "runtime": {
      "env": "preview",  <-- WRONG
      "hostname": "638a1962.rubikvault-site.pages.dev"
    }
  }
}
```
### Logic Proof (`summary.js`)
```javascript
748:   const isProd = hostname === 'rubikvault.com' || hostname === 'www.rubikvault.com';
751:   isPreview: isPages || isLocalhost,
```
