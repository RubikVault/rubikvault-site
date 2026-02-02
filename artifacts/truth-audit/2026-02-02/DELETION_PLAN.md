# Deletion Plan (Candidates Only — No Deletions Performed)

## Scope
This plan lists **candidates** for removal based on static references + runtime telemetry from the audit run.
Nothing has been deleted in this run.

## Candidates (Require Guardrails First)

### Candidate 1: Top-level `latest_bar` (API response root)
- **Classification:** ALLOWED FALLBACK (legacy)
- **Static refs:** Present (e.g., `functions/api/mission-control/summary.js:290-292`).
- **Runtime hits:** 0 (see `RUNTIME_TELEMETRY.json`).
- **Risk if removed:** Could break legacy consumers expecting `latest_bar` at root if any exist.
- **Guardrails needed:**
  - Add a regression test that fails if code reads `response.latest_bar`.
  - Confirm at least one downgrade/degrade scenario does not require this fallback.

### Candidate 2: Top-level `truthChains` (summary root)
- **Classification:** ALLOWED FALLBACK (legacy)
- **Static refs:** Present (e.g., `public/ops/index.html:736-737` fallback to legacy fields).
- **Runtime hits:** 0 (see `RUNTIME_TELEMETRY.json`).
- **Risk if removed:** Could break legacy summaries or cached static `summary.latest.json` if older.
- **Guardrails needed:**
  - Require `data.truthChains` in all summary producers.
  - CI gate to reject summary files missing `data.truthChains`.

## Not Safe to Delete (Insufficient Evidence)
- Degrade-only paths (`data.bar`, `bar`, alternate trace fields): no S4 scenario available; classify as UNKNOWN.

## Staged Removal Plan (if ever approved)
1) **Stage 1 (Guardrails)**: Add explicit tests that forbid top-level `latest_bar` and `truthChains` usage.
2) **Stage 2 (Deprecation)**: Remove fallback logic in summary/UI only after tests confirm no hits across scenarios.
3) **Stage 3 (Removal)**: Remove legacy keys from producers if no consumers remain.

