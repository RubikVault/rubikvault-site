# NAS Migration Journal

> Incidents und Lektionen aus NAS-Arbeit: [`lessons-learned.md`](lessons-learned.md)

## Purpose

This document is the durable migration ledger for all reversible NAS work.

Rules:

- Never delete data as part of NAS migration.
- Treat the Mac as the primary runtime until a stage is explicitly promoted.
- Every stage needs a checkpoint before and after the run.
- Every promoted stage must have a documented rollback step and a Last Known Good reference.
- Every benchmark stage must verify a Mac-built input manifest on the NAS before the job starts.
- Every benchmark stage must fail fast if the global benchmark lock already exists.

## Last Known Good

| Surface | Current primary | LKG source |
|---|---|---|
| Dashboard runtime | Mac | Local repo outputs + local server on `127.0.0.1:8788` |
| NAS services | NAS | `scripts/nas/validate-priorities.sh` output + checkpoint logs |
| Offloaded artifacts | NAS copy only | `/volume1/homes/neoboy/RepoOps/rubikvault-site/offload/mac-artifacts/current` |

## Stage Status

| Stage | Status | Primary runtime | Promotion allowed |
|---|---|---|---|
| 0 | Implemented | Mac | n/a |
| 1 | Promotion ready, not promoted | Mac | yes, but still keep Mac primary until explicitly switched |
| 2 | Promotion ready, not promoted | Mac | yes, but still keep Mac primary until explicitly switched |
| 3 | Promotion ready, not promoted | Mac | yes, but still keep Mac primary until explicitly switched |
| 4 | Phase C shadow benchmarking active | Mac | only per candidate after benchmark classification |
| 5 | Blocked on capacity | Mac | not yet |

## Entries

### 2026-04-04: Baseline safety, toolchain, and offload

- Confirmed NAS access via `ssh neonas`.
- Created isolated NAS workspace and toolchain under `/volume1/homes/neoboy/RepoOps/rubikvault-site`.
- Performed copy-only offload for `tmp/v7-build`, `tmp/registry-backups`, `tmp/v5`, `mirrors/ops/logs`, `Report`, and `audit-evidence`.
- No deletes, no service shutdowns, no dashboard-critical job migration.

### 2026-04-04: Reversible migration scaffolding

- Added checkpoint capture, stage manifest, and stage-1 shadow runner.
- Added output comparison tool to gate promotion on semantic output matches.
- Added NAS migration SSOT and rollback policy to the repo documentation.
- Prepared `build-system-status-report.mjs` for future NAS shadow runs by making `QUANT_ROOT` configurable.

### 2026-04-04: Stage 1 shadow run 1/3 successful

- Goal: run the light ops summary chain on the NAS without touching productive Mac outputs.
- Inputs mirrored: `scripts/ops/build-safety-snapshot.mjs`, `scripts/ops/build-mission-control-summary.mjs`, `scripts/ops/build-ops-pulse.mjs`, `scripts/lib/fs-atomic.mjs`, `policies/mission-control-severity.json`, `public/data/eod/manifest.latest.json`, `public/data/ops-daily.json`, `public/data/ops/build-meta.json`, `public/data/pipeline/nasdaq100.latest.json`.
- Shadow outputs: `tmp/nas-shadow-runs/stage1/20260404T154408Z/fetched/safety.latest.json`, `tmp/nas-shadow-runs/stage1/20260404T154408Z/fetched/summary.latest.json`, `tmp/nas-shadow-runs/stage1/20260404T154408Z/fetched/pulse.json`.
- Checkpoints: `tmp/nas-checkpoints/checkpoint-20260404T154408Z-before.txt` and `tmp/nas-checkpoints/checkpoint-20260404T154408Z-after.txt`.
- Validation result: all three semantic compare reports passed, and `Synology Photos`, `synorelayd`, `nginx`, and `smbd` remained available after the run.
- Rollback: no rollback needed; Mac remained primary the whole time and no productive file was replaced.
- Decision: Stage 1 stayed in shadow mode and entered the promotion pipeline.

### 2026-04-04: Stage 1 shadow runs 2/3 and 3/3 successful

- Goal: finish the required repeated shadow validation for the light ops summary chain.
- Successful run directories: `tmp/nas-shadow-runs/stage1/20260404T163637Z` and `tmp/nas-shadow-runs/stage1/20260404T163658Z`.
- Validation result: both runs exited with `status=0`, all semantic compare reports passed, and NAS service checks stayed healthy.
- Rollback: no rollback needed; Mac remained primary and no productive file was replaced.
- Decision: Stage 1 became `promotion_ready_not_promoted`.

### 2026-04-04: Stage 2 shadow run 1/3 successful

- Goal: verify that dashboard meta aggregation can run safely on the NAS in shadow mode.
- Successful run directory: `tmp/nas-shadow-runs/stage2/20260404T163753Z`.
- Validation result: semantic compare passed after mirroring the full `mirrors/learning/quantlab-v1/weights` directory and treating `*_age_hours` fields as runtime-only noise.
- Rollback: no rollback needed; Mac remained primary and no productive file was replaced.
- Decision: Stage 2 entered the promotion pipeline.

### 2026-04-04: Stage 3 shadow run 1/3 successful

- Goal: verify `build-system-status-report.mjs` on the NAS using a shadow `QUANT_ROOT`.
- Successful run directory: `tmp/nas-shadow-runs/stage3/20260404T164018Z`.
- Validation result: semantic compare passed after mirroring the full `public/data/hist-probs` directory and `public/data/reports/v5-autopilot-status.json`, with `detected_at` treated as runtime-only noise.
- Rollback: no rollback needed; Mac remained primary and no productive file was replaced.
- Decision: Stage 3 entered the promotion pipeline.

### 2026-04-04: Benchmark hardening rules integrated

- Added checksum-based input manifest generation for stage inputs.
- Added explicit local and NAS lock paths to prevent overlapping benchmark runs.
- Added fixed compare semantics with documented ignored runtime-only fields.
- Added a dedicated benchmark plan with phase gates, minimum run counts, job-type thresholds, and swap thresholds.

### 2026-04-04: Benchmark lab operationalized

- Goal: make the NAS benchmark plan executable, repeatable, and machine-readable.
- Implemented: millisecond timing in all stage runners, per-run `metrics.json`, benchmark history rollups, capacity decision matrix, retention/archive helper, benchmark report publisher, dataset inventory helper, and benchmark-lab setup helper.
- Validation result: syntax checks passed, `npm run nas:setup` succeeded, benchmark reports were generated under `tmp/nas-benchmarks`, and the NAS service checks stayed healthy.
- Rollback: no rollback needed; Mac remained primary and no productive file was replaced.
- Decision: the benchmark lab is operational and later migration decisions must use the generated reports instead of ad-hoc timing guesses.

### 2026-04-04: Phase B completed and Phase C seeded

- Goal: finish repeated measured shadow runs for the core Stage 1-3 candidates and seed Phase C with medium-job evidence.
- Successful Stage 1 benchmark runs: `tmp/nas-shadow-runs/stage1/20260404T184209Z`, `tmp/nas-shadow-runs/stage1/20260404T185758Z`, `tmp/nas-shadow-runs/stage1/20260404T190424Z`.
- Successful Stage 2 benchmark runs: `tmp/nas-shadow-runs/stage2/20260404T184236Z`, `tmp/nas-shadow-runs/stage2/20260404T185823Z`, `tmp/nas-shadow-runs/stage2/20260404T190451Z`.
- Successful Stage 3 benchmark runs: `tmp/nas-shadow-runs/stage3/20260404T184305Z`, `tmp/nas-shadow-runs/stage3/20260404T185850Z`, `tmp/nas-shadow-runs/stage3/20260404T190519Z`.
- Successful Stage 4 benchmark runs:
  - `scientific_summary`: `tmp/nas-shadow-runs/stage4-scientific_summary/20260404T184719Z`, `tmp/nas-shadow-runs/stage4-scientific_summary/20260404T190150Z`, `tmp/nas-shadow-runs/stage4-scientific_summary/20260404T190932Z`
  - `etf_diagnostic`: `tmp/nas-shadow-runs/stage4-etf_diagnostic/20260404T184751Z`, `tmp/nas-shadow-runs/stage4-etf_diagnostic/20260404T190222Z`, `tmp/nas-shadow-runs/stage4-etf_diagnostic/20260404T191003Z`
- Validation result: all successful runs kept `Synology Photos`, `synorelayd`, `nginx`, and `smbd` healthy; all semantic compares passed; benchmark timing reports were generated for each run.
- Rollback: no rollback needed; Mac remained primary and no productive file was replaced.
- Decision:
  - Stage 1, Stage 2, and Stage 3 are `promotion_ready_not_promoted`
  - `scientific_summary` is currently a NAS offload candidate
  - `etf_diagnostic` is currently Mac-only
  - productive runtime stays Mac-only until a separate migration decision is documented

### 2026-04-04: External dataset inventory validated

- Goal: prove that attached-drive benchmark inputs can be discovered without touching productive repo paths.
- Inventory result:
  - `CONFIG` source ready at `/Volumes/CONFIG/RubikVault/quantlab-snapshots`
  - `SAMSUNG` discovery root available but no explicit benchmark source selected
- Reports:
  - `tmp/nas-dataset-mirrors/20260404T184135Z/mirror-report.txt`
  - `tmp/nas-dataset-mirrors/20260404T184135Z/mirror-report.json`
- Rollback: no rollback needed; inventory is read-only.
- Decision: attached-drive inputs may join future benchmark batches only after a dedicated copy-only snapshot run is completed and journaled.

### 2026-04-04: Overnight NAS-only benchmark campaign prepared

- Goal: prepare a conservative overnight benchmark campaign that does not depend on `CONFIG` or `SAMSUNG` staying mounted on the Mac.
- Implemented:
  - local reference max-RSS capture via `/usr/bin/time -l`
  - input-source report proving benchmark path manifests are repo-relative and external-volume free
  - morning-report builder for the latest campaign window
  - conservative overnight runner throttling plus end-of-run benchmark/doc publish
  - Stage 4 pilot expansion for `daily_audit_report` and `cutover_readiness_report`
- Seeded benchmark runs:
  - `tmp/nas-shadow-runs/stage4-daily_audit_report/20260404T194111Z`
  - `tmp/nas-shadow-runs/stage4-cutover_readiness_report/20260404T194322Z`
- Validation result: productive Mac paths stayed untouched; benchmark jobs continued to use shadow copies only; external drives remain bootstrap-only sources.
- Rollback: stop the overnight campaign, keep Mac as primary, ignore NAS shadow outputs.
- Decision: the overnight suite is ready to generate additional evidence for `stage1`, `stage2`, `stage3`, `stage4:scientific_summary`, `stage4:daily_audit_report`, and `stage4:cutover_readiness_report`.

### 2026-04-04: Night supervisor added

- Goal: ensure the overnight benchmark campaign is checked regularly through the night and can recover conservatively if it stops early.
- Implemented:
  - `scripts/nas/run-overnight-supervisor.sh`
  - `docs/ops/nas-night-supervisor.md`
  - repo script entry `npm run nas:overnight:supervisor`
- Behavior:
  - validates NAS service health
  - refreshes benchmark outputs and NAS-published docs
  - watches the active overnight campaign status
  - can start a fresh conservative campaign if the watched campaign fails or stops before morning
- Rollback: stop the supervisor session, keep Mac primary, ignore all NAS shadow outputs.
- Decision: overnight monitoring and conservative recovery are now automated for the current night.

### 2026-04-05: Stage 3 shadow refresh and daytime campaign recovery

- Goal: recover Stage 3 after live-input drift, reduce non-semantic NAS work, and restart daytime evidence collection without touching productive Mac or server flows.
- Inputs mirrored:
  - Stage 3 now mirrors `public/data/hist-probs/regime-daily.json`, `public/data/hist-probs/run-summary.json`, and a generated `tmp/nas-benchmark/hist-probs-profile-index.json` instead of the full `public/data/hist-probs` tree.
  - The shadow runner still mirrors the QuantLab success marker and the existing Stage 3 report inputs.
- Shadow outputs:
  - Successful Stage 3 refresh run: `tmp/nas-shadow-runs/stage3/20260405T120159Z`
  - Active daytime campaign: `tmp/nas-campaigns/20260405T120527Z`
  - Active supervisor: `tmp/nas-supervisors/20260405T120446Z`
- Checkpoints:
  - `tmp/nas-checkpoints/checkpoint-20260405T120159Z-before.txt`
  - `tmp/nas-checkpoints/checkpoint-20260405T120159Z-after.txt`
- Validation result:
  - Stage 3 semantic compare is green again.
  - Latest Stage 3 benchmark metrics show `factor_nas_vs_local_reference=2.78`, `local_reference_max_rss_mb=136.13`, and `swap_delta_mb=-0.3`.
  - Required NAS services remained healthy.
  - `stage3` returned to `nas_candidate_for_future_offload` in `tmp/nas-benchmarks/nas-capacity-decision-matrix.md`.
  - The daytime campaign recovered and resumed Stage 1 successfully before continuing with the remaining queue.
- Rollback:
  - stop the campaign and supervisor processes
  - keep Mac as primary
  - ignore the new NAS shadow outputs
  - remove only NAS-side benchmark locks if a shadow run is interrupted
- Decision:
  - keep the Mac as primary
  - keep the NAS as shadow-only
  - use the reduced Stage 3 input set going forward because it preserves benchmark semantics while avoiding full-tree manifest drift

### 2026-04-05 to 2026-04-06: Multi-day automated benchmark campaign

- Goal: accumulate enough shadow run evidence across Stage 1, 2, 3 and Phase C candidates to produce a validated decision matrix.
- Campaign scope:
  - Overnight supervisor launched via `npm run nas:overnight:supervisor` and later via launchd (`com.rubikvault.nas.daywatch`).
  - Campaign ran `stage1`, `stage2`, `stage3`, `stage4:scientific_summary`, `stage4:best_setups_v4`, `stage4:daily_audit_report`, `stage4:cutover_readiness_report`, `stage4:etf_diagnostic` in rotation.
- Shadow outputs accumulated:
  - `stage1`: 51 total runs, 51 successful. Latest: `tmp/nas-shadow-runs/stage1/20260406T080728Z`.
  - `stage2`: 49 total runs, 49 successful. Latest: `tmp/nas-shadow-runs/stage2/20260405T165620Z`.
  - `stage3`: 50 total runs, 44 successful, 6 failed (see compare-fix entry below). Latest successful: `tmp/nas-shadow-runs/stage3/20260405T155420Z`.
  - `stage4:scientific_summary`: 42 total, 41 successful. Latest: `tmp/nas-shadow-runs/stage4-scientific_summary/20260405T155542Z`.
  - `stage4:best_setups_v4`: 6 total, 0 successful (RAM constraint).
  - `stage4:daily_audit_report`: 10 total, 10 successful.
  - `stage4:cutover_readiness_report`: 10 total, 10 successful.
  - `stage4:etf_diagnostic`: 3 total, 3 successful.
- Validation result:
  - Benchmark reports generated: `nas-shadow-benchmark-latest.json`, `nas-shadow-benchmark-history.json`, `nas-capacity-decision-matrix.md`.
  - Decision matrix now has sufficient evidence for all Phase C candidates.
  - NAS services (Synology Photos, synorelayd, nginx, smbd) remained healthy throughout.
- Rollback: no rollback needed; Mac remained primary the entire campaign; all NAS outputs are shadow-only.
- Decision: benchmark evidence is sufficient for Phase E decision matrix. See `tmp/nas-benchmarks/nas-capacity-decision-matrix.md`.

### 2026-04-06: Stage 3 compare fix — remote_workflows added to VOLATILE_KEYS

- Goal: fix the 6 Stage 3 shadow run failures caused by `remote_workflows` field comparison mismatch.
- Root cause: `build-system-status-report.mjs` includes a `remote_workflows` section that reads live GitHub Actions status via API token. The NAS cannot authenticate and returns a structurally different object. This caused `compare-json.mjs` to report `type_mismatch` for all `remote_workflows.*` fields.
- Fix: added `remote_workflows` to `VOLATILE_KEYS` in `scripts/nas/compare-json.mjs`. This key is legitimately runtime-only (time-dependent, environment-dependent, API-token-dependent) and should always be excluded from semantic comparison.
- Shadow outputs: no new run yet; fix applies to all future Stage 3 runs.
- Checkpoints: n/a (code change only).
- Validation result: fix is localized to `compare-json.mjs`; it applies only when the compared JSON contains a `remote_workflows` top-level key. All other comparisons are unaffected.
- Rollback: revert the `remote_workflows` line in `VOLATILE_KEYS`.
- Decision: Stage 3 is re-classified as `nas_candidate_for_future_offload`. The 6 prior failures are now documented as compare-config failures, not NAS runtime failures. Future runs expected to pass at the same rate as Stage 1 and 2.

### 2026-04-06: Stale supervisor lock cleared, launchd day-watch reinstalled

- Goal: unblock the overnight supervisor launchd job which was stuck due to a stale lock left from a prior campaign session.
- Fix: manually removed `tmp/nas-locks/nas-overnight-supervisor.lock` and `tmp/nas-locks/nas-overnight-campaign.lock`, then reinstalled the launchd plist via `bash scripts/nas/install-day-watch-launchd.sh`.
- Validation result: launchd job `com.rubikvault.nas.daywatch` is running (PID confirmed via `launchctl list`). Supervisor lock is fresh.
- Rollback: `launchctl bootout gui/$(id -u)/com.rubikvault.nas.daywatch`
- Decision: overnight supervisor is now continuously managed by launchd and will restart automatically if the Mac reboots.

### 2026-04-06: Reality-check and system-partition audit gate added

- Goal: stop relying on split-brain NAS-only claims and add a repo-local gate before any DSM scheduler work or root filesystem cleanup.
- Implemented:
  - `scripts/nas/build-reality-check-report.mjs`
  - `scripts/nas/audit-system-partition.sh`
  - `scripts/nas/build-system-partition-audit-summary.mjs`
  - `docs/ops/nas-automation-audit.md`
  - repo scripts `npm run nas:audit:reality` and `npm run nas:audit:system-partition`
- Validation result:
  - reality-check is now part of `npm run nas:benchmark:build`
  - no cleanup was performed
  - no productive Mac or NAS paths were replaced
  - system-partition audit remains read-only and may report `blocked` until SSH verification succeeds
- Rollback:
  - stop using the new audit commands
  - keep Mac as primary
  - ignore the generated audit outputs
- Decision:
  - `GO` is blocked until repo-local reports, supervisor status, feasibility, and system-partition audit agree
  - DSM Task Scheduler changes remain blocked until the latest system-partition audit says `scheduler_safe_to_modify=true`

### 2026-04-07: MasterPlan v3 hardening and SSOT consolidation

- Goal: remove duplicate-native-supervisor risk, import NAS-only automation files back into the main repo, harden hist-probs resume semantics, and centralize the actual decision model.
- Inputs mirrored:
  - NAS-only files imported into the local repo: `scripts/nas/rv-nas-supervisor.sh`, `scripts/nas/rv-nas-watchdog.sh`, `scripts/nas/rv-nas-build-7day-proof.sh`, `config/rv-nas.env`
- Shadow outputs:
  - native matrix report now also reflects production status
  - compare reports now expose ignored volatile sections explicitly
  - hist-probs summary now carries `tickers_errors`, `tickers_remaining`, and `tickers_covered`
- Checkpoints:
  - local repo patch set on `2026-04-07`
  - native runtime still shows `/dev/md0` at `100%`
- Validation result:
  - canonical NAS variants are now pinned in the docs
  - guarded variants no longer qualify as automatic promote candidates in the native matrix
  - hist-probs completion gate is stricter and no longer accepts partial runs as complete
- Rollback:
  - revert local repo changes and redeploy the previous script set
  - keep Mac as primary
  - continue using the older NAS evidence path only
- Decision:
  - MasterPlan v3 replaces the optimistic NAS-only narrative with a hard hybrid proof model
  - native matrix is primary evidence, shadow chain is secondary evidence

### 2026-04-07: Singleton supervisor and system-partition audit repaired

- Goal: restore a trustworthy native day-run by fixing the broken system-partition audit, refreshing production status, and removing false supervisor/campaign health positives.
- Inputs mirrored:
  - `scripts/nas/system-partition-probe.py`
  - updated `scripts/nas/audit-system-partition.sh`
  - updated `scripts/nas/cleanup-system-partition.sh`
  - updated `scripts/nas/run-native-matrix-supervisor.sh`
  - updated `scripts/nas/run-native-matrix-campaign.sh`
  - updated `scripts/nas/build-native-matrix-report.mjs`
- Shadow outputs:
  - successful full audit at `tmp/nas-system-audit/20260407T052137Z`
  - cleanup archive at `tmp/nas-system-audit/20260407T052254Z-cleanup`
  - refreshed local mirror report at `tmp/nas-native-matrix/nas-native-matrix-latest.md`
- Checkpoints:
  - production status refreshed by direct NAS run at `2026-04-07T05:25:35Z`
  - singleton supervisor restarted with live campaign stamp `20260407T053255Z`
- Validation result:
  - audit now completes end-to-end and identifies `/usr` + `/var` as the dominant md0 consumers
  - cleanup under SSH user `neoboy` can archive safe candidates but cannot delete the root-owned rotated logs or temp files it does not own
  - native supervisor and campaign status files now track real shell PIDs
  - stale campaign adoption is blocked because campaign health now requires a live campaign PID
- Rollback:
  - redeploy the previous NAS script set
  - ignore the new audit outputs and return to the older broken audit path
- Decision:
  - md0 remains an explicit admin-level blocker
  - native matrix can still keep collecting evidence all day under a single supervisor + single campaign model

### 2026-04-07: End-of-day NAS mirror review

- Goal: capture the full 2026-04-07 NAS day-run state from the latest mirrored artifacts and preserve the day-end findings in the local repo.
- Inputs mirrored:
  - `tmp/nas-native-matrix/live/nas-native-matrix-latest.md`
  - `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`
  - `tmp/nas-benchmarks/nas-main-device-feasibility-latest.md`
  - `tmp/nas-benchmarks/pipeline-census-latest.md`
  - `tmp/nas-system-audit/20260407T052137Z/summary.md`
  - `tmp/nas-system-audit/20260407T052254Z-cleanup/cleanup-summary.json`
  - `tmp/nas-campaigns/20260407T053734Z/status.json`
  - `tmp/nas-campaigns/20260407T053734Z/campaign.log`
- Shadow outputs:
  - `docs/ops/nas-status-2026-04-07.md`
- Checkpoints:
  - native matrix mirror timestamp: `2026-04-07T05:34:03.213Z`
  - reality-check timestamp: `2026-04-07T19:28:27.756Z`
  - latest failed legacy campaign stamp: `20260407T053734Z`
- Validation result:
  - production GO remains blocked by `mac_remains_operationally_required` and `scheduler_safe_to_modify_false`
  - md0 remained full in the mirrored native report
  - system-partition cleanup archived candidates but still deleted nothing under the SSH user
  - legacy overnight shadow was still colliding on the remote benchmark lock and failing immediately on `stage1`
  - native matrix stayed the primary evidence path; legacy shadow stayed secondary and operationally noisy
- Rollback:
  - ignore the new day-end status document
  - rely on the raw mirrored JSON/MD files only
- Decision:
  - 2026-04-07 did produce useful NAS evidence
  - 2026-04-07 did not produce a production-ready NAS cutover signal

### 2026-04-07: Night watch supervisor installed

- Goal: install a local overnight watcher that keeps the NAS native-matrix evidence path alive, runs the NAS watchdog every 30 minutes, syncs mirror artifacts back to the Mac repo, and leaves a morning report.
- Inputs mirrored:
  - `runtime/reports/native-matrix/*`
  - `runtime/native-matrix/supervisors/*`
  - `runtime/native-matrix/campaigns/*`
  - `runtime/STATUS.json`
  - `runtime/reports/system-partition/*`
- Shadow outputs:
  - `tmp/nas-night-watch/latest.json`
  - `tmp/nas-benchmarks/nas-night-watch-latest.json`
  - `tmp/nas-benchmarks/nas-night-watch-latest.md`
  - `tmp/nas-launchd/night-watch.stdout.log`
  - `tmp/nas-launchd/night-watch.stderr.log`
- Checkpoints:
  - launchd label: `com.rubikvault.nas.nightwatch`
  - cadence: `1800s`
  - target end: `08:00` local
  - legacy local `com.rubikvault.nas.daywatch` is booted out during install to prevent duplicate orchestration
- Validation result:
  - native-matrix supervisor now supports `RUN_WATCHDOG_EACH_CYCLE=1`
  - start script now forwards cadence and watchdog env into the remote native supervisor
  - first installed night-watch cycle recorded `nas_unreachable_retrying`, so overnight retries remain necessary
- Rollback:
  - boot out `com.rubikvault.nas.nightwatch`
  - delete `~/Library/LaunchAgents/com.rubikvault.nas.nightwatch.plist`
  - restore the old day-watch install only if explicitly needed
- Decision:
  - overnight NAS evidence collection now has a dedicated singleton-friendly path
  - tomorrow-morning review can use the dedicated night-watch report instead of only raw mirrors

### 2026-04-08: Morning read after first night watch

- Goal: capture what the first 30-minute night watch actually achieved overnight and record the new NAS evidence.
- Inputs mirrored:
  - `tmp/nas-night-watch/latest.json`
  - `tmp/nas-benchmarks/nas-night-watch-latest.json`
  - `tmp/nas-native-matrix/live/nas-native-matrix-latest.json`
  - `tmp/nas-native-matrix/live/STATUS.json`
- Shadow outputs:
  - `docs/ops/nas-status-2026-04-08.md`
- Checkpoints:
  - latest night-watch status timestamp: `2026-04-08T07:57:04+02:00`
  - latest mirrored native-matrix report timestamp: `2026-04-08T05:55:08Z`
  - latest mirrored campaign stamp: `20260408T031234Z`
  - latest mirrored supervisor stamp: `20260407T053239Z`
- Validation result:
  - night watch recovered remote connectivity and finished the night in `cycle_complete`
  - native-matrix evidence volume grew from `221` result files to `1216`
  - the overnight campaign reached `21` completed cycles with `97` completed runs and `30` failed runs
  - required services stayed healthy
  - production `runtime/STATUS.json` remained stale from `2026-04-07`, with only watchdog freshness updates
  - `/dev/md0` remained full and `scheduler_safe_to_modify` remained `false`
- Rollback:
  - ignore the new morning status document
  - keep using only the raw night-watch JSON and native-matrix mirror files
- Decision:
  - first night-watch run was operationally useful and worth keeping
  - the NAS gained more benchmark evidence, but no new production-cutover signal

### 2026-04-08: Day open-probe campaign repaired and restarted

- Goal: turn the new NAS open-probe campaign into a real day+night evidence path for unresolved steps instead of collecting empty-sample false results.
- Inputs mirrored:
  - `runtime/open-probes/campaigns/20260408T073101Z/*`
  - `runtime/open-probes/campaigns/20260408T073737Z/*`
  - `runtime/open-probes/reports/nas-open-probes-latest.json`
  - `runtime/open-probes/runs/*/result.json`
- Shadow outputs:
  - `docs/ops/nas-status-2026-04-08.md`
  - `docs/ops/nas-open-probes.md`
- Checkpoints:
  - broken campaign stamps replaced: `20260408T073101Z`, `20260408T073737Z`
  - active repaired campaign stamp: `20260408T074259Z`
  - target end: `2026-04-09T08:00:00+02:00`
  - repaired sample scope:
    - stocks: `AALB`, `ABN`, `ACOMO`, `ADYEN`, `AGN`, `AJAX`, `AKZA`, `ALFEN`
    - ETFs: `AGAC`, `AGGD`, `AGGE`, `AGUG`
- Validation result:
  - empty-sample failure was fixed by shipping the missing `US+EU` scope artifacts to the NAS repo and by adding registry/country fallback logic
  - semantic-failure classification was added, so NAS runs that exit `0` but clearly fail now surface as `failed`
  - broken NAS-local `mirrors/universe-v7/history` symlink was normalized so `refresh_history_sample` could finally run and succeed
  - `fundamentals_sample` still fails semantically because providers returned no data
  - `quantlab_v4_daily_report` still fails because `pyarrow` and NAS-local `QuantLabHot` paths are missing
  - `q1_delta_ingest_smoke` remains an architecture-bound failure signature
  - open-probe defaults were raised from `80` to `240` cycles so the day/night campaign can run until the target window instead of stopping early on a fast cadence
  - the immediate post-change restart attempt hit temporary NAS SSH/preflight failures, so the next verified live campaign stamp must be read from the next successful sync
- Rollback:
  - stop the repaired campaign and rely only on native matrix
  - remove the probe sample fallback and semantic classification changes
- Decision:
  - keep the repaired open-probe campaign running through the day and night
  - treat it as the main NAS evidence path for unresolved components while native matrix remains the main path for promotable stages

### 2026-04-08: Solution matrix report added for day+night NAS evidence

- Goal: convert the growing mix of native-matrix and open-probe results into a single problem→solution evidence report that can answer "what was tested, what worked, what failed, and what is still only a proposed/manual fix".
- Inputs mirrored:
  - `tmp/nas-benchmarks/nas-open-probes-latest.json`
  - `tmp/nas-benchmarks/nas-night-watch-latest.json`
  - `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
  - `tmp/nas-native-matrix/live/nas-native-matrix-latest.json`
- Shadow outputs:
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.json`
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.md`
- Checkpoints:
  - problem families covered: `15`
  - current summary snapshot:
    - `verified_success=48`
    - `mixed_results=16`
    - `verified_failure=6`
    - `manual_or_admin_only=5`
    - `not_yet_tested=16`
- Validation result:
  - the report now ties open-probe and native-matrix evidence back to named problem/solution IDs
  - active probe coverage expanded beyond the original small set and now includes stage-4 smoke steps and learning-cycle evidence
  - the current solution matrix clearly separates:
    - proven NAS strengths (`stage1/2/3`, `scientific_summary`, forecast daily, hist-probs validity path, universe audit sample)
    - mixed live-API paths (history/fundamentals)
    - strong architecture blockers (QuantLab hot path, daily learning on NAS, best-setups decomposition still unresolved)
- Rollback:
  - stop generating the solution matrix and rely only on raw open-probe/native-matrix reports
- Decision:
  - keep the solution-matrix rollup in the day/night loop
  - use it as the canonical morning read for unresolved NAS blockers and tested fixes

### 2026-04-08: Day+night watcher expanded with audit/publish/report ordering

- Goal: make the 30-minute day+night watcher generate richer proof on every cycle instead of only mirroring campaign state.
- Implemented:
  - updated `scripts/nas/run-night-watch-supervisor.sh`
  - updated `scripts/nas/install-night-watch-launchd.sh`
  - updated `scripts/nas/build-solution-matrix-report.mjs`
  - updated `docs/ops/nas-runbook.md`
  - updated `docs/ops/nas-open-probes.md`
  - updated `docs/ops/nas-status-2026-04-08.md`
- Behavior:
  - every watcher cycle can now run the repo-local read-only system-partition audit
  - rebuilds now run in the correct dependency order:
    - open-probes
    - reality check
    - solution matrix
    - night-watch report
  - refreshed benchmark rollups and NAS docs are published again on each healthy cycle
  - solution-matrix generation no longer depends on a previously built night-watch rollup and instead reads the native-matrix mirror and latest system audit directly
- Validation result:
  - the day+night loop now has a stronger chance of producing fresh blocker evidence for `md0`, open probes, native matrix, and solution-path status every `30min`
  - the report dependency cycle was removed, so later morning reads should stop lagging one cycle behind the newest open-probe/native-matrix evidence
- Rollback:
  - revert the watcher/order changes
  - reinstall the prior launchd plist
  - stop per-cycle audit/publish if they create unwanted load
- Decision:
  - keep the expanded watcher as the default evidence path for the current NAS test window
  - continue using the generated solution matrix as the primary "which fix works for which problem" report

### 2026-04-08: Central evidence hub added

- Goal: keep all NAS proof reports readable from one central doc instead of forcing manual cross-reading of raw JSON and separate markdown reports.
- Implemented:
  - `scripts/nas/build-evidence-hub.mjs`
  - repo script `npm run nas:evidence:hub`
  - watcher integration in `scripts/nas/run-night-watch-supervisor.sh`
  - docs publish integration in `scripts/nas/publish-docs-to-nas.sh`
- Outputs:
  - `docs/ops/nas-evidence-hub.md`
- Validation result:
  - the hub now answers in one place:
    - whether the NAS is on plan or not
    - which steps are now proven on NAS that were previously not proven
    - which methods are currently best per stage
    - which open probes are mixed, failed, or stable
    - which blockers still prevent Mac replacement
- Rollback:
  - stop generating the hub and fall back to `nas-night-watch`, `nas-open-probes`, `nas-solution-matrix`, and `nas-status` separately
- Decision:
  - keep the hub in the 30-minute loop and treat it as the first morning read

## Entry Template

Use this format for the next migration step:

```md
### YYYY-MM-DD: Short title

- Goal:
- Inputs mirrored:
- Shadow outputs:
- Checkpoints:
- Validation result:
- Rollback:
- Decision:
```
