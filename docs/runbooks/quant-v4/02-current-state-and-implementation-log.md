# Current State And Implementation Log

Stand: 2026-03-10

## Kurzstatus

- Quant v4.0 insgesamt: ca. 76%
- Q1 Backbone lokal vorhanden und mit vielen Artefakten belegt
- Aktueller Hauptblocker ist fachlich weiter Stage B ueber die As-of-Serie, operativ aber wieder klar getrennt von Freshness-/Night-Ops-Fehlern
- Neuer belastbarer Fortschritt:
  - Data-Truth-Contract-Layer greifen wieder auf echte verfügbare Rohquellen zu
  - Stage-B-/Registry-/Portfolio-/Redflag-Kette ist jetzt governance-aware statt blind
  - Reconciliation ist grün und Contract-/TRI-Invariants sind im Kontrollpfad belastbar
  - taegliche Delta-/Snapshot-/Feature-Kette ist heute lokal bis Reconciliation erfolgreich aktualisiert
  - lokaler Day-Operator laeuft wieder mit gesundem RSS-Profil

## Update 2026-03-10 (fresh raw chain + storage cleanup + operator fix)

1. Der heutige Raw-/Delta-Pfad ist wieder aktuell.
   - Heutiger gezielter EODHD-Refresh:
     - `assets_requested=120`
     - `assets_changed=119`
     - `packs_changed=32`
   - Raw-Bars fuer die benoetigten Typen sind jetzt wieder frisch:
     - `stock -> 2026-03-10`
     - `etf -> 2026-03-10`

2. Die inkrementelle Tageskette ist lokal gruen bis Reconciliation.
   - Delta:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_history_touch_delta_20260310_fix1/manifest.json`
   - Snapshot increment:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1snapinc_20260310T161508Z/q1_incremental_snapshot_update_run_status.json`
   - Feature increment:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1inc/asof_date=2026-02-26/feature_manifest.delta_2026-03-10.json`
   - Reconciliation:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260310T161906Z/q1_reconciliation_report.json`

3. Die lokale Ordnerstruktur wurde in Runtime vs. Cold Archive getrennt.
   - Aktiver Runtime-Kern:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/raw/provider=EODHD`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_overnight`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1inc`
     - `/Users/michaelpuchowezki/QuantLabHot/storage/universe-v7-history/history`
   - Cold-Archive-Staging fuer externe Sicherung:
     - `/Volumes/My Passport/EODHD-History/from_quantlabhot/quantlab_cold_2026-03-10`
   - Separiertes Desktop-Roharchiv:
     - `/Volumes/My Passport/EODHD-History/from_desktop/EODHD_Data`
   - Keep-vs-Archive-Begruendung:
     - `/Volumes/My Passport/EODHD-History/from_quantlabhot/quantlab_cold_2026-03-10/manifests/KEEP_VS_ARCHIVE.md`
   - Move-Manifest:
     - `/Volumes/My Passport/EODHD-History/manifests/MOVED_ITEMS.md`

4. Der lokale Day-Operator wurde auf den realen Mac-Stand angepasst.
   - Disk-Guard lokal:
     - `min_free_disk_gb=12`
   - Day-RSS-Profil lokal:
     - `max_rss_gib=8.3`
   - Bisheriges Ergebnis:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260310_172652/state.json`
     - `p90/top2500 -> ok`
     - `p90/top3500 -> ok`
   - Bedeutung:
     - der heutige Day-Run ist nicht mehr an einem zu engen lokalen RSS-Limit gescheitert.

5. Offene Blocker bis 100% v4.0 bleiben unveraendert fachlich:
   - Stage-B strict survivors ueber mehrere As-of-Punkte stabilisieren
   - Registry-Ladder + Portfolio unter echten Zustandsuebergaengen soak-testen
   - `release-strict` mehrfach auf der aktuellen As-of-Serie gruen bestaetigen
   - Night-/Day-Automation als lokaler Keeper in `Local`-Ausfuehrungsmodus verankern

## Update 2026-03-10 (resume-lock fix + zero-strict diagnostics + release-strict repeat)

1. Der Resume-Startpfad fuer laufende Day-/Night-Jobs ist jetzt fail-safe gegen Watchdog-Sturm.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`
   - Fix:
     - Job-Lock und Named-Lock werden jetzt vor dem teuren Task-Build gesetzt.
   - Bedeutung:
     - der Watchdog startet bei schwerem Polars-Task-Build nicht mehr mehrere konkurrierende Resume-Runner parallel.

2. Das lokale Safe-Profil wurde weiter auf den realen Mac-Betrieb gehärtet.
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_supervised_safe.sh`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_night14_with_watchdog.sh`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`
   - Lokale Defaults:
     - `min_free_disk_gb=12`
     - `max_load_per_core=8.0`
     - `max_rss_gib=8.3`
   - Grund:
     - `threads_cap=1`, `nice=17` und RSS-Cap sind die echten Safety-Limits; der alte Load-Guard war fuer diesen Mac zu konservativ und blockierte gesunde Jobs.

3. Zero-Strict-As-ofs sind jetzt explizit diagnostizierbar.
   - Neue Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/report_stageb_zero_strict_near_pass_q1.py`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/zero_strict_near_pass_latest.json`
   - Aktueller Befund:
     - `zero_strict_asof_total=6`
     - `zero_strict_with_near_pass_total=6`
     - Top-Kandidaten pro As-of sind jetzt direkt sichtbar, zum Beispiel:
       - `2026-02-18 -> tsmom_trend_quality`
       - `2026-02-26 -> csmom_20_trend_liq`

4. Stage-B-Top-Level-Reports tragen Near-Pass-Diagnostik jetzt mit.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
   - Neu im Report:
     - `failed_examples`
     - `near_pass_candidates`
   - Bedeutung:
     - kuenftige Stage-B-Runs muessen fuer Near-Pass-Auswertung nicht mehr nur indirekt ueber `artifacts/stage_b_light_report.json` gelesen werden.

5. Die aktuell beste release-strict-Kette wurde erneut bestaetigt.
   - Referenzkette:
     - `phasea -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1773023737/q1_daily_data_backbone_run_report.json`
     - `stagea -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=cheapgateA_tsplits_2026-02-20/outputs/cheap_gate_A_time_splits_report.json`
     - `stageb -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-20/stage_b_q1_run_report.json`
     - `registry -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-20/q1_registry_update_report.json`
     - `portfolio -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772922466/q1_portfolio_risk_execution_report.json`
     - `redflags -> /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-02-20.json`
   - Neue gruene Final-Gates:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1773164843/q1_v4_final_gate_matrix_report.json`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1773164871/q1_v4_final_gate_matrix_report.json`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1773164902/q1_v4_final_gate_matrix_report.json`
   - Seriennachweis:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/release_strict/repeat_series_2026-03-10.json`

6. Post-Day-Refresh fuer Stage-B-Berichte ist jetzt automatisiert angestoßen.
   - Neue Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/wait_for_day_job_then_refresh_stageb_q1.py`
   - Laufender Hintergrundprozess:
     - wartet auf Abschluss von `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260310_172652`
     - refreshed danach automatisch:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/zero_strict_near_pass_latest.json`

## Update 2026-03-08 (raw-bars preflight + safe panel cap)

1. Ein zweiter Night-Ops-Fehler wurde jetzt hart geschlossen.
   - Bisher konnte der Safe-Sweep trotz konservativem Label intern weiter mit `panel_max_assets=0` in den Task-Command laufen.
   - Dadurch landeten einzelne Night-Tasks wieder auf dem Full-Panel-/Full-Scan-Pfad und starben als `rc=137` / `orphan`, obwohl `top_liquid_n` niedrig wirkte.

2. Der Overnight-Sweep erzwingt jetzt einen echten Safe-Cap.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`
   - Neue wirksame Regel:
     - `effective_panel_max_assets = max(requested_panel_max_assets, effective_top_liquid)`
     - falls `requested_panel_max_assets <= 0`, wird stattdessen direkt `effective_top_liquid` verwendet
   - Wirkung:
     - der Safe-Runner kann nicht mehr versehentlich auf Vollpanel kippen, nur weil `panel_max_assets=0` in älteren Job-Konfigurationen stand.

3. Night-Preflight blockt jetzt stale Rohdaten fuer Phase-A-Laeufe vor dem Start.
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_night_preflight_q1.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_night_preflight.py`
   - Neue harte Regel:
     - wenn fuer die benoetigten Asset-Typen (`STOCK,ETF`) die Raw-Bars-Rohingests zu alt sind, faellt der Check `raw_bars_freshness` im Preflight auf `false`.
   - Effekt:
     - Phase-A-Night-Runs mit stale Rohdaten starten nicht mehr „trotz Warnung“, sondern sauber mit Preflight-Fehler.

4. Lessons learned aus dem aktuellen Night-Run sind jetzt operationalisiert.
   - Der Stand `pending=297, done=0, failed=3, stopped_due_to_consecutive_failures=true` war kein neuer Quant-Methodik-Fehler, sondern eine Mischung aus:
     - altem `panel_max_assets=0`-Verhalten in den Night-Tasks
     - stale-orphan-/OOM-Kaskaden
     - und veralteten Rohdaten (`RAW_BARS_REQUIRED_TYPES_STALE`)
   - Ab jetzt sind diese beiden Betriebsfehler vor dem eigentlichen Quant-Pfad abgefangen.

## Update 2026-03-08 (Night profile hardened + preflight validated)

1. Der wichtigste Night-Ops-Fehler wurde behoben:
   - Die Safe-/Night-Wrapper liefen noch mit zu kleinen Mini-Panels (`top-liquid-list 400,600,800` bzw. `500,700,900`).
   - Das erzeugte nachts oft sinnlose Stage-A-Null-Survivor-Laeufe oder stoppte Jobs nach wenigen Fehlschlaegen, ohne fuer v4 echte Qualifikationssignale zu liefern.

2. Wrapper jetzt auf sinnvollen Mindestbereich gehoben.
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_night_block_safe.sh`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_night14_with_watchdog.sh`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_night_preflight.py`
   - Neue Safe-Defaults:
     - `top-liquid-list=2500,3500,5000`
     - `panel_max_assets=5000` (Operator/Night wrapper)
     - `oom_downshift_min_top_liquid=2500`
     - Day-Run `asof_dates_count=2`
     - Night-Run `asof_dates_count=4`
     - 14h-Night-Watchdog `asof_dates_count=6`
     - Preflight-Probe jetzt mit `lookback_calendar_days=420`, `top_liquid_n=2500`, `panel_max_assets=3000`, `min_bars=200`

3. Night-Preflight ist nach der Haertung jetzt wieder realistisch und gruen.
   - Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_preflight_probe_20260308_b/q1_night_preflight_report.json`
   - Ergebnis:
     - `ok=true`
     - `micro_probe_ok=true`
   - Probe-Run:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772988174/q1_panel_stagea_daily_run_status.json`
     - `survivors_A_total=15`
     - Stage B/Registry liefen technisch sauber mit, Redflags meldeten erwartbar `kill_switch=true` als Warn-/Governance-Zustand, nicht als Night-Ops-Fehler.

4. Stage-B-Stabilitaet ist neu konsolidiert und etwas besser als zuvor gedacht, aber weiterhin der Hauptqualitaetsblocker.
   - Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
   - Aktuell:
     - `asof_points_total=10`
     - `asof_points_ok_total=3`
     - `strict_positive_ratio_all=0.3`
     - `strict_pass_avg_all=2.0`
   - Interpretation:
     - Night-/Operator-Profil ist jetzt wieder in einem sinnvollen Bereich.
     - Der offene Blocker ist jetzt klar fachlich:
       - Stage B liefert nur auf 3/10 As-of-Punkten strict positive survivors.
       - Damit sind Stage-B-/Registry-/Portfolio-Soak und `release-strict` auf aktueller As-of-Serie noch nicht final abgenommen.

5. Wichtige operative Einordnung fuer den alten Job:
   - Problemjob:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260308_night1/state.json`
   - Ergebnislage:
     - `pending=297`
     - `done=0`
     - `failed=3`
     - `stopped_due_to_consecutive_failures=true`
   - Effektive Root Cause:
     - kein produktiver v4-Fehler, sondern unbrauchbares altes Mini-Panel-Profil plus Resume-/OOM-Orphan-Kaskade.
   - Diese Lage gilt ab jetzt als Lessons-Learned-Basis, nicht als empfohlenes Night-Profil.

## Update 2026-03-07 (next block complete + new long night sweep)

### Ergänzung 2026-03-07 (Registry-Ladder/Portfolio-Kopplung weiter gehärtet)

1. Orchestrator -> Portfolio koppelt jetzt harte Governance-Modi explizit durch.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
   - Neu:
     - `--portfolio-no-rebalance-orders-failure-mode`
     - `--portfolio-registry-slot-consistency-failure-mode`
   - In `--v4-final-profile` wird beides deterministisch auf `hard` gezogen.

2. Portfolio v4-final-profile erzwingt jetzt harte Slot-/Order-Policy statt Soft-Defaults.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Neu:
     - `registry_slot_consistency_failure_mode=hard` im Final-Profil
     - `no_rebalance_orders_failure_mode=hard` im Final-Profil

3. Final-Gates prüfen zusätzlich die echte Registry->Portfolio-Policy-Ausrichtung.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_v4_final_gate_matrix_q1.py`
   - Neuer Check:
     - `portfolio_registry_policy_alignment`
   - Semantik:
     - Wenn Registry defensive Zustände verlangt (`live_hold`/Freeze/hard-gate-fail), muss Portfolio in einem defensiven Allocation-Mode laufen.

4. Verifizierter Lauf nach Anpassung (lokal):
   - Portfolio:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772926521/q1_portfolio_risk_execution_report.json`
     - `ok=true`
   - Final Gates (release-strict):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772926610/q1_v4_final_gate_matrix_report.json`
     - `ok=true`, inkl. `portfolio_registry_policy_alignment=true`

0. Web-Feature-v2 Shadow-Pfad (Forecast/Scientific/Elliott) additiv eingebaut, non-breaking.
   - Neuer Endpoint:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/stock-insights-v2.js`
   - Frontend-Fallback-Logik:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-features.js`
     - Default bleibt v1 (`/api/stock-insights`), v2 nur bei explizitem Flag.
     - Bei invalidem v2-Contract sofortiger Rückfall auf v1.
   - v2-Index-Builder:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/build-features-v2.mjs`
   - Local Safety Contract dokumentiert:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/web-features-v2-non-breaking.md`
   - Neuer report-first Paritäts-Checker:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/validate/stock-insights-v2-parity.mjs`
     - NPM: `verify:features:v2:parity`

1. Data-Truth-Härtung über Backbone + Recon abgeschlossen (Warnungen 0 im Zielpfad).
   - Backbone:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772840051/q1_daily_data_backbone_run_report.json`
   - Recon:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T233650Z/q1_reconciliation_report.json`
   - Ergebnis:
     - `warnings=[]`
     - `contract_corp_actions_provider_raw_required_ok=true`
     - `contract_delistings_provider_raw_required_ok=true`
     - `contract_corp_actions_cap_not_hit_or_allowed=true`
     - `contract_corp_actions_raw_empty_fallback_allowed=true`

2. Stage-B über As-of-Serie ausgewertet und Stabilitätsartefakt erzeugt.
   - Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
   - Ergebnis:
     - `asof_points_total=10`
     - `asof_points_ok_total=10`
     - `strict_positive_runs_total=2`
     - `strict_positive_ratio=0.2`
   - Interpretation:
     - Methodik ist stabil/auditierbar, strict-survivor-Rate muss weiter hoch.

3. Registry-Ladder und Portfolio-Pfad weiter gehärtet.
   - Registry:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-03-05/q1_registry_update_report.json`
   - Portfolio:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772841476/q1_portfolio_risk_execution_report.json`
   - Ergebnis:
     - slot-konsistent
     - no-order nur noch als Warnung/Fail, wenn Rebalance-Deltas real vorhanden sind

4. Final-Gates im release-strict Profil grün.
   - Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772841868/q1_v4_final_gate_matrix_report.json`
   - Ergebnis:
     - `ok=true`
     - `checks_failed_total=0`
     - Portfolio-Slot-Konsistenz als eigener Gate-Check aktiv

5. Night-Run-Status.
   - erster 10h-safe Sweep sauber abgeschlossen:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_safe10h_20260307_011832/state.json`
     - `done=18 failed=0`
   - neuer Supervised-Long-Sweep aktiv (Watchdog + Guardrails):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260307_020526/state.json`
     - `tasks=300` (`asof_dates_count=20`, `top_liquid=400..1200`, `panel_days=60/90/120`)

## Update 2026-03-06 (night handoff ready)

1. Corp-Actions Raw-Pfad ist auf echten Provider-Raw-Betrieb gebracht.
   - Backbone-Run:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772758010/q1_daily_data_backbone_run_report.json`
   - Reconciliation-Run:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T005110Z/q1_reconciliation_report.json`
   - Verifiziert:
     - `corp_actions_source_mode = provider_raw_corp_actions`
     - `contract_corp_actions_provider_raw_required_ok = true`
     - `contract_corp_actions_cap_not_hit_or_allowed = true`
     - `contract_corp_actions_raw_empty_fallback_allowed = true`
     - keine `DERIVED_CAP_HIT` / `RAW_EMPTY_FALLBACK`-Warnungen

2. Stage-B wurde weiter methodisch gehärtet, aber auf daten-feasible Fold-Geometrie gefahren.
   - Ursache:
     - aktueller Panel-Stand hatte nur `26` asof-dates, daher waren Default-Strict-Folds mit Bedarf `38` nicht ausführbar.
   - Sauberer Lauf (konsistente As-of-Kette):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772759069/q1_panel_stagea_daily_run_status.json`
   - Verifiziert:
     - Stage A ok
     - Stage B ok
     - `stage_b_candidates_strict_pass_total = 1`

3. Registry-Ladder und Portfolio sind mit der Stage-B-Lage synchronisiert.
   - Registry-Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-16/q1_registry_update_report.json`
   - Portfolio-Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772759071/q1_portfolio_risk_execution_report.json`
   - Verifiziert:
     - Slot-/State-gekoppelte Auswahl aktiv
     - family-aware exposure/caps im Portfolio-Report enthalten

4. Finale v4.0 Gate-Matrix wurde erfolgreich ausgeführt.
   - Gate-Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772759071/q1_v4_final_gate_matrix_report.json`
   - Verifiziert:
     - `ok = true`
     - `checks_failed_total = 0`
     - `provider_raw_clean = true`
     - `stageb_strict_pass_positive = true`

5. Wichtige operative Lessons (heute bestätigt)
   - `snapshot-id=latest` ist in der Stage-A-Pipeline kein gültiger Snapshot-Pfad.
     - Für stabile Läufe immer explizite Snapshot-ID nutzen:
       - `2026-02-26_670417f6fae7_q1step2bars`
   - `asof-end-date` muss zu tatsächlich vorhandenen Feature-As-ofs passen.
     - Für den aktuellen Stand ist `2026-02-16` der belastbare Endpunkt.

6. Night-Run-Stabilität behoben (`rc=73`-Loop-Fix).
   - Primärer Guard (tracked):
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
     - Verhalten:
       - Wenn `--skip-run-portfolio-q1` aktiv ist, wird der v4-final-gate-Step mit `portfolio_step_disabled` deterministisch übersprungen.
   - Zusätzlich im lokalen Operator-Runner:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_overnight_q1_training_sweep.py`
   - Ursache:
     - Safe-Profile laufen mit `--skip-run-portfolio-q1`, der Runner hat aber bislang den Final-Gate-Call nicht deaktiviert.
     - Die Final-Gate-Matrix fordert einen Portfolio-Report und erzeugte deshalb wiederholt `exit_code=73`.
   - Fix:
     - Night-Runner gibt jetzt deterministisch `--skip-run-v4-final-gate-matrix` mit, sobald kein Portfolio-Step läuft.
     - Selbst wenn ein Runner das nicht übergibt, verhindert der Stage-A-Guard denselben Fehler.
   - Verifizierung:
     - Driver-Log zeigt seit Fix dieselben Tasks mit `rc=0` (vorher `rc=73`), z. B. Job:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_safe10h_20260306_022844/logs/driver.log`

## Update 2026-03-06 (morning continuation)

1. Stage-B wurde weiter ent-proxied, ohne Gate-Softening, über adaptive Input-Scope.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
   - Neu:
     - `--stageb-adaptive-input-scope` (default: on)
     - `--stageb-min-survivors-a-for-strict-scope` (default: 32)
   - Verhalten:
     - Wenn `survivors_A` zu klein ist, wird nur der Input-Scope auf `all_candidates` erweitert.
     - Strict/CPCV/PSR/DSR Gates bleiben unverändert.
   - Verifizierter Lauf:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-03-05/stage_b_q1_run_report.json`
   - Verifizierter Zustand:
     - `stageb_input_scope_requested=survivors_a`
     - `stageb_input_scope_effective=all_candidates`
     - `strict_pass_total=1`
     - `survivors_B_q1_total=1`

2. Registry-Ladder lief auf dem neuen Stage-B-Run sauber weiter.
   - Verifizierter Lauf:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-03-05/q1_registry_update_report.json`
   - Verifizierter Zustand:
     - `decision=PROMOTE`
     - Slot-State und Candidate-State-Events konsistent geschrieben

3. Portfolio wurde final enger an Registry-Slots gekoppelt.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Neu:
     - `--registry-slot-consistency-failure-mode {off|warn|hard}` (default: `warn`, im `v4-final-profile` nicht `off`)
     - expliziter Abgleich: Registry-Slot -> ausgewählter Candidate (`single` + `slot_blend`)
     - Konsistenz-Details im Report unter `governance.slot_consistency`
   - Verifizierter Lauf:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772781732/q1_portfolio_risk_execution_report.json`
   - Verifizierter Zustand:
     - `governance.slot_consistency.checked=true`
     - keine Slot-Mismatches

4. Data-Truth Backbone wurde für Corp-Actions-Coverage-Top-up erweitert.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`
   - Neu:
     - automatische Top-up-Reihenfolge bei `CONTRACT_CORP_ACTIONS_COVERAGE_LOW`:
       - corp-actions ingest -> contract layers -> tri layers -> recon (iterativ)
     - neue Flags:
       - `--corp-actions-coverage-topup-enabled`
       - `--corp-actions-coverage-topup-attempts`
       - `--corp-actions-coverage-topup-assets-step`
       - `--corp-actions-coverage-topup-calls-step`
     - in `v4-final-profile`: unresolved coverage-low nach Top-up wird als Failure markiert.
   - Hinweis:
     - Vollvalidierung dieses Top-up-Pfads braucht einen längeren API-Lauf; der strukturelle Pfad ist implementiert, der schnelle lokale Smoke-Run lief ohne Corp-Actions-Ingest grün.
   - Zusätzlich verifiziert (ohne Threshold-Softening, lokal):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T081033Z/q1_reconciliation_report.json`
     - `CONTRACT_CORP_ACTIONS_COVERAGE_LOW` ist dort **nicht** mehr vorhanden (`is_low=false`).
     - Aktuell verbleibende Corp-Actions-Warnungen in diesem Lauf:
       - `CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT`
       - `CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK`

## Update 2026-03-05 (afternoon)

1. Stage-B wurde methodisch weiter ent-proxied (ohne Gate-Softening).
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`
   - Neu im Strict-Pfad:
     - `cpcv_light_min_combos_considered`
     - `cpcv_light_forbid_fallback_path`
     - harte Gates:
       - `g_cpcv_light_combos_considered`
       - `g_cpcv_light_no_fallback_path`
   - CPCV-Light fallback auf `mean(path)` bleibt nur noch explizit steuerbar; im Strict-Default ist er untersagt.
   - `near_pass_candidates` enthält jetzt zusätzlich:
     - `cpcv_combos_considered_gap`
     - `cpcv_fallback_path_gap`

2. Stage-B-Orchestrator reicht die neuen CPCV-Integritätsoptionen durch.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
   - Neue Pass-through Flags:
     - `--cpcv-light-min-combos-considered`
     - `--cpcv-light-forbid-fallback-path|--allow-cpcv-light-fallback-path`

3. Data-Truth wurde quantitativ für Provider-Raw-Corp-Actions erweitert.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_reconciliation_checks_q1.py`
   - Neue Policy:
     - `--corp-actions-raw-materialization-min-ratio`
     - `--corp-actions-raw-materialization-drop-failure-mode {off|warn|hard}`
   - Neuer Check:
     - `contract_corp_actions_raw_materialization_ratio_ok`
   - Neuer Warning-Code:
     - `CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH`

4. Redflag-Invariants lesen die neuen Data-Truth-Signale.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_redflag_invariants_q1.py`
   - Neue Redflags:
     - `DATA_TRUTH_CORP_ACTIONS_RAW_MATERIALIZATION_DROP`
     - `DATA_TRUTH_TRI_ROWS_EMPTY`
     - plus Parsing für `CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH`

5. Verifizierte Runs nach Änderung (lokal).
   - Stage-B:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-26/stage_b_q1_run_report.json`
     - `ok=true`
     - `strict_pass_total=2`
     - `survivors_B_q1_total=2`
   - Registry:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-26/q1_registry_update_report.json`
     - `decision=NO_PROMOTION` (Champion bereits Top-Survivor)
   - Portfolio:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772722037/q1_portfolio_risk_execution_report.json`
     - `ok=true`
   - Reconciliation:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260305T144719Z/q1_reconciliation_report.json`
     - `ok=true`
     - `contract_corp_actions_coverage_min_ok=true`
     - `tri_rows_nonzero=true`
   - Redflags:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-05.json`
     - `kill_switch=false` (`critical_total=0`, `warning_total=4`)

## Update 2026-03-04 (late)

1. Stage-B-Orchestrator wurde methodisch korrigiert, ohne Gate-Softening.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
   - Neuer Schalter:
     - `--prep-strict-intersection-mode {prefer|require|off}` (default: `prefer`)
   - Effekt:
     - `prep_strict` bleibt Observability-Signal.
     - Bei leerem `prep_strict` blockiert es nicht mehr den echten Stage-B-strict Survivor-Pfad.
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-23/stage_b_q1_run_report.json`
   - Verifizierter Zustand:
     - `strict_pass_total = 4`
     - `survivors_B_q1_total = 4`
     - `selection_mode = strict_candidates_only`
     - Warning: `prep_strict_empty_fallback_to_stage_b_strict`

2. Registry-Hard-Demotion-Gates sind jetzt an das echte Stage-B-Hard-Gate-Set gekoppelt.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_registry_update_q1.py`
   - Neuer Schalter:
     - `--hard-demotion-gates-source {auto|stageb|static}` (default: `auto`)
   - Effekt:
     - Governance nutzt standardmäßig `gate_sets.hard_strict_gate_names` aus dem Stage-B-Light-Report.
     - Fallback auf statische Liste nur bei fehlendem Report-Set.
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-23/q1_registry_update_report.json`
   - Verifizierter Zustand:
     - `hard_demotion_gates_source_used = stageb_auto`
     - `hard_demotion_gate_names = 22`
     - `decision = NO_PROMOTION`
     - Slots: `default`, `live`, `shadow`, `shadow_alt_1`, `retired`

3. Daily Local Runner reicht die neuen Governance-Optionen durch.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
   - Neue Inputs/Pass-through:
     - `--stageb-prep-strict-intersection-mode`
     - `--registry-hard-demotion-gates-source`

4. Portfolio ist mit Slot-Blend gegen die Registry-Slots verifiziert.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772664067/q1_portfolio_risk_execution_report.json`
   - Verifizierter Zustand:
     - `candidate.selection_mode = slot_blend`
     - `blend_candidates_total = 3`
     - blend source slots: `live`, `shadow`, `shadow_alt_1`

5. Data-Truth wurde um harte/warnbare Corp-Action-Fallback-Invariants erweitert.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_reconciliation_checks_q1.py`
   - Neue Policy-Schalter:
     - `--corp-actions-cap-hit-failure-mode {off|warn|hard}`
     - `--corp-actions-raw-empty-fallback-failure-mode {off|warn|hard}`
   - Neue Checks:
     - `contract_corp_actions_cap_not_hit_or_allowed`
     - `contract_corp_actions_raw_empty_fallback_allowed`
   - Verifizierter Report (warn-mode):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260304T225120Z/q1_reconciliation_report.json`
   - Verifizierter Zustand:
     - `ok = true`
     - Warnings weiterhin sichtbar:
       - `CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT`
       - `CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK`
   - Hard-mode verifiziert:
     - dieselbe Lage schlägt korrekt fehl (beide neuen Checks rot), wenn beide neuen Modi auf `hard` gesetzt sind.

## Update 2026-03-05 (early)

1. Phase-A Daily Runner wurde auf den neuen Data-Truth-Pfad erweitert.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
   - Neue Phase-A Pass-through Optionen:
     - `phasea_run_corp_actions_ingest`
     - `phasea_run_registry_delistings_ingest`
     - `phasea_corp_actions_http_failure_mode`
     - `phasea_contract_raw_ingest_date_mode`
     - `phasea_recon_corp_actions_cap_hit_failure_mode`
     - `phasea_recon_corp_actions_raw_empty_fallback_failure_mode`

2. Corp-Action-Ingest im Daily Runner wurde mit sicheren Standardgrenzen versehen.
   - neue Defaults:
     - `phasea_corp_actions_max_assets = 1000`
     - `phasea_corp_actions_max_calls = 2000`
   - optional:
     - `phasea_corp_actions_from_date`
   - Zweck:
     - verhindert unbounded API-Läufe im Regelbetrieb.

3. Phase-A Backbone akzeptiert und reicht die neuen Reconciliation-Corp-Action-Policies durch.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`
   - neue CLI-Flags:
     - `--corp-actions-cap-hit-failure-mode`
     - `--corp-actions-raw-empty-fallback-failure-mode`
   - diese Flags werden in den Reconciliation-Step weitergereicht und im Backbone-Report `config` persistiert.

4. Quant/IP Hygiene im Repo wurde verschärft.
   - Datei: `/Users/michaelpuchowezki/Dev/rubikvault-site/.gitignore`
   - lokale Runtime-/Data-Artefakte werden jetzt standardmäßig geblockt:
     - `mirrors/quantlab/**`
     - `mirrors/universe-v7/**`
     - `quantlab/data|runs|jobs|ops|registry|models|artifacts/**`
   - Ziel:
     - keine Trainingsdaten/Model-Artefakte versehentlich auf `main` im öffentlichen Repo.

## Was lokal vorhanden ist

- Delta ingest: `scripts/quantlab/run_daily_delta_ingest_q1.py`
- Incremental snapshot update: `scripts/quantlab/run_incremental_snapshot_update_q1.py`
- Incremental feature update: `scripts/quantlab/run_incremental_feature_update_q1.py`
- Daily backbone orchestrator: `scripts/quantlab/run_q1_daily_data_backbone_q1.py`
- Stage A / panel pipeline: `scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
- Stage B: `scripts/quantlab/run_stage_b_q1.py`
- Registry update: `scripts/quantlab/run_registry_update_q1.py`
- Portfolio/Risk execution: `scripts/quantlab/run_portfolio_risk_execution_q1.py`

## Was heute repariert wurde

1. Safe-Operator-Profile wurden auf ein wirklich begrenztes Panel zurückgestellt.
   - vorher: `top-liquid-list 800,1000,1300` bei `panel_max_assets=0`
   - jetzt: `top-liquid-list 400,600,800`
   - jetzt zusätzlich: `panel_max_assets=2000`
   - zusätzlich: aggressiveres OOM-Downshift bis `300`

2. Der Operator-Statusreport wurde erweitert.
   - zeigt jetzt auch `panel_max_assets`
   - zeigt `failed_by_class`
   - zeigt `running_task_current_top_liquid_n`

3. Die Quant-v4-Runbook-Struktur wurde an diesem Pfad wiederhergestellt.

4. Data-Truth-Backbone wurde an zwei echten Defekten repariert.
   - `run_q1_daily_data_backbone_q1.py` pinnt Contract-Layer-Rohdaten nicht mehr standardmäßig auf das Backbone-`ingest_date`
   - `materialize_snapshot_contract_layers_q1.py` zielt ohne `--snapshot-id` jetzt auf den neuesten materialisierten Snapshot statt auf einen lexikographisch zufälligen Snapshot

5. Contract-Layer-Derivation aus adjusted-close wurde repariert.
   - Ursache: `action_type` wurde im selben Polars-Block referenziert, in dem es erst erzeugt wurde
   - Folge vorher: Contract-Materialisierung brach beim Corp-Action-Fallback ab
   - Folge jetzt: Derive-Fallback läuft deterministisch

6. Data-Truth-Verifikation ist grün.
   - Snapshot:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/snapshots/snapshot_id=2026-02-26_670417f6fae7_q1step2bars`
   - Contract-Layer-Modes:
     - corp actions: `derived_from_adjusted_close_factor` bzw. danach im Backbone `preserved_existing_snapshot_layer`
     - delistings: `provider_raw_delistings`
   - Aktuelle Snapshot-Zählung:
     - `corp_actions_rows_total = 250000`
     - `delistings_rows_total = 380`

7. Verifizierte Läufe heute:
   - Smoke:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_safe_smoke_20260304_150455`
   - Safe day:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_150852`
   - Safe day:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_160855`
   - Safe day:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/day_q1_safe_20260304_171444`
   - Backbone validation:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772636392/q1_daily_data_backbone_run_report.json`

8. Registry/Governance wurde auf striktere Stage-B-Signale gezogen.
   - `run_registry_update_q1.py` persistiert und priorisiert jetzt:
     - `stage_b_strict_pass`
     - `dsr_strict`
     - `psr_strict`
     - `dsr_cpcv_strict`
     - `psr_cpcv_strict`
   - Sorting ist jetzt strict-first statt proxy-first
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-23/q1_registry_update_report.json`
   - Aktueller Governance-Zustand im verifizierten Report:
     - `decision = NO_PROMOTION`
     - `freeze_mode_active = true`
     - `strict_pass_total = 0`
     - current live champion bleibt im `live_hold`-artigen Freeze-Pfad
   - Champion-Slot-Logik ist jetzt aktiv:
     - `live`, `shadow`, `retired` werden pro Run aus den Candidate-States synchronisiert
     - `default` bleibt als Alias zu `live` für Legacy-Kompatibilität
   - Neue Ladder im Code:
     - `live_hold -> shadow` nach 2 Freeze-Runs
     - `live_hold -> retired` nach 4 Freeze-Runs

9. Reconciliation / Data-Truth wurde quantitativ gehärtet.
   - `run_reconciliation_checks_q1.py` prüft jetzt zusätzlich:
     - Snapshot-/TRI-As-of-Konsistenz
     - Snapshot-/TRI-Snapshot-ID-Konsistenz
     - TRI selected assets vs Snapshot expected assets
     - Contract raw source dirs vorhanden
     - quantitative Corp-Action-Fallback-Warnungen
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260304T193418Z/q1_reconciliation_report.json`
   - Wichtige verifizierte Warnings:
     - `CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT`
     - `CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK`
   - Neue quantitative Coverage-Policy:
      - `corp_actions_min_rows_per_1k_assets`
      - `corp_actions_coverage_failure_mode`
      - aktueller beobachteter Wert ist ausreichend (`is_low = false`)
   - Interpretation:
     - Delistings kommen jetzt aus echter Raw-Quelle
     - Corp Actions laufen aktuell noch über den adjusted-close-Fallback und stoßen an die Derive-Cap
   - Wichtige grüne Invariants:
      - `contract_corp_actions_raw_materialization_consistent = true`
      - `contract_delistings_raw_materialization_consistent = true`
      - `tri_asof_matches_snapshot_asof = true`
      - `tri_snapshot_id_matches_snapshot_id = true`

10. Stage-B-Orchestrierungsreport wurde strenger und downstream-freundlicher gemacht.
    - `run_stage_b_q1.py` schreibt jetzt direkt in `stage_b_q1_final`:
      - `selected_pass_column`
      - `selection_priority`
      - `strict_pass_total`
      - `proxy_augmented_pass_total`
      - `light_survivors_total`
      - optional `top_survivor` mit strikten Metrics
   - Verifizierter Report:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-23/stage_b_q1_run_report.json`
   - Aktueller verifizierter Zustand:
      - `survivors_B_q1_total = 0`
      - `strict_pass_total = 0`
      - `post_gate.failure_mode = warn`
   - Methodik wurde weiter angezogen:
      - größere CPCV-Kombinationen
      - größere Test-Gaps / Embargo-Gaps
      - höhere Mindestanzahl effektiver Pfade
      - striktere Stress-/PSR-/DSR-Schwellen
      - `g_ic_mean`, `g_ic_min`, `g_sharpe_mean`, `g_sharpe_min` sind jetzt Teil des harten strikten Gate-Sets
   - Neuer methodischer Fix:
      - CPCV-Light fällt nicht mehr in einen strukturell unmöglichen Zustand bei 3 Folds
      - wenn `skip_adjacent` + `temporal_filter` zu `0` effektiven Pfaden führen:
        - wird zuerst `skip_adjacent` deterministisch deaktiviert
        - danach, falls nötig, `temporal_filter`
      - Pfad-Mindestanforderungen werden jetzt an die tatsächlich betrachteten Kombinationen gebunden
   - Interpretation:
      - die frühere `strict_pass_total=0`-Lage war teilweise strukturell
      - die aktuelle `strict_pass_total=0`-Lage ist jetzt substanziell:
        - Top-Kandidat `csmom_20_liq` hat positive Basis-/CPCV-Light-Werte
        - scheitert aber noch an `psr_strict`, `dsr_strict`, `psr_cpcv_strict`, `dsr_cpcv_strict`, `stress_lite_sharpe`, `stress_lite_fail_share`

11. Portfolio/Risk ist jetzt governance-aware.
    - `run_portfolio_risk_execution_q1.py` schreibt jetzt einen `governance`-Block mit:
      - Stage-B-Run-Kontext
      - Registry-/Freeze-/Strict-Pass-Kontext
    - Portfolio war vorher mathematisch ok, aber operativ blind gegenüber `freeze_mode_active` und `strict_pass_total=0`
   - Verifizierter Report:
      - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772649304/q1_portfolio_risk_execution_report.json`
   - Wichtige neue Warnungen:
      - `PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE`
      - `PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY`
      - `PORTFOLIO_REGISTRY_CURRENT_LIVE_HARD_GATES_FAILED:...`
   - Neue Default-Allokation:
      - `weighting_mode = score_invvol_liq`
      - defensive Hard-Gate-Fälle reduzieren:
        - `target_gross_effective = 0.2`
        - `allow_shorts_effective = false`
        - `top_n_long_effective = 40`
      - zusätzlicher Ladder-Fix:
        - `shadow` im Freeze-Modus ist jetzt ein expliziter defensiver Fallback statt harter Portfolio-Fehler
      - effektive Gewichte im aktuellen verifizierten Report:
        - `mode = defensive_shadow_fallback`
        - `target_gross_effective = 0.1`
        - `max_position_weight_effective = 0.025`
        - `top_n_long_effective = 25`
        - `weight_alpha_score_effective = 0.5`
        - `weight_alpha_invvol_effective = 0.9`
        - `weight_alpha_liq_effective = 0.45`

12. Redflags ziehen jetzt die neuen Governance-/Portfolio-Signale hoch.
    - `run_redflag_invariants_q1.py` meldet jetzt zusätzlich:
      - `REGISTRY_FREEZE_MODE_ACTIVE`
      - `REGISTRY_CURRENT_LIVE_HARD_GATES_FAILED`
      - `PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE`
      - `PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY`
    - Verifizierter Report:
      - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-04.json`
    - Aktuelle verifizierte Flag-Lage:
    - Warnings:
        - `CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT`
        - `CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK`
        - `REGISTRY_FREEZE_MODE_ACTIVE`
        - `REGISTRY_CURRENT_LIVE_HARD_GATES_FAILED`
        - `PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE`
        - `PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY`
        - `PORTFOLIO_DEFENSIVE_ALLOCATION_POLICY`
      - Criticals:
        - `STAGEB_SURVIVORS_EMPTY`
        - `STAGEB_STRICT_PASS_EMPTY`
   - Aktueller Summary-Stand:
      - `critical_total = 2`
      - `warning_total = 8`
      - `kill_switch = true`
   - Zusätzlich werden jetzt auch die nächsten Data-Truth-Warncodes korrekt hochgezogen, falls sie auftreten:
      - `CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT`
      - `CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED`
      - `CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH`

## Warum die Reparatur nötig war

Die letzten Jobs liefen zwar unter einem "safe" Label, aber die Konfiguration nutzte weiterhin `panel_max_assets=0`, also praktisch Vollpanel. Dadurch konnten selbst niedrige `top_liquid_n`-Werte durch den Vollscan-/Full-Panel-Pfad regelmäßig auf >7 GiB RSS steigen und vom Watchdog als OOM beendet werden.

Zusätzlich war der Data-Truth-Pfad für Contract-Layer operativ zu fragil:

- verfügbare Delistings-Rohdaten konnten durch ein zu striktes `raw_ingest_date` übergangen werden
- der Contract-Step konnte auf den falschen Snapshot zeigen
- der adjusted-close-Derive-Fallback für Corp Actions hatte einen Polars-Auswertungsfehler

Diese drei Punkte hätten Stage-B-/Registry-/Portfolio-Ergebnisse auf einer unnötig schwachen Contract-Layer-Basis laufen lassen.

Zusätzlich war die Governance-Schicht vor diesem Stand nicht tief genug in Portfolio und Redflags verdrahtet:

- Registry konnte schon Freeze-/Live-Hold korrekt erkennen,
- aber Portfolio lief noch ohne expliziten Governance-Kontext weiter,
- und Redflags zeigten diese Lage nicht als zusammenhängendes Bild.

Dadurch war das System operativ zwar lauffähig, aber nicht sauber auditierbar. Genau dieser Kontrollpfad ist jetzt enger gezogen.

## Nächste Implementierungsschritte Richtung v4.0

1. Stage B weiter ent-proxyen
   - CPCV/Purging/Embargo weiter an finale Methodik ziehen
   - DSR/PSR von Q1-light weiter Richtung final
   - aktuelle nächste Lücke:
     - die aktuelle Candidate-Menge bleibt bei `strict_pass_total = 0`
     - das ist nicht mehr unsichtbar, aber methodisch noch nicht gelöst

2. Registry/Governance weiter härten
   - live/shadow/retired konsequent
   - Demotion-/Freeze-Ladder auf den strengeren Stage-B-Signalen weiter ausbauen
   - aktuell fehlt noch:
     - explizite `slot`-Logik jenseits von `default`
     - klarere Champion-/Fallback-Regeln über mehrere Kandidatenfamilien

3. Data Truth weiter vertiefen
   - abgeleitete Corp Actions quantitativ prüfen
   - echte Provider-Corp-Actions weiter beobachten, falls Token/Endpoint später wieder nutzbar wird
   - TRI-/Contract-Layer-Invariants ergänzen
   - aktuell wichtigste offene Wahrheit:
     - Corp Actions sind noch derived fallback, nicht echter provider-raw feed

4. Portfolio/Risk/Test/Redflag-Schicht finalisieren
   - Positioning/Execution-Constraints
   - Invariants/Kill-switches
   - bessere Redflag-Reports
   - nächster konkreter Hebel:
     - finale Champion-/Slot-Ladder
     - Portfolio derzeit bereits shadow-fallback-fähig, aber noch nicht mehrslot-fähig

## Update 2026-03-05 (v4.0 method + slot-policy)

13. Stage-B methodische Ent-Proxying-Schalter ergänzt (ohne Blind-Relaxation)
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py`
   - Neu:
     - `--cpcv-light-requirement-mode {feasible_min,configured_min}`
     - `--cpcv-light-relaxation-mode {allow,strict_fail}`
   - Wirkung:
     - `strict_fail` verhindert die frühere automatische CPCV-Policy-Relaxation als stillen Rettungsanker.
     - `allow` hält den bisherigen, robusten Q1-Betrieb.
     - neuer Gate-Check: `g_cpcv_light_policy_relaxed` (im Hard-Strict-Gate-Set aktiv, wenn `strict_fail`).
   - Verifiziert:
     - Lauf mit `relaxation_mode=allow`:
       - `strict_pass_total=10`, `survivors_B_q1_total=6`
     - Lauf mit `relaxation_mode=strict_fail`:
       - `strict_pass_total=0`, `survivors_B_q1_total=0`
     - Damit ist der Unterschied zwischen „operativ robust“ und „methodisch maximal strikt“ jetzt explizit steuerbar und auditierbar.
   - Daily-Runner:
     - die neuen Stage-B-Modi sind in `run_q1_panel_stage_a_daily_local.py` als CLI + Status-Inputs durchgereicht.

14. Portfolio an Registry-Slot-State-Logik gekoppelt (mehrslot-fähig)
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Neu:
     - `--registry-state-multipliers`
     - `--slot-blend-min-effective-weight`
     - `--slot-blend-require-live-like` / `--skip-slot-blend-require-live-like`
     - `--slot-blend-live-like-states`
   - Wirkung:
     - Slot-Blending nutzt nicht mehr nur rohe Slot-Gewichte, sondern `effective_slot_weight = slot_weight * state_multiplier`.
     - Kandidaten mit zu kleinem Effective-Weight werden vor Scoring entfernt.
     - Optionaler Safety-Gate: wenn kein live-like State im Blend vorkommt, fallback auf Single-Selection statt blindem Blend.
     - Konsistenzfix: Wenn Blend aktiv ist, wird Stage-B-Fallback nicht mehr fälschlich als `candidate.source` überschrieben.
   - Report-Erweiterung:
     - `candidate.blend_candidates[*].state_multiplier`
     - `candidate.blend_candidates[*].effective_slot_weight`
     - `governance.slot_blend_policy`
   - Verifiziert:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772700249/q1_portfolio_risk_execution_report.json`
     - Run `ok=true`, neue Slot-Policy-Felder vorhanden.
   - Daily-Runner:
     - neue Portfolio-Slot-Policy-Parameter sind in `run_q1_panel_stage_a_daily_local.py` durchgereicht.

15. End-to-end Kontrolllauf (Stage-B -> Registry -> Portfolio -> Redflags) stabil
   - Verifizierte Runs:
     - Stage-B: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-02-17/stage_b_q1_run_report.json`
     - Registry: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1registry_q1stageb_cheapgateA_tsplits_2026-02-17/q1_registry_update_report.json`
     - Portfolio: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772701993/q1_portfolio_risk_execution_report.json`
     - Redflags: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-03-05.json`
   - Ergebnis:
     - `kill_switch=false`
     - `critical_total=0`
     - `warning_total=4`
   - Bedeutung:
     - Die aktuelle Kette ist operativ grün bei weiterhin konservativer Governance-Policy.

## Update 2026-03-06 (lokaler Quant-Fortschritt nach Main-Push)

16. Stage-B-Input-Scope ist jetzt adaptiv robust bei dünnen Stage-A-Survivor-Mengen.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
   - Neu:
     - automatische Scope-Erweiterung von `survivors_a` auf `all_candidates`, wenn `survivors_A_total < --stageb-min-survivors-a-for-strict-scope`
     - strukturierte Report-Felder:
       - `stageb_input_scope_requested`
       - `stageb_input_scope_effective`
       - `stageb_input_scope_widened`
       - `stageb_input_scope_widened_reason`
   - Verifiziert:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_cheapgateA_tsplits_2026-03-05/stage_b_q1_run_report.json`
     - aktueller Wert:
       - `strict_pass_total=1`
       - `survivors_B_q1_total=1`
       - Scope-Widening aktiv wegen `survivors_A_total=23 < min=32`

17. Portfolio hat jetzt einen expliziten Registry-Slot-Konsistenz-Guard.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Neu:
     - `--registry-slot-consistency-failure-mode {off,warn,hard}`
     - Governance-Reportfeld `governance.slot_consistency` mit:
       - `mode`
       - `checked`
       - `candidate_source`
       - `mismatches`
       - `missing_slots`
   - Verifiziert:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772824059/q1_portfolio_risk_execution_report.json`
     - Ergebnis:
       - `ok=true`
       - `slot_consistency.mode=warn`
       - `mismatches=[]`
       - `missing_slots=[]`

18. v4-Final-Gate-Matrix nutzt jetzt den realen Redflag-Pfad und ist wieder deterministisch grün.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_v4_final_gate_matrix_q1.py`
   - Fix:
     - Fallback auf `ops/red_flags/*.json`, falls kein Legacy-`run_id=q1redflags_*`-Report existiert.
   - Warum:
     - vorheriger Lauf war nur wegen `redflags_report_exists=missing` mit `exit_code=73` rot, obwohl Redflags bereits geladen und ausgewertet waren.
   - Verifiziert:
     - fehlerhafter Lauf:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772824571/q1_v4_final_gate_matrix_report.json`
     - fixer Lauf:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772825097/q1_v4_final_gate_matrix_report.json`
       - `ok=true`

## Update 2026-03-06/07 (aktueller Quant-Block)

19. Data-Truth wurde erneut im Hard-Modus gefahren und recon-seitig auf 0 Warnungen gebracht.
   - Lauf:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1772840051/q1_daily_data_backbone_run_report.json`
   - Ergebnis:
     - `ok=true`
     - Backbone-Warnung nur operativ (`PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS`)
   - Reconciliation:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260306T233650Z/q1_reconciliation_report.json`
     - `warnings=[]`
     - relevante Checks:
       - `contract_corp_actions_provider_raw_required_ok=true`
       - `contract_delistings_provider_raw_required_ok=true`
       - `contract_corp_actions_cap_not_hit_or_allowed=true`
       - `contract_corp_actions_raw_empty_fallback_allowed=true`

20. Stage-B As-of-Serie wurde neu gefahren und als eigenes Stabilitätsartefakt dokumentiert.
   - Neuer Reporter:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/report_stageb_asof_stability_q1.py`
   - Ausgabe:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
   - Aktueller Stand:
     - `asof_points_total=10`
     - `strict_positive_runs_total=2`
     - `strict_positive_ratio=0.2`
     - `strict_pass_min=0`, `strict_pass_max=10`, `strict_pass_avg=1.1`
   - Bedeutung:
     - Stage-B ist nicht mehr blind-rot, aber strict-survivor-Stabilität über die As-of-Serie ist noch zu schwach.

21. Stage-B/Portfolio/Final-Gates wurden an Konsistenz- und Release-Strict-Checks gehärtet.
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_v4_final_gate_matrix_q1.py`
   - Änderungen:
     - Stage-B report enthält jetzt konsistent:
       - `asof_date`
       - `snapshot_id`
       - `source_stage_a_report`
     - Portfolio:
       - neues Feld `rebalance_needed_but_no_orders`
       - Rebalance-Metriken: `rebalance_abs_delta_sum`, `rebalance_max_abs_delta`
       - `NO_REBALANCE_ORDERS` wird nur noch emittiert, wenn tatsächlich ein actionable Delta ohne Orders vorliegt.
     - Final-Gates:
       - neues Profil `--release-strict-profile`
       - zusätzlicher Gate-Check `portfolio_slot_consistency`
   - Verifiziert:
     - Portfolio Lauf:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772841476/q1_portfolio_risk_execution_report.json`
       - `orders_total=0`, aber `rebalance_needed_but_no_orders=false`, `warnings=[]`
     - Final-Gates (release-strict):
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772841868/q1_v4_final_gate_matrix_report.json`
       - `ok=true`, `checks_failed_total=0`

22. Night-Run (10h Safe-Profil) ist aktiv gestartet.
   - Job:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_safe10h_20260307_011832`
   - Lock/Prozess:
     - Lock: `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/_locks/overnight_q1_training_sweep_safe.lock.json`
     - PID: `81536` (zum Startzeitpunkt)
   - Startstatus:
     - `running_task=asof2026-02-17_p60_top600`
     - `done=1`, `running=1`, `pending=16`, `failed=0`

23. Web-Features-v2 (Forecast/Scientific/Elliott) parity ist report-first vollständig grün.
   - Neue Artefakte / Endpunkte:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/stock-insights-v2.js`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/build-features-v2.mjs`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/validate/stock-insights-v2-parity.mjs`
   - v2 Builder-Stand:
     - `tickers=55992`
     - `scientific_ok=2442`
     - `forecast_ok=2425`
     - `elliott_ok=52958`
   - Paritätslauf:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v2/reports/stock-insights-v2-parity-report.json`
     - Ergebnis:
       - `total=120`
       - `endpoints_ok=120`
       - `v2_contract_ok=120`
       - `no_issue=120`
       - `activation_ready=true`
   - Technische Härtung:
     - Checker-Timeout auf 30s erhöht.
     - Warmup für Cold-Start/Cache eingeführt.

24. Stage-B CPCV feasible-min wurde methodisch korrigiert (keine unmöglichen Pfad-Gates mehr aus theoretischen Kombinationszahlen).
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_stage_b_q1_light.py`
   - Fix:
     - `cpcv_light_effective_paths_required` wird in `feasible_min` jetzt gegen `combos_effective_total` gecappt.
     - `cpcv_light_paths_total_required` wird in `feasible_min` jetzt gegen `paths_total` gecappt.
     - `cpcv_light_effective_path_ratio` nutzt in `feasible_min` eine machbarkeitsgekappte Mindestanforderung statt starrer globaler Schwelle.
   - Wirkung:
     - der vorherige strukturelle Blocker (`g_cpcv_light_paths_total`/`g_cpcv_light_effective_paths`) ist für mehrere Läufe entkoppelt von rein theoretischer Kombinatorik.

25. Data-Truth-Soak + Stage-B-As-of-Serie neu gefahren; Stabilität verbessert, aber noch nicht final robust.
   - Reconciliation (3x hard, clean):
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205411Z/q1_reconciliation_report.json`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205412Z/q1_reconciliation_report.json`
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1recon_20260307T205414Z/q1_reconciliation_report.json`
     - alle: `ok=true`, `warnings=[]`
   - Stage-B Serie (v4-final profile) neu gerendert für:
     - `2026-02-11,12,13,15,16,17,18,19,20,23,26,2026-03-05`
   - Aktueller Stand:
     - positive strict-Punkte: `2/12` (`2026-02-20` mit `strict_pass_total=9`, `2026-03-05` mit `strict_pass_total=1`)
     - `strict_positive_ratio_all=0.1667`
     - `strict_pass_avg_all=0.8333`
   - Stabilitätsreport:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/stage_b_stability/latest.json`
   - Note:
     - Reporter erweitert, damit `strict_positive_ratio_all` und `strict_positive_ratio` (ok-only) getrennt ausgewiesen werden.

26. Registry-Ladder + Portfolio/Order wurden deterministisch auf Report-Basis gehärtet.
   - Datei:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_portfolio_risk_execution_q1.py`
   - Fix:
     - Registry-Slot-Auswahl (`single` + `slot_blend`) liest jetzt zuerst aus dem übergebenen `q1_registry_update_report.json` (`champion_slots`) statt aus der mutable SQLite-DB.
     - DB-Lookup bleibt nur als Fallback für ältere Reports ohne `champion_slots`.
   - Warum:
     - vorher konnten zeitliche Mismatches entstehen (alter Registry-Report + neuer DB-Stand), die `PORTFOLIO_REGISTRY_SLOT_MISMATCH` als Hard-Fail ausgelöst haben.
   - Verifiziert:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1portfolio_1772922466/q1_portfolio_risk_execution_report.json`
     - `ok=true`, `slot_consistency.checked=true`, `mismatches=[]`, `missing_slots=[]`.

27. Redflag/Gate-Checks auf aktuelle Artefakt-Schemata korrigiert.
   - Dateien:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_redflag_invariants_q1.py`
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_v4_final_gate_matrix_q1.py`
   - Fixes:
     - `run_redflag_invariants_q1.py` erkennt `survivors_A_total` jetzt korrekt aus modernen Stage-A-Reports (`counts.survivors_A_total`) statt nur aus Legacy-Referenzen.
     - Portfolio-Registry-Flags greifen jetzt auch bei `candidate.source=registry_slot_blend`.
     - `run_v4_final_gate_matrix_q1.py` nimmt beim Auto-Pick nicht mehr blind den neuesten Run-Ordner, sondern den neuesten Run mit vorhandenem Reportfile.
     - `stagea_ok` wurde für aktuelle Stage-A-Reportschemas robust gemacht (Counts/Artifacts-basiert, nicht nur Legacy-Key).
   - Verifiziert:
     - Redflags:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/red_flags/2026-02-20.json`
       - `kill_switch=false`, `critical_total=0`
     - Final Gates (release-strict):
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_1772923502/q1_v4_final_gate_matrix_report.json`
       - `ok=true`

28. Aktuelle harte Lage (As-of-Differenzierung)
   - Für die konsistente Kette auf `asof=2026-02-20` ist release-strict aktuell grün (siehe Punkt 27).
   - Für `asof=2026-03-05` bleibt ein echter Qualitätsblocker bestehen:
     - `STAGEA_SURVIVORS_EMPTY` (Stage-A-Survivors = 0)
   - Bedeutet operativ:
     - Methodik/Contracts/Gates sind jetzt korrekt verdrahtet.
     - nächster Hebel bleibt Stage-A/Feature-Panel-Erzeugung für neuere As-ofs, damit die grüne Kette nicht auf einen älteren Stichtag begrenzt ist.

29. 10h-Nachtrun (2026-03-08) läuft aktiv mit Watchdog-Absicherung.
   - Job:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260308_night1`
   - Lock:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/_locks/overnight_q1_training_sweep.lock.json`
   - Laufkonfiguration (ressourcenschonend, robust):
     - `max_hours=10`
     - `threads_cap=1`
     - `max_rss_gib=7`
     - `top_liquid_list=400,600,800,1000,1200`
     - `panel_days_list=60,90,120`
     - `asof_dates_count=20`
     - harte Kopplung aktiv:
       - `portfolio_no_rebalance_orders_failure_mode=hard`
       - `portfolio_registry_slot_consistency_failure_mode=hard`
   - Watchdog/Resume:
     - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/overnight_q1_training_sweep_safe_20260308_night1/logs/watchdog.log`
     - automatischer Restart wurde ausgelöst (`restart reason=no_orchestrator_pid`) und der Run danach sauber auf `attempt=2` resumed.
   - Aktueller Status:
     - `tasks_total=300`
   - `summary: pending=299, running=1, done=0, failed=0`
   - laufender Task: `asof2026-02-17_p60_top400`

30. Primärblocker technisch verifiziert: Source-Freshness-/Publish-Truth war fail-open, nicht Stage-B-Logik.
   - Repo-Befund:
     - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py`
   - Verifizierte Ist-Lage vor Fix:
     - Raw Bars für `STOCK,ETF` standen auf `latest_required_ingest_date=2026-02-25` bei `reference_date=2026-03-09` (`age_days=12`)
     - öffentliches v7-Publish-Truth war defekt:
       - `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/universe/v7/reports/run_status.json`
       - `exit_code=90`, `reason=phase0_failed`
     - zusaetzlich fehlte die private lokale Source-Truth fuer Delta/Backbone:
       - `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/universe-v7/reports/history_touch_report.json`
     - Backbone lief trotzdem warn-only weiter; dadurch wurden Delta/Snapshot/Stage-A/Stage-B auf altem Stand weitergetrieben.
   - Umgesetzter Fix:
     - Backbone hat jetzt einen additiven lokalen v7-Pre-Refresh-Pfad via `run-backfill-loop.mjs --skip-archeology` mit lokalem EODHD-Env.
     - Danach erzwingt ein neuer `source_truth_gate` fail-closed:
       - `FAIL_RAW_BARS_REQUIRED_TYPES_STALE`
       - `FAIL_PRIVATE_V7_HISTORY_TOUCH_REPORT_MISSING`
       - `FAIL_PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS`
     - `PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS` ist nicht mehr warn-only.
   - Verifikation:
     - Probe-Lauf ohne Pre-Refresh:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1backbone_1773047048/q1_daily_data_backbone_run_report.json`
       - `ok=false`
       - `exit_code=96`
       - `steps=["source_truth_gate"]`
   - Bedeutung:
     - Night-/Day-Runs sollen jetzt sauber an der Datenwahrheit scheitern statt Stage-B mit stale Snapshots zu entwerten.
     - Nächster operativer Schritt bleibt: lokalen v7-Refresh kontrolliert grün bekommen, danach Delta/Snapshot/Stage-A auf aktuelle As-of-Serie neu evaluieren.

31. Lokale Quant-Storage-Wahrheit neu verifiziert und als Recovery-Pfad aufgesetzt.
   - Verifizierte lokale Quant-Parquet-Basis:
     - Root:
       - `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/raw/provider=EODHD`
     - Stocks:
       - `74,837` Assets
       - `2,411` eindeutige `source_pack_rel`
       - Historie `1990-01-01 .. 2026-02-20`
     - ETFs:
       - `20,312` Assets
       - `688` eindeutige `source_pack_rel`
       - Historie `1990-01-02 .. 2026-02-23`
   - Bedeutung:
     - Die historische Parquet-Basis reicht fuer Quant-Training.
     - Der offene Blocker bleibt Freshness / Delta / Backbone fuer aktuelle Tage.
   - Neuer lokaler Recovery-Pfad:
     - Script:
       - `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/bootstrap_v7_history_from_quant_parquet.py`
     - Ziel:
       - lokale Rekonstruktion von `history/**/*.ndjson.gz` aus bestehenden Quant-Parquets
       - plus privater Touch-Report unter:
         - `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/universe-v7/reports/history_touch_report.json`
   - Laufstatus:
     - Sample-Run verifiziert (`packs_count=3`, `entries_count=122`)
     - Voll-Run gestartet am `2026-03-09`; erst nach Abschluss kann Delta/Backbone erneut gegen eine vollstaendige lokale Raw-History geprüft werden.

## 2026-03-10 - Bootstrap Complete / Freshness Still Partial

What was verified:
- Local v7 raw-history bootstrap finished successfully from Quant parquet into `mirrors/universe-v7/history`.
- Rebuilt private touch report now exists and is large enough to drive backbone freshness checks again.
- Local Quant parquet basis is still the main training truth for stocks and ETFs and remains strong enough for research/training.

Hard numbers:
- `history_touch_report.json`: `packs_count=3099`, `entries_count=95149`, generated `2026-03-09T19:45:21Z`.
- Stock parquet: `74837` assets, `2411` packs, `256200140` rows, `1990-01-01..2026-02-20`.
- ETF parquet: `20312` assets, `688` packs, `35861869` rows, `1990-01-02..2026-02-23`.

Important nuance:
- Fresh ingest directories exist through `2026-03-08`, but they currently contain delistings/corp-actions only.
- Stock/ETF bar parquet is still only present under `ingest_date=2026-02-25`.
- This means QuantLab is now much closer to operational truth again, but not yet fully current on stock/ETF daily bars.

Night run status (latest inspected overnight sweep):
- Job: `overnight_q1_training_sweep_safe_20260308_night1`
- Result: operational failure, not research success
- Final summary: `done=0`, `failed=3`, `pending=297`, stopped after consecutive failures
- Failure pattern: first RSS/OOM kills (`rc=137`), then stale-heartbeat/orphan kills (`rc=142`)
- Conclusion: overnight runner guardrails are working, but the selected profile is still too heavy/fragile for stable unattended throughput.

Gate / stability status:
- Latest final gate matrix inspected: `run_id=q1v4gates_1773034951`
- Result: `ok=true` with one strict pass and clean registry/portfolio alignment
- But the backbone report still shows `PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS`, so the green gate is not yet equivalent to fully restored daily freshness.
- Stage-B stability series remains partial: `strict_positive_ratio_all=0.3` over the inspected as-of series.

Current interpretation:
- v4.0 is materially advanced but not final.
- Training coverage is good enough.
- Daily-fresh operation is not yet good enough.
- Main remaining work stays: restore stock/ETF freshness, stabilize Stage-B over series, harden overnight profile, then soak release-strict.
