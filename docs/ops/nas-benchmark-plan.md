# NAS Benchmark Plan

## Goal

Build a fully isolated NAS benchmark lab that can prove, with repeatable evidence, which RubikVault jobs can safely move off the Mac and which must remain on the Mac.

## Operationalized Tooling

The benchmark lab is wired into the repo with these entry points:

- `npm run nas:setup`
- `npm run nas:validate`
- `npm run nas:shadow:stage1`
- `npm run nas:shadow:stage2`
- `npm run nas:shadow:stage3`
- `npm run nas:shadow:stage4:scientific-summary`
- `npm run nas:shadow:stage4:etf-diagnostic`
- `npm run nas:shadow:stage4:daily-audit`
- `npm run nas:shadow:stage4:cutover-readiness`
- `npm run nas:overnight:campaign`
- `npm run nas:benchmark:build`
- `npm run nas:benchmark:publish`
- `npm run nas:retention`
- `npm run nas:mirror:external:inventory`

Authoritative benchmark outputs:

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

## Isolation Rules

- Mac stays productive primary.
- NAS stays non-productive shadow.
- No Git remote usage on the NAS.
- No deletes, no productive path replacement, no dashboard cutover.
- No new NAS-only API calls when the same frozen inputs already exist on the Mac or attached drives.
- Attached drives such as `CONFIG` and `SAMSUNG` are bootstrap-only sources; once copied to the NAS they should be treated as optional and unplug-able.

## Input Integrity

- The Mac generates the canonical input manifest first.
- The Mac-generated stage path manifest file is mirrored to the NAS run workspace before verification starts.
- Each benchmark run writes `input-manifest.mac.json`.
- The manifest contains per-file SHA-256, size, file count, total bytes, and a combined hash.
- The manifest is mirrored to the NAS run directory.
- The NAS rebuilds its own manifest as the first benchmark step.
- The run continues only if `input-manifest.compare.json` is semantically equal.
- Job output comparison must use an isolated local shadow reference run, not a potentially stale productive artifact from the main repo tree.
- Stage 3 also verifies the shadow `QUANT_ROOT` input separately via `quant-input.mac.json` and `quant-input.nas.json`.

## Mirror Strategy

- Fresh per-run shadow workspaces use unique directories under `staging/shadow-runs/<stage>/<TEST_RUN_ID>`.
- Because each run uses a fresh destination, input reproducibility is guaranteed by the input manifest hash.
- Persistent dataset mirrors from the Mac or attached drives should use checksum-based sync:
  - `rsync -a --checksum --protect-args`
- Operational offload copies that are not benchmark inputs stay on the existing non-delete policy and do not become benchmark truth automatically.
- Local shadow-run retention may trim old local run directories after remote archive, but only after the full run directory has been copied to the NAS archive and a local archive pointer remains.

## Locking

- A global benchmark lock prevents overlapping runs.
- Local lock path: `tmp/nas-locks/nas-shadow-benchmark.lock`
- NAS lock path: `/volume1/homes/neoboy/RepoOps/rubikvault-site/runtime/locks/nas-shadow-benchmark.lock`
- If either lock exists, the next run must fail fast.
- Stale lock cleanup must be manual and journaled.

## Standard Run Artifacts

Each benchmark run must produce:

- `validate-before.txt`
- `validate-after.txt`
- `input-manifest.mac.json`
- `input-manifest.nas.json`
- `input-manifest.compare.json`
- optional `quant-input.mac.json`
- optional `quant-input.nas.json`
- optional `quant-input.compare.json`
- `remote.stdout.log`
- `remote.stderr.log`
- `input-manifest.remote.stdout.log`
- `input-manifest.remote.stderr.log`
- step-specific compare report
- before/after checkpoints

## System Snapshot Format

Benchmark validation and checkpoints must always capture:

- `node -v`
- `npm -v`
- `python3 --version`
- `uv --version`
- service status for `synofoto`, `synorelayd`, `nginx`, `smbd`
- `uptime`
- `/proc/loadavg`
- `free -m`
- `/proc/meminfo`
- `/proc/swaps`
- `df -h /volume1 /volume1/homes`
- top RSS processes

This format stays fixed so historical runs are comparable.

## Local Reference Metrics

- Every local reference run must be wrapped with `/usr/bin/time -l`.
- `metrics.json` must record local max RSS so hardware-fit decisions are based on evidence, not only runtime.

## Compare Specification

`compare-json.mjs` is the SSOT comparator.

- mode: `semantic_json`
- ignores runtime-only keys such as `generated_at`, `updated_at`, `detected_at`
- ignores keys matching `*_age_hours`
- ignores runtime-only path suffixes such as `.provider.env_present`
- outputs:
  - `comparison_mode`
  - `ignored_keys`
  - `ignored_key_patterns`
  - `ignored_path_suffixes`
  - `diff_count`
  - `diffs`

If a job needs stronger comparison later, add a second comparator instead of weakening this one globally.

## Benchmark Gates

### Phase A

- shadow repo and dataset mirror layout complete
- input manifest hashing active
- locking active
- stderr/stdout capture active

### Phase B

- Stage 2 and Stage 3 each reach `3/3` successful shadow runs
- all compare reports pass
- no NAS service regressions

### Phase C

Starts only if Phase B is fully green.

- frozen offline transforms only
- JSON to Parquet
- history conversions
- read-only report builders
- seeded candidates:
  - `scientific_summary`
  - `etf_diagnostic`
  - `daily_audit_report`
  - `cutover_readiness_report`

### Phase D

Starts only if Phase C has at least 5 successful benchmark runs in the current window.

- medium read-only analysis jobs
- larger universe evaluations on frozen inputs

### Phase E

Decision matrix only after enough history exists.

## Minimum Run Counts

- 3-day window is only valid with at least `5` successful runs
- 7-day window is only valid with at least `10` successful runs
- 14-day window is only valid with at least `20` successful runs

## Job-Type Decision Thresholds

### I/O-bound

- green: NAS runtime `<= 4x` Mac
- yellow: `> 4x` and `<= 8x`
- red: `> 8x`

### Mixed

- green: NAS runtime `<= 6x` Mac
- yellow: `> 6x` and `<= 10x`
- red: `> 10x`

### CPU-bound

- green: NAS runtime `<= 8x` Mac
- yellow: `> 8x` and `<= 15x`
- red: `> 15x`

## Swap Thresholds

- green: swap delta `<= 250 MB`
- yellow: swap delta `> 250 MB` and `<= 500 MB`
- red: swap delta `> 500 MB`

Independent red trigger:

- repeated upward-only swap growth across 3 consecutive successful runs without recovery

## What Counts As Failure

- non-zero exit code
- compare mismatch
- missing output
- missing manifest verification
- active lock collision
- service regression
- benchmark writing into any productive path

## Decision Output

At the end of the benchmark campaign each job must be classified as:

- `mac_only`
- `nas_shadow_only`
- `nas_candidate_for_future_offload`

No production migration may be planned until the classification exists and is backed by the benchmark reports.
