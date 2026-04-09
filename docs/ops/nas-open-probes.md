# NAS Open Probes

## Purpose

The native matrix already covers the benchmarkable stage set. The open-probe campaign exists for the unresolved pipeline components that still need direct NAS evidence, architecture proof, or failure signatures.

## Probe Set

- `refresh_history_sample`
- `q1_delta_ingest_smoke`
- `fundamentals_sample`
- `quantlab_v4_daily_report`
- `hist_probs_sample`
- `forecast_daily`
- `daily_learning_cycle`
- `universe_audit_sample`

## Safety

- Shadow-only.
- No productive Mac outputs are trusted or promoted from these runs.
- The campaign uses small samples or bounded smoke settings whenever a component is not yet safe for full NAS runs.
- The day/night watcher may restart the campaign, but only one remote campaign may run at a time.

## Runtime

Start a remote campaign manually:

```sh
npm run nas:open-probes:start
```

Build the local summary report:

```sh
npm run nas:open-probes:report
```

The day/night watch path keeps this campaign alive automatically and will attempt a restart or re-sync on the next `30min` cadence when the remote campaign is missing or stale.
The default day/night ceiling is `MAX_CYCLES=240`, still bounded by the target local end time.
Each cadence also refreshes the repo-local system-partition audit, benchmark rollups, docs publish, and the higher-level solution matrix so the next morning view always includes fresh blocker evidence.

Build the higher-level problem/solution summary:

```sh
npm run nas:solutions:report
```

## Artifacts

- Remote campaign status:
  - `runtime/open-probes/campaigns/<STAMP>/status.json`
- Remote run results:
  - `runtime/open-probes/runs/<STAMP>/*/result.json`
- Local mirrored campaign status:
  - `tmp/nas-open-probes/campaigns/`
- Local mirrored runs:
  - `tmp/nas-open-probes/runs/`
- Local summary:
  - `tmp/nas-benchmarks/nas-open-probes-latest.json`
  - `tmp/nas-benchmarks/nas-open-probes-latest.md`
- Local solution matrix:
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.json`
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.md`

## Current Role

- Use this campaign to learn what still fails on NAS and why.
- Keep native matrix as the primary evidence path for promotable stages.
- Use open probes for live-API, architecture, and heavy-job diagnostics until those paths are either promoted, refactored, or kept Mac-only.

## Current 2026-04-08 Notes

- Sample selection now prefers the real `US+EU` scope and no longer falls back to accidental Asia/global rows when the NAS repo is missing the scope helper files.
- Probe result classification now treats semantic failures as failures even when the wrapped process exits `0`.
  - examples:
    - `all providers failed`
    - missing Python modules such as `pyarrow`
    - missing `QuantLabHot` runtime paths
- Broken NAS-local `mirrors/universe-v7/history` symlinks are normalized into a writable directory for the history sample probe, so the probe can actually test EOD refresh behavior.
- The active day/night probe set now covers:
  - `refresh_history_sample`
  - `fundamentals_sample`
  - `quantlab_v4_daily_report`
  - `q1_delta_ingest_smoke`
  - `hist_probs_sample`
  - `hist_probs_sample_w1`
  - `hist_probs_sample_w2`
  - `forecast_daily`
  - `universe_audit_sample`
  - `best_setups_v4_smoke`
  - `etf_diagnostic_smoke`
  - `daily_audit_report_smoke`
  - `cutover_readiness_smoke`
  - `daily_learning_cycle`
