#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUANT_ROOT="${Q1_QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
PYTHON_BIN="${Q1_PYTHON_BIN:-$REPO_ROOT/quantlab/.venv/bin/python}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
LABEL="com.rubikvault.quantlab.self-heal"
LOCK_FILE="$QUANT_ROOT/ops/locks/quantlab_self_heal.lock.json"
LOG_DIR="$QUANT_ROOT/logs"
STATUS_PUBLIC="$REPO_ROOT/public/data/quantlab/status/local-automation-status.json"
STATUS_MIRROR="$REPO_ROOT/mirrors/quantlab/status/local-automation-status.json"
mkdir -p "$LOG_DIR" "$(dirname "$LOCK_FILE")" "$(dirname "$STATUS_PUBLIC")" "$(dirname "$STATUS_MIRROR")"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_FILE="$LOG_DIR/quantlab_self_heal_${TS}.log"
LATEST_LINK="$LOG_DIR/quantlab_self_heal.latest.log"
touch "$LOG_FILE"
ln -sfn "$LOG_FILE" "$LATEST_LINK"

BACKBONE_RC=""
STAGEA_RC=""
REPORT_RC=""
FINAL_RC=""
SUMMARY_SEVERITY=""
SUMMARY_MESSAGE=""
SUMMARY_REPORT_DATE=""
V7_ENV_FILE=""
V7_ENV_SOURCE="missing"
STATUS_PHASE="starting"
FINISHED_AT=""
BACKBONE_TIMEOUT_SEC="${Q1_SELF_HEAL_BACKBONE_TIMEOUT_SEC:-10800}"
STAGEA_TIMEOUT_SEC="${Q1_SELF_HEAL_STAGEA_TIMEOUT_SEC:-7200}"
REPORT_TIMEOUT_SEC="${Q1_SELF_HEAL_REPORT_TIMEOUT_SEC:-3600}"

find_bin() {
  local preferred="$1"
  local name="$2"
  if [[ -n "$preferred" && -x "$preferred" ]]; then
    printf '%s\n' "$preferred"
    return 0
  fi
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  return 1
}

NODE_BIN="$(find_bin "${NODE_BIN:-}" node || true)"
if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "FATAL: python not executable: $PYTHON_BIN" >&2
  exit 2
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "FATAL: node not found" >&2
  exit 2
fi

pid_alive() {
  local pid="${1:-0}"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

run_with_timeout() {
  local timeout_sec="$1"
  shift
  python3 - <<'PY' "$timeout_sec" "$@"
import subprocess
import sys

timeout_sec = int(sys.argv[1])
cmd = sys.argv[2:]
try:
    completed = subprocess.run(cmd, check=False, timeout=timeout_sec)
except subprocess.TimeoutExpired:
    print(f"TIMEOUT_EXPIRED: {timeout_sec}s", file=sys.stderr, flush=True)
    raise SystemExit(124)
except Exception as exc:
    print(f"FAILED_TO_START: {exc}", file=sys.stderr, flush=True)
    raise SystemExit(125)
raise SystemExit(completed.returncode)
PY
}

resolve_v7_env() {
  local candidate
  for candidate in \
    "${Q1_V7_REFRESH_ENV_FILE:-}" \
    "$REPO_ROOT/.env.local"
  do
    if [[ -n "$candidate" && -f "$candidate" ]]; then
      V7_ENV_FILE="$candidate"
      if [[ "$candidate" == "${Q1_V7_REFRESH_ENV_FILE:-}" ]]; then
        V7_ENV_SOURCE="env_override"
      else
        V7_ENV_SOURCE="repo_env_local"
      fi
      return 0
    fi
  done
  local token="${EODHD_API_KEY:-${EODHD_API_TOKEN:-}}"
  if [[ -n "$token" && "$token" != "DEIN_KEY" ]]; then
    V7_ENV_FILE=""
    V7_ENV_SOURCE="process_env"
    return 0
  fi
  V7_ENV_FILE=""
  V7_ENV_SOURCE="missing"
  return 1
}

write_status() {
  STATUS_PHASE="${1:-$STATUS_PHASE}"
  export STATUS_PHASE STARTED_AT FINISHED_AT LOG_FILE LABEL LOCK_FILE BACKBONE_RC STAGEA_RC REPORT_RC FINAL_RC
  export SUMMARY_SEVERITY SUMMARY_MESSAGE SUMMARY_REPORT_DATE V7_ENV_FILE V7_ENV_SOURCE STATUS_PUBLIC STATUS_MIRROR
  python3 - <<'PY'
import json
import os
import socket
import tempfile
from pathlib import Path

def as_int(value):
    try:
        return int(str(value).strip())
    except Exception:
        return None

def write_atomic(path_str, payload):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    Path(tmp_name).replace(path)

payload = {
    "schema": "rv_quantlab_local_automation_status_v1",
    "label": os.environ.get("LABEL"),
    "phase": os.environ.get("STATUS_PHASE"),
    "startedAt": os.environ.get("STARTED_AT") or None,
    "finishedAt": os.environ.get("FINISHED_AT") or None,
    "host": socket.gethostname(),
    "logFile": os.environ.get("LOG_FILE") or None,
    "lockFile": os.environ.get("LOCK_FILE") or None,
    "v7RefreshEnv": {
        "path": os.environ.get("V7_ENV_FILE") or None,
        "source": os.environ.get("V7_ENV_SOURCE") or None,
    },
    "steps": {
        "backbone": {"exitCode": as_int(os.environ.get("BACKBONE_RC"))},
        "stagea_daily": {"exitCode": as_int(os.environ.get("STAGEA_RC"))},
        "report_publish": {"exitCode": as_int(os.environ.get("REPORT_RC"))},
    },
    "freshness": {
        "severity": os.environ.get("SUMMARY_SEVERITY") or None,
        "message": os.environ.get("SUMMARY_MESSAGE") or None,
        "reportDate": os.environ.get("SUMMARY_REPORT_DATE") or None,
    },
    "exitCode": as_int(os.environ.get("FINAL_RC")),
    "ok": as_int(os.environ.get("FINAL_RC")) == 0 if os.environ.get("FINAL_RC") else None,
}
for target in [os.environ.get("STATUS_PUBLIC"), os.environ.get("STATUS_MIRROR")]:
    if target:
        write_atomic(target, payload)
PY
}

finish_run() {
  FINAL_RC="${1:-0}"
  STATUS_PHASE="${2:-completed}"
  FINISHED_AT="${FINISHED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  write_status "$STATUS_PHASE"
  exit "$FINAL_RC"
}

cleanup() {
  local rc=$?
  rm -f "$LOCK_FILE"
  if [[ -z "${FINISHED_AT:-}" ]]; then
    FINAL_RC="${FINAL_RC:-$rc}"
    FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [[ "${FINAL_RC:-1}" -eq 0 ]]; then
      write_status "${STATUS_PHASE:-completed}"
    else
      SUMMARY_SEVERITY="${SUMMARY_SEVERITY:-error}"
      SUMMARY_MESSAGE="${SUMMARY_MESSAGE:-QuantLab self-heal exited unexpectedly.}"
      write_status "unexpected_exit"
    fi
  fi
}
trap cleanup EXIT

on_signal() {
  SUMMARY_SEVERITY="error"
  SUMMARY_MESSAGE="QuantLab self-heal interrupted by signal."
  finish_run 130 "interrupted"
}
trap on_signal INT TERM HUP

if [[ -f "$LOCK_FILE" ]]; then
  EXISTING_PID="$(
    python3 - <<'PY' "$LOCK_FILE"
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    obj = json.loads(path.read_text())
    print(int(obj.get("pid") or 0))
except Exception:
    print(0)
PY
  )"
  if pid_alive "$EXISTING_PID"; then
    FINAL_RC=0
    SUMMARY_SEVERITY="info"
    SUMMARY_MESSAGE="Existing self-heal run is still active."
    FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    write_status "noop_active_lock"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

export SHELL_LOCK_PID="$$"
python3 - <<'PY' "$LOCK_FILE"
import json, os, socket, sys
from pathlib import Path
path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({
    "pid": int(os.environ.get("SHELL_LOCK_PID") or 0),
    "host": socket.gethostname(),
}))
PY

resolve_v7_env || true
write_status "starting"

{
  echo "[quantlab-self-heal] started_utc=$STARTED_AT"
  echo "[quantlab-self-heal] repo_root=$REPO_ROOT"
  echo "[quantlab-self-heal] quant_root=$QUANT_ROOT"
  echo "[quantlab-self-heal] v7_env_source=$V7_ENV_SOURCE"
  echo "[quantlab-self-heal] v7_env_file=${V7_ENV_FILE:-none}"
} | tee "$LOG_FILE"

BACKBONE_CMD=(
  env PYTHONUNBUFFERED=1 "$PYTHON_BIN" "$REPO_ROOT/scripts/quantlab/run_q1_daily_data_backbone_q1.py"
  --quant-root "$QUANT_ROOT"
  --production-mode
  --v4-final-profile
)
if [[ -n "$V7_ENV_FILE" ]]; then
  BACKBONE_CMD+=(--v7-refresh-env-file "$V7_ENV_FILE")
fi

set +e
write_status "backbone_running"
run_with_timeout "$BACKBONE_TIMEOUT_SEC" "${BACKBONE_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
BACKBONE_RC=${PIPESTATUS[0]}
set -e

STAGEA_CMD=(/bin/bash "$REPO_ROOT/scripts/quantlab/run_q1_panel_stage_a_daily_local.sh")
set +e
write_status "stagea_running"
run_with_timeout "$STAGEA_TIMEOUT_SEC" "${STAGEA_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
STAGEA_RC=${PIPESTATUS[0]}
set -e

REPORT_CMD=(/bin/bash "$REPO_ROOT/scripts/quantlab/run_quantlab_v4_daily_report.sh")
set +e
write_status "report_running"
run_with_timeout "$REPORT_TIMEOUT_SEC" "${REPORT_CMD[@]}" 2>&1 | tee -a "$LOG_FILE"
REPORT_RC=${PIPESTATUS[0]}
set -e

readarray -t FRESHNESS_LINES < <(
  python3 - <<'PY' "$REPO_ROOT/public/data/quantlab/status/operational-status.json"
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
if not path.exists():
    print("")
    print("")
    print("")
    raise SystemExit(0)
obj = json.loads(path.read_text())
summary = obj.get("summary") or {}
print(str(summary.get("severity") or ""))
print(str(summary.get("message") or ""))
print(str(obj.get("reportDate") or ""))
PY
)
SUMMARY_SEVERITY="${FRESHNESS_LINES[0]:-}"
SUMMARY_MESSAGE="${FRESHNESS_LINES[1]:-}"
SUMMARY_REPORT_DATE="${FRESHNESS_LINES[2]:-}"

FINAL_RC=0
if [[ "${BACKBONE_RC:-0}" -ne 0 || "${STAGEA_RC:-0}" -ne 0 || "${REPORT_RC:-0}" -ne 0 ]]; then
  FINAL_RC=1
fi
FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
write_status "completed"

{
  echo "[quantlab-self-heal] backbone_exit_code=${BACKBONE_RC:-}"
  echo "[quantlab-self-heal] stagea_exit_code=${STAGEA_RC:-}"
  echo "[quantlab-self-heal] report_exit_code=${REPORT_RC:-}"
  echo "[quantlab-self-heal] freshness_severity=${SUMMARY_SEVERITY:-unknown}"
  echo "[quantlab-self-heal] finished_utc=$FINISHED_AT"
  echo "[quantlab-self-heal] exit_code=$FINAL_RC"
} | tee -a "$LOG_FILE"

finish_run "$FINAL_RC" "completed"
