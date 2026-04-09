# NAS Native Matrix

## Purpose

This layer runs directly on the NAS repo and complements the Mac-driven shadow benchmarks.

It exists to answer four questions with hard evidence:

1. Which stages stay stable on the DS720+ under real day/night load.
2. Which safe runtime variants reduce swap pressure without changing outputs.
3. Which stages remain Mac-only under the current hardware and architecture.
4. Whether the NAS can act as a durable secondary worker without touching production truth.

## SSOT

- Code SSOT: current local repo synced into `/volume1/homes/neoboy/Dev/rubikvault-site`
- Ops/runtime SSOT: `/volume1/homes/neoboy/RepoOps/rubikvault-site`
- Baselines for Mac-parity compares: `/volume1/homes/neoboy/RepoOps/rubikvault-site/datasets/baselines/current`
- Native matrix reports: `/volume1/homes/neoboy/RepoOps/rubikvault-site/runtime/reports/native-matrix`
- Native matrix is the primary NAS evidence layer.
- The legacy overnight shadow chain is historical evidence only and must not override native matrix classification.
- Production `runtime/STATUS.json` must not contradict the native matrix report.

## Main Scripts

- `scripts/nas/deploy-native-matrix-to-nas.sh`
- `scripts/nas/start-native-matrix-supervisor.sh`
- `scripts/nas/run-native-matrix-supervisor.sh`
- `scripts/nas/run-native-matrix-campaign.sh`
- `scripts/nas/run-native-stage-matrix.sh`
- `scripts/nas/build-native-matrix-report.mjs`
- `scripts/nas/capture-native-system-audit.sh`
- `scripts/nas/capture-native-service-census.sh`

## Safe Variants

- `baseline_serial`
- `volume1_caches`
- `node384`
- `node512`
- `guarded_serial`

Current canonical variants:

- `stage1`: `node512`
- `stage2`: `baseline_serial`
- `stage3`: `node512`
- `scientific_summary`: `baseline_serial`

## Stage Targets

- `stage1`
- `stage2`
- `stage3`
- `scientific_summary`

Low-frequency probes:

- `best_setups_v4`
- `daily_audit_report`
- `cutover_readiness_report`
- `etf_diagnostic`

## Rules

- No production overwrite.
- No delete of NAS user data.
- Synology Photos, QuickConnect, nginx, SMB must stay healthy.
- One campaign at a time.
- One native supervisor at a time.
- Supervisor and campaign status files must carry real shell PIDs, not transient helper-process PIDs.
- Serial execution only.
- Output parity is always checked against frozen Mac baselines.
- The NAS repo is allowed to differ from the Mac repo if the NAS-specific setup is intentional.
- Parity drift against frozen Mac baselines is tracked as evidence, not treated as a hard execution failure by itself.
- Hard failures are: command failure, missing/invalid outputs, guard blocks, or required NAS service regressions.
- Reports distinguish between `native_classification` and `parity_classification`.
- NAS-only changes must be mirrored back into the main repo to avoid split-brain.
- Old campaign status files must not be treated as healthy unless the recorded campaign PID is still alive.
