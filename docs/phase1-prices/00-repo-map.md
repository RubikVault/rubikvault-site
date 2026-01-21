# Phase 1 Prices — Repo Map (WP0)

## Repo state

- **pwd**
  - `/Users/michaelpuchowezki/Dev/rubikvault-site`
- **git branch**
  - `main`
- **git status --porcelain**
  - `M functions/api/_shared/static-only.js`
- **git remote -v**
  - `origin https://github.com/RubikVault/rubikvault-site.git (fetch)`
  - `origin https://github.com/RubikVault/rubikvault-site.git (push)`
- **last 5 commits**
  - `b37d43d fix`
  - `f768f52 P2: propagate build_id/manifest_ref across manifest/provider-state/api debug`
  - `a13d528 P1: forbid KV writes in API request path`
  - `d6d3054 P1: remove legacy resilience (no KV writes in request path)`
  - `b8a57f8 P1: v3 API KV read (read-only) + debug kv_status/asset_status`

## Pipeline model (current)

- **Module workflows are artifact-only**
  - Scrape template workflow runs provider scripts and uploads artifacts.
  - No commits in module jobs.
  - Finalizer workflow downloads artifacts and commits to `public/data`.

### Finalizer / aggregator

- **Finalizer script (atomic publish gatekeeper)**
  - `scripts/aggregator/finalize.mjs`
  - Reads artifacts from `ARTIFACTS_DIR` (env), expects per-module dirs containing:
    - `snapshot.json`
    - `module-state.json`
  - Writes/promotes to `public/data`:
    - `public/data/snapshots/<module>/latest.json`
    - `public/data/state/modules/<module>.json`
    - `public/data/manifest.json`
    - `public/data/provider-state.json`

### Workflows (artifact fan-in -> finalizer commit)

- **Scrape template (artifact producer)**
  - `.github/workflows/v3-scrape-template.yml`
  - Uses registry to build module matrix:
    - `public/data/registry/modules.json`
  - Provider script resolution:
    - `scripts/providers/<module>-v3.mjs` (preferred)
    - `scripts/providers/<module>.mjs` (fallback)
  - Upload artifact:
    - `module-<module>` containing `snapshot.json`, `module-state.json`

- **Finalizer workflow (artifact fan-in + commit)**
  - `.github/workflows/v3-finalizer.yml`
  - Downloads artifacts, organizes them into `artifacts-organized/<module>/...`
  - Runs:
    - `node scripts/aggregator/finalize.mjs`
  - Commits only under `public/data/...`

## API entrypoints (read-only)

- **Static JSON loader / debug output**
  - `functions/api/_shared/static-only.js`
  - KV read key format used by API:
    - `/data/snapshots/<module>/latest.json`

## Key libraries / invariants

- **Digest**
  - `scripts/lib/digest.js`
  - `computeSnapshotDigest(snapshot)` is the canonical snapshot digest.

- **Envelope builder + validator**
  - `scripts/lib/envelope.js`
  - `buildEnvelope(...)` builds `schema_version: "3.0"` envelopes.
  - `validateEnvelopeSchema(envelope)` validates `schema_version` and required metadata.

- **Atomic publish helper (library)**
  - `scripts/lib/atomic-publish.js`
  - Helpers for writing temp tree + validation + atomic promote.
  - Note: `scripts/aggregator/finalize.mjs` currently contains its own promote logic.

- **Module state writer (library)**
  - `scripts/lib/module-state.js`
  - `buildModuleState(...)` and `writeModuleState(...)` for per-module state files.

- **Provider-state generator/writer**
  - `scripts/lib/provider-state.js`
  - Finalizer uses `generateProviderState(...)` + `writeProviderState(...)`.

- **KV write policy (scripts only)**
  - `scripts/lib/kv-write.js`
  - Finalizer-only KV writes (no request-path writes).

- **Forbid KV writes in request path**
  - `scripts/ci/forbid-kv-writes-in-api.sh`

## Providers directory

- `scripts/providers/`
  - Example module provider: `scripts/providers/market-health-v3.mjs`
  - Shared provider helpers: `scripts/providers/_shared.js`
