# Deploy Bundle Policy

This document is an implemented architecture contract for the Pages/static deploy
bundle. It defines what may be published from `public/`, what must stay inside
NAS pipeline artifact storage, and which repository gates enforce that split.

## Why This Exists

Pages rejects individual files larger than 25 MiB. The previous failure mode was
not only a missing exclude rule: internal full-universe pipeline artifacts were
being written into `public/data/`, so the deployable static bundle treated audit
state, debug state, and runtime data as one mixed storage layer.

The current design separates those concerns. `public/data/` is a controlled
runtime contract for web, dashboard, and future mobile clients. Large pipeline,
audit, debug, and build-state files are internal artifacts and are written to the
NAS pipeline artifact layer instead.

## Storage Layers

### Public Runtime Layer

Path: `public/`, deployed through `dist/pages-prod/`.

Allowed content:

- Static web-app files.
- Small runtime JSON files consumed by the site, dashboard, APIs, or mobile
  clients.
- Small dashboard, status, seal, deploy-proof, and summary files.
- Small per-asset files or shard files with stable contracts.
- Runtime-scoped manifests that clients actually need.

Not allowed:

- Full-universe audit reports.
- Large operability reports.
- Global pack manifests and global manifest lookup files.
- Debug, rescue, or recovery logs.
- Error ledgers and raw build ledgers.
- Large marketphase or deep-summary JSON files.
- Monolithic full dumps or raw provider exports.

### Internal Pipeline Artifact Layer

Path: `NAS_OPS_ROOT/pipeline-artifacts/`.

This layer is NAS/server runtime state. It is not deployed and is not a client
contract. It exists for pipeline orchestration, audit, status production, and
build logic.

Implemented redirects:

| Artifact | Producer | Internal target |
|---|---|---|
| Global history pack manifest | `scripts/ops/build-history-pack-manifest.mjs --scope global` | `RV_GLOBAL_MANIFEST_DIR` |
| Global history pack lookup | `scripts/ops/build-history-pack-manifest.mjs --scope global` | `RV_GLOBAL_MANIFEST_DIR` |
| Marketphase deep summary | `scripts/universe-v7/build-marketphase-deep-summary.mjs` | `RV_MARKETPHASE_DEEP_SUMMARY_PATH` |

`scripts/nas/nas-env.sh` sets:

- `NAS_PIPELINE_ARTIFACTS_ROOT` to `NAS_OPS_ROOT/pipeline-artifacts`.
- `RV_GLOBAL_MANIFEST_DIR` to `NAS_PIPELINE_ARTIFACTS_ROOT/manifests`.
- `RV_MARKETPHASE_DEEP_SUMMARY_PATH` to
  `NAS_PIPELINE_ARTIFACTS_ROOT/marketphase_deep_summary.json`.

`nas_ensure_runtime_roots` creates the runtime and internal artifact directories
at startup. No manual directory creation is required for normal NAS/server
operation.

### Optional Large Data Layer

If a future product requirement needs large productive data, it must be served
through an explicit large-data design such as object storage, an API, or
contracted shards. It must not be added wholesale to the Pages/static bundle.

This document does not introduce a new infrastructure dependency. Any future
large-data layer still has to satisfy the project cost and deployment rules.

## Enforcement

1. **Output-path redirects via env vars.** Global manifests and marketphase deep
   summaries are written to internal artifact paths during NAS/server runs.
2. **Summary-only public outputs.** The night supervisor runs the stock-analyzer
   operability summary step with `--summary-only`, so the public output is the
   small dashboard-ready summary rather than a refreshed full-universe report.
3. **Deploy-bundle excludes.** `scripts/ops/build-deploy-bundle.mjs` excludes
   known large internal artifacts as a safety net when building
   `dist/pages-prod/`.
4. **25 MiB size guard.** After rsync, `build-deploy-bundle.mjs` scans the
   bundle. Any file over 25 MiB fails the build with exit code `3` and prints the
   violating paths before Wrangler deploy starts.
5. **Deploy smokes.** `scripts/ops/release-gate-check.mjs` builds the bundle,
   deploys it with the project-local Wrangler binary, runs production smoke
   checks, writes deploy proof, and exits non-zero if smoke checks are not green.

## Wrangler Resolution

Release deploy uses `node_modules/.bin/wrangler` from the repository. It does
not fall back to `npx wrangler` or require a globally installed Wrangler. If the
local binary is missing, the deploy fails before contacting Pages and tells the
operator to install project dependencies.

This keeps NAS/server deploys reproducible: the deploy tool is resolved from the
project dependency graph rather than from host-specific global Node, npm, or
npx setup.

## Current Decision

The architecture moved from:

- `public/data/` as a mixed storage location for runtime data and pipeline
  artifacts.

To:

- `public/data/` as a strict runtime contract.
- Large pipeline, audit, debug, and build artifacts in internal runtime artifact
  paths.
- A compact CDN- and mobile-friendly deploy bundle.

## Expected State

- The pipeline can deploy end-to-end autonomously after the release gates pass.
- The deploy path is not dependent on manual local `npx` or global CLI setup.
- New large pipeline artifacts cannot silently violate the 25 MiB hosting limit.
- Large internal reports are not treated as public runtime data.
- Web and mobile clients consume small, stable, intentional runtime contracts.
- Production smoke checks are green after a successful deploy.

## Adding New Outputs

Before adding any generator output under `public/data/`, define its artifact
class and runtime contract:

- If clients need it, keep it small, shard it if needed, and document the
  consumer contract.
- If only pipeline, audit, debug, or build logic needs it, write it to the
  internal artifact layer through an env-var path or directory.
- If it can exceed 25 MiB, it must never rely only on a deploy exclude; redirect
  the output first, then add an exclude as a final guard.
