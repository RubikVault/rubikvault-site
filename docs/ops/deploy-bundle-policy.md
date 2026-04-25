# Deploy Bundle Policy

## What goes where

### `public/data/` → Cloudflare Pages (deployed)

Small, runtime-consumed files only. Served as static assets to browsers and mobile apps.

| Type | Example | Max size |
|---|---|---|
| Per-asset stock JSONs | `data/stock/V.json` | ~50 KB |
| Seal & epoch | `data/ops/final-integrity-seal-latest.json` | < 10 KB |
| US-EU pack manifest | `data/eod/history/pack-manifest.us-eu.json` | < 5 MB |
| Universe search buckets | `data/universe/v7/search/buckets/` | < 1 MB each |
| Dashboard data | `data/ui/dashboard-v7-status.json` | < 100 KB |

**Hard limit: 25 MiB per file** (Cloudflare Pages constraint). The build script enforces this with a post-rsync size guard that fails the build before wrangler even runs.

### `NAS_OPS_ROOT/pipeline-artifacts/` → NAS only (never deployed)

Large pipeline-internal artifacts. Written by NAS pipeline steps, read only by other NAS pipeline steps or reporting scripts. Never need to reach Pages or mobile clients.

| File | Source script | Env var redirect |
|---|---|---|
| `manifests/pack-manifest.global.json` (~40 MB) | `build-history-pack-manifest.mjs --scope global` | `RV_GLOBAL_MANIFEST_DIR` |
| `manifests/pack-manifest.global.lookup.json` (~5 MB) | same | `RV_GLOBAL_MANIFEST_DIR` |
| `marketphase_deep_summary.json` (~35 MB) | `build-marketphase-deep-summary.mjs` | `RV_MARKETPHASE_DEEP_SUMMARY_PATH` |

These env vars are set in `scripts/nas/nas-env.sh` and default to `$NAS_OPS_ROOT/pipeline-artifacts/`. On Mac (dev), they are not set, so the scripts fall back to `public/data/` as before.

### `public/data/ops/stock-analyzer-operability-latest.json` (~60 MB)

Written by `build-stock-analyzer-operability.mjs`. The NAS supervisor passes `--summary-only` so only the small summary (`stock-analyzer-operability-summary-latest.json`) is written back to `public/`. The 60 MB full report remains as the input file on NAS but is not refreshed on every run.

Excluded from Pages via `RSYNC_EXCLUDES` in `build-deploy-bundle.mjs` (safety net).

## Enforcement layers

1. **RSYNC_EXCLUDES** in `build-deploy-bundle.mjs` — primary filter, excludes known large paths before rsync
2. **Size guard** in `build-deploy-bundle.mjs` — post-rsync scan, fails with exit 3 if any file >25 MiB slips through; lists all violators explicitly
3. **Env-var redirects** in `nas-env.sh` — structural fix; pipeline steps write large artifacts to `NAS_OPS_ROOT/pipeline-artifacts/` so they never land in `public/` in the first place

## Adding a new large artifact

If a pipeline step starts writing a new file >10 MB to `public/data/`:

1. Redirect the output via env var (preferred): add a `RV_*_PATH` or `RV_*_DIR` variable to `nas-env.sh` and read it in the script
2. Add to `RSYNC_EXCLUDES` in `build-deploy-bundle.mjs` as a safety net
3. Document here

## Mobile app (iOS / Android)

The same `public/data/` JSON files served by Pages are the data source for mobile. Architecture:

- **Per-asset data** (`/api/stock?ticker=X`) — Cloudflare Worker reads from KV/R2, already fast
- **Small static JSONs** (<1 MB) — served directly from Pages CDN, globally cached
- **Large aggregate reports** (operability, deep summaries) — never exposed to clients; NAS-internal only

This keeps the Pages bundle lean and the mobile API responses fast regardless of universe size.
