# A1 Findings — OPS single verdict + gates

## Findings (evidence-backed)
1) **OPS UI presents multiple parallel sections (health tiles + truth chains + pipeline tables)**, which makes INFO/preview signals appear as non-green noise and duplicates core verdict.
   - Evidence: `public/ops/index.html:205-408` shows four health cards plus pipeline tables plus three Truth Chain sections in the main view.

2) **No single gate-based verdict in payload**; ops UI relied on `data.health.*` and truth-chains, making PREVIEW INFO/WARN appear as non-green even when core product is OK.
   - Evidence: `public/ops/index.html:626-743` renders `health.*` tiles + truth chains without a unified gate policy.

3) **OPS had no machine-readable gate policy**, so UI/summary could not map INFO/WARN to “non-gating” in preview.
   - Evidence: No `public/data/policies/ops-gates.json` existed before; summary only used `health.*` (see `functions/api/mission-control/summary.js:1720-1740`).

## Root Cause (primary)
- **OPS lacked a single, policy-driven gate layer**, so preview INFO/WARN signals were presented as top-level non-green despite product path being healthy.
  - Evidence: ops UI used `health.*` directly (`public/ops/index.html:626-630`) and summary had no `gates` object.

