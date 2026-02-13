# RubikVault v3 Data System

This document describes the side-by-side v3 data plane (`public/data/v3/**`) and the guardrails used to prevent regressions in the existing UI paths.

## Design Laws

- Single producer check for `public/data/v3/**` artifacts via `reports/v3/forensics/collisions.json`.
- Deterministic serialization and gzip (`mtime=0`) through `scripts/lib/v3/*`.
- Policy-first execution with fail-loud policy validation before each pipeline run.
- Contract validation for fixtures and generated artifacts using AJV.

## Main Commands

- `npm run validate:policies:v3`
- `npm run build:v3:forensics`
- `npm run check:v3:collisions`
- `npm run build:v3:daily`
- `npm run test:v3:contracts`
- `npm run test:v3:dry-run`

## DP Artifacts

- DP0: `public/data/v3/universe/*`
- DP1: `public/data/v3/eod/US/*`
- DP1.5: `public/data/v3/fx/rates/*`
- DP2: `public/data/v3/actions/*`
- DP3: `public/data/v3/series/*`
- DP4: `public/data/v3/pulse/*`
- DP5: `public/data/v3/news/*`
- DP6: `public/data/v3/derived/*`
- DP7: `public/data/v3/universe/sector-mapping/*`, `public/data/v3/fundamentals/*`

## Workflows

- `.github/workflows/contracts-gate.yml`
- `.github/workflows/policy-drift-check.yml`
- `.github/workflows/data-pulse-daily.v3.yml`
- `.github/workflows/data-brain-weekly.v3.yml`
- `.github/workflows/data-branch-sync.yml`
- `.github/workflows/archive-mirrors-release.yml`
- `.github/workflows/retention-cleanup.yml`

## Required Secrets

- `EODHD_API_KEY` (core data plane + exchange drift)
- `TIINGO_API_KEY` (DP7 fundamentals bridge)
- `RV_ALERT_WEBHOOK` (pipeline alerting)

Missing/invalid secrets do not publish empty artifacts; DP5/DP7 emit degraded manifests with explicit reasons.
