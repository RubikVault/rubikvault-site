# NAS Evidence Hub

Generated at: 2026-04-09T11:56:15.241Z

## Current Verdict

- Production GO on NAS: false
- Current primary runtime: Mac
- Night-watch status: monitoring / cycle_complete / remote_connected=true
- Native-matrix campaign: 20260409T092417Z / running
- Open-probe campaign: 20260408T201518Z / running / cycles=49 / runs=113 / failed=51
- Root filesystem: 2.3G / 2.3G (100%)

## Hard Blockers

- scheduler_safe_to_modify_false
- root_fs_100_percent

## Steps Now Proven On NAS

- `refresh_v7_history_from_eodhd` läuft auf der NAS jetzt als echter Probe-Run mit US+EU-Sample und History-Root-Normalisierung.
- `hist_probs` läuft auf der NAS jetzt stabil als Small-Scope- und konservativer Runtime-Pfad.
- `forecast_daily` läuft auf der NAS jetzt wiederholt erfolgreich als Day/Night-Probe.
- `stock_analyzer_universe_audit` ist auf der NAS als JSON/API-Sample-Audit nachweisbar lauffähig.
- Der 30-Minuten-Watcher hält Native-Matrix und Open-Probes automatisch am Leben und baut pro Zyklus neue Rollups.

## Recommended NAS Methods By Stage

| Stage | Recommended method | Why this is the current best NAS path | Evidence |
|---|---|---|---|
| stage1 | volume1_caches | peak_rss=35.51 MB, avg_duration=0.72 s, swap_delta=-7.84 MB | 72/72 promote_candidate |
| stage2 | node384 | peak_rss=81.74 MB, avg_duration=0.70 s, swap_delta=6.57 MB | 71/71 promote_candidate |
| stage3 | node512 | peak_rss=65.30 MB, avg_duration=0.75 s, swap_delta=-3.42 MB | 71/71 promote_candidate |
| stage4:scientific_summary | baseline_serial | peak_rss=455.74 MB, avg_duration=4.71 s, swap_delta=6.86 MB | 72/72 promote_candidate |

## Open-Probe Results

| Probe | Status | Runs | Avg duration (s) | Avg peak RSS (MB) | What it proves |
|---|---|---:|---:|---:|---|
| Best Setups V4 Smoke | verified_failure | 0/6 | 2407.45 | 630.57 | nonzero_exit; |
| Cutover Readiness Smoke | mixed_results | 4/6 | 592.16 | 665.51 | stable sample path |
| Daily Audit Report Smoke | verified_success | 6/6 | 544.65 | 667.43 | stable sample path |
| Daily Learning Cycle | verified_failure | 0/37 | 279.43 | 695.48 | nonzero_exit; |
| ETF Diagnostic Smoke | verified_success | 6/6 | 3.78 | 264.85 | stable sample path |
| Forecast Daily | verified_success | 37/37 | 142.50 | 648.72 | stable sample path |
| Fundamentals Sample | mixed_results | 1/42 | 143.76 | 66.18 | provider_chain_failed; |
| Hist Probs Sample | verified_success | 38/38 | 147.33 | 671.83 | stable sample path |
| Hist Probs Sample W1 | verified_failure | 0/6 | 1811.24 | 669.58 | nonzero_exit; |
| Hist Probs Sample W2 | verified_failure | 0/6 | 1443.25 | 643.50 | nonzero_exit; |
| Q1 Delta Ingest Smoke | verified_failure | 0/40 | 0.51 | 8.39 | nonzero_exit; FATAL: pyarrow required: No module named 'pyarrow' |
| Q1 Delta Preflight | verified_failure | 0/6 | 1.02 | 42.24 | nonzero_exit; |
| QuantLab Boundary Audit | verified_failure | 0/6 | 0.71 | 31.56 | missing_quantlab_path; |
| QuantLab V4 Daily Report | mixed_results | 1/42 | 9.86 | 306.41 | missing_dependency; Traceback (most recent call last): File "/volume1/homes/neoboy/Dev/rubikvault-site/scripts/quantlab… |
| Refresh V7 History Sample | mixed_results | 40/42 | 7.92 | 20.70 | stable sample path |
| Runtime Control Probe | verified_failure | 0/6 | 0.99 | 31.92 | nonzero_exit; |
| UI Contract Probe | verified_failure | 0/6 | 0.93 | 36.80 | nonzero_exit; |
| Universe Audit Sample | verified_success | 37/37 | 1.26 | 49.10 | stable sample path |

## Problem -> Best Current NAS Solution

| Problem | Best current solution | Status | Report family |
|---|---|---|---|
| P01_md0_rootfs | 1A Read-only root audit | verified_success | system_partition |
| P02_ssot_split_brain | 2A Single JSON SSOT | verified_success | ssot |
| P03_orchestrator_locking | 3A Singleton supervisor only | verified_success | orchestration |
| P04_api_fetch | 4A Isolated fetcher service | mixed_results | fetch |
| P05_ui_browser_localhost | 5A Remove UI from daily core | verified_success | ui_audit |
| P06_best_setups_v4 | 6J Monolith baseline run | evidence_present_but_blocked | best_setups |
| P07_quantlab_boundary | 7A Boundary audit | mixed_results | quantlab |
| P08_release_safety | 8E No direct main/prod write | verified_success | release |
| P09_parity_drift | 9A Frozen snapshot compare | verified_success | parity |
| P10_prod_go | 10A Gatekeeper script | verified_success | cutover |
| P11_hist_probs | 11A Skip only on valid file | verified_success | hist_probs |
| P12_learning_governance | 12C Small runtime-control artifact | verified_success | learning |
| P13_daily_chain | 13A Minimal daily core | verified_success | daily_chain |
| P14_fundamentals | 14C Content freshness over mtime | verified_success | fundamentals |
| P15_resources | 15A Serial baseline | verified_success | resources |

## Proven Good Without Mac Replacement

- Daily Audit Report Smoke: 6/6 successful, latest=success, avg_peak_rss_mb=667.43
- ETF Diagnostic Smoke: 6/6 successful, latest=success, avg_peak_rss_mb=264.85
- Forecast Daily: 37/37 successful, latest=success, avg_peak_rss_mb=648.72
- Hist Probs Sample: 38/38 successful, latest=success, avg_peak_rss_mb=671.83
- Universe Audit Sample: 37/37 successful, latest=success, avg_peak_rss_mb=49.10
- stage1: recommended variant is `volume1_caches` with 72/72 successful native-matrix runs.
- stage2: recommended variant is `node384` with 71/71 successful native-matrix runs.
- stage3: recommended variant is `node512` with 71/71 successful native-matrix runs.
- stage4:scientific_summary: recommended variant is `baseline_serial` with 72/72 successful native-matrix runs.

## Mixed Or Partial Solutions

- Cutover Readiness Smoke: 4/6 success, 2 fail, latest_reason=process_exit_zero
- Fundamentals Sample: 1/42 success, 41 fail, latest_reason=provider_chain_failed
- QuantLab V4 Daily Report: 1/42 success, 41 fail, latest_reason=missing_dependency
- Refresh V7 History Sample: 40/42 success, 2 fail, latest_reason=process_exit_zero

## Still Not Working Well On NAS

- Best Setups V4 Smoke: 6/6 failed, latest_reason=nonzero_exit
- Daily Learning Cycle: 37/37 failed, latest_reason=nonzero_exit
- Hist Probs Sample W1: 6/6 failed, latest_reason=nonzero_exit
- Hist Probs Sample W2: 6/6 failed, latest_reason=nonzero_exit
- Q1 Delta Ingest Smoke: 40/40 failed, latest_reason=nonzero_exit
- Q1 Delta Preflight: 6/6 failed, latest_reason=nonzero_exit
- QuantLab Boundary Audit: 6/6 failed, latest_reason=missing_quantlab_path
- Runtime Control Probe: 6/6 failed, latest_reason=nonzero_exit
- UI Contract Probe: 6/6 failed, latest_reason=nonzero_exit
- `best_setups_v4`: architecture still overloaded; smoke path is not yet a promote candidate.
- Production cutover remains blocked while `/dev/md0` stays full and `scheduler_safe_to_modify=false`.

## Central Report Map

- `docs/ops/nas-evidence-hub.md`
- `docs/ops/nas-solution-attempt-log.md`
- `docs/ops/nas-transfer-status.md`
- `docs/ops/nas-variant-catalog.md`
- `docs/ops/nas-runbook.md`
- `docs/ops/nas-status-2026-04-08.md`
- `docs/ops/nas-open-probes.md`
- `docs/ops/nas-migration-journal.md`
- `tmp/nas-benchmarks/nas-night-watch-latest.json`
- `tmp/nas-benchmarks/nas-night-watch-latest.md`
- `tmp/nas-benchmarks/nas-open-probes-latest.json`
- `tmp/nas-benchmarks/nas-open-probes-latest.md`
- `tmp/nas-benchmarks/nas-solution-matrix-latest.json`
- `tmp/nas-benchmarks/nas-solution-matrix-latest.md`
- `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
- `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`
- `tmp/nas-system-audit/<STAMP>/summary.json`
- `tmp/nas-system-audit/<STAMP>/summary.md`

## Answer To The Core Question

- Ja, auf der NAS sind heute Schritte nachweisbar möglich, die vorher nicht stabil belegt waren: `refresh_v7_history_from_eodhd`, `hist_probs`, `forecast_daily`, `universe_audit_sample`, sowie der 30-Minuten-Autopilot für Evidence-Runs.
- Nein, das MacBook ist noch nicht ersetzbar. Die wichtigsten verbleibenden Gründe sind `md0=100%`, `scheduler_safe_to_modify=false`, QuantLab-Hot-Path-Probleme, `daily_learning_cycle`, und die noch ungelöste `best_setups_v4`-Architektur.

