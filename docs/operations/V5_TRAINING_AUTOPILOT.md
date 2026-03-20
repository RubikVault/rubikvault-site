# V5 Training Autopilot Runbook

Path: `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/operations/V5_TRAINING_AUTOPILOT.md`

## Scope
This runbook is the only operating guide another AI should use during the next 5 days.

Goal:
- keep the V5 day and night training runs alive,
- refresh prediction artifacts after completed runs,
- monitor whether V5 is moving toward usable short / medium / long predictions,
- avoid any code or config changes.

## Hard Rules
Allowed:
- inspect state
- inspect logs
- run the safe status commands below
- kickstart the already prepared launch agents
- rerun the prepared refresh script

Not allowed:
- no file edits
- no git actions
- no package changes
- no workflow edits
- no policy edits
- no threshold tuning
- no manual data deletion
- no lock-file surgery unless the safe scripts already do it
- do not run ad-hoc experimental training commands
- do not run `night_max_learn.sh`
- do not change launchd schedules

Use only the prepared scripts below.

## Installed Background System
LaunchAgents:
- `com.rubikvault.quantlab.v5-training.day`
- `com.rubikvault.quantlab.v5-training.day.keepalive`
- `com.rubikvault.quantlab.v5-training.night`
- `com.rubikvault.quantlab.v5-training.night.keepalive`

Schedules:
- day start: 10:30 local
- day keepalive: hourly at `:30` from 11:30 through 17:30 local
- night start: 23:00 local
- night keepalive: hourly at `:30` from 23:30 through 07:30 local

Prepared scripts:
- status: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_training_status.py`
- refresh: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_refresh_predictions.py`
- keeper: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_training_keeper.py`
- forecast outcome backfill: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/forecast/backfill_outcomes.mjs`
- 5-day stability report: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/learning/run-5day-stability-observation.mjs`
- safe operator: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh`
- baseline job status: `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py`

## Read-Only Status Commands
Primary status:
```bash
python3 /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_training_status.py
```

QuantLab operator status:
```bash
python3 /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py
```

Current snapshot counts:
```bash
jq '.meta.verified_counts' /Users/michaelpuchowezki/Dev/rubikvault-site/public/data/snapshots/best-setups-v4.json
```

Current analyzer quality:
```bash
jq '.features.stock_analyzer | {learning_status, precision_10, precision_50, accuracy_all, coverage_7d, safety_switch, false_positive_classes_30d}' /Users/michaelpuchowezki/Dev/rubikvault-site/public/data/reports/learning-report-latest.json
```

ETF diagnosis:
```bash
cat /Users/michaelpuchowezki/Dev/rubikvault-site/public/data/reports/best-setups-etf-diagnostic-latest.json
```

Forecast calibration summary:
```bash
cat /Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/forecast/champion/calibration_latest.json
```

5-day stability report:
```bash
cat /Users/michaelpuchowezki/Dev/rubikvault-site/public/data/reports/learning-stability-5d-latest.json
```

SSOT parity summary:
```bash
cat /Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/learning/reports/best-setups-ssot-parity-latest.json
```

## Logs
Launchd logs:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_day.out.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_day.err.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_day_keepalive.out.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_day_keepalive.err.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_night.out.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_night.err.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_night_keepalive.out.log`
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_night_keepalive.err.log`

Safe tail examples:
```bash
tail -n 80 /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/launchd_v5_training_night_keepalive.out.log
```

## Job State and Refresh State
Training jobs live under:
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/jobs/`

Refresh state for a completed job lives next to the job:
- `<job_dir>/v5_refresh_status.json`

A completed refresh is indicated by:
- `status = completed`

## Safe Restart / Recovery Commands
Re-run day keepalive safely:
```bash
launchctl kickstart -k gui/$(id -u)/com.rubikvault.quantlab.v5-training.day.keepalive
```

Re-run night keepalive safely:
```bash
launchctl kickstart -k gui/$(id -u)/com.rubikvault.quantlab.v5-training.night.keepalive
```

Manual safe refresh for the latest day or night job:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/quantlab/.venv/bin/python /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_refresh_predictions.py --mode day --job-dir <ABS_JOB_DIR>
```
or
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/quantlab/.venv/bin/python /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/v5_refresh_predictions.py --mode night --job-dir <ABS_JOB_DIR>
```

Manual install/reload of all launch agents:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/install_v5_training_launchd.sh --run-now
```

## What “Healthy” Looks Like
- active lock only while a day or night job is truly running
- latest job summary progresses from `pending/running` to `done`
- `<job_dir>/v5_refresh_status.json` becomes `completed`
- SSOT parity stays green
- `learning_status` moves away from `SAFE_MODE` only because quality improves, never because policy is loosened
- ETF diagnosis changes from `SNAPSHOT_GATE_REJECTION` toward actual verified ETF rows
- forecast calibration gains real sample counts for `1d`, `5d`, `20d`

## What Counts as a Problem
- active lock with no real progress for multiple keepalive cycles
- repeated failed refresh status
- parity report no longer green
- learning report stays `SAFE_MODE` with falling precision
- ETF diagnosis regresses upstream from snapshot gate back to agent/publish failure
- calibration files stop updating

## Escalation Policy
Another AI may:
- inspect
- summarize
- kickstart
- rerun refresh
- report the latest metrics

Another AI may not:
- patch code
- delete locks manually
- change policy thresholds
- replace training commands
- disable safety logic

## Daily Checklist For Another AI
1. run the status script
2. inspect latest day and night job summaries
3. confirm refresh status completed for the latest completed jobs
4. confirm snapshot + learning report updated
5. confirm parity is still green
6. if a run is stuck, kickstart the matching keepalive agent only
7. if refresh is missing, rerun only the prepared refresh script
