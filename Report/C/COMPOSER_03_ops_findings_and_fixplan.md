# OPS Field Findings and Fix Plan

**Note:** LIVE_URL not provided. This analysis is based on code review only. Live evidence verification pending.

## P0 Blockers

### 1. SSOT Missing for OPS Fields
**Status:** P0 BLOCKER
**Symptom:** No explicit contract/schema defines OPS field semantics, types, units, required/optional status.
**Expected:** Contract file (e.g., `public/data/ops/ops-fields-contract.v1.json`) defining all fields.
**Root Cause:** Fields are implicitly defined by implementation code only.
**Evidence:** 
- No schema files found for OPS fields
- Fields defined only in `functions/api/mission-control/summary.js:1591-1678`
- Display logic in `public/ops/index.html` references fields without contract

**Fix Location:** Create `public/data/ops/ops-fields-contract.v1.json` with field definitions.
**Regression Test:** 
- Verify contract file exists
- Verify contract is loaded and validated in summary.js
- Verify UI displays fields according to contract

## WRONG Fields (Pending Live Verification)

### 1. runtime.env (RUNTIME_MODE)
**Status:** UNDECIDABLE (LIVE_URL not provided)
**Symptom:** Cannot verify if runtime.env matches deployment mode for production URLs.
**Expected Semantics:** Deployment-mode semantics:
- Production hostname (`rubikvault.com`) → `runtime.env = "production"`
- Preview hostname (`.pages.dev`) → `runtime.env = "preview"`

**Root Cause:** `detectPreviewMode` uses hostname-based detection (functions/api/mission-control/summary.js:744-756).
**Evidence:**
- `functions/api/mission-control/summary.js:744-756` (detectPreviewMode logic)
- `functions/api/mission-control/summary.js:760-764` (pickProfile logic)
- `functions/api/mission-control/summary.js:1619` (runtime.env assignment)

**Fix Location:** If wrong, verify hostname detection logic matches Cloudflare Pages deployment semantics.
**Regression Test:** 
- Deploy to production → verify `runtime.env = "production"`
- Deploy to preview → verify `runtime.env = "preview"`
- Check hostname parsing handles all CF Pages URL formats

## Semantic Clarification: RUNTIME_MODE

**Implemented Semantic:** Deployment-mode semantics (hostname-based)

**Detection Logic:**
```javascript
// functions/api/mission-control/summary.js:744-756
function detectPreviewMode(url, env) {
  const hostname = url?.hostname || '';
  const isPages = hostname.endsWith('.pages.dev');
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isProd = hostname === 'rubikvault.com' || hostname === 'www.rubikvault.com';
  const hasCron = Boolean(env?.CRON_TRIGGER);
  return {
    isPreview: isPages || isLocalhost,
    isProduction: isProd,
    hasCron,
    hostname
  };
}
```

**Profile Selection:**
```javascript
// functions/api/mission-control/summary.js:760-764
function pickProfile(previewMode, profiles) {
  if (previewMode?.isProduction && profiles?.production) 
    return { key: 'production', profile: profiles.production };
  if (profiles?.preview) 
    return { key: 'preview', profile: profiles.preview };
  return { key: 'preview', profile: null };
}
```

**Runtime Assignment:**
```javascript
// functions/api/mission-control/summary.js:1619
runtime: {
  env: profilePick.key,  // "production" or "preview"
  ...
}
```

**Conclusion:** If LIVE_URL is `rubikvault.com` or `www.rubikvault.com` and `runtime.env` shows "PREVIEW", then it is WRONG. If LIVE_URL ends with `.pages.dev` and `runtime.env` shows "PREVIEW", then it is CORRECT.

## Next Steps

1. **Provide LIVE_URL** to enable live evidence collection
2. **Run live probes** against `/api/mission-control/summary` endpoint
3. **Compare live values** with expected semantics
4. **Update verdicts** in `02_ops_field_trace.csv` based on live evidence
5. **Create SSOT contract** file for OPS fields
