# Overnight Ops Profile

Stand: 2026-03-04

## Ziel

Runs sollen lieber etwas langsamer, aber robust und macbook-sicher laufen. Hauptfehler der letzten Tage war ein zu aggressives Safe-Profil in Verbindung mit `panel_max_assets=0`.

## Lessons Learned

1. `threads_cap=1` ist Pflicht für Safe-Betrieb.
2. `panel_max_assets=0` war zu aggressiv und führte trotz niedriger `top_liquid_n` zu OOM-Kills.
3. OOM-Retries ohne sinnvollen Downshift verschwenden nur Zeit.
4. Ein Night-Run muss mit Watchdog, RSS-Cap und globalem Lock laufen.

## Aktuelles Safe-Profil

Operator-Startskript:
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`

Wesentliche Defaults:
- `top-liquid-list 400,600,800`
- `panel-max-assets 2000`
- `threads_cap=1`
- `max_rss_gib=7.0`
- `oom_downshift_factor=0.50`
- `oom_downshift_min_top_liquid=300`
- `task_order=safe_light_first`
- `skip-run-portfolio-q1`
- `skip-run-v4-final-gate-matrix` (wird im Night-Runner automatisch gesetzt, wenn Portfolio übersprungen wird)
- zusätzlicher Stage-A-Guard: Final-Gates werden automatisch übersprungen, falls der Portfolio-Step deaktiviert ist

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
