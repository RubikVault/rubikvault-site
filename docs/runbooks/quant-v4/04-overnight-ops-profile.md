# Overnight Ops Profile

Stand: 2026-03-08

## Ziel

Runs sollen lieber etwas langsamer, aber robust und macbook-sicher laufen. Hauptfehler der letzten Tage war ein zu aggressives Safe-Profil in Verbindung mit `panel_max_assets=0`.

## Lessons Learned

1. `threads_cap=1` ist Pflicht für Safe-Betrieb.
2. Zu kleine Mini-Panels (`top_liquid_n < 2500`) sind fuer v4-Qualifikation praktisch wertlos, auch wenn sie technisch laufen.
3. `panel_max_assets=0` war in frueheren Night-Profilen zu aggressiv und fuehrte zusammen mit Resume-Schleifen zu OOM-/orphan-Kaskaden.
4. OOM-Retries ohne sinnvollen Downshift verschwenden nur Zeit.
5. Ein Night-Run muss mit Watchdog, RSS-Cap, globalem Lock und realistischem Preflight laufen.
6. Stale Rohdaten (`STOCK,ETF`) duerfen keinen Phase-A-Night-Run mehr starten; das ist jetzt ein harter Preflight-Stop statt spaeter Warnsignal.

## Aktuelles Safe-Profil

Operator-Startskript:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`

Wesentliche Defaults:
- `top-liquid-list 2500,3500,5000`
- `panel-max-assets 5000`
- effektive Task-Regel: `panel_max_assets = max(requested_panel_max_assets, top_liquid_n)`; `0` ist im Task nicht mehr gleich Vollpanel
- `threads_cap=1`
- `max_rss_gib=7.0`
- `oom_downshift_factor=0.50`
- `oom_downshift_min_top_liquid=2500`
- `task_order=safe_light_first`
- `skip-run-portfolio-q1`
- `skip-run-v4-final-gate-matrix` (wird im Night-Runner automatisch gesetzt, wenn Portfolio übersprungen wird)
- zusätzlicher Stage-A-Guard: Final-Gates werden automatisch übersprungen, falls der Portfolio-Step deaktiviert ist
- `day`: `asof-dates-count=2`
- `night`: `asof-dates-count=4`

## Standard-Kommandos

Status:
```bash
python3 /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py
```

Tageslauf:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh day
```

10h-Nachtlauf:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh night
```

Gezielter v4-Validierungslauf (ohne Full-Phase-A-Delta-Scan):
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/quantlab/.venv/bin/python \
  /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_panel_stage_a_daily_local.py \
  --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab \
  --snapshot-id 2026-02-26_670417f6fae7_q1step2bars \
  --asof-end-date 2026-02-16 \
  --run-stageb-q1 --run-registry-q1 --run-portfolio-q1 --run-redflags-q1 --run-v4-final-gate-matrix \
  --v4-final-profile \
  --panel-max-assets 4000 --top-liquid-n 3000 --survivors-max 80 \
  --fold-count 3 --test-days 5 --embargo-days 2
```

Gezielter Data-Truth-Backbone-Lauf (Provider-Raw Corp/Delistings):
```bash
set -a; source /Users/michaelpuchowezki/Dev/rubikvault-site/.env.local; set +a
/Users/michaelpuchowezki/Dev/rubikvault-site/quantlab/.venv/bin/python \
  /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/run_q1_daily_data_backbone_q1.py \
  --quant-root /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab \
  --include-types STOCK,ETF \
  --ingest-date 2026-03-05 \
  --delta-limit-packs 3 --delta-max-emitted-rows 20000 \
  --run-corp-actions-ingest --corp-actions-max-assets 50 --corp-actions-max-calls 200 \
  --corp-actions-from-date 2000-01-01 --corp-actions-http-failure-mode hard \
  --contract-source-policy force_derive \
  --run-registry-delistings-ingest --run-data-truth-layers --run-invalidation-scan --run-redflags-q1 \
  --v4-final-profile
```

## Logs und State

Job-State und Logs liegen unter:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/<job_name>/state.json`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/<job_name>/logs/driver.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/<job_name>/logs/watchdog.log`

## Quick checks nach jedem Lauf

1. Final-Gates:
```bash
jq '{ok, counts, failed: (.checks|map(select(.ok==false)|{name,reason}))}' \
  /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1v4gates_*/q1_v4_final_gate_matrix_report.json
```

2. Stage-B strict survivor:
```bash
jq '.counts.stage_b_light.stage_b_candidates_strict_pass_total' \
  /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1stageb_*/stage_b_q1_run_report.json
```

## Validierter Night-Preflight (neuer Stand)

Gruener Validierungsreport nach Härtung:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/q1_preflight_probe_20260308_b/q1_night_preflight_report.json`

Wesentliche Probe-Parameter:
- `lookback_calendar_days=420`
- `panel_max_assets=3000`
- `top_liquid_n=2500`
- `min_bars=200`

Verifizierter Probe-Lauf:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/runs/run_id=q1panel_daily_local_1772988174/q1_panel_stagea_daily_run_status.json`
- Ergebnis:
  - `survivors_A_total=15`
  - Stage B lief technisch sauber mit
  - Registry lief technisch sauber mit
  - Redflags meldeten erwartbaren Governance-/Kill-Switch-Zustand als Warnpfad

## Neue harte Guardrails

1. `raw_bars_freshness`
   - Night-Preflight prueft jetzt vor dem Start, ob die benoetigten Rohdaten fuer `STOCK,ETF` frisch genug sind.
   - Wenn `RAW_BARS_REQUIRED_TYPES_STALE` oder `RAW_BARS_MISSING_REQUIRED_TYPES` auftritt, darf ein Phase-A-Night-Run nicht starten.

2. Kein stilles Full-Panel mehr im Safe-Runner
   - Auch wenn alte Jobs oder Resume-Staende `panel_max_assets=0` enthalten, setzt der Task-Builder jetzt ein effektives Cap mindestens auf `top_liquid_n`.
   - Das verhindert OOM-/orphan-Kaskaden durch versehentlichen Vollscan im „safe“ Label.

3. Backbone ist jetzt ebenfalls fail-closed gegen stale Rohdaten / kaputten v7-Publish-Truth
   - Nicht mehr nur der Night-Preflight blockt stale Rohdaten.
   - Der eigentliche Backbone-Lauf (`run_q1_daily_data_backbone_q1.py`) stoppt jetzt hart vor Delta/Snapshot, wenn:
     - `RAW_BARS_REQUIRED_TYPES_STALE`
     - `PUBLIC_V7_HISTORY_TOUCH_REPORT_MISSING`
     - oder `PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS`
   - Zusätzlich kann der Backbone vor dem Gate einen kleinen lokalen v7-Refresh anstoßen:
     - `scripts/universe-v7/run-backfill-loop.mjs --skip-archeology`
     - Standardpfad für den lokalen Key:
       - `/Users/michaelpuchowezki/Desktop/EODHD.env`
   - Operative Konsequenz:
     - Night-Runs dürfen jetzt nicht mehr “scheinbar normal” auf alten Snapshots loslaufen.
     - Wenn der Backbone an `source_truth_gate` scheitert, ist das ein echter Data-Freshness-/Publish-Truth-Blocker und kein Stage-B-Problem.
