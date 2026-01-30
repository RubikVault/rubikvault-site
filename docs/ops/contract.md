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

## Cache + Debug (Runblock C)
- `/api/stock` and `/api/resolve` attach `meta.cache` with `{mode, hit, stale, age_s, ttl_s, swr}`.
- Public debug (`?debug=1`) may include `meta.cache`, `meta.timings`, `meta.degraded`.
- Privileged debug requires `X-Admin-Token` matching `ADMIN_TOKEN` or `RV_ADMIN_TOKEN`.
- Public debug must NOT expose `cache_key`/`swr_key` or provider URLs/tokens.
- Privileged debug may include `cache_key`/`swr_key` for troubleshooting.

## Scheduler Law (Runblock E)
- Heartbeat keys: `meta:scheduler:last_ok`, `meta:scheduler:last_run`, and status payload at `meta:scheduler:status`.
- Scheduler health: `/api/scheduler/health` returns `ok=true` + `meta.status=LIVE` when heartbeat is recent; otherwise `ok=false`, `meta.status=error`, `error.code=SCHEDULER_STALE`.
- Scheduler runs are chunked (default 50) with bounded concurrency (default 3); partial success is allowed.
- Per-run cursor stored at `sched:cursor:<job>:<run_id>`; attempt markers at `sched:attempt:<job>:<asset_id>:<yyyymmdd>`.
- Scheduler trigger requires `X-Admin-Token` (env `ADMIN_TOKEN` or `RV_ADMIN_TOKEN`).

## Mission Control (Ops) Additions
- `data.opsBaseline.runtime.schedulerExpected`: boolean indicating whether cron is expected in the current environment.
- `data.opsBaseline.runtime.schedulerExpectedReason`: short reason string (e.g., preview/static).
- `data.opsBaseline.truthChain.nasdaq100`: ordered truth-chain steps with `id`, `title`, `status`, `evidence`, and `first_blocker`.
- `public/data/marketphase/missing.json`: optional build artifact listing per-ticker missing reasons for MarketPhase (used to explain pipeline gaps).
