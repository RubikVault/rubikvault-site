OPS Shapes SSOT (Single Source of Truth)
========================================

This document defines the canonical JSON shapes used by OPS code and tests.
Do not deviate from these paths in OPS logic or verifiers.

1) `/api/stock?ticker=UBER` (normal)
-----------------------------------
Envelope shape:

```
{
  "schema_version": "3.0",
  "meta": { ... },
  "metadata": { ... },
  "data": {
    "latest_bar": {
      "date": "YYYY-MM-DD",
      "open": <number>,
      "high": <number>,
      "low": <number>,
      "close": <number>,
      "volume": <number>
    },
    "change": { "abs": <number>, "pct": <number> },
    ...
  },
  "error": null
}
```

Authoritative node for bars: **`data.latest_bar`** (NOT top-level `latest_bar`).

2) `/api/stock?ticker=UBER&debug=1`
----------------------------------
Same envelope shape. Debug does not change bar location.

Authoritative node for bars: **`data.latest_bar`**.

3) `/api/mission-control/summary?debug=1`
----------------------------------------
Envelope shape (subset):

```
{
  "schema_version": "3.0",
  "meta": { ... },
  "data": {
    "truthChains": {
      "prices": { "steps": [...] },
      "indicators": { "steps": [...] }
    },
    ...
  }
}
```

Authoritative node for truth chains: **`data.truthChains`** (NOT top-level).

Notes
-----
- All OPS code must read from these paths. If a path is missing, it is a contract failure.
- When in doubt, update this SSOT file and then update code/tests to match it.
