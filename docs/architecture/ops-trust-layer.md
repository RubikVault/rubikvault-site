# Ops Trust Layer

Purpose: Make provider limits, missing keys, bad payloads, and circuit state diagnosable without KV.

## Where to look
- public/ops/usage.html
- public/data/usage-report.json
- public/data/seed-manifest.json
- public/data/provider-state.json
- public/data/snapshots/*.json (meta.details)

## How limits are detected
- RATE_LIMITED: HTTP 429 or provider rate signal; cooldownUntil set from Retry-After.
- BUDGET_EXHAUSTED: budget.remaining < maxRequestsPerRun.
- MISSING_SECRET: requiredSecrets missing in environment.
- UNAUTHORIZED: HTTP 401/403; repeated failures open circuit.

## Circuit + cooldown
- RATE_LIMITED with Retry-After -> cooldownUntil set, provider skipped until time passes.
- UNAUTHORIZED >= 3 -> circuit open for 1 hour.
- PROVIDER_HTTP_ERROR 5xx >= 3 -> circuit open for 15 minutes.
- Half-open allows one probe after openUntil; fail reopens.

## What to do
- Wait: RATE_LIMITED or CIRCUIT_OPEN.
- Fix key: MISSING_SECRET or UNAUTHORIZED.
- Budget reset: BUDGET_EXHAUSTED.
- Payload issues: PROVIDER_BAD_PAYLOAD / PROVIDER_SCHEMA_MISMATCH.

## Snapshot meta.details
- meta.details includes safe fields: httpStatus, retryAfterSec, urlHost, snippet, at.
- No secrets are stored.
