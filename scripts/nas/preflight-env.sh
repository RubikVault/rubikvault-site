#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

lane="${RV_PIPELINE_LANE:-data-plane}"
for arg in "$@"; do
  case "$arg" in
    --lane=*)
      lane="${arg#*=}"
      ;;
  esac
done

errors=()

check_command() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || errors+=("missing_command:$cmd")
}

check_path_readable() {
  local path="$1"
  [[ -r "$path" ]] || errors+=("unreadable:$path")
}

check_writable_dir() {
  local dir="$1"
  mkdir -p "$dir" 2>/dev/null || errors+=("mkdir_failed:$dir")
  if [[ -d "$dir" ]]; then
    local probe="$dir/.preflight-write-$$"
    if ! : > "$probe" 2>/dev/null; then
      errors+=("write_failed:$dir")
    else
      rm -f "$probe"
    fi
  fi
}

node_major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
[[ "$node_major" == "20" ]] || errors+=("node_not_v20:$NODE_BIN")

check_command python3
if ! command -v git >/dev/null 2>&1; then
  printf 'warning=missing_command:git mode=rsync_mirror\n' >&2
fi
check_command jq
check_command rsync
check_command ps

python3 --version >/dev/null 2>&1 || errors+=("python3_unusable")

q1_python_bin="${RV_Q1_PYTHON_BIN:-}"
if [[ "$lane" == "data-plane" ]]; then
  if [[ -z "$q1_python_bin" ]]; then
    errors+=("missing_q1_python:pyarrow+pandas+requests")
  elif [[ ! -x "$q1_python_bin" ]]; then
    errors+=("q1_python_not_executable:$q1_python_bin")
  elif ! "$q1_python_bin" - <<'PY' >/dev/null 2>&1
import pyarrow  # noqa: F401
import pandas  # noqa: F401
import requests  # noqa: F401
PY
  then
    errors+=("q1_python_missing_modules:$q1_python_bin")
  fi
fi

check_writable_dir "$OPS_ROOT/runtime"
check_path_readable "$QUANT_ROOT"

provider_env_file="${RV_EODHD_ENV_FILE:-$NAS_DEV_ROOT/.env.local}"
if [[ ! -f "$provider_env_file" && -z "${EODHD_API_KEY:-}" && -z "${EODHD_API_TOKEN:-}" ]]; then
  errors+=("missing_env_file:$provider_env_file")
fi
if [[ "${RV_EODHD_PROVIDER_KEY_STATUS:-}" == "placeholder_provider_key" ]]; then
  errors+=("placeholder_provider_key:EODHD_API_KEY_OR_EODHD_API_TOKEN")
elif [[ -z "${EODHD_API_KEY:-}" && -z "${EODHD_API_TOKEN:-}" ]]; then
  errors+=("missing_provider_key:EODHD_API_KEY_OR_EODHD_API_TOKEN")
fi

drift_hits=()
if [[ -d "$NAS_DEV_ROOT/runtime" ]]; then
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    drift_hits+=("$path")
  done < <(
    find "$NAS_DEV_ROOT/runtime" \
      \( -name '*.lock' -o -name 'status.json' -o -name 'result.json' -o -name 'latest.json' \
         -o -type d -name 'campaigns' -o -type d -name 'reports' -o -type d -name 'supervisors' \
         -o -type d -name 'launch' -o -type d -name 'locks' \) \
      -print 2>/dev/null | sort
  )
fi
if (( ${#drift_hits[@]} > 0 )); then
  errors+=("runtime_drift_under_dev_root")
fi

if (( ${#errors[@]} > 0 )); then
  {
    printf 'preflight_env_failed lane=%s\n' "$lane"
    for item in "${errors[@]}"; do
      printf 'error=%s\n' "$item"
    done
    for hit in "${drift_hits[@]:0:20}"; do
      printf 'runtime_drift=%s\n' "$hit"
    done
  } >&2
  exit 1
fi

printf 'preflight_env_ok lane=%s node=%s python=%s\n' \
  "$lane" \
  "$("$NODE_BIN" --version 2>/dev/null)" \
  "$(python3 --version 2>/dev/null)"
if [[ -n "$q1_python_bin" ]]; then
  printf 'preflight_q1_python=%s\n' "$q1_python_bin"
fi
