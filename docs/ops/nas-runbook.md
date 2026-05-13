# NAS Runbook

> Incidents und Lektionen aus NAS-Arbeit: [`lessons-learned.md`](lessons-learned.md)

## Purpose

This document is the source of truth for all RubikVault work that touches the home NAS.

Current priorities:

1. Do not delete or mutate existing NAS user data.
2. Keep Synology Photos upload/sync from iPhone working at all times.
3. Keep DSM, Mac access, and QuickConnect working at all times.
4. Increase NAS repo usage slowly, with logs and explicit validation after every change.

## Connect

- SSH host: `neonas`
- Command: `ssh neonas`
- Current login user: `neoboy`
- NAS workspace root: `/volume1/homes/neoboy/RepoOps/rubikvault-site`
- Human use should prefer `ssh neonas`.
- Repo helper scripts use the explicit key+port form for deterministic automation: `ssh -i ~/.ssh/id_ed25519_nas -p 2222 neoboy@192.168.188.21`

## Hard Safety Rules

- Never delete NAS data unless the user explicitly asks for deletion.
- Never disable or uninstall Synology Photos without explicit approval.
- Never disable or uninstall QuickConnect without explicit approval.
- Never disable SMB unless the user explicitly confirms it is unused.
- Do not move dashboard-critical jobs to the NAS until load tests prove stability.
- Prefer copy/sync over move.
- Every change on the NAS must be followed by a validation snapshot.
- Every migration step must have a checkpoint before and after the run.
- The Mac remains the primary runtime until a NAS stage is explicitly promoted.
- Shadow outputs on NAS must never overwrite productive Mac outputs.

## Reversible Migration Model

The NAS migration is explicitly reversible by design.

- **Primary runtime:** Mac
- **Secondary runtime:** NAS shadow workspace
- **Rollback rule:** stop the NAS job, keep or restore the Mac job as primary, and ignore NAS outputs without deleting them
- **Promotion gate:** at least 3 successful shadow runs, matching semantic outputs, stable NAS metrics, and a documented rollback path

Related source-of-truth files:

- `docs/ops/nas-migration-journal.md`
- `docs/ops/nas-evidence-hub.md`
- `docs/ops/nas-solution-attempt-log.md`
- `docs/ops/nas-variant-catalog.md`
- `docs/ops/nas-transfer-status.md`
- `docs/ops/nas-automation-audit.md`
- `docs/ops/nas-benchmark-plan.md`
- `scripts/nas/stage-manifest.json`
- `scripts/nas/capture-checkpoint.sh`
- `scripts/nas/run-stage1-shadow.sh`
- `scripts/nas/run-stage2-shadow.sh`
- `scripts/nas/run-stage3-shadow.sh`
- `scripts/nas/run-stage4-shadow.sh`
- `scripts/nas/compare-json.mjs`
- `scripts/nas/build-run-metrics.mjs`
- `scripts/nas/build-benchmark-history.mjs`
- `scripts/nas/build-capacity-decision-matrix.mjs`
- `scripts/nas/build-overnight-summary.mjs`
- `scripts/nas/build-input-source-report.mjs`
- `scripts/nas/build-campaign-summary.mjs`
- `scripts/nas/setup-benchmark-lab.sh`
- `scripts/nas/mirror-external-datasets.sh`
- `scripts/nas/archive-shadow-runs.sh`
- `scripts/nas/publish-benchmark-reports.sh`
- `scripts/nas/run-overnight-shadow-campaign.sh`
- `scripts/nas/run-overnight-supervisor.sh`

Current live migration state:

- Benchmark counts are evidence, not a production `GO` by themselves.
- Native matrix is now the primary NAS evidence layer.
- The legacy overnight shadow chain is kept only as supporting history.
- Final `GO` authority is the combination of:
  - `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
  - `tmp/nas-benchmarks/nas-main-device-feasibility-latest.json`
  - `tmp/nas-benchmarks/pipeline-proof-matrix-latest.md`
  - latest `tmp/nas-system-audit/<STAMP>/summary.json`
- If those sources disagree, the stricter result wins and Mac stays primary.

- Stage 0 is implemented.
- Stage 1: `51` successful shadow runs, 100% pass rate, avg factor 2.52x → `nas_candidate_for_future_offload`.
- Stage 2: `49` successful shadow runs, 100% pass rate, avg factor 3.3x → `nas_candidate_for_future_offload`.
- Stage 3: `44/50` successful shadow runs, avg factor 3.54x → `nas_candidate_for_future_offload`. 6 prior failures were caused by `remote_workflows` GitHub API field comparison; fixed 2026-04-06 by adding `remote_workflows` to `VOLATILE_KEYS` in `compare-json.mjs`.
- Phase C benchmark pilots completed:
  - `stage4:scientific_summary`: 41/42 successful, avg factor 4.09x → `nas_candidate_for_future_offload`
  - `stage4:best_setups_v4`: 0/6 successful, requires 1438 MB RAM (NAS ~550 MB available) → `mac_only` (permanently excluded from overnight campaign)
  - `stage4:etf_diagnostic`: 3/3 successful outputs, factor 23.5x → `mac_only`
  - `stage4:daily_audit_report`: 10/10 successful outputs, factor 22.35x → `mac_only`
  - `stage4:cutover_readiness_report`: 10/10 successful outputs, factor 22.12x → `mac_only`
- Productive runtime is still Mac-only.
- Day+night watcher now runs automatically via launchd (`com.rubikvault.nas.nightwatch`).
- The NAS native matrix supervisor must run as a singleton.
- Production status was refreshed again on `2026-04-07` by a direct NAS run of `rv-nas-supervisor.sh`; current `runtime/STATUS.json` is no longer the stale `2026-04-06` snapshot.
- The singleton hardening now records real bash PIDs for both supervisor and campaign status files.
- The system-partition audit is now fully working again, but conservative cleanup under SSH user `neoboy` could archive candidates without deleting root-owned files, so `/dev/md0` remains a separate admin-level blocker.
- `runtime/STATUS.json` and the native matrix report must agree before any `GREEN/GO` statement is accepted.

Current benchmark outputs:

- `tmp/nas-benchmarks/nas-shadow-benchmark-latest.json`
- `tmp/nas-benchmarks/nas-shadow-benchmark-history.json`
- `tmp/nas-benchmarks/nas-capacity-decision-matrix.md`
- `tmp/nas-benchmarks/nas-overnight-summary-latest.json`
- `tmp/nas-benchmarks/nas-input-sources-latest.json`
- `tmp/nas-benchmarks/nas-morning-report-latest.json`
- `tmp/nas-benchmarks/pipeline-census-latest.json`
- `tmp/nas-benchmarks/pipeline-census-latest.md`
- `tmp/nas-benchmarks/nas-main-device-feasibility-latest.json`
- `tmp/nas-benchmarks/nas-main-device-feasibility-latest.md`
- `tmp/nas-benchmarks/pipeline-proof-matrix-latest.md`
- `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
- `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`
- `tmp/nas-benchmarks/nas-night-watch-latest.json`
- `tmp/nas-benchmarks/nas-night-watch-latest.md`
- `tmp/nas-benchmarks/nas-open-probes-latest.json`
- `tmp/nas-benchmarks/nas-open-probes-latest.md`
- `tmp/nas-benchmarks/nas-solution-matrix-latest.json`
- `tmp/nas-benchmarks/nas-solution-matrix-latest.md`
- `docs/ops/nas-evidence-hub.md`
- `docs/ops/nas-solution-attempt-log.md`
- `docs/ops/nas-transfer-status.md`
- `tmp/nas-system-audit/<STAMP>/summary.json`
- `tmp/nas-system-audit/<STAMP>/summary.md`

Current day+night watcher behavior:

- local launchd runs `scripts/nas/run-night-watch-supervisor.sh` every `30min`
- install default run window is now `28` days unless `END_LOCAL_DATE` or `RUN_WINDOW_DAYS` overrides it
- each cadence can:
  - keep the remote native-matrix singleton alive
  - keep the remote open-probe campaign alive
  - run the repo-local read-only system-partition audit
  - rebuild reality/open-probe/solution/transfer-status/attempt-log/evidence-hub/night-watch reports in order
  - publish refreshed benchmark rollups and NAS docs
- target window remains bounded by the configured long-run `END_LOCAL_DATE` and local `08:00` cutoff unless overridden

Current autonomous NAS-only runtime:

- As of `2026-04-14`, the active evidence loops can run without the Mac staying online.
- Open-probe supervisor and campaign are started directly on the NAS and keep running until their configured `target_end_local`.
- Native-matrix supervisor and campaign are started directly on the NAS and keep running until their configured `target_end_local`.
- Current direct-NAS day run:
  - open-probes supervisor stamp: `20260414T061431Z`
  - open-probes campaign stamp: `20260414T061440Z`
  - native-matrix supervisor stamp: `20260414T061431Z`
  - native-matrix campaign stamp: `20260414T061440Z`
  - target end: `2026-04-14T23:00:00+02:00`
- If the Mac goes offline, these NAS-side processes continue; only repo-local report mirroring to the Mac pauses.

## Current NAS Workspace

```text
/volume1/homes/neoboy/RepoOps/rubikvault-site
├── README.txt
├── archives/
├── datasets/
├── docs/
├── offload/
├── runtime/
│   ├── checkpoints/
│   ├── journal/
│   ├── locks/
│   ├── logs/
│   ├── reports/
│   └── tests/
├── staging/
└── tooling/
    ├── bin/
    ├── env.sh
    ├── state/
    └── venv39/
```

## Toolchain On NAS

The toolchain is intentionally isolated under the NAS workspace.

- `node`: provided by Synology package `Node.js_v20`
- `npm`: wrapper script in `tooling/bin/npm`
- `python3`: isolated `venv` wrapper in `tooling/bin/python3`
- `pip`: isolated `venv` wrapper in `tooling/bin/pip`
- `uv`: installed inside `tooling/venv39`
- `git`: not installed

Activate the known-good toolchain:

```sh
. /volume1/homes/neoboy/RepoOps/rubikvault-site/tooling/env.sh
node -v
npm -v
python3 --version
uv --version
```

## Validation

Create a fresh NAS status snapshot:

```sh
ssh neonas '. /volume1/homes/neoboy/RepoOps/rubikvault-site/tooling/env.sh; /volume1/homes/neoboy/RepoOps/rubikvault-site/tooling/bin/rv-nas-snapshot'
```

Required service checks:

```sh
ssh neonas 'ps -ef | egrep "synorelayd|synofoto|nginx: master|smbd -F --no-process-group" | grep -v egrep'
```

## Cloudflare Pages Deploy Secret

Production deploys run from the NAS release lane. Keep Cloudflare credentials in NAS private secrets directories only.

Active supervisor path:

```sh
/volume1/homes/neoboy/RepoOps/rubikvault-site/secrets/cloudflare.env
```

Dev workspace mirror:

```sh
/volume1/homes/neoboy/Dev/rubikvault-site/var/private/secrets/cloudflare.env
```

Required keys:

```sh
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_PROJECT_NAME=rubikvault-site
```

Rules:

- Never commit this file.
- Never print token values in logs, docs, tickets, or screenshots.
- File owner should be `neoboy`; permissions should be `600`.
- `CLOUDFLARE_ACCOUNT_ID` must be the 32-character account id, not a `cfut_...` token value.
- Validate from the same NAS environment that runs the supervisor.

Non-printing validation:

```sh
cd /volume1/homes/neoboy/Dev/rubikvault-site
. scripts/nas/nas-env.sh >/dev/null
node -e "console.log({token: !!process.env.CLOUDFLARE_API_TOKEN, account: /^[0-9a-f]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID || ''), project: process.env.CLOUDFLARE_PROJECT_NAME || null})"
node_modules/.bin/wrangler whoami
curl -fsS "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${CLOUDFLARE_PROJECT_NAME}" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | jq '{success, project: .result.name}'
```

If validation fails, stop before `wrangler pages deploy`. Do not mark the release lane green.

Capture a migration checkpoint before or after a stage:

```sh
bash scripts/nas/capture-checkpoint.sh
```

Build a deterministic input manifest for a stage:

```sh
node scripts/nas/build-input-manifest.mjs --root "$PWD" --paths-file scripts/nas/inputs/stage-1.paths --output tmp/input-manifest.example.json
```

Build and publish the current benchmark rollups:

```sh
npm run nas:benchmark:build
npm run nas:benchmark:publish
```

Build the repo-local automation reality check:

```sh
npm run nas:audit:reality
```

Build the repo-local NAS solution matrix:

```sh
npm run nas:solutions:report
```

Build the central NAS evidence hub doc:

```sh
npm run nas:evidence:hub
```

Build the transfer-readiness status doc:

```sh
npm run nas:transfer:status
```

Run the read-only NAS system-partition audit:

```sh
npm run nas:audit:system-partition
```

Do not modify DSM Task Scheduler until the latest system-partition audit says `scheduler_safe_to_modify=true`.

Start the conservative overnight shadow campaign:

```sh
npm run nas:overnight:campaign
```

Start the night supervisor:

```sh
npm run nas:night:supervisor
```

Install the overnight 30-minute launchd watcher:

```sh
npm run nas:night:install
```

Start the unresolved-component probe campaign:

```sh
npm run nas:open-probes:start
```

Archive older local shadow runs to the NAS without deleting them locally:

```sh
npm run nas:retention
```

Inventory attached external benchmark datasets without copying them:

```sh
npm run nas:mirror:external:inventory
```

## What May Run On NAS Now

- Offload copies from the Mac to the NAS
- Validation snapshots and metrics logging
- Light and medium shadow benchmark jobs with isolated outputs
- Compression, manifesting, and archive management for non-critical artifacts

## What Must Stay On The Mac For Now

- `wrangler pages dev` and `http://127.0.0.1:8788/dashboard_v7`
- Full `dashboard_v7` green-keeping loop
- `scripts/universe-v7/run-daily-stack.mjs`
- `scripts/forecast/run_daily.mjs`
- `scripts/learning/run-daily-learning-cycle.mjs`
- `scripts/ops/build-stock-analyzer-universe-audit.mjs` (requires `http://127.0.0.1:8788` — localhost Pages server, permanently Mac-only)
- `scripts/lib/hist-probs/run-hist-probs.mjs` full universe (RAM too large for NAS; ~1.4 GB needed)
- `scripts/build-best-setups-v4.mjs` (requires 1438 MB RAM — permanently Mac-only, excluded from overnight campaign)
- `stage4:etf_diagnostic`, `stage4:daily_audit_report`, `stage4:cutover_readiness_report` (all benchmarked as mac_only, factor >20x)
- QuantLab local launchd jobs and training flows
- Anything that depends on local Mac paths, launchd, `caffeinate`, or the existing QuantLab runtime root
- Any DSM scheduler change while the latest system-partition audit is missing, blocked, or not safe to modify

## Current NAS Constraints

- Model: Synology DS720+
- CPU: Intel Celeron J4125
- RAM: about 1.75 GB total
- Current swap usage is already high, mostly compressed zRAM
- Main memory pressure currently comes from SMB, Synology Photos side processes, Synology Drive, and media services

This means the NAS is currently suitable for storage/offload and selected shadow compute, but not for heavy repo compute.

## Incremental Adoption Plan

### Phase 0

- Create isolated toolchain
- Create validation snapshots
- Copy only non-critical artifacts to the NAS
- Record before/after checkpoints and keep a migration journal

### Phase 1

- Shadow-run light ops summary jobs only:
  - `scripts/ops/build-safety-snapshot.mjs`
  - `scripts/ops/build-mission-control-summary.mjs`
  - `scripts/ops/build-ops-pulse.mjs`
- Use `bash scripts/nas/run-stage1-shadow.sh`
- Keep the Mac as the source of truth
- Do not delete local copies
- Stage 1 validation is complete for shadow mode
- Latest successful shadow run: `tmp/nas-shadow-runs/stage1/20260404T190424Z`

### Phase 2

- Shadow-run `scripts/generate_meta_dashboard_data.mjs`
- Use `bash scripts/nas/run-stage2-shadow.sh`
- Compare NAS output against an isolated local reference run using the same frozen inputs
- Increase workload only if validation remains stable
- Stage 2 validation is complete for shadow mode
- Latest successful shadow run: `tmp/nas-shadow-runs/stage2/20260404T190451Z`

### Phase 3

- Shadow-run `scripts/ops/build-system-status-report.mjs`
- Use `bash scripts/nas/run-stage3-shadow.sh` only against mirrored inputs and a shadow `QUANT_ROOT`
- `QUANT_ROOT` is configurable and the needed QuantLab success artifact is mirrored per run
- The 2026-04-05 runner refresh replaces the full `public/data/hist-probs` mirror with:
  - `public/data/hist-probs/regime-daily.json`
  - `public/data/hist-probs/run-summary.json`
  - `tmp/nas-benchmark/hist-probs-profile-index.json`
- `HIST_PROBS_PROFILE_INDEX` is used only in shadow runs so the benchmark keeps the same coverage semantics without hashing the full profile tree on every run
- Stage 3 validation is complete for shadow mode
- Latest successful shadow run: `tmp/nas-shadow-runs/stage3/20260405T120159Z`

### Phase C Benchmark Pilots

- `bash scripts/nas/run-stage4-shadow.sh scientific_summary`
- `bash scripts/nas/run-stage4-shadow.sh etf_diagnostic`
- `bash scripts/nas/run-stage4-shadow.sh daily_audit_report`
- `bash scripts/nas/run-stage4-shadow.sh cutover_readiness_report`
- Current evidence:
  - `scientific_summary` is a NAS offload candidate
  - `etf_diagnostic` should stay on the Mac
  - `daily_audit_report` should stay on the Mac
  - `cutover_readiness_report` should stay on the Mac
- Classification authority: `tmp/nas-benchmarks/nas-capacity-decision-matrix.md`

### Formal Gate

- A 3-day benchmark window is only valid with at least `5` successful runs.
- A 7-day benchmark window is only valid with at least `10` successful runs.
- A 14-day benchmark window is only valid with at least `20` successful runs.
- No production migration may be planned until the benchmark classification exists and is documented in the journal.

## External Dataset Mirrors

- Inventory status on 2026-04-04:
  - `CONFIG`: ready at `/Volumes/CONFIG/RubikVault/quantlab-snapshots`
  - `SAMSUNG`: discovery root available, but no explicit source path selected
- Inventory report:
  - `tmp/nas-dataset-mirrors/20260404T184135Z/mirror-report.txt`
  - `tmp/nas-dataset-mirrors/20260404T184135Z/mirror-report.json`
- Rule:
  - external datasets must be mirrored copy-only into `datasets/` under the NAS workspace
  - benchmark truth comes from a documented `TEST_RUN_ID` or dataset snapshot stamp, never from an implicit live path
  - `CONFIG` and `SAMSUNG` are bootstrap-only sources and are not required to stay mounted on the Mac after a copy-only snapshot finishes
  - overnight benchmark runs must use repo-relative inputs plus NAS-side snapshots only
- Note:
  - a full checksum mirror of `CONFIG` was not adopted as benchmark truth during setup
  - inventory is authoritative until a dedicated dataset copy run is explicitly completed and journaled

## Offload Policy

Safe first candidates:

- `tmp/v7-build`
- `tmp/registry-backups`
- `tmp/v5`
- `mirrors/ops/logs`
- `Report`
- `audit-evidence`

These are copied to NAS only. They are not removed from the Mac by default.

## Initial Offload Status

Completed on 2026-04-04:

- `tmp/v7-build` about `3.8G`
- `tmp/registry-backups` about `21M`
- `tmp/v5` about `9.8M`
- `mirrors/ops/logs` about `3.6M`
- `Report` about `23M`
- `audit-evidence` about `732K`

Current NAS copy root:

- `/volume1/homes/neoboy/RepoOps/rubikvault-site/offload/mac-artifacts/current`

Point-in-time run copy:

- `/volume1/homes/neoboy/RepoOps/rubikvault-site/offload/mac-artifacts/20260404T142355Z`

Local run log:

- `tmp/nas-offload-logs/offload-20260404T142355Z.log`

NAS run log copy:

- `/volume1/homes/neoboy/RepoOps/rubikvault-site/runtime/logs/offload-20260404T142355Z.log`

Rule:

- Local originals remain untouched unless the user later approves deletion or move.

## Related Files

- `scripts/nas/offload-safe-artifacts.sh`
- `scripts/nas/validate-priorities.sh`
- `scripts/nas/capture-checkpoint.sh`
- `scripts/nas/run-stage1-shadow.sh`
- `scripts/nas/run-stage2-shadow.sh`
- `scripts/nas/run-stage3-shadow.sh`
- `scripts/nas/run-stage4-shadow.sh`
- `scripts/nas/build-run-metrics.mjs`
- `scripts/nas/build-benchmark-history.mjs`
- `scripts/nas/build-capacity-decision-matrix.mjs`
- `scripts/nas/setup-benchmark-lab.sh`
- `scripts/nas/mirror-external-datasets.sh`
- `scripts/nas/archive-shadow-runs.sh`
- `scripts/nas/publish-benchmark-reports.sh`
