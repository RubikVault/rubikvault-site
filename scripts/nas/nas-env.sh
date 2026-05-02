#!/usr/bin/env bash

if [[ -n "${RV_NAS_ENV_SOURCED:-}" ]] && declare -F nas_assert_global_lock_clear >/dev/null 2>&1; then
  return 0 2>/dev/null || exit 0
fi
export RV_NAS_ENV_SOURCED=1

_rv_nas_env_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_rv_nas_repo_root_default="$(cd "$_rv_nas_env_dir/../.." && pwd)"

export REPO_ROOT="${REPO_ROOT:-$_rv_nas_repo_root_default}"
export NAS_DEV_ROOT="${NAS_DEV_ROOT:-/volume1/homes/neoboy/Dev/rubikvault-site}"
export NAS_OPS_ROOT="${NAS_OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
export NAS_QUANT_ROOT="${NAS_QUANT_ROOT:-/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab}"

if [[ -f "$NAS_OPS_ROOT/tooling/env.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NAS_OPS_ROOT/tooling/env.sh"
fi

export NAS_DEV_ROOT="${NAS_DEV_ROOT:-/volume1/homes/neoboy/Dev/rubikvault-site}"
export NAS_OPS_ROOT="${NAS_OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
export NAS_QUANT_ROOT="${NAS_QUANT_ROOT:-/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab}"

export OPS_ROOT="${OPS_ROOT:-$NAS_OPS_ROOT}"
export QUANT_ROOT="${QUANT_ROOT:-$NAS_QUANT_ROOT}"
export RV_EODHD_ENV_FILE="${RV_EODHD_ENV_FILE:-$NAS_DEV_ROOT/.env.local}"
export RV_CLOUDFLARE_ENV_FILE="${RV_CLOUDFLARE_ENV_FILE:-$NAS_OPS_ROOT/secrets/cloudflare.env}"

# EODHD daily-fetch robustness (consumed by rv-nas-night-supervisor.sh + refresh_v7_history_from_eodhd.py).
# Floor below which the budget pre-flight blocks the market_data_refresh step.
export RV_MARKET_REFRESH_MIN_EODHD_AVAILABLE_CALLS="${RV_MARKET_REFRESH_MIN_EODHD_AVAILABLE_CALLS:-10000}"
# Bulk-yield guard: abort further EODHD use if the bulk fetch underdelivers.
export RV_EODHD_BULK_MIN_YIELD_RATIO="${RV_EODHD_BULK_MIN_YIELD_RATIO:-0.80}"
export RV_EODHD_BULK_MIN_ROWS_MATCHED="${RV_EODHD_BULK_MIN_ROWS_MATCHED:-50000}"
# Hard kill ceiling on EODHD attempts (eodhd weighted). Distinct from soft --max-eodhd-calls.
export RV_EODHD_HARD_DAILY_CAP="${RV_EODHD_HARD_DAILY_CAP:-90000}"

export NAS_RUNTIME_ROOT="${NAS_RUNTIME_ROOT:-$NAS_OPS_ROOT/runtime}"
export NAS_LOCK_ROOT="${NAS_LOCK_ROOT:-$NAS_RUNTIME_ROOT/locks}"
export NAS_REPORTS_ROOT="${NAS_REPORTS_ROOT:-$NAS_RUNTIME_ROOT/reports}"
export NAS_LOG_ROOT="${NAS_LOG_ROOT:-$NAS_RUNTIME_ROOT/logs}"
export NAS_JOURNAL_ROOT="${NAS_JOURNAL_ROOT:-$NAS_RUNTIME_ROOT/journal}"
export NAS_LAUNCH_ROOT="${NAS_LAUNCH_ROOT:-$NAS_RUNTIME_ROOT/launch}"
export NAS_NIGHT_PIPELINE_ROOT="${NAS_NIGHT_PIPELINE_ROOT:-$NAS_RUNTIME_ROOT/night-pipeline}"

# ── Pipeline artifact directories (NAS-only) ──────────────────────────────────
# Large pipeline artifacts that must NOT land in public/ or the Pages deploy bundle.
# Each env var redirects the corresponding script's output away from public/data/.
# The Pages runtime never needs these files; they are NAS-internal build state.
#
# RV_GLOBAL_MANIFEST_DIR  → build-history-pack-manifest.mjs (--scope global)
#   Keeps pack-manifest.global.json (~40 MB) out of public/data/eod/history/.
#   Note: pack-manifest.us-eu.json always stays in public/ — it IS served at runtime.
#
# RV_MARKETPHASE_DEEP_SUMMARY_PATH → build-marketphase-deep-summary.mjs
#   Keeps marketphase_deep_summary.json (~35 MB) out of public/data/universe/v7/read_models/.
export NAS_PIPELINE_ARTIFACTS_ROOT="${NAS_PIPELINE_ARTIFACTS_ROOT:-$NAS_OPS_ROOT/pipeline-artifacts}"
export RV_GLOBAL_MANIFEST_DIR="${RV_GLOBAL_MANIFEST_DIR:-$NAS_PIPELINE_ARTIFACTS_ROOT/manifests}"
export RV_MARKETPHASE_DEEP_SUMMARY_PATH="${RV_MARKETPHASE_DEEP_SUMMARY_PATH:-$NAS_PIPELINE_ARTIFACTS_ROOT/marketphase_deep_summary.json}"

nas_now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

nas_python_has_modules() {
  local python_bin="${1:-}"
  shift || true
  [[ -n "$python_bin" ]] || return 1
  if [[ "$python_bin" == "python3" ]]; then
    python_bin="$(command -v python3 2>/dev/null || true)"
  fi
  [[ -n "$python_bin" && -x "$python_bin" ]] || return 1
  "$python_bin" - "$@" >/dev/null 2>&1 <<'PY'
import importlib
import sys

for name in sys.argv[1:]:
    importlib.import_module(name)
PY
}

nas_find_python_with_modules() {
  local -a required_modules=("$@")
  local -a candidates=()
  local resolved_python3=""
  resolved_python3="$(command -v python3 2>/dev/null || true)"

  [[ -n "${RV_Q1_PYTHON_BIN:-}" ]] && candidates+=("${RV_Q1_PYTHON_BIN}")
  candidates+=(
    "/usr/bin/python3"
    "$resolved_python3"
    "$NAS_OPS_ROOT/tooling/bin/python3"
    "$NAS_OPS_ROOT/tooling/venv39/bin/python"
  )

  local candidate seen=""
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" ]] || continue
    case ":$seen:" in
      *":$candidate:"*) continue ;;
    esac
    seen="${seen}:$candidate"
    if nas_python_has_modules "$candidate" "${required_modules[@]}"; then
      if [[ "$candidate" == "python3" ]]; then
        command -v python3
      else
        printf '%s\n' "$candidate"
      fi
      return 0
    fi
  done
  return 1
}

if [[ -z "${RV_Q1_PYTHON_BIN:-}" ]]; then
  export RV_Q1_PYTHON_BIN="$(nas_find_python_with_modules pyarrow pandas requests || true)"
fi

if [[ -z "${RV_BREAKOUT_PYTHON_BIN:-}" ]]; then
  export RV_BREAKOUT_PYTHON_BIN="$(nas_find_python_with_modules polars || true)"
fi

nas_is_placeholder_secret() {
  local value
  value="$(printf '%s' "${1:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/^['\"]//" -e "s/['\"]$//")"
  case "$value" in
    ""|DEIN_KEY|YOUR_KEY|YOUR_API_KEY|API_KEY|CHANGE_ME|CHANGEME|REPLACE_ME|REPLACEME|TOKEN_HERE)
      return 0
      ;;
  esac
  return 1
}

nas_load_env_file_secret() {
  local env_file="$1"
  local key="$2"
  [[ -f "$env_file" ]] || return 1
  local raw value current_key
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    raw="${raw#"${raw%%[![:space:]]*}"}"
    raw="${raw%"${raw##*[![:space:]]}"}"
    [[ -n "$raw" && "$raw" != \#* && "$raw" == *=* ]] || continue
    current_key="${raw%%=*}"
    current_key="${current_key#"${current_key%%[![:space:]]*}"}"
    current_key="${current_key%"${current_key##*[![:space:]]}"}"
    [[ "$current_key" == "$key" ]] || continue
    value="${raw#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value%$'\r'}"
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"
    if ! nas_is_placeholder_secret "$value"; then
      printf '%s\n' "$value"
      return 0
    fi
    export RV_EODHD_PROVIDER_KEY_STATUS="placeholder_provider_key"
    return 2
  done < "$env_file"
  return 1
}

nas_export_provider_secrets() {
  local env_file="${1:-$RV_EODHD_ENV_FILE}"
  export RV_EODHD_PROVIDER_KEY_STATUS="${RV_EODHD_PROVIDER_KEY_STATUS:-missing_provider_key}"
  local key_value token_value cloudflare_token_value cloudflare_account_value cloudflare_project_value
  local cloudflare_env_file="${RV_CLOUDFLARE_ENV_FILE:-}"

  if nas_is_placeholder_secret "${EODHD_API_KEY:-}"; then
    unset EODHD_API_KEY
  else
    export RV_EODHD_PROVIDER_KEY_STATUS="ok"
  fi
  if nas_is_placeholder_secret "${EODHD_API_TOKEN:-}"; then
    unset EODHD_API_TOKEN
  else
    export RV_EODHD_PROVIDER_KEY_STATUS="ok"
  fi

  if [[ -z "${EODHD_API_KEY:-}" ]]; then
    key_value="$(nas_load_env_file_secret "$env_file" "EODHD_API_KEY" || true)"
    if [[ -n "$key_value" ]]; then
      export EODHD_API_KEY="$key_value"
      export RV_EODHD_PROVIDER_KEY_STATUS="ok"
    fi
  fi

  if [[ -z "${EODHD_API_TOKEN:-}" ]]; then
    token_value="$(nas_load_env_file_secret "$env_file" "EODHD_API_TOKEN" || true)"
    if [[ -n "$token_value" ]]; then
      export EODHD_API_TOKEN="$token_value"
      export RV_EODHD_PROVIDER_KEY_STATUS="ok"
    fi
  fi

  if nas_is_placeholder_secret "${CLOUDFLARE_API_TOKEN:-}"; then
    unset CLOUDFLARE_API_TOKEN
  fi
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    cloudflare_token_value="$(nas_load_env_file_secret "$env_file" "CLOUDFLARE_API_TOKEN" || true)"
    if [[ -z "$cloudflare_token_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_token_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CLOUDFLARE_API_TOKEN" || true)"
    fi
    if [[ -z "$cloudflare_token_value" ]]; then
      cloudflare_token_value="$(nas_load_env_file_secret "$env_file" "CF_API_TOKEN" || true)"
    fi
    if [[ -z "$cloudflare_token_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_token_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CF_API_TOKEN" || true)"
    fi
    if [[ -n "$cloudflare_token_value" ]]; then
      export CLOUDFLARE_API_TOKEN="$cloudflare_token_value"
    fi
  fi

  if nas_is_placeholder_secret "${CLOUDFLARE_ACCOUNT_ID:-}"; then
    unset CLOUDFLARE_ACCOUNT_ID
  fi
  if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    cloudflare_account_value="$(nas_load_env_file_secret "$env_file" "CLOUDFLARE_ACCOUNT_ID" || true)"
    if [[ -z "$cloudflare_account_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_account_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CLOUDFLARE_ACCOUNT_ID" || true)"
    fi
    if [[ -z "$cloudflare_account_value" ]]; then
      cloudflare_account_value="$(nas_load_env_file_secret "$env_file" "CF_ACCOUNT_ID" || true)"
    fi
    if [[ -z "$cloudflare_account_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_account_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CF_ACCOUNT_ID" || true)"
    fi
    if [[ -n "$cloudflare_account_value" ]]; then
      export CLOUDFLARE_ACCOUNT_ID="$cloudflare_account_value"
    fi
  fi

  if nas_is_placeholder_secret "${CLOUDFLARE_PROJECT_NAME:-}"; then
    unset CLOUDFLARE_PROJECT_NAME
  fi
  if [[ -z "${CLOUDFLARE_PROJECT_NAME:-}" ]]; then
    cloudflare_project_value="$(nas_load_env_file_secret "$env_file" "CLOUDFLARE_PROJECT_NAME" || true)"
    if [[ -z "$cloudflare_project_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_project_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CLOUDFLARE_PROJECT_NAME" || true)"
    fi
    if [[ -z "$cloudflare_project_value" ]]; then
      cloudflare_project_value="$(nas_load_env_file_secret "$env_file" "CF_PAGES_PROJECT_NAME" || true)"
    fi
    if [[ -z "$cloudflare_project_value" && -n "$cloudflare_env_file" && "$cloudflare_env_file" != "$env_file" ]]; then
      cloudflare_project_value="$(nas_load_env_file_secret "$cloudflare_env_file" "CF_PAGES_PROJECT_NAME" || true)"
    fi
    if [[ -n "$cloudflare_project_value" ]]; then
      export CLOUDFLARE_PROJECT_NAME="$cloudflare_project_value"
    fi
  fi
}

nas_export_provider_secrets "$RV_EODHD_ENV_FILE"

nas_mem_available_kb() {
  awk '/MemAvailable:/ {print $2}' /proc/meminfo
}

nas_swap_used_kb() {
  awk '
    /SwapTotal:/ {total=$2}
    /SwapFree:/ {free=$2}
    END {print total - free}
  ' /proc/meminfo
}

nas_global_lock_path() {
  local name="$1"
  case "$name" in
    night-pipeline|night_pipeline)
      printf '%s\n' "$NAS_LOCK_ROOT/night-pipeline.lock"
      ;;
    open-probe|open_probe)
      printf '%s\n' "$NAS_LOCK_ROOT/open-probe.lock"
      ;;
    native-matrix|native_matrix)
      printf '%s\n' "$NAS_LOCK_ROOT/native-matrix.lock"
      ;;
    q1-writer|q1_writer)
      printf '%s\n' "$NAS_LOCK_ROOT/q1-writer.lock"
      ;;
    *)
      printf '%s\n' "$NAS_LOCK_ROOT/${name}.lock"
      ;;
  esac
}

nas_lock_pid() {
  local lock_dir="$1"
  if [[ -f "$lock_dir/pid" ]]; then
    cat "$lock_dir/pid" 2>/dev/null || true
  fi
}

nas_pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

nas_lock_is_active() {
  local name="$1"
  local lock_dir
  lock_dir="$(nas_global_lock_path "$name")"
  [[ -d "$lock_dir" ]] || return 1
  local pid
  pid="$(nas_lock_pid "$lock_dir")"
  if nas_pid_alive "$pid"; then
    return 0
  fi
  return 2
}

nas_refresh_global_lock() {
  local name="$1"
  local lock_dir
  lock_dir="$(nas_global_lock_path "$name")"
  [[ -d "$lock_dir" ]] || return 0
  mkdir -p "$lock_dir"
  printf '%s\n' "$$" > "$lock_dir/pid"
  nas_now_utc > "$lock_dir/heartbeat"
}

nas_release_global_lock() {
  local name="$1"
  local lock_dir
  lock_dir="$(nas_global_lock_path "$name")"
  rm -rf "$lock_dir"
}

nas_acquire_global_lock() {
  local name="$1"
  local lock_dir
  lock_dir="$(nas_global_lock_path "$name")"
  mkdir -p "$(dirname "$lock_dir")"

  if mkdir "$lock_dir" 2>/dev/null; then
    nas_refresh_global_lock "$name"
    return 0
  fi

  local existing_pid
  existing_pid="$(nas_lock_pid "$lock_dir")"
  if nas_pid_alive "$existing_pid"; then
    echo "lock_busy name=$name path=$lock_dir pid=$existing_pid" >&2
    return 90
  fi

  rm -rf "$lock_dir"
  mkdir -p "$lock_dir"
  nas_refresh_global_lock "$name"
}

nas_assert_global_lock_clear() {
  local name="$1"
  local lock_dir
  lock_dir="$(nas_global_lock_path "$name")"
  local state
  set +e
  nas_lock_is_active "$name"
  state="$?"
  set -e
  if [[ "$state" -eq 0 ]]; then
    echo "lock_conflict name=$name path=$lock_dir pid=$(nas_lock_pid "$lock_dir")" >&2
    return 90
  fi
  if [[ "$state" -eq 2 ]]; then
    rm -rf "$lock_dir"
  fi
  return 0
}

nas_ensure_runtime_roots() {
  mkdir -p \
    "$NAS_RUNTIME_ROOT" \
    "$NAS_LOCK_ROOT" \
    "$NAS_REPORTS_ROOT" \
    "$NAS_LOG_ROOT" \
    "$NAS_JOURNAL_ROOT" \
    "$NAS_LAUNCH_ROOT" \
    "$NAS_NIGHT_PIPELINE_ROOT" \
    "$NAS_PIPELINE_ARTIFACTS_ROOT" \
    "$RV_GLOBAL_MANIFEST_DIR"
}

nas_detect_q1_writer_conflict() {
  python3 - "$NAS_QUANT_ROOT" <<'PY'
import glob
import json
import os
import subprocess
import sys
import time
from datetime import datetime

quant_root = sys.argv[1]
patterns = [
    "materialize_history_touch_delta_q1.py",
    "run_daily_delta_ingest_q1.py",
    "run_overnight_q1_training_sweep.py",
]
try:
    ps_lines = []
    for proc_dir in glob.glob("/proc/[0-9]*"):
        cmdline_path = os.path.join(proc_dir, "cmdline")
        try:
            with open(cmdline_path, "r", encoding="utf-8", errors="ignore") as handle:
                cmd = handle.read().replace("\x00", " ").strip()
            if cmd:
                ps_lines.append(cmd)
        except (OSError, IOError, PermissionError):
            continue
    if not ps_lines:
        raw = subprocess.check_output(["ps", "-o", "args"], text=True)
        ps_lines = [line.strip() for line in raw.splitlines() if line.strip()]
except Exception:
    ps_lines = []
for line in ps_lines:
    command = line.strip()
    if not command:
      continue
    if any(pattern in command for pattern in patterns):
      print("process_conflict")
      raise SystemExit(0)

def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False

def load_lock_pid(lock_path: str) -> int:
    try:
        raw = open(lock_path, "r", encoding="utf-8", errors="ignore").read().strip()
    except Exception:
        return 0
    if not raw:
        return 0
    try:
        doc = json.loads(raw)
        return int(doc.get("pid") or 0)
    except Exception:
        try:
            return int(raw)
        except Exception:
            return 0

cutoff = time.time() - (15 * 60)
for path in glob.glob(os.path.join(quant_root, "jobs", "**", "state.json"), recursive=True):
    try:
        doc = json.load(open(path, "r", encoding="utf-8"))
    except Exception:
        continue
    if doc.get("finished_at"):
        continue
    updated = doc.get("updated_at") or doc.get("heartbeat_at") or doc.get("started_at")
    try:
        ts = datetime.fromisoformat(str(updated).replace("Z", "+00:00")).timestamp()
    except Exception:
        ts = os.path.getmtime(path)
    if ts >= cutoff:
        job_root = os.path.dirname(path)
        per_job_lock = os.path.join(job_root, ".lock")
        if os.path.exists(per_job_lock):
            lock_pid = load_lock_pid(per_job_lock)
            if pid_alive(lock_pid):
                print("state_conflict")
                raise SystemExit(0)
        # No live process and no live per-job lock: treat recent unfinished state as stale/resumable.
        continue

for path in glob.glob(os.path.join(quant_root, "jobs", "_locks", "*.lock.json")):
    if os.path.exists(path):
        lock_pid = load_lock_pid(path)
        if pid_alive(lock_pid):
            print("lock_conflict")
            raise SystemExit(0)

print("")
PY
}
