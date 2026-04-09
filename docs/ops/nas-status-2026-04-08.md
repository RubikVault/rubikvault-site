# NAS Status 2026-04-08

## Overnight Read

- Night watch remained active until the configured `08:00` local window.
- Remote NAS connectivity recovered during the night; the latest local night-watch status at `2026-04-08T07:57:04+02:00` recorded `remote_connected=true`.
- The active native-matrix supervisor remained the long-running singleton `20260407T053239Z`.
- The active native-matrix campaign became `20260408T031234Z` and was still `running` near the end of the night window.

## New Evidence

- Native-matrix result volume increased from `221` mirrored result files to `1216`.
- Latest mirrored campaign state:
  - `cycles_completed=21`
  - `runs_completed=97`
  - `runs_failed=30`
  - `last_stage=stage3`
  - `last_variant=volume1_caches`
- Required NAS services stayed healthy in the latest service census:
  - `synorelayd=true`
  - `synology_photos=true`
  - `nginx=true`
  - `smb=true`

## Stable Conclusions

- Strong native candidates remain:
  - `stage1`
  - `stage2`
  - `stage3`
  - `stage4:scientific_summary`
- The overnight run adds confidence to those stages, especially across:
  - `baseline_serial`
  - `node384`
  - `node512`
  - `volume1_caches`

## New Operational Findings

- The night-watch orchestration itself worked:
  - local launchd stayed alive
  - remote connectivity recovered
  - mirrored artifacts refreshed
  - a dedicated morning report was produced
- The production NAS status did **not** refresh into a new production run overnight.
  - Latest mirrored `runtime/STATUS.json` still points to `2026-04-07T05:25:35Z`
  - Watchdog kept updating the file, but no fresh production supervisor cycle replaced it
- `/dev/md0` remained at `100%`.
- `scheduler_safe_to_modify` remained `false`.
- Reality check remained blocked by:
  - `mac_remains_operationally_required`
  - `scheduler_safe_to_modify_false`
  - effective root blocker: `root_fs_100_percent`

## Morning Meaning

- The NAS night was useful and produced real new benchmark evidence.
- The NAS is still a good evidence/shadow machine.
- The NAS is still not ready for production cutover.
- The next highest-value NAS actions remain:
  - keep native matrix as the only benchmark path
  - keep the new night watch path
  - do not re-enable legacy overnight shadow
  - treat `md0` and stale production `STATUS.json` as separate blockers

## Day Run 2026-04-08

- A dedicated open-probe campaign was restarted with a fixed sample selector.
  - last verified active campaign stamp: `20260408T074259Z`
  - target end: `2026-04-09T08:00:00+02:00`
- The sample set is now real `US+EU` scope instead of accidental Asia/global fallback:
  - stocks: `AALB`, `ABN`, `ACOMO`, `ADYEN`, `AGN`, `AJAX`, `AKZA`, `ALFEN`
  - ETFs: `AGAC`, `AGGD`, `AGGE`, `AGUG`
- The remote deploy path now also ships the probe-critical scope artifacts:
  - `public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json`
  - `public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json`
  - `public/data/universe/v7/registry/registry.ndjson.gz`
  - `public/data/eod/history/pack-manifest.us-eu.json`
  - `public/data/eod/history/pack-manifest.us-eu.lookup.json`

## New Day Findings

- `refresh_history_sample` moved from `allowlist_empty` / broken-history-root failure to a real successful NAS sample run.
  - latest status: `success`
  - latest run stamp: `20260408T074333Z`
  - avg duration: `8.58s`
  - avg peak RSS: `20.59 MB`
- `fundamentals_sample` still fails semantically on NAS.
  - latest status: `failed`
  - reason: `provider_chain_failed`
  - current meaning: the Node process exits `0`, but all providers failed to return fundamentals for the sample run
- `quantlab_v4_daily_report` is now clearly classified as failed on NAS.
  - latest status: `failed`
  - reason: `missing_dependency`
  - concrete blockers:
    - `ModuleNotFoundError: No module named 'pyarrow'`
    - missing NAS-local `QuantLabHot` paths under `/Users/michaelpuchowezki/QuantLabHot/...`
- `q1_delta_ingest_smoke` remains a failure signature for the QuantLab boundary problem.
  - classification remains `blocked_by_architecture`
  - blocker family remains `quantlabhot_path` / `mac_local_env`

## Meaning After The Day Restart

- Open probes are now collecting useful failure signatures instead of fake-empty samples.
- `refresh_v7_history_from_eodhd` has moved into the "worth optimizing further on NAS" bucket.
- `build_fundamentals` remains live-API-sensitive and still needs provider or env work.
- QuantLab daily report and Q1 ingest remain strong evidence that the current QuantLab hot path is not NAS-native yet.
- The day-and-night path is now:
  - one native-matrix supervisor
  - one open-probe campaign
  - one local night-watch launcher that re-checks and re-syncs every `30min`
- The open-probe defaults were then raised to `MAX_CYCLES=240` so the campaign cannot stop early before the `08:00` target window.
- Immediate post-restart verification of the higher-cycle campaign was blocked by temporary NAS SSH/preflight timeouts, so the next verified live stamp must come from the next night-watch sync or the next successful SSH check.

## Expanded Matrix Snapshot

- The later day sync moved the active open-probe evidence window forward again:
  - latest mirrored open-probe campaign: `20260408T083233Z`
  - status: `running`
- The day/night probe set now spans:
  - history fetch
  - fundamentals
  - QuantLab daily report
  - Q1 ingest smoke
  - hist-probs
  - forecast
  - universe audit
  - daily learning cycle
  - stage-4 smoke coverage (`best_setups_v4`, `ETF diagnostic`, `daily audit`, `cutover readiness`)
- Latest mirrored open-probe scoreboard:
  - `refresh_history_sample`: `8/10` success
  - `fundamentals_sample`: `1/10` success
  - `quantlab_v4_daily_report`: `1/10` success
  - `q1_delta_ingest_smoke`: `0/9` success
  - `hist_probs_sample`: `7/7` success
  - `forecast_daily`: `7/7` success
  - `universe_audit_sample`: `7/7` success
  - `daily_learning_cycle`: `0/6` success
- New higher-level summary report exists:
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.json`
  - `tmp/nas-benchmarks/nas-solution-matrix-latest.md`
  - `docs/ops/nas-evidence-hub.md`
- The active day+night watcher now also refreshes:
  - a fresh repo-local read-only system-partition audit
  - benchmark publish
  - docs publish
  - solution-matrix rollups before rebuilding the morning/night watch report
- Current matrix read:
  - verified successes exist for orchestration singleton, native-matrix resource profiles, hist-probs validity checks, forecast daily, API/browser-smoke separation, and shadow-only release safety
  - mixed results remain for live API fetch and fundamentals
  - strong failures remain for QuantLab hot-path boundary and daily-learning-cycle-on-NAS
  - unresolved architecture work remains for `best_setups_v4` decomposition and several release/parity improvements
