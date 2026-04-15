# NAS Evidence Hub

Generated at: 2026-04-12T13:46:18.645Z

## Current Verdict

- Production GO on NAS: false
- Current primary runtime: Mac
- Night-watch status: monitoring / nas_unreachable_retrying / remote_connected=false
- Native-matrix campaign: 20260410T041454Z / running
- Open-probe campaign: 20260412T131510Z / running / cycles=8 / runs=18 / failed=6
- Root filesystem: 1.5G / 2.3G (66%)

## Hard Blockers

- none

## Steps Now Proven On NAS

- `refresh_v7_history_from_eodhd` läuft auf der NAS jetzt als echter Probe-Run mit US+EU-Sample und History-Root-Normalisierung.
- `hist_probs` läuft auf der NAS jetzt stabil als Small-Scope- und konservativer Runtime-Pfad.
- `forecast_daily` läuft auf der NAS jetzt wiederholt erfolgreich als Day/Night-Probe.
- `stock_analyzer_universe_audit` ist auf der NAS als JSON/API-Sample-Audit nachweisbar lauffähig.
- Der 30-Minuten-Watcher hält Native-Matrix und Open-Probes automatisch am Leben und baut pro Zyklus neue Rollups.

## Recommended NAS Methods By Stage

| Stage | Recommended method | Why this is the current best NAS path | Evidence |
|---|---|---|---|
| stage1 | node512 | peak_rss=36.04 MB, avg_duration=4.20 s, swap_delta=-14.65 MB | 84/84 promote_candidate |
| stage2 | baseline_serial | peak_rss=74.48 MB, avg_duration=0.75 s, swap_delta=0.22 MB | 87/87 promote_candidate |
| stage3 | node512 | peak_rss=61.04 MB, avg_duration=1.93 s, swap_delta=-7.47 MB | 84/84 promote_candidate |
| stage4:scientific_summary | baseline_serial | peak_rss=454.57 MB, avg_duration=8.70 s, swap_delta=21.79 MB | 86/86 promote_candidate |

## Open-Probe Results

| Probe | Status | Runs | Avg duration (s) | Avg peak RSS (MB) | What it proves |
|---|---|---:|---:|---:|---|
| Best Setups V4 Smoke | verified_failure | 0/20 | 2288.74 | 694.13 | nonzero_exit; FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory … |
| Cutover Readiness Smoke | mixed_results | 16/20 | 368.82 | 677.50 | stable sample path |
| Daily Audit Report Smoke | verified_success | 20/20 | 367.69 | 688.55 | stable sample path |
| Daily Learning Cycle | verified_failure | 0/51 | 265.78 | 679.48 | nonzero_exit; [learning] Scientific: no snapshot and no summary file [learning] Stock Analyzer: no best-setups snapshot… |
| ETF Diagnostic Smoke | verified_success | 20/20 | 3.09 | 286.18 | stable sample path |
| Forecast Daily | verified_success | 52/52 | 213.87 | 646.86 | stable sample path |
| Fundamentals Sample | mixed_results | 1/56 | 109.19 | 66.04 | provider_chain_failed; |
| Hist Probs Sample | verified_success | 52/52 | 180.95 | 664.84 | stable sample path |
| Hist Probs Sample W1 | mixed_results | 1/20 | 1726.18 | 719.68 | stable sample path |
| Hist Probs Sample W2 | mixed_results | 1/20 | 1258.35 | 698.02 | stable sample path |
| Q1 Delta Ingest Smoke | verified_failure | 0/54 | 0.50 | 8.59 | nonzero_exit; FATAL: pyarrow required: No module named 'pyarrow' |
| Q1 Delta Preflight | verified_failure | 0/20 | 0.92 | 41.42 | nonzero_exit; |
| QuantLab Boundary Audit | verified_failure | 0/20 | 0.59 | 28.93 | missing_quantlab_path; |
| QuantLab V4 Daily Report | mixed_results | 1/56 | 9.12 | 309.44 | missing_dependency; Traceback (most recent call last): File "/volume1/homes/neoboy/Dev/rubikvault-site/scripts/quantlab… |
| Refresh V7 History Sample | mixed_results | 54/56 | 7.86 | 20.69 | stable sample path |
| Runtime Control Probe | verified_failure | 0/20 | 0.85 | 30.64 | nonzero_exit; |
| UI Contract Probe | verified_failure | 0/20 | 0.63 | 35.70 | nonzero_exit; |
| Universe Audit Sample | verified_success | 52/52 | 1.20 | 48.54 | stable sample path |

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

- Daily Audit Report Smoke: 20/20 successful, latest=success, avg_peak_rss_mb=688.55
- ETF Diagnostic Smoke: 20/20 successful, latest=success, avg_peak_rss_mb=286.18
- Forecast Daily: 52/52 successful, latest=success, avg_peak_rss_mb=646.86
- Hist Probs Sample: 52/52 successful, latest=success, avg_peak_rss_mb=664.84
- Universe Audit Sample: 52/52 successful, latest=success, avg_peak_rss_mb=48.54
- stage1: recommended variant is `node512` with 84/84 successful native-matrix runs.
- stage2: recommended variant is `baseline_serial` with 87/87 successful native-matrix runs.
- stage3: recommended variant is `node512` with 84/84 successful native-matrix runs.
- stage4:scientific_summary: recommended variant is `baseline_serial` with 86/86 successful native-matrix runs.

## Mixed Or Partial Solutions

- Cutover Readiness Smoke: 16/20 success, 4 fail, latest_reason=process_exit_zero
- Fundamentals Sample: 1/56 success, 55 fail, latest_reason=provider_chain_failed
- Hist Probs Sample W1: 1/20 success, 19 fail, latest_reason=process_exit_zero
- Hist Probs Sample W2: 1/20 success, 19 fail, latest_reason=process_exit_zero
- QuantLab V4 Daily Report: 1/56 success, 55 fail, latest_reason=missing_dependency
- Refresh V7 History Sample: 54/56 success, 2 fail, latest_reason=process_exit_zero

## Still Not Working Well On NAS

- Best Setups V4 Smoke: 20/20 failed, latest_reason=nonzero_exit
- Daily Learning Cycle: 51/51 failed, latest_reason=nonzero_exit
- Q1 Delta Ingest Smoke: 54/54 failed, latest_reason=nonzero_exit
- Q1 Delta Preflight: 20/20 failed, latest_reason=nonzero_exit
- QuantLab Boundary Audit: 20/20 failed, latest_reason=missing_quantlab_path
- Runtime Control Probe: 20/20 failed, latest_reason=nonzero_exit
- UI Contract Probe: 20/20 failed, latest_reason=nonzero_exit
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

