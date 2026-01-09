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

## UI manifest fallback
- Homepage block order uses `/data/seed-manifest.json` as the authoritative list when registry JSON is invalid.
- Registry fetch remains optional; if it fails, the UI stays in manifest-driven mode.
- Sanity check (browser console):
  - `document.body.textContent.includes("Block 43")`

## Registry smoke checks
- Registry content-type:
  - `curl -I "<PREVIEW>/data/feature-registry.json" | grep -i content-type`
- Registry count:
  - `curl -sS "<PREVIEW>/data/feature-registry.json" | jq '.features|length'`
- Manifest count:
  - `curl -sS "<PREVIEW>/data/seed-manifest.json" | jq '.blocks|length'`
- Expectation:
  - Registry features count >= manifest blocks count
- Homepage blocks:
  - `curl -sS "<PREVIEW>/" | grep -Eo "Block [0-9]+" | sort -u | tail -n 40`
