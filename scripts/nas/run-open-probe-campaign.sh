#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
OPEN_ROOT="$OPS_ROOT/runtime/open-probes"
CAMPAIGN_DIR="$OPEN_ROOT/campaigns/$CAMPAIGN_STAMP"
RUNS_DIR="$OPEN_ROOT/runs/$CAMPAIGN_STAMP"
REPORTS_DIR="$OPEN_ROOT/reports"
LOCK_DIR="$OPEN_ROOT/locks/open-probe-campaign.lock"
STATUS_JSON="$CAMPAIGN_DIR/status.json"
CAMPAIGN_LOG="$CAMPAIGN_DIR/campaign.log"
SAMPLE_IDS_JSON="$CAMPAIGN_DIR/sample-canonical-ids.json"
SAMPLE_TICKERS_JSON="$CAMPAIGN_DIR/sample-tickers.json"
END_LOCAL_DATE="${END_LOCAL_DATE:-}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-20}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
MAX_CYCLES="${MAX_CYCLES:-480}"
SLEEP_BETWEEN_PROBES_SEC="${SLEEP_BETWEEN_PROBES_SEC:-15}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-120}"
PROBE_PLAN_VERSION="${PROBE_PLAN_VERSION:-2026-04-22-node-date}"
PROBE_MARKET_DATE="${PROBE_MARKET_DATE:-$(python3 - <<'PY'
import os
import subprocess
from datetime import datetime, timedelta

env = dict(os.environ)
env["TZ"] = "America/New_York"
raw = subprocess.check_output(["date", "+%Y-%m-%d %H"], env=env, text=True).strip()
ny = datetime.strptime(raw, "%Y-%m-%d %H")
candidate = ny.date()
if ny.weekday() >= 5 or ny.hour < 18:
    candidate -= timedelta(days=1)
while candidate.weekday() >= 5:
    candidate -= timedelta(days=1)
print(candidate.isoformat())
PY
)}"

mkdir -p "$CAMPAIGN_DIR" "$RUNS_DIR" "$REPORTS_DIR" "$(dirname "$LOCK_DIR")"
nas_ensure_runtime_roots
if [[ -L "$REPO_ROOT/mirrors/universe-v7/history" && ! -e "$REPO_ROOT/mirrors/universe-v7/history" ]]; then
  rm -f "$REPO_ROOT/mirrors/universe-v7/history"
fi
mkdir -p "$REPO_ROOT/mirrors/universe-v7/history" "$REPO_ROOT/mirrors/universe-v7/state" "$REPO_ROOT/public/data/eod/history"
: > "$CAMPAIGN_LOG"

nas_assert_global_lock_clear "night-pipeline"
nas_assert_global_lock_clear "native-matrix"
if [[ -n "$(nas_detect_q1_writer_conflict)" ]]; then
  echo "open_probe_blocked=q1_writer_conflict" >&2
  exit 91
fi
nas_acquire_global_lock "open-probe"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "open_probe_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
trap 'rm -rf "$LOCK_DIR"; nas_release_global_lock "open-probe"' EXIT

printf '%s\n' "$$" > "$LOCK_DIR/pid"

target_end_iso() {
  python3 - "$END_LOCAL_DATE" "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" <<'PY'
from datetime import datetime, timedelta
import sys

date_arg, hh, mm = sys.argv[1:4]
now = datetime.now().astimezone()
if date_arg:
    year, month, day = [int(part) for part in date_arg.split("-")]
    end = now.replace(year=year, month=month, day=day, hour=int(hh), minute=int(mm), second=0, microsecond=0)
else:
    end = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    if end <= now:
        end = end + timedelta(days=1)
print(end.isoformat())
PY
}

TARGET_END_LOCAL="$(target_end_iso)"
CAMPAIGN_PID="$$"

build_sample_inputs() {
  python3 - "$REPO_ROOT" "$SAMPLE_IDS_JSON" "$SAMPLE_TICKERS_JSON" <<'PY'
import json
import sys
from pathlib import Path
import gzip

repo_root = Path(sys.argv[1])
ids_path = Path(sys.argv[2])
tickers_path = Path(sys.argv[3])
rows_path = repo_root / "mirrors" / "universe-v7" / "ssot" / "stocks_etfs.us_eu.rows.json"
ids_source_path = repo_root / "public" / "data" / "universe" / "v7" / "ssot" / "stocks_etfs.us_eu.canonical.ids.json"
registry_path = repo_root / "public" / "data" / "universe" / "v7" / "registry" / "registry.ndjson.gz"
fallback_rows_path = repo_root / "mirrors" / "universe-v7" / "ssot" / "stocks.max.canonical.rows.json"
allowed_countries = {
    "UNITED STATES",
    "USA",
    "US",
    "UNITED KINGDOM",
    "UK",
    "GREAT BRITAIN",
    "IRELAND",
    "NETHERLANDS",
    "BELGIUM",
    "FRANCE",
    "GERMANY",
    "ITALY",
    "SPAIN",
    "PORTUGAL",
    "SWITZERLAND",
    "AUSTRIA",
    "DENMARK",
    "SWEDEN",
    "NORWAY",
    "FINLAND",
    "POLAND",
    "CZECH REPUBLIC",
    "CZECHIA",
    "SLOVAKIA",
    "SLOVENIA",
    "HUNGARY",
    "ROMANIA",
    "BULGARIA",
    "GREECE",
    "CROATIA",
    "LUXEMBOURG",
    "ESTONIA",
    "LATVIA",
    "LITHUANIA",
    "ICELAND",
    "MALTA",
    "CYPRUS",
    "JERSEY",
    "GUERNSEY",
    "ISLE OF MAN",
}

items = []
allowlist_ids = set()
try:
    payload = json.loads(rows_path.read_text())
    items = payload.get("items") if isinstance(payload, dict) else []
    if not isinstance(items, list):
        items = []
except Exception:
    items = []

if not items:
    try:
        payload = json.loads(ids_source_path.read_text())
        values = payload.get("canonical_ids") if isinstance(payload, dict) else []
        if isinstance(values, list):
            allowlist_ids = {str(value).strip() for value in values if str(value).strip()}
    except Exception:
        allowlist_ids = set()
    if allowlist_ids and registry_path.exists():
        try:
            with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    canonical_id = str(row.get("canonical_id") or "").strip()
                    type_norm = str(row.get("type_norm") or "").strip().upper()
                    country = str(row.get("country") or "").strip().upper()
                    if canonical_id not in allowlist_ids or type_norm not in {"STOCK", "ETF"}:
                        continue
                    items.append({
                        "canonical_id": canonical_id,
                        "symbol": row.get("symbol"),
                        "type_norm": type_norm,
                        "bars_count": row.get("bars_count"),
                        "country": country,
                        "exchange": row.get("exchange"),
                    })
                    if len(items) >= 512:
                        break
        except Exception:
            items = []

if not items:
    try:
        if registry_path.exists():
            with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
                for line in fh:
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    type_norm = str(row.get("type_norm") or "").strip().upper()
                    country = str(row.get("country") or "").strip().upper()
                    symbol = str(row.get("symbol") or "").strip().upper()
                    canonical_id = str(row.get("canonical_id") or "").strip()
                    bars_count = int(row.get("bars_count") or 0)
                    if type_norm not in {"STOCK", "ETF"} or country not in allowed_countries:
                        continue
                    if not canonical_id or not symbol or bars_count < 60:
                        continue
                    items.append({
                        "canonical_id": canonical_id,
                        "symbol": symbol,
                        "type_norm": type_norm,
                        "bars_count": bars_count,
                        "country": country,
                        "exchange": row.get("exchange"),
                    })
                    if len(items) >= 512:
                        break
        if not items:
            payload = json.loads(fallback_rows_path.read_text())
            values = payload.get("items") if isinstance(payload, dict) else []
            if isinstance(values, list):
                items = values
    except Exception:
        items = []

stocks = []
etfs = []
seen_ids = set()
seen_tickers = set()
for row in items:
    type_norm = str(row.get("type_norm") or "").strip().upper()
    canonical_id = str(row.get("canonical_id") or "").strip()
    symbol = str(row.get("symbol") or "").strip().upper()
    bars_count = int(row.get("bars_count") or 0)
    country = str(row.get("country") or "").strip().upper()
    if not canonical_id or not symbol or bars_count < 60:
        continue
    if country and country not in allowed_countries and not allowlist_ids:
        continue
    target = stocks if type_norm == "STOCK" else etfs if type_norm == "ETF" else None
    if target is None:
        continue
    if canonical_id in seen_ids or symbol in seen_tickers:
        continue
    target.append({"canonical_id": canonical_id, "symbol": symbol, "type_norm": type_norm})
    seen_ids.add(canonical_id)
    seen_tickers.add(symbol)
    if len(stocks) >= 8 and len(etfs) >= 4:
        break

selected = stocks[:8] + etfs[:4]
ids_payload = {"canonical_ids": [row["canonical_id"] for row in selected]}
tickers_payload = {
    "symbols": [row["symbol"] for row in selected],
    "stocks": [row["symbol"] for row in selected if row["type_norm"] == "STOCK"],
    "etfs": [row["symbol"] for row in selected if row["type_norm"] == "ETF"],
  }
ids_path.write_text(json.dumps(ids_payload, indent=2) + "\n", encoding="utf-8")
tickers_path.write_text(json.dumps(tickers_payload, indent=2) + "\n", encoding="utf-8")
PY
}

build_sample_inputs

if ! python3 - "$SAMPLE_IDS_JSON" "$SAMPLE_TICKERS_JSON" <<'PY'
import json
import sys

ids_path, tickers_path = sys.argv[1:3]
try:
    ids_doc = json.load(open(ids_path, "r", encoding="utf-8"))
    ticker_doc = json.load(open(tickers_path, "r", encoding="utf-8"))
except Exception:
    raise SystemExit(1)
ids = ids_doc.get("canonical_ids") if isinstance(ids_doc, dict) else []
symbols = ticker_doc.get("symbols") if isinstance(ticker_doc, dict) else []
stocks = ticker_doc.get("stocks") if isinstance(ticker_doc, dict) else []
print("ok" if ids and symbols and stocks else "empty")
raise SystemExit(0 if ids and symbols and stocks else 1)
PY
then
  echo "open_probe_sample_empty" >&2
  exit 92
fi

python3 - "$STATUS_JSON" "$CAMPAIGN_STAMP" "$TARGET_END_LOCAL" "$CAMPAIGN_PID" "$SAMPLE_IDS_JSON" "$SAMPLE_TICKERS_JSON" "$PROBE_PLAN_VERSION" <<'PY'
import json
import os
import sys

out_path, stamp, target_end, campaign_pid, sample_ids, sample_tickers, probe_plan_version = sys.argv[1:8]
doc = {
    "schema_version": "nas.open.probe.campaign.status.v1",
    "campaign_stamp": stamp,
    "started_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "target_end_local": target_end,
    "current_pid": int(campaign_pid),
    "last_heartbeat_at": __import__("datetime").datetime.now().astimezone().isoformat(),
    "cycles_completed": 0,
    "runs_completed": 0,
    "runs_failed": 0,
    "last_probe": None,
    "last_status": "running",
    "sample_ids_path": sample_ids,
    "sample_tickers_path": sample_tickers,
    "probe_plan_version": probe_plan_version,
}
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

should_continue() {
  python3 - "$STATUS_JSON" "$MAX_CYCLES" <<'PY'
import json
import sys
from datetime import datetime

status_path, max_cycles = sys.argv[1:3]
doc = json.load(open(status_path, "r", encoding="utf-8"))
now = datetime.now().astimezone()
end = datetime.fromisoformat(doc["target_end_local"])
ok = now < end and int(doc["cycles_completed"]) < int(max_cycles)
print("yes" if ok else "no")
PY
}

update_status() {
  local probe_id="$1"
  local status="$2"
  local ok="$3"
  python3 - "$STATUS_JSON" "$probe_id" "$status" "$ok" "$CAMPAIGN_PID" <<'PY'
import json
import sys

status_path, probe_id, status, ok, campaign_pid = sys.argv[1:6]
doc = json.load(open(status_path, "r", encoding="utf-8"))
doc["last_probe"] = probe_id
doc["last_status"] = status
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
doc["runs_completed"] = int(doc.get("runs_completed", 0)) + 1
if ok != "yes":
    doc["runs_failed"] = int(doc.get("runs_failed", 0)) + 1
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

advance_cycle() {
  local cycle="$1"
  python3 - "$STATUS_JSON" "$cycle" "$CAMPAIGN_PID" <<'PY'
import json
import sys

status_path, cycle, campaign_pid = sys.argv[1:4]
doc = json.load(open(status_path, "r", encoding="utf-8"))
doc["cycles_completed"] = int(cycle)
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

pick_stock_tickers() {
  python3 - "$SAMPLE_TICKERS_JSON" <<'PY'
import json
import sys
doc = json.load(open(sys.argv[1], "r", encoding="utf-8"))
values = doc.get("stocks") or doc.get("symbols") or []
print(",".join(values[:6]))
PY
}

pick_all_tickers() {
  python3 - "$SAMPLE_TICKERS_JSON" <<'PY'
import json
import sys
doc = json.load(open(sys.argv[1], "r", encoding="utf-8"))
values = doc.get("symbols") or []
print(",".join(values[:8]))
PY
}

run_probe() {
  local probe_id="$1"
  local timeout_sec="$2"
  local workdir="$3"
  shift 3
  local command="$*"
  local run_stamp
  run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local run_dir="$RUNS_DIR/${run_stamp}-${probe_id}"
  mkdir -p "$run_dir"
  printf 'probe=%s stamp=%s at=%s\n' "$probe_id" "$run_stamp" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"
  set +e
  python3 "$REPO_ROOT/scripts/nas/measure-command.py" \
    --cwd "$workdir" \
    --stdout "$run_dir/stdout.log" \
    --stderr "$run_dir/stderr.log" \
    --json "$run_dir/metrics.json" \
    --timeout-sec "$timeout_sec" \
    --command "$command"
  local exit_code="$?"
  set -e
  python3 - "$run_dir/result.json" "$probe_id" "$exit_code" "$workdir" "$command" "$run_stamp" <<'PY'
import json
import sys
from pathlib import Path

out_path, probe_id, exit_code, workdir, command, run_stamp = sys.argv[1:7]
run_dir = Path(out_path).parent
metrics_path = run_dir / "metrics.json"
stderr_path = run_dir / "stderr.log"
stdout_path = run_dir / "stdout.log"
metrics = {}
try:
    metrics = json.loads(metrics_path.read_text())
except Exception:
    metrics = {}
stderr_tail = ""
stdout_tail = ""
try:
    stderr_tail = "\n".join(stderr_path.read_text(errors="replace").splitlines()[-20:])
except Exception:
    pass
try:
    stdout_tail = "\n".join(stdout_path.read_text(errors="replace").splitlines()[-20:])
except Exception:
    pass
combined = "\n".join([stdout_tail, stderr_tail]).lower()
status = "success" if int(exit_code) == 0 else "failed"
status_reason = "process_exit_zero" if int(exit_code) == 0 else "nonzero_exit"
if status == "success":
    semantic_patterns = [
        ("all providers failed", "provider_chain_failed"),
        ("fetched: 0/1 | failed: 1", "provider_chain_failed"),
        ("allowlist_empty", "empty_allowlist"),
        ("modulenotfounderror", "missing_dependency"),
        ("no module named", "missing_dependency"),
        ("no such file or directory", "missing_runtime_path"),
    ]
    for needle, reason in semantic_patterns:
        if needle in combined:
            status = "failed"
            status_reason = reason
            break
payload = {
    "schema_version": "nas.open.probe.result.v1",
    "probe_id": probe_id,
    "run_stamp": run_stamp,
    "status": status,
    "status_reason": status_reason,
    "exit_code": int(exit_code),
    "cwd": workdir,
    "command": command,
    "metrics": metrics,
    "stderr_tail": stderr_tail,
    "stdout_tail": stdout_tail,
}
Path(out_path).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY
  if [[ "$exit_code" -eq 0 ]]; then
    update_status "$probe_id" "running" "yes"
  else
    update_status "$probe_id" "running" "no"
  fi
  "$NODE_BIN" "$REPO_ROOT/scripts/nas/build-open-probe-report.mjs" >> "$CAMPAIGN_LOG" 2>&1 || true
  sleep "$SLEEP_BETWEEN_PROBES_SEC"
}

cycle=0
while [[ "$(should_continue)" == "yes" ]]; do
  cycle=$((cycle + 1))
  stock_tickers="$(pick_stock_tickers)"
  mixed_tickers="$(pick_all_tickers)"
  slot=$((cycle % 8))
  if [[ "$slot" -eq 1 ]]; then
    run_probe "q1_delta_preflight" 120 "$REPO_ROOT" "node scripts/nas/probes/q1-delta-preflight.mjs"
    run_probe "q1_delta_cache_health" 120 "$REPO_ROOT" "node scripts/nas/probes/q1-delta-cache-health.mjs"
    run_probe "quantlab_v4_daily_report" 600 "$REPO_ROOT" "node scripts/quantlab/build_quantlab_v4_daily_report.mjs"
  elif [[ "$slot" -eq 2 ]]; then
    run_probe "quantlab_boundary_audit" 120 "$REPO_ROOT" "node scripts/nas/probes/quantlab-boundary-audit.mjs"
    run_probe "runtime_control_probe" 120 "$REPO_ROOT" "node scripts/nas/probes/runtime-control-probe.mjs"
    run_probe "daily_learning_cycle" 2400 "$REPO_ROOT" "RUBIKVAULT_ROOT='$REPO_ROOT' NODE_OPTIONS='--max-old-space-size=1536' node scripts/learning/run-daily-learning-cycle.mjs --date='$PROBE_MARKET_DATE'"
  elif [[ "$slot" -eq 3 ]]; then
    run_probe "ui_contract_probe" 120 "$REPO_ROOT" "node scripts/nas/probes/ui-contract-probe.mjs"
    run_probe "universe_audit_sample" 900 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=512' node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --tickers '$mixed_tickers' --max-tickers 8"
    run_probe "forecast_daily" 2400 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=1536' FORECAST_SKIP_MATURED_EVAL=1 node scripts/forecast/run_daily.mjs --date='$PROBE_MARKET_DATE'"
  elif [[ "$slot" -eq 4 ]]; then
    run_probe "best_setups_v4_smoke" 2400 "$REPO_ROOT" "ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 NODE_OPTIONS='--max-old-space-size=1536' node scripts/build-best-setups-v4.mjs"
    run_probe "daily_audit_report_smoke" 1800 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=1024' node scripts/learning/quantlab-v1/daily-audit-report.mjs"
  elif [[ "$slot" -eq 5 ]]; then
    run_probe "hist_probs_sample_w2" 1800 "$REPO_ROOT" "HIST_PROBS_WORKERS=2 HIST_PROBS_SKIP_EXISTING=0 NODE_OPTIONS='--max-old-space-size=1536' node run-hist-probs-turbo.mjs"
    run_probe "hist_probs_sample" 1800 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=1024' node scripts/lib/hist-probs/run-hist-probs.mjs --tickers '$mixed_tickers'"
  elif [[ "$slot" -eq 6 ]]; then
    run_probe "refresh_history_sample" 600 "$REPO_ROOT" "python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path '$SAMPLE_IDS_JSON' --from-date 2026-04-01 --max-assets 12 --report-path '$RUNS_DIR/refresh-history-sample-latest.report.json'"
    run_probe "fundamentals_sample" 900 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=1024' node scripts/build-fundamentals.mjs --ticker '$stock_tickers' --force"
    run_probe "cutover_readiness_smoke" 1200 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=1024' node scripts/learning/quantlab-v1/cutover-readiness-report.mjs"
  elif [[ "$slot" -eq 7 ]]; then
    run_probe "quantlab_boundary_audit" 120 "$REPO_ROOT" "node scripts/nas/probes/quantlab-boundary-audit.mjs"
    run_probe "etf_diagnostic_smoke" 1200 "$REPO_ROOT" "NODE_OPTIONS='--max-old-space-size=768' node scripts/learning/diagnose-best-setups-etf-drop.mjs"
  else
    run_probe "runtime_control_probe" 120 "$REPO_ROOT" "node scripts/nas/probes/runtime-control-probe.mjs"
    run_probe "hist_probs_sample_w1" 1800 "$REPO_ROOT" "HIST_PROBS_WORKERS=1 HIST_PROBS_SKIP_EXISTING=0 NODE_OPTIONS='--max-old-space-size=1536' node run-hist-probs-turbo.mjs"
  fi
  advance_cycle "$cycle"
  sleep "$SLEEP_BETWEEN_CYCLES_SEC"
done

"$NODE_BIN" "$REPO_ROOT/scripts/nas/build-open-probe-report.mjs" >> "$CAMPAIGN_LOG" 2>&1 || true

python3 - "$STATUS_JSON" "$CAMPAIGN_PID" <<'PY'
import json
import sys

path, campaign_pid = sys.argv[1:3]
doc = json.load(open(path, "r", encoding="utf-8"))
doc["finished_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
doc["current_pid"] = int(campaign_pid)
doc["last_heartbeat_at"] = __import__("datetime").datetime.now().astimezone().isoformat()
if doc.get("last_status") != "failed":
    doc["last_status"] = "completed"
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

printf '%s\n' "$CAMPAIGN_DIR"
