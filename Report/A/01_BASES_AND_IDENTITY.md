# 01_BASES_AND_IDENTITY

## Repo Identity (SSOT_CHECK)
Source: `Report/A/04_SSOT_EVIDENCE/01_identity_raw.txt`

- `pwd` => `/Users/michaelpuchowezki/Dev/rubikvault-site`
- `git rev-parse --show-toplevel` => `/Users/michaelpuchowezki/Dev/rubikvault-site`
- `git remote -v` => `origin https://github.com/RubikVault/rubikvault-site.git`
- `git status -sb` => `## main...origin/main` and `?? Report/A/`
- `git rev-parse HEAD` => `166a15246fc75b11da12b0f8504ef8fb77a01229`
- `git log -1 --oneline --decorate` => `166a1524 (HEAD -> main, origin/main, origin/HEAD, fix/block-numbering) Merge branch 'fix/hardening-never-empty-deploy'`
- branch => `main`
- timestamp => `Tue Feb 10 19:02:11 CET 2026`

## Frozen Bases (LAW 0.1)
Source: `Report/A/04_SSOT_EVIDENCE/31_base_reachability.txt`

- `PREVIEW_BASE = https://71d62877.rubikvault-site.pages.dev`
- `PROD_BASE = https://rubikvault.com`
- `OPTIONAL_OLD_PREVIEWS = https://00656f57.rubikvault-site.pages.dev, https://dece36c6.rubikvault-site.pages.dev`

Base reachability evidence:
- preview/prod candidates returned HTTP 200 for `/` (see `31_base_reachability.txt`).

## Threshold Policy (Step 06)
- Time drift tolerance (generatedAt): `±10m` (`DEFAULT/UNVERIFIED`)
- Cache divergence tolerance: `any diff requires classification` (`DEFAULT/UNVERIFIED`)
- Latency thresholds: `>2s => P1`, `>5s => P0` (`DEFAULT/UNVERIFIED`)
- Freshness baseline for finance artifacts: latest trading day if claimed (`DEFAULT/UNVERIFIED`)
- Allowed Preview/Prod differences whitelist: none defined in repo (`DEFAULT/UNVERIFIED`)

## Config / ENV Inventory Pointers
- Config file inventory: `Report/A/04_SSOT_EVIDENCE/04_env_and_workflows.txt`
- Env usage scan: `Report/A/04_SSOT_EVIDENCE/04_env_and_workflows.txt`
- Workflow env/secrets scan: `Report/A/04_SSOT_EVIDENCE/04_env_and_workflows.txt`
- Base construction/hardcoding scan: `Report/A/04_SSOT_EVIDENCE/02_base_construction_rg.txt`

## Binding Baseline Pointer
- Wrangler KV binding evidence: `Report/A/04_SSOT_EVIDENCE/21_wrangler_full.txt`
