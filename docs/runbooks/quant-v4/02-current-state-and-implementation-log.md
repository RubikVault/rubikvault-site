# Current State And Implementation Log

Stand: 2026-03-04

## Kurzstatus

- Quant v4.0 insgesamt: ca. 69%
- Q1 Backbone lokal vorhanden und mit vielen Artefakten belegt
- Aktueller Hauptblocker war nicht Phase A, sondern instabile Operator-Runs durch zu aggressive Safe-Profile
- Neuer belastbarer Fortschritt:
  - Data-Truth-Contract-Layer greifen wieder auf echte verfügbare Rohquellen zu
  - Stage-B-/Registry-/Portfolio-/Redflag-Kette ist jetzt governance-aware statt blind
  - Reconciliation ist grün und Contract-/TRI-Invariants sind im Kontrollpfad belastbar

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
