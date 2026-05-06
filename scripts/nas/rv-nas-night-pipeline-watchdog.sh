#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -f "$REPO_ROOT/scripts/nas/nas-env.sh" ]]; then
  # shellcheck source=/dev/null
  source "$REPO_ROOT/scripts/nas/nas-env.sh"
fi

NAS_OPS_ROOT="${NAS_OPS_ROOT:-${OPS_ROOT:-$HOME/RepoOps/rubikvault-site}}"
PIPELINE_ROOT="${NAS_NIGHT_PIPELINE_ROOT:-$NAS_OPS_ROOT/runtime/night-pipeline}"
OUT_JSON="$PIPELINE_ROOT/watchdog-latest.json"
ALERT_JSON="$PIPELINE_ROOT/watchdog-alert-latest.json"
JOURNAL_DIR="$PIPELINE_ROOT/journal"
MIN_RATE_ASSETS_PER_MIN="${RV_WATCHDOG_MIN_RATE_ASSETS_PER_MIN:-300}"
STALE_PROGRESS_MIN="${RV_WATCHDOG_STALE_PROGRESS_MIN:-20}"

mkdir -p "$PIPELINE_ROOT" "$JOURNAL_DIR"

python3 - "$PIPELINE_ROOT" "$OUT_JSON" "$ALERT_JSON" "$JOURNAL_DIR" "$MIN_RATE_ASSETS_PER_MIN" "$STALE_PROGRESS_MIN" <<'PY'
import glob
import json
import os
import sys
import time
from datetime import datetime, timezone

pipeline_root, out_json, alert_json, journal_dir, min_rate_raw, stale_min_raw = sys.argv[1:7]
min_rate = float(min_rate_raw)
stale_min = float(stale_min_raw)
latest_path = os.path.join(pipeline_root, "latest.json")
now = time.time()

def parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None

def read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None

latest = read_json(latest_path) or {}
stamp = latest.get("campaign_stamp")
step = latest.get("current_step")
status = latest.get("last_status") or "unknown"
step_dir = os.path.join(pipeline_root, "runs", str(stamp or ""), str(step or ""))
stdout_path = os.path.join(step_dir, "stdout.log")
stderr_path = os.path.join(step_dir, "stderr.log")
result_path = os.path.join(step_dir, "result.json")
measure_path = os.path.join(step_dir, "measure.json")
resources_path = os.path.join(step_dir, "resources.ndjson")

progress = []
warnings = []
if os.path.exists(stdout_path):
    with open(stdout_path, errors="ignore") as fh:
        for line in fh:
            try:
                obj = json.loads(line.strip())
            except Exception:
                continue
            if isinstance(obj.get("progress"), dict):
                progress.append(obj["progress"])
            elif obj.get("warning"):
                warnings.append(obj)

last_progress = progress[-1] if progress else None
started_ts = parse_ts(latest.get("started_at"))
updated_ts = parse_ts(latest.get("updated_at"))
progress_mtime = os.path.getmtime(stdout_path) if os.path.exists(stdout_path) else None
rate = None
eta_min = None
deadline_ok = None
if started_ts and last_progress:
    completed = float(last_progress.get("completed") or 0)
    total = float(last_progress.get("total") or 0)
    elapsed_min = max(0.001, (now - started_ts) / 60.0)
    rate = completed / elapsed_min
    if rate > 0 and total >= completed:
        eta_min = (total - completed) / rate
        # This run was started before the default timeout was raised.
        timeout_sec = 14400 if stamp == "20260423T120558Z" else float(os.environ.get("RV_MARKET_REFRESH_TIMEOUT_SEC", "28800"))
        deadline_ok = now + eta_min * 60 < started_ts + timeout_sec

stale_progress_min = ((now - progress_mtime) / 60.0) if progress_mtime else None
resources_mtime = os.path.getmtime(resources_path) if os.path.exists(resources_path) else None
stale_resources_min = ((now - resources_mtime) / 60.0) if resources_mtime else None
result = read_json(result_path)
measure = read_json(measure_path)
stderr_tail = ""
if os.path.exists(stderr_path):
    with open(stderr_path, errors="ignore") as fh:
        stderr_tail = fh.read()[-3000:]

processes = []
for path in glob.glob("/proc/[0-9]*/cmdline"):
    try:
        cmd = open(path, "rb").read().replace(b"\0", b" ").decode("utf-8", "ignore").strip()
    except Exception:
        continue
    if not cmd or "python3 -" in cmd:
        continue
    if any(token in cmd for token in [
        "rv-nas-night-supervisor.sh",
        "measure-command.py",
        "refresh_v7_history_from_eodhd.py",
        "run_daily_delta_ingest_q1.py",
    ]):
        pid = path.split("/")[2]
        st = {}
        try:
            with open(f"/proc/{pid}/status", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if line.startswith(("State:", "VmRSS:", "VmSwap:", "Threads:")):
                        key, value = line.split(":", 1)
                        st[key] = value.strip()
        except Exception:
            pass
        processes.append({"pid": pid, "cmdline": cmd[:260], "status": st})

severity = "ok"
reasons = []
if status == "failed":
    severity = "critical"
    reasons.append("pipeline_failed")
elif status in {"completed", "success"}:
    severity = "ok"
elif status == "running":
    if step == "market_data_refresh" and rate is not None and rate < min_rate:
        severity = "warning"
        reasons.append("market_refresh_rate_below_threshold")
    if step == "market_data_refresh" and deadline_ok is False:
        severity = "critical"
        reasons.append("market_refresh_eta_exceeds_timeout")
    if stale_progress_min is not None and stale_progress_min > stale_min:
        severity = "critical"
        reasons.append("progress_log_stale")
    if stale_resources_min is not None and stale_resources_min > stale_min:
        severity = "critical"
        reasons.append("resource_samples_stale")
    if stale_progress_min is None and stale_resources_min is None and updated_ts and (now - updated_ts) / 60.0 > stale_min:
        severity = "critical"
        reasons.append("step_status_no_progress")
    if not processes:
        severity = "critical"
        reasons.append("no_pipeline_process_detected")
else:
    severity = "warning"
    reasons.append("unknown_pipeline_status")

doc = {
    "schema": "rv.nas.night_pipeline.watchdog.v1",
    "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "severity": severity,
    "reasons": reasons,
    "latest": latest,
    "current": {
        "campaign_stamp": stamp,
        "step": step,
        "status": status,
        "progress_events": len(progress),
        "last_progress": last_progress,
        "rate_assets_per_min": round(rate, 2) if rate is not None else None,
        "eta_min": round(eta_min, 1) if eta_min is not None else None,
        "eta_deadline_ok": deadline_ok,
        "stale_progress_min": round(stale_progress_min, 1) if stale_progress_min is not None else None,
        "stale_resources_min": round(stale_resources_min, 1) if stale_resources_min is not None else None,
        "warnings_tail": warnings[-3:],
        "stderr_tail": stderr_tail,
        "result": result,
        "measure": measure,
    },
    "thresholds": {
        "min_rate_assets_per_min": min_rate,
        "stale_progress_min": stale_min,
    },
    "processes": processes,
    "recovery_policy": {
        "mode": "alert_only",
        "no_parallel_recovery_owner": True,
        "manual_actions": ["inspect_step_logs", "resume_same_supervisor_only", "do_not_start_legacy_pipeline_master"],
    },
}

tmp = f"{out_json}.{os.getpid()}.tmp"
with open(tmp, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2, sort_keys=True)
    fh.write("\n")
os.replace(tmp, out_json)

if severity in {"warning", "critical"}:
    alert = {
        "schema": "rv.nas.pipeline_watchdog_alert.v1",
        "generated_at": doc["generated_at"],
        "severity": severity,
        "typed_failure_reason": reasons[0] if reasons else "unknown",
        "reasons": reasons,
        "campaign_stamp": stamp,
        "step": step,
        "status": status,
        "no_parallel_recovery_owner": True,
        "recovery_policy": doc["recovery_policy"],
        "artifact": out_json,
    }
    tmp_alert = f"{alert_json}.{os.getpid()}.tmp"
    with open(tmp_alert, "w", encoding="utf-8") as fh:
        json.dump(alert, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp_alert, alert_json)

journal_path = os.path.join(journal_dir, f"watchdog-{datetime.now(timezone.utc).date().isoformat()}.ndjson")
with open(journal_path, "a", encoding="utf-8") as fh:
    fh.write(json.dumps({
        "generated_at": doc["generated_at"],
        "severity": severity,
        "reasons": reasons,
        "campaign_stamp": stamp,
        "step": step,
        "status": status,
        "last_progress": last_progress,
        "rate_assets_per_min": doc["current"]["rate_assets_per_min"],
        "eta_min": doc["current"]["eta_min"],
        "typed_failure_reason": reasons[0] if reasons else None,
    }, sort_keys=True))
    fh.write("\n")

print(json.dumps({
    "severity": severity,
    "reasons": reasons,
    "campaign_stamp": stamp,
    "step": step,
    "status": status,
    "last_progress": last_progress,
    "rate_assets_per_min": doc["current"]["rate_assets_per_min"],
    "eta_min": doc["current"]["eta_min"],
}, sort_keys=True))
sys.exit(2 if severity == "critical" else 1 if severity == "warning" else 0)
PY
