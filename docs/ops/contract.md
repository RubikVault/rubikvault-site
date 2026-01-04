# Envelope Contract

## Canonical Envelope (JSON)
```json
{
  "ok": true,
  "feature": "string",
  "data": {},
  "error": {"code": "", "message": "", "details": {}},
  "meta": {
    "status": "LIVE|STALE|ERROR|EMPTY",
    "reason": "string|null",
    "ts": "ISO-8601",
    "schemaVersion": 1,
    "traceId": "string",
    "writeMode": "NONE|READONLY|READWRITE",
    "circuitOpen": false,
    "warnings": [],
    "savedAt": null,
    "ageMinutes": null
  },
  "ts": "ISO-8601",
  "traceId": "string",
  "schemaVersion": 1
}
```

## Rules (Law)
- `meta` MUST NEVER be null.
- `error` MUST ALWAYS exist (use empty strings/objects when `ok=true`).
- `feature` MUST be a stable id (e.g. `price-snapshot`).
- Extra fields are allowed (e.g. `cache`, `upstream`, `rateLimit`, `freshness`), but must not remove required keys.

## Meta Fields (Required)
- `status`: `LIVE`, `STALE`, `ERROR`, or `EMPTY`.
- `reason`: nullable string explaining status (examples: `MIRROR_FALLBACK`, `STALE`, error code).
- `ts`: ISO timestamp for this response.
- `schemaVersion`: integer schema version.
- `traceId`: request trace id.
- `writeMode`: `NONE`, `READONLY`, or `READWRITE`.
- `circuitOpen`: boolean.
- `warnings`: array of strings.
- `savedAt`: nullable ISO timestamp when data was persisted.
- `ageMinutes`: nullable number (age of cached data).

## Status and Reason Mapping
- `ok=true` and fresh data => `meta.status=LIVE`, `reason=null`.
- Stale or Mirror Fallback => `meta.status=STALE`, `reason=STALE` or `MIRROR_FALLBACK`.
- Upstream/error => `meta.status=ERROR`, `reason=error.code`.
- Empty/no data but not an error => `meta.status=EMPTY`, `reason` describes why.
