# Quant v4 Runbooks

Diese Runbooks beschreiben den aktuellen lokalen Betriebsstand des Quant-Lab-Systems auf dem Weg zu v4.0.

## Aktueller Fokus

1. Stabiler lokaler Betrieb der Tages- und Nachtruns
2. Phase-A Backbone mit Delta -> Snapshot -> Feature Update stabil halten
3. Data-Truth im Backbone belastbar machen
4. Stage B schrittweise ent-proxyen
5. Registry/Governance danach weiterziehen

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

- Operator-Safe-Runs sind wieder stabil:
  - `panel_max_assets=2000`
  - `threads_cap=1`
  - drei grüne Day-Runs in Folge
- Reconciliation ist grün:
  - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260305T144719Z/q1_reconciliation_report.json`
- Stage B ist methodisch strenger und der strukturelle CPCV-Light-Blocker ist entfernt:
  - `cpcv_light_combos_effective_total` ist nicht mehr künstlich `0`
  - aktuelle Lage: `strict_pass_total=2`, `survivors_B_q1_total=2`
  - Gate-Fails sind jetzt substanziell (v. a. strikte PSR/DSR + IC-tail), nicht mehr durch CPCV-Policy-Artefakte
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

## Runbook-Dateien

- `02-current-state-and-implementation-log.md`
- `04-overnight-ops-profile.md`
- `05-low-reasoning-operator-handoff.md`
