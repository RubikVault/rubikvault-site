# Quant v4 Runbooks

Diese Runbooks beschreiben den aktuellen lokalen Betriebsstand des Quant-Lab-Systems auf dem Weg zu v4.0.

## Endziel v4.0 (klar definiert)

Das Quant-System ist erst dann v4.0-fertig, wenn gleichzeitig erfüllt ist:

1. Data-Truth ist stabil provider-raw geführt (Corp-Actions + Delistings), Recon-Warnungen zu diesen Pfaden sind 0.
2. Stage B liefert über eine As-of-Serie wiederholt strict survivors (nicht nur Einzelfall).
3. Registry-Ladder ist in echten Zustandsübergängen robust (live_hold -> shadow -> retired) und slot-konsistent.
4. Portfolio/Order-Pfad ist policy-aware, produziert konsistente Orders (oder sauber begründetes No-Order) ohne Scheinalarme.
5. Final Gates laufen im release-strict Profil grün.

## Aktueller Fokus

1. Stabiler lokaler Betrieb der Tages- und Nachtruns im sinnvollen Panel-Bereich
2. Data-Truth im Backbone dauerhaft gruen halten
3. Stage B ueber As-of-Serie stabilisieren (nicht nur Einzelpunkt)
4. Registry/Governance unter echten Uebergaengen soak-testen
5. Portfolio/Order + `release-strict` auf aktuellem As-of-Stand mehrfach gruen bekommen

## Wichtige Skripte

- Operator Start: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`
- Operator Status: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py`
- Supervised runner: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_supervised_safe.sh`
- Watchdog: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/watch_overnight_q1_job.py`

## Quant root

- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab`

## Letzter belastbarer Stand

- Data-Truth Backbone (Provider-Raw Corp/Delistings) erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772758010/q1_daily_data_backbone_run_report.json`
- Reconciliation mit provider-raw clean erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T005110Z/q1_reconciliation_report.json`
- Vollständiger Stage-A -> Stage-B -> Registry -> Portfolio -> Redflags -> Final-Gates Lauf erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772759069/q1_panel_stagea_daily_run_status.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772759071/q1_v4_final_gate_matrix_report.json`
- Lokaler Kontrolllauf nach Main-Push (2026-03-06) erfolgreich:
  - Stage-B: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-03-05/stage_b_q1_run_report.json`
  - Registry: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-03-05/q1_registry_update_report.json`
  - Portfolio: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772824059/q1_portfolio_risk_execution_report.json`
  - Redflags: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-06.json`
  - v4-Gates: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772825097/q1_v4_final_gate_matrix_report.json`
- Neuer Quant-Block (2026-03-06/07) erfolgreich:
  - Data-Truth Backbone (hard mode): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772840051/q1_daily_data_backbone_run_report.json`
  - Reconciliation (provider-raw checks clean): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T233650Z/q1_reconciliation_report.json`
  - Stage-B As-of Stability Report: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
  - Registry (latest): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-03-05/q1_registry_update_report.json`
  - Portfolio (rebalance/order path): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772841476/q1_portfolio_risk_execution_report.json`
  - Redflags (latest): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-07.json`
  - Final Gates (release-strict profile): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772841868/q1_v4_final_gate_matrix_report.json`
- Night-Run Status:
  - Abgeschlossen (18/18, 0 failed): `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_safe10h_20260307_011832/state.json`
  - Lessons-Learned-Failrun (alter Mini-Panel-Stand, nicht mehr Zielprofil):
    - Job: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260308_night1/state.json`
    - Ergebnis: `done=0`, `failed=3`, `stopped_due_to_consecutive_failures=true`
  - Neuer gehaerteter Night-Startpfad lokal validiert:
    - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_preflight_probe_20260308_b/q1_night_preflight_report.json`

- Safe-Day-Run erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_150852`
- Safe-Day-Run erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_160855`
- Safe-Day-Run erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_171444`
- Data-Truth-Backbone erfolgreich:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772636392/q1_daily_data_backbone_run_report.json`
- Aktueller materialisierter Snapshot mit Contract-/TRI-Layern:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots/snapshot_id=2026-02-26_670417f6fae7_q1step2bars`
- Aktualisierte Stage-B-/Registry-/Portfolio-/Redflag-Kette:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-26/stage_b_q1_run_report.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-26/q1_registry_update_report.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772722037/q1_portfolio_risk_execution_report.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-05.json`

## Aktuelle Kurzlage

- Operator-/Night-Profile sind jetzt wieder sinnvoll gehaertet:
  - `top-liquid-list=2500,3500,5000`
  - `panel_max_assets=5000`
  - effektive Night-Task-Regel: `panel_max_assets = max(requested_panel_max_assets, top_liquid_n)`; `0` darf nicht mehr zu Vollpanel werden
  - `threads_cap=1`
  - `oom_downshift_min_top_liquid=2500`
  - Night-Preflight mit realistischem Probe-Lookback ist gruen
  - Night-Preflight blockt jetzt stale Rohdaten fuer `STOCK,ETF` hart vor dem Start
- Reconciliation ist grün:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205411Z/q1_reconciliation_report.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205412Z/q1_reconciliation_report.json`
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205414Z/q1_reconciliation_report.json`
- Stage B wurde im CPCV-feasible-min methodisch gehärtet:
  - `cpcv_light_effective_paths_required` ist gegen `combos_effective_total` gecappt
  - `cpcv_light_paths_total_required` ist gegen `paths_total` gecappt
  - `cpcv_light_effective_path_ratio_required` ist im feasible-min Modus machbarkeitsgekappt
- Stage B schreibt jetzt zusätzlich `near_pass_candidates` mit quantitativen Gap-Komponenten je Gate.
- Stage B hat neue CPCV-Integritätsgates:
  - `g_cpcv_light_combos_considered`
  - `g_cpcv_light_no_fallback_path`
- Registry hat jetzt echte Champion-Slots:
  - `live`, `shadow`, `retired` (+ `default` als Kompatibilitätsalias zu `live`)
- Registry-Ladder ist sichtbar im echten Lauf:
  - aktueller Lauf bleibt `live` (kein Promotion-Fall, Champion bereits Top-Survivor)
- Portfolio ist jetzt policy-aware und shadow-fallback-fähig statt equal-weight/blind
- Portfolio liest Registry jetzt slot-basiert mit Fallback-Reihenfolge:
  - `live -> default -> shadow -> retired`
- Portfolio nutzt Registry-Slots jetzt report-first (immutable `champion_slots`) mit DB nur als Fallback; dadurch keine zeitlichen Slot-Mismatches zwischen Report und DB-Stand.
- Aktueller Stage-B-Serienstatus (As-of-Stabilität):
  - `strict_positive_ratio_all=0.3` (3/10 As-of-Punkte mit `strict_pass_total > 0`)
  - positive As-of-Punkte aktuell:
    - `2026-02-17` (`strict_pass_total=10`, `survivors_B_q1_total=6`)
    - `2026-02-20` (`strict_pass_total=9`, `survivors_B_q1_total=6`)
    - `2026-03-05` (`strict_pass_total=1`, `survivors_B_q1_total=1`)
  - Bedeutung:
    - Stage-B ist technisch belastbar und auditierbar.
    - Der Hauptblocker fuer 100% v4.0 bleibt jetzt die fachliche Stabilitaet der strict survivors ueber mehrere As-of-Punkte.
- Final-Gates (release-strict) sind für die konsistente 2026-02-20-Kette aktuell grün:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772923502/q1_v4_final_gate_matrix_report.json`
  - `ok=true`
- Final-Gates (release-strict) sind nach zusätzlicher Registry->Portfolio-Policy-Kopplung ebenfalls grün:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772926610/q1_v4_final_gate_matrix_report.json`
  - `ok=true` inkl. `portfolio_registry_policy_alignment=true`
- Offene Qualitaetsblocker bis 100% v4.0:
  - Stage-B strict survivors ueber Serie stabilisieren
  - Registry-Ladder + Portfolio unter echten Uebergaengen soak-testen
  - `release-strict` mehrfach auf aktueller As-of-Serie gruen bekommen
  - Night-Runner jetzt mit dem gehaerteten Profil in echten Laeufen erneut bestaetigen

## Technische Lage nach Source-Truth-Diagnose (2026-03-08)

- Primärblocker ist aktuell nicht mehr “Stage-B an sich”, sondern die Data-Freshness-/Publish-Truth-Kette vor Phase A.
- Verifizierter Ist-Zustand:
  - Raw Bars `STOCK,ETF` aktuell nur bis `2026-02-25`
  - öffentliches v7-Run-Truth defekt:
    - `public/data/universe/v7/reports/run_status.json -> exit_code=90`
    - `public/data/universe/v7/reports/history_touch_report.json` fehlt
- Konsequenz:
  - Der Backbone wurde auf fail-closed umgestellt.
  - Stale Rohdaten / fehlender Touch-Report / produktiver No-Op-Delta stoppen den Lauf jetzt hart vor Delta/Snapshot/Stage-A/Stage-B.
- Verifizierter Probe-Report:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1773047048/q1_daily_data_backbone_run_report.json`
  - `exit_code=96`
  - `threshold_failures`:
    - `FAIL_RAW_BARS_REQUIRED_TYPES_STALE`
    - `FAIL_PUBLIC_V7_HISTORY_TOUCH_REPORT_MISSING`
    - `FAIL_PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS`

Das ist beabsichtigt: lieber harter, transparenter Data-Truth-Abbruch als alte Snapshots in Night-Sweeps.

## Runbook-Dateien

- `02-current-state-and-implementation-log.md`
- `04-overnight-ops-profile.md`
- `05-low-reasoning-operator-handoff.md`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/web-features-v2-non-breaking.md` (additiver Web-v2 Shadow-Pfad für Forecast/Scientific/Elliott)
