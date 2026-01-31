# OPS Gates (HARD_GATE / HEALTH_SIGNAL)

This document defines the hard gate vs health signal policy for OPS checks.

## HARD_GATE (must fail CI)
- Missing required contract fields in `/api/mission-control/summary`.
- Invalid JSON or missing `meta.status` / required numeric counts.
- `#ops-bridge` missing in `/ops` HTML.

## HEALTH_SIGNAL (warning only)
- Coverage degradation (e.g., high `coverage.missing`).
- KV backend unavailable when static snapshot fallback exists.
- Preview/static environments where scheduler or pipeline are NOT_EXPECTED.

## OPS Bridge Contract
`/ops` must include a single bridge marker:

- `#ops-bridge`
- Data attributes (always present):
  - `data-status`: `loading | ok | degraded | error`
  - `data-baseline`: `ok | pending | fail`
  - `data-health`: `green | yellow | red | unknown`
  - `data-count-fetched`, `data-count-validated`
  - `data-coverage-computed`, `data-coverage-missing`
  - `data-reason`: short machine reason

The bridge is the SSOT for UI tests. No table parsing is used in CI.

## Policy Keywords
- `HARD_GATE`: contract/schema/meta violations.
- `HEALTH_SIGNAL`: non-blocking degradation warnings.
