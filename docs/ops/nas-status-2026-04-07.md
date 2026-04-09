# NAS Status 2026-04-07

Generated from locally mirrored NAS artifacts on the Mac at the end of 2026-04-07.
Direct NAS SSH was not reachable during this review, so this document reflects the latest mirrored evidence already present in the repo workspace.

## What Ran Today

- Native matrix supervisor was active:
  - `20260407T053239Z` -> `monitoring`
- Native matrix campaign was active:
  - `20260407T053255Z` -> `running` in the last mirrored status
- Legacy overnight shadow campaigns kept failing on `stage1` because the remote benchmark lock stayed busy:
  - `20260407T045332Z`
  - `20260407T050422Z`
  - `20260407T051516Z`
  - `20260407T052609Z`
  - `20260407T053734Z`

## Reports Produced Today

- Native matrix mirror:
  - `tmp/nas-native-matrix/live/nas-native-matrix-latest.md`
  - `tmp/nas-native-matrix/live/nas-native-matrix-latest.json`
- Automation / feasibility / census:
  - `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`
  - `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
  - `tmp/nas-benchmarks/nas-main-device-feasibility-latest.md`
  - `tmp/nas-benchmarks/nas-main-device-feasibility-latest.json`
  - `tmp/nas-benchmarks/pipeline-census-latest.md`
  - `tmp/nas-benchmarks/pipeline-census-latest.json`
  - `tmp/nas-benchmarks/nas-morning-report-latest.md`
  - `tmp/nas-benchmarks/nas-overnight-summary-latest.md`
- System-partition audit and cleanup:
  - `tmp/nas-system-audit/20260407T052137Z/summary.md`
  - `tmp/nas-system-audit/20260407T052254Z-cleanup/cleanup-summary.json`

## New Findings

- Production GO is still blocked:
  - `production_go_supported=false`
  - reasons:
    - `mac_remains_operationally_required`
    - `scheduler_safe_to_modify_false`
- The best current native evidence remains limited to:
  - `stage1`
  - `stage2`
  - `stage3`
  - `stage4:scientific_summary`
- Latest mirrored native matrix still showed:
  - production status `GREEN`
  - root filesystem `/dev/md0` effectively `100%`
  - required services healthy: QuickConnect/Relay, Photos, nginx, SMB
- The system-partition audit confirmed:
  - `/usr` and `/var` dominate root-fs usage
  - cleanup could archive rotated logs and tmp files
  - cleanup could not delete the root-owned files under the SSH user
  - `scheduler_safe_to_modify=no`
- The latest reality check downgraded the older optimistic interpretation:
  - NAS can keep collecting proof
  - NAS is not yet supported as the main daily production device
- The latest feasibility report still classifies these as hard blockers:
  - `refresh_v7_history_from_eodhd`
  - `run_daily_delta_ingest_q1`
  - `build_fundamentals`
  - `run_hist_probs`
  - `run_daily_learning_cycle`
  - `build_stock_analyzer_universe_audit`

## Most Important Operational Issue Seen Today

- Legacy overnight shadow campaigns were not progressing because:
  - `run-stage1-shadow.sh` kept hitting `lock_busy_remote`
  - remote lock path:
    - `/volume1/homes/neoboy/RepoOps/rubikvault-site/runtime/locks/nas-shadow-benchmark.lock`
- This means the native matrix path and the legacy overnight shadow path were still contending for the same remote benchmark lock.

## Current Read

- NAS proof collection: still active
- NAS automation evidence: improved
- NAS production readiness: still not reached
- Main conclusion for 2026-04-07:
  - keep Mac operationally primary
  - keep native matrix as the primary NAS evidence path
  - treat legacy overnight shadow as contended / secondary until the remote lock model is cleaned up
