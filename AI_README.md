## RubikVault Agent Rules

- Never delete existing features or hide blocks; only extend.
- Keep vanilla JS + ES Modules + Pages Functions (no framework migrations).
- Every block must always show: Feature ID + Block Name + Status + Updated + Source + Debug panel.
- No "magic fixes" for 403/429; surface provider diagnostics and fallbacks.
- All `/API/*` responses must follow the standard JSON schema (below).

## Standard API JSON Schema

```json
{
  "ok": true,
  "feature": "top-movers",
  "ts": "ISO8601",
  "traceId": "abcd1234",
  "schemaVersion": 1,
  "cache": { "hit": false, "ttl": 300, "layer": "kv|none" },
  "upstream": { "url": "...", "status": 200, "snippet": "..." },
  "rateLimit": { "remaining": "unknown", "reset": null, "estimated": true },
  "data": {},
  "error": { "code": "", "message": "", "details": {} }
}
```

## Block Init Signature

```js
export async function init(root, context) {}
export async function refresh(root, context) {}
```

`context` contains: `featureId`, `feature`, `traceId`, `logger`, `root`, `content`, `section`.

## Never Delete, Only Extend

If a change requires removing existing behavior, add a new code path and keep the old one intact.
