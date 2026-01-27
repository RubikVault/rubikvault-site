# Data Layout Law v1

This document defines the canonical data layout for EOD (end-of-day) pools and pipeline truth artifacts.

## Rules (must follow)
1) Canonical Pool:
   - public/data/eod/batches/eod.latest.{chunk_id}.json (max 500 symbols per chunk; chunk_id is 000,001,...)
2) EOD Manifest:
   - public/data/eod/manifest.latest.json (batch index + counts + freshness)
3) Universe Views:
   - public/data/universe/<universe>.json (member list only)
4) Pipeline Truth (Ops interface):
   - public/data/pipeline/<universe>.latest.json (expected/fetched/validated/computed/static_ready + degraded_summary + refs)
5) Ops page reads ONLY pipeline/<universe>.latest.json (no scanning); optional fallback to stage-split files if .latest missing.

## Ops generator constraint (no discovery)
- scripts/ops/build-ops-daily.mjs MUST NOT do directory discovery (no readdir/glob/walk). Only explicit filenames are allowed.

## Local verification (snippet)
- Build EOD + pipeline truth:
  - node scripts/eod/build-eod-latest.mjs --universe nasdaq100 --chunk-size 500 --out public/data
- Build ops daily:
  - node scripts/ops/build-ops-daily.mjs
- Confirm artifacts:
  - public/data/eod/manifest.latest.json
  - public/data/eod/batches/eod.latest.000.json (and more if needed)
  - public/data/pipeline/nasdaq100.latest.json
  - public/data/ops-daily.json includes ops.pipeline section
- Confirm ops generator still has no discovery patterns:
  - rg -n "readdir|glob|walk|dirent" scripts/ops/build-ops-daily.mjs
