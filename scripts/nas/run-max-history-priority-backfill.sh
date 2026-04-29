#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"
# shellcheck source=scripts/nas/node-env.sh
. "$REPO_ROOT/scripts/nas/node-env.sh"

nas_ensure_runtime_roots

cd "$REPO_ROOT"

GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"
TARGET_MARKET_DATE="${RV_HISTORY_BACKFILL_TARGET_DATE:-${TARGET_MARKET_DATE:-}}"
if [[ -z "$TARGET_MARKET_DATE" ]]; then
  TARGET_MARKET_DATE="$(python3 - <<'PY'
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
)"
fi
FROM_DATE="${RV_HISTORY_BACKFILL_FROM_DATE:-1900-01-01}"
CONCURRENCY="${RV_HISTORY_BACKFILL_CONCURRENCY:-12}"
FLUSH_EVERY="${RV_HISTORY_BACKFILL_FLUSH_EVERY:-100}"
PROGRESS_EVERY="${RV_HISTORY_BACKFILL_PROGRESS_EVERY:-100}"
TIMEOUT_SEC="${RV_HISTORY_BACKFILL_TIMEOUT_SEC:-90}"
MIN_CALLS_TO_RUN="${RV_HISTORY_BACKFILL_MIN_CALLS_TO_RUN:-1000}"
CALL_RESERVE="${RV_HISTORY_BACKFILL_CALL_RESERVE:-0}"
MAX_CALLS_PER_CYCLE="${RV_HISTORY_BACKFILL_MAX_CALLS_PER_CYCLE:-100000}"
POLL_SEC="${RV_HISTORY_BACKFILL_POLL_SEC:-300}"
RUN_PIPELINE_WHEN_DONE="${RV_HISTORY_BACKFILL_RUN_PIPELINE_WHEN_DONE:-1}"
JOB_PREFIX="${RV_HISTORY_BACKFILL_JOB_PREFIX:-max_history_priority}"
INTEGRATED_AFTER_REFRESH=0
export RV_HISTORY_BACKFILL_PID="$$"

STATE_DIR="$NAS_RUNTIME_ROOT/history-backfill"
STATE_JSON="$STATE_DIR/max-history-latest.json"
COMPLETED_JSON="$STATE_DIR/max-history-completed-ids.json"
mkdir -p "$STATE_DIR" "$REPO_ROOT/tmp"

write_state() {
  local status="$1"
  local note="${2:-}"
  local exit_code="${3:-0}"
  python3 - "$STATE_JSON" "$status" "$note" "$exit_code" "$GLOBAL_ASSET_CLASSES" "$TARGET_MARKET_DATE" "$FROM_DATE" "$COMPLETED_JSON" <<'PY'
import json
import os
import sys
from datetime import datetime

path, status, note, exit_code, asset_classes, target_date, from_date, completed_path = sys.argv[1:9]
doc = {}
if os.path.exists(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except Exception:
        doc = {}
previous_status = doc.get("status")
now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
doc.update({
    "schema_version": "rv.max_history_priority_backfill.v1",
    "updated_at": now,
    "status": status,
    "note": note or None,
    "exit_code": int(exit_code),
    "pid": int(os.environ.get("RV_HISTORY_BACKFILL_PID") or 0),
    "asset_classes": asset_classes,
    "target_market_date": target_date,
    "from_date": from_date,
    "completed_ids_path": completed_path,
})
report_path = os.environ.get("RV_HISTORY_BACKFILL_REPORT_PATH")
if report_path:
    doc["report_path"] = report_path
if not doc.get("started_at") or (status == "running" and previous_status in {"completed", "failed", "skipped"}):
    doc["started_at"] = now
if status in {"completed", "failed", "skipped"}:
    doc["finished_at"] = now
else:
    doc.pop("finished_at", None)
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

eodhd_budget_json() {
  python3 - "$RV_EODHD_ENV_FILE" <<'PY'
import json
import os
import sys
import urllib.request
from datetime import date

env_file = sys.argv[1]
keys = ["EODHD_API_TOKEN", "EODHD_API_KEY"]
values = {key: os.environ.get(key, "").strip() for key in keys}
if os.path.exists(env_file):
    for raw in open(env_file, "r", encoding="utf-8"):
        raw = raw.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        if key in keys and not values.get(key):
            values[key] = value.strip().strip('"').strip("'")
token = values.get("EODHD_API_TOKEN") or values.get("EODHD_API_KEY")
if not token:
    raise SystemExit("missing_eodhd_token")
with urllib.request.urlopen(f"https://eodhd.com/api/user?api_token={token}&fmt=json", timeout=20) as resp:
    doc = json.load(resp)
api_requests = int(doc.get("apiRequests") or 0)
daily_limit = int(doc.get("dailyRateLimit") or 0)
extra_limit = int(doc.get("extraLimit") or 0)
api_date = str(doc.get("apiRequestsDate") or "")
today = date.today().isoformat()
daily_remaining = max(0, daily_limit - api_requests) if api_date == today else daily_limit
available = max(0, daily_remaining + max(0, extra_limit))
print(json.dumps({
    "apiRequests": api_requests,
    "apiRequestsDate": api_date,
    "dailyRateLimit": daily_limit,
    "extraLimit": extra_limit,
    "dailyRemaining": daily_remaining,
    "available": available,
}, sort_keys=True))
PY
}

available_calls() {
  eodhd_budget_json | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("available") or 0))'
}

generate_allowlist() {
  local max_assets="$1"
  local stamp="$2"
  local allowlist_path="$REPO_ROOT/tmp/${JOB_PREFIX}_${stamp}.allowlist.json"
  local report_path="$REPO_ROOT/tmp/${JOB_PREFIX}_${stamp}.allowlist.report.json"
  python3 - "$REPO_ROOT" "$COMPLETED_JSON" "$allowlist_path" "$report_path" "$TARGET_MARKET_DATE" "$max_assets" <<'PY'
from __future__ import annotations
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

root = Path(sys.argv[1])
completed_path = Path(sys.argv[2])
allowlist_path = Path(sys.argv[3])
report_path = Path(sys.argv[4])
target_date = sys.argv[5]
max_assets = int(sys.argv[6])

ssot_path = root / "public/data/universe/v7/ssot/assets.global.canonical.ids.json"
registry_path = root / "public/data/universe/v7/registry/registry.ndjson.gz"
manifest_path = root / "public/data/eod/history/pack-manifest.global.json"
index_files = [
    root / "data/symbols/sp500.json",
    root / "public/data/universe/sp500.json",
    root / "data/symbols/dow.json",
    root / "public/data/universe/dowjones.json",
    root / "data/symbols/nasdaq.json",
    root / "public/data/universe/nasdaq100.json",
    root / "data/symbols/russell.json",
    root / "public/data/universe/russell2000.json",
]
tradable_types = {"STOCK", "ETF", "INDEX"}
german_regionals = {"F", "STU", "BE", "DU", "HM", "MU", "HA", "HE", "XETRA"}
symbol_keys = {"ticker", "symbol", "s", "code", "Symbol", "Ticker", "Code"}
symbol_re = re.compile(r"^[A-Z0-9][A-Z0-9.\\-]{0,14}$")

ssot_doc = json.loads(ssot_path.read_text())
scope_ids = list(ssot_doc.get("canonical_ids") if isinstance(ssot_doc, dict) else ssot_doc)
scope_set = {str(value).strip() for value in scope_ids if str(value).strip()}
completed = set()
if completed_path.exists():
    try:
        doc = json.loads(completed_path.read_text())
        completed = {str(value).strip() for value in doc.get("canonical_ids", []) if str(value).strip()}
    except Exception:
        completed = set()

manifest = json.loads(manifest_path.read_text())
pack_present = set((manifest.get("by_canonical_id") or {}).keys())

def norm_symbol(value):
    return str(value or "").strip().upper()

def collect_symbols(obj, out):
    if isinstance(obj, dict):
        for key in symbol_keys:
            value = obj.get(key)
            if isinstance(value, str):
                sym = norm_symbol(value)
                if symbol_re.match(sym):
                    out.add(sym)
        for value in obj.values():
            if isinstance(value, (dict, list)):
                collect_symbols(value, out)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, str):
                sym = norm_symbol(item)
                if symbol_re.match(sym):
                    out.add(sym)
            elif isinstance(item, (dict, list)):
                collect_symbols(item, out)

index_symbols = set()
index_source_counts = {}
for path in index_files:
    if not path.exists():
        continue
    symbols = set()
    collect_symbols(json.loads(path.read_text()), symbols)
    index_source_counts[str(path.relative_to(root))] = len(symbols)
    index_symbols.update(symbols)

registry = {}
us_by_symbol = defaultdict(list)
with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
    for line in fh:
        if not line.strip():
            continue
        obj = json.loads(line)
        cid = str(obj.get("canonical_id") or "").strip()
        if cid not in scope_set:
            continue
        exchange = str(obj.get("exchange") or "").strip().upper()
        sym = norm_symbol(obj.get("symbol"))
        row = {
            "canonical_id": cid,
            "symbol": sym,
            "exchange": exchange,
            "type_norm": str(obj.get("type_norm") or "").strip().upper() or "OTHER",
            "bars_count": int(obj.get("bars_count") or 0),
            "last_trade_date": str(obj.get("last_trade_date") or "")[:10],
            "pack_present": cid in pack_present,
        }
        registry[cid] = row
        if exchange == "US" and sym:
            us_by_symbol[sym].append(cid)
            us_by_symbol[sym.replace(".", "-")].append(cid)
            us_by_symbol[sym.replace("-", ".")].append(cid)

us_index_ids = []
seen = set()
unmatched = []
for sym in sorted(index_symbols):
    found = []
    for candidate in [sym, sym.replace(".", "-"), sym.replace("-", ".")]:
        found.extend(us_by_symbol.get(candidate, []))
    direct = f"US:{sym}"
    if direct in registry:
        found.append(direct)
    found = [cid for cid in found if registry.get(cid, {}).get("type_norm") in {"STOCK", "ETF"}]
    if not found:
        unmatched.append(sym)
        continue
    for cid in found:
        if cid not in seen:
            seen.add(cid)
            us_index_ids.append(cid)

def need_bucket(row):
    if not row["pack_present"]:
        return "missing_pack"
    if row["bars_count"] <= 0:
        return "zero_bars"
    if row["bars_count"] < 200:
        return "short_lt200"
    if (row["last_trade_date"] or "") < target_date:
        return "targetable_stale"
    if row["bars_count"] < 1000:
        return "targetable_under1000"
    return "already_deep"

def need_rank(row):
    return {
        "missing_pack": 0,
        "zero_bars": 1,
        "short_lt200": 2,
        "targetable_stale": 3,
        "targetable_under1000": 4,
        "already_deep": 5,
    }[need_bucket(row)]

def type_rank(row):
    return {"STOCK": 0, "ETF": 1, "INDEX": 2}.get(row["type_norm"], 3)

def sort_key(cid):
    row = registry[cid]
    return (need_rank(row), type_rank(row), row["exchange"], row["symbol"], cid)

ordered = []
stage_by_id = {}

def add_stage(name, cids):
    added = 0
    for cid in cids:
        if cid in completed or cid not in registry or cid in stage_by_id:
            continue
        stage_by_id[cid] = name
        ordered.append(cid)
        added += 1
    return added

stage_counts = {}
stage_counts["us_major_indices_needs"] = add_stage("us_major_indices_needs", sorted([cid for cid in us_index_ids if need_rank(registry[cid]) <= 4], key=sort_key))
stage_counts["us_tradable_needs"] = add_stage("us_tradable_needs", sorted([cid for cid, row in registry.items() if row["exchange"] == "US" and row["type_norm"] in tradable_types and need_rank(row) <= 4], key=sort_key))
stage_counts["xetra_germany_needs"] = add_stage("xetra_germany_needs", sorted([cid for cid, row in registry.items() if row["exchange"] == "XETRA" and row["type_norm"] in tradable_types and need_rank(row) <= 4], key=sort_key))
stage_counts["germany_regional_needs"] = add_stage("germany_regional_needs", sorted([cid for cid, row in registry.items() if row["exchange"] in german_regionals and row["exchange"] != "XETRA" and row["type_norm"] in tradable_types and need_rank(row) <= 4], key=sort_key))
for bucket in ["missing_pack", "zero_bars", "short_lt200", "targetable_stale", "targetable_under1000"]:
    stage_counts[f"rest_tradable_{bucket}"] = add_stage(f"rest_tradable_{bucket}", sorted([cid for cid, row in registry.items() if row["type_norm"] in tradable_types and need_bucket(row) == bucket], key=sort_key))
stage_counts["us_major_indices_deep"] = add_stage("us_major_indices_deep", sorted(us_index_ids, key=sort_key))
stage_counts["us_other_tradable_deep"] = add_stage("us_other_tradable_deep", sorted([cid for cid, row in registry.items() if row["exchange"] == "US" and row["type_norm"] in tradable_types], key=sort_key))
stage_counts["xetra_germany_deep"] = add_stage("xetra_germany_deep", sorted([cid for cid, row in registry.items() if row["exchange"] == "XETRA" and row["type_norm"] in tradable_types], key=sort_key))
stage_counts["germany_regional_deep"] = add_stage("germany_regional_deep", sorted([cid for cid, row in registry.items() if row["exchange"] in german_regionals and row["exchange"] != "XETRA" and row["type_norm"] in tradable_types], key=sort_key))
stage_counts["rest_tradable_deep"] = add_stage("rest_tradable_deep", sorted([cid for cid, row in registry.items() if row["type_norm"] in tradable_types], key=sort_key))

selected = ordered[:max_assets]
allowlist_path.write_text(json.dumps(selected, ensure_ascii=False, indent=2))
selected_rows = [registry[cid] for cid in selected]
report = {
    "schema": "rv_max_history_priority_allowlist_v1",
    "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "target_market_date": target_date,
    "max_assets": max_assets,
    "selected_count": len(selected),
    "scope_count": len(scope_set),
    "registry_scope_count": len(registry),
    "completed_excluded_count": len(completed),
    "index_symbol_count": len(index_symbols),
    "us_index_id_count": len(us_index_ids),
    "index_source_counts": index_source_counts,
    "unmatched_index_symbols_sample": unmatched[:100],
    "stage_counts_before_cap": stage_counts,
    "selected_stage_counts": dict(Counter(stage_by_id[cid] for cid in selected)),
    "selected_need_counts": dict(Counter(need_bucket(row) for row in selected_rows)),
    "selected_type_counts": dict(Counter(row["type_norm"] for row in selected_rows)),
    "selected_top_exchanges": dict(Counter(row["exchange"] for row in selected_rows).most_common(40)),
    "first_50": selected[:50],
    "last_20": selected[-20:],
    "allowlist_path": str(allowlist_path),
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({"allowlist_path": str(allowlist_path), "report_path": str(report_path), "selected_count": len(selected)}), file=sys.stderr)
PY
  printf '%s\n' "$allowlist_path"
}

merge_completed_ids() {
  local report_path="$1"
  python3 - "$COMPLETED_JSON" "$report_path" <<'PY'
import json
import os
import sys
from datetime import datetime

completed_path, report_path = sys.argv[1:3]
done = set()
if os.path.exists(completed_path):
    try:
        done = {str(value).strip() for value in json.load(open(completed_path, "r", encoding="utf-8")).get("canonical_ids", []) if str(value).strip()}
    except Exception:
        done = set()
new = set()
try:
    report = json.load(open(report_path, "r", encoding="utf-8"))
except Exception:
    report = {}
fetched_path = report.get("fetched_assets_path")
if fetched_path and os.path.exists(fetched_path):
    try:
        new.update(str(value).strip() for value in json.load(open(fetched_path, "r", encoding="utf-8")).get("canonical_ids", []) if str(value).strip())
    except Exception:
        pass
for entry in report.get("fetched_assets_sample") or []:
    cid = str(entry.get("canonical_id") or "").strip()
    if cid:
        new.add(cid)
for entry in report.get("changed_packs") or []:
    for asset in entry.get("changed_assets") or []:
        cid = str(asset.get("canonical_id") or "").strip()
        if cid:
            new.add(cid)
done.update(new)
doc = {
    "schema": "rv_max_history_completed_ids_v1",
    "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    "count": len(done),
    "canonical_ids": sorted(done),
}
os.makedirs(os.path.dirname(completed_path), exist_ok=True)
with open(completed_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
print(json.dumps({"completed_count": len(done), "new_count": len(new)}))
PY
}

integrate_history() {
  node scripts/ops/apply-history-touch-report-to-registry.mjs --scan-existing-packs
  node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$GLOBAL_ASSET_CLASSES"
  node scripts/ops/report-history-coverage.mjs --asset-classes "$GLOBAL_ASSET_CLASSES" --target-market-date "$TARGET_MARKET_DATE"
}

run_pipeline() {
  if [[ "${INTEGRATED_AFTER_REFRESH:-0}" != "1" ]]; then
    integrate_history
  fi
  RV_GLOBAL_ASSET_CLASSES="$GLOBAL_ASSET_CLASSES" bash scripts/nas/rv-nas-night-supervisor.sh --lane=data-plane --start-step=q1_delta_ingest
  RV_GLOBAL_ASSET_CLASSES="$GLOBAL_ASSET_CLASSES" bash scripts/nas/rv-nas-night-supervisor.sh --lane=release-full
}

write_state "running" "started" 0

while true; do
  budget="$(eodhd_budget_json)"
  calls="$(printf '%s' "$budget" | python3 -c 'import json,sys; print(int(json.load(sys.stdin)["available"]))')"
  cap=$(( calls - CALL_RESERVE ))
  if [[ "$cap" -gt "$MAX_CALLS_PER_CYCLE" ]]; then
    cap="$MAX_CALLS_PER_CYCLE"
  fi
  if [[ "$cap" -lt "$MIN_CALLS_TO_RUN" ]]; then
    write_state "waiting" "waiting_for_eodhd_budget" 0
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] waiting_for_eodhd_budget budget=$budget"
    sleep "$POLL_SEC"
    continue
  fi

  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  allowlist="$(generate_allowlist "$cap" "$stamp")"
  selected="$(python3 - "$allowlist" <<'PY'
import json
import sys
print(len(json.load(open(sys.argv[1], "r", encoding="utf-8"))))
PY
)"
  if [[ "$selected" -le 0 ]]; then
    write_state "running" "history_scope_done_running_pipeline" 0
    if [[ "$RUN_PIPELINE_WHEN_DONE" == "1" ]]; then
      run_pipeline
    fi
    write_state "completed" "history_scope_done" 0
    exit 0
  fi

  job_name="${JOB_PREFIX}_${stamp}"
  log_path="$STATE_DIR/${job_name}.log"
  report_path="mirrors/universe-v7/state/${job_name}.report.json"
  full_report_path="$REPO_ROOT/$report_path"
  export RV_HISTORY_BACKFILL_REPORT_PATH="$full_report_path"
  INTEGRATED_AFTER_REFRESH=0
  write_state "running" "refresh:$job_name selected=$selected cap=$cap" 0
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] refresh_start job=$job_name selected=$selected cap=$cap budget=$budget allowlist=$allowlist"
  set +e
  PYTHONUNBUFFERED=1 python3 scripts/quantlab/refresh_v7_history_from_eodhd.py \
    --env-file "$RV_EODHD_ENV_FILE" \
    --allowlist-path "$allowlist" \
    --from-date "$FROM_DATE" \
    --to-date "$TARGET_MARKET_DATE" \
    --concurrency "$CONCURRENCY" \
    --progress-every "$PROGRESS_EVERY" \
    --flush-every "$FLUSH_EVERY" \
    --max-retries 0 \
    --timeout-sec "$TIMEOUT_SEC" \
    --max-eodhd-calls "$cap" \
    --global-lock-path "$NAS_LOCK_ROOT/eodhd.lock" \
    --job-name "$job_name" \
    --report-path "$report_path" \
    > "$log_path" 2>&1
  exit_code="$?"
  set -e
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] refresh_finished job=$job_name exit=$exit_code log=$log_path"

  if [[ -f "$full_report_path" ]]; then
    merge_completed_ids "$full_report_path" || true
    integrate_history
    INTEGRATED_AFTER_REFRESH=1
  else
    write_state "failed" "missing_refresh_report:$job_name" "$exit_code"
    exit "$exit_code"
  fi

  status="$(python3 - "$full_report_path" <<'PY'
import json
import sys
doc=json.load(open(sys.argv[1], "r", encoding="utf-8"))
print(str(doc.get("status") or ""))
PY
)"
  if [[ "$exit_code" -eq 0 && "$status" == "ok" && "$selected" -lt "$cap" ]]; then
    write_state "running" "cycle_scope_done_running_pipeline" 0
    if [[ "$RUN_PIPELINE_WHEN_DONE" == "1" ]]; then
      run_pipeline
    fi
    write_state "completed" "cycle_scope_done" 0
    exit 0
  fi
  if [[ "$exit_code" -ne 0 && "$status" != "budget_stopped_partial" && "$status" != "provider_blocked_partial" && "$status" != "interrupted" ]]; then
    write_state "failed" "refresh_failed:$job_name:$status" "$exit_code"
    exit "$exit_code"
  fi
  write_state "waiting" "cycle_completed_waiting_next_budget:$status" 0
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cycle_done status=$status; checking_budget_again"
done
