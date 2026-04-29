#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# fetch-nas-live-status.sh
# Pulls current NAS pipeline telemetry into public/data/ui/ so dashboard_v7
# can render a fresh local snapshot.
#
# Usage:
#   bash scripts/nas/fetch-nas-live-status.sh
#   bash scripts/nas/fetch-nas-live-status.sh --mode fast
# ──────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$REPO_ROOT/public/data/ui"
mkdir -p "$OUT_DIR"
FETCH_MODE="full"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast)
      FETCH_MODE="fast"
      ;;
    --full)
      FETCH_MODE="full"
      ;;
    --mode)
      shift
      FETCH_MODE="${1:-}"
      ;;
    --mode=*)
      FETCH_MODE="${1#*=}"
      ;;
    *)
      echo "Usage: bash scripts/nas/fetch-nas-live-status.sh [--mode fast|full]" >&2
      exit 2
      ;;
  esac
  shift
done

case "$FETCH_MODE" in
  fast|full) ;;
  *)
    echo "ERROR: unsupported fetch mode: $FETCH_MODE" >&2
    exit 2
    ;;
esac

SSH_CONNECT_TIMEOUT="${SSH_CONNECT_TIMEOUT:-10}"
SSH_BASE_OPTS=(
  -o BatchMode=yes
  -o ConnectTimeout="$SSH_CONNECT_TIMEOUT"
  -o IdentitiesOnly=yes
  -o PreferredAuthentications=publickey
)

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

choose_ssh_target() {
  local local_pipeline_root="${NAS_OPS_ROOT:-${OPS_ROOT:-}}/runtime/night-pipeline"
  if [[ "${RV_NAS_STATUS_LOCAL:-0}" == "1" || ( -n "${NAS_OPS_ROOT:-${OPS_ROOT:-}}" && -d "$local_pipeline_root" ) ]]; then
    SSH_CMD=(sh -c)
    SSH_TARGET_LABEL="local-nas"
    return 0
  fi
  if ssh "${SSH_BASE_OPTS[@]}" neonas "printf ok" >/dev/null 2>&1; then
    SSH_CMD=(ssh "${SSH_BASE_OPTS[@]}" neonas)
    SSH_TARGET_LABEL="neonas"
    return 0
  fi
  if ssh "${SSH_BASE_OPTS[@]}" -o HostName=100.98.90.69 neonas "printf ok" >/dev/null 2>&1; then
    SSH_CMD=(ssh "${SSH_BASE_OPTS[@]}" -o HostName=100.98.90.69 neonas)
    SSH_TARGET_LABEL="neonas@100.98.90.69"
    return 0
  fi
  if ssh "${SSH_BASE_OPTS[@]}" -o HostName=neonas.taila2701e.ts.net neonas "printf ok" >/dev/null 2>&1; then
    SSH_CMD=(ssh "${SSH_BASE_OPTS[@]}" -o HostName=neonas.taila2701e.ts.net neonas)
    SSH_TARGET_LABEL="neonas@neonas.taila2701e.ts.net"
    return 0
  fi
  return 1
}

TMP_BUNDLE="$(mktemp "$OUT_DIR/nas-pipeline-dashboard.XXXXXX.tmp")"
trap 'rm -f "$TMP_BUNDLE"' EXIT

log "Resolving NAS SSH target..."
if ! choose_ssh_target; then
  echo "ERROR: NAS SSH target unreachable via alias or Tailscale fallback." >&2
  exit 1
fi
log "Using SSH target: $SSH_TARGET_LABEL"

log "Fetching NAS pipeline telemetry (mode=$FETCH_MODE)..."
RV_DASHBOARD_FETCH_MODE="$FETCH_MODE" "${SSH_CMD[@]}" 'bash -s' > "$TMP_BUNDLE" <<'REMOTE'
python3 - <<'PY'
from __future__ import annotations

import glob
import json
import math
import os
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
REPO_ROOT = Path(os.environ.get("NAS_DEV_ROOT") or HOME / "Dev" / "rubikvault-site")
OPS_ROOT = Path(os.environ.get("NAS_OPS_ROOT") or os.environ.get("OPS_ROOT") or HOME / "RepoOps" / "rubikvault-site")
QUANT_ROOT = Path(os.environ.get("NAS_QUANT_ROOT") or os.environ.get("QUANT_ROOT") or HOME / "QuantLabHot" / "rubikvault-quantlab")
PIPELINE_ROOT = OPS_ROOT / "runtime" / "night-pipeline"
FETCH_MODE = str(os.environ.get("RV_DASHBOARD_FETCH_MODE") or "full").strip().lower()

STEP_ORDER = [
    "safe_code_sync",
    "build_global_scope",
    "market_data_refresh",
    "q1_delta_ingest",
    "build_fundamentals",
    "quantlab_daily_report",
    "scientific_summary",
    "forecast_daily",
    "hist_probs",
    "snapshot",
    "etf_diagnostic",
    "learning_daily",
    "v1_audit",
    "cutover_readiness",
    "stage1_ops_pack",
    "system_status_report",
    "data_freshness_report",
    "pipeline_epoch",
    "generate_meta_dashboard_data",
]
STEP_LABELS = {
    "safe_code_sync": "Code Sync",
    "build_global_scope": "Global Scope",
    "market_data_refresh": "Market Data Refresh",
    "q1_delta_ingest": "Q1 Delta Ingest",
    "build_fundamentals": "Build Fundamentals",
    "quantlab_daily_report": "QuantLab Daily Report",
    "scientific_summary": "Scientific Summary",
    "forecast_daily": "Forecast Daily",
    "hist_probs": "Hist Probs",
    "snapshot": "Snapshot",
    "etf_diagnostic": "ETF Diagnostic",
    "learning_daily": "Learning Daily",
    "v1_audit": "V1 Audit",
    "cutover_readiness": "Cutover Readiness",
    "stage1_ops_pack": "Stage1 Ops Pack",
    "system_status_report": "System Status Report",
    "data_freshness_report": "Data Freshness Report",
    "pipeline_epoch": "Pipeline Epoch",
    "generate_meta_dashboard_data": "Meta Dashboard Data",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path, default=None):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def read_first_line(path: Path) -> str | None:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as handle:
            for raw in handle:
                line = raw.strip()
                if line:
                    return line[:400]
    except Exception:
        return None
    return None


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def age_seconds(value: str | None) -> float | None:
    parsed = parse_iso(value)
    if not parsed:
      return None
    return max(0.0, (utc_now() - parsed).total_seconds())


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    items = sorted(float(v) for v in values)
    if len(items) == 1:
        return items[0]
    idx = max(0, min(len(items) - 1, math.ceil((pct / 100.0) * len(items)) - 1))
    return items[idx]


def safe_float(value) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def human_error_signature(message: str | None) -> str | None:
    if not message:
        return None
    msg = str(message).strip()
    lowered = msg.lower()
    patterns = [
        ("missing_pyarrow", "No module named 'pyarrow'"),
        ("missing_pandas", "No module named 'pandas'"),
        ("missing_requests", "No module named 'requests'"),
        ("missing_provider_key", "provider key missing"),
        ("placeholder_provider_key", "placeholder provider key"),
        ("lock_conflict", "lock conflict"),
        ("q1_writer_conflict", "q1 writer conflict"),
        ("timeout", "step timed out"),
        ("missing_registry_entry", "missing registry entry"),
        ("api_limit", "provider quota / api limit"),
        ("runtime_drift", "runtime drift under dev root"),
    ]
    if "no module named 'pyarrow'" in lowered:
        return "missing_pyarrow"
    if "no module named 'pandas'" in lowered:
        return "missing_pandas"
    if "no module named 'requests'" in lowered:
        return "missing_requests"
    if "missing_provider_key" in lowered:
        return "missing_provider_key"
    if "placeholder_provider_key" in lowered:
        return "placeholder_provider_key"
    if "lock_conflict" in lowered:
        return "lock_conflict"
    if "q1_writer_conflict" in lowered:
        return "q1_writer_conflict"
    if "timed out" in lowered or "timeout" in lowered:
        return "timeout"
    if "missing_registry_entry" in lowered:
        return "missing_registry_entry"
    if "api_limit_reached" in lowered or "quota" in lowered:
        return "api_limit"
    if "runtime_drift_under_dev_root" in lowered:
        return "runtime_drift"
    if "exit_code=-15" in lowered:
        return "terminated_signal_15"
    return msg[:160]


def fix_suggestion(step_id: str | None, signature: str | None) -> str | None:
    sig = signature or ""
    if sig == "missing_pyarrow":
        return "Use /usr/bin/python3 for q1_delta_ingest or install pyarrow into the RepoOps tooling Python."
    if sig == "missing_pandas":
        return "Install pandas into the interpreter used by q1_delta_ingest or switch the step to /usr/bin/python3."
    if sig == "missing_requests":
        return "Install requests into the interpreter used by q1_delta_ingest or switch the step to /usr/bin/python3."
    if sig == "missing_provider_key":
        return "Verify .env.local on NAS and rerun preflight-env.sh before restarting the lane."
    if sig == "placeholder_provider_key":
        return "Replace placeholder provider key values in .env.local with the active EODHD key."
    if sig == "lock_conflict":
        return "Inspect runtime/locks on NAS, confirm the competing job is gone, then rerun the blocked step."
    if sig == "q1_writer_conflict":
        return "Wait for live Q1 writer jobs to finish; if no writer exists, clear stale per-job Q1 locks/state and rerun the lane."
    if sig == "timeout":
        return "Compare current step throughput to timeout and either increase the timeout or reduce the step scope."
    if sig == "missing_registry_entry":
        return "Rebuild global scope and history-pack manifest so the refresh allowlist matches the registry."
    if sig == "api_limit":
        return "Check EODHD quota state, wait for reset if needed, then resume the lane."
    if sig == "runtime_drift":
        return "Quarantine drift under Dev/runtime, keep RepoOps/runtime as truth, then rerun preflight and the lane."
    if sig == "terminated_signal_15":
        if step_id == "q1_delta_ingest":
            return "q1_delta_ingest was terminated after hitting its wall-clock budget; inspect measure.json/result.json and raise the step timeout before rerunning."
        return "The step was terminated by signal 15; inspect the timeout budget and external supervisors before rerunning."
    if step_id == "build_fundamentals":
        return "Inspect provider symbol mapping and fundamentals scope before rerunning build-fundamentals."
    return None


def strip_markdown(text: str | None) -> str | None:
    if not text:
        return None
    clean = str(text)
    clean = re.sub(r"```.+?```", " ", clean, flags=re.S)
    clean = re.sub(r"`([^`]+)`", r"\1", clean)
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean or None


def extract_lesson_field(body: str, label: str) -> str | None:
    pattern = rf"\*\*{re.escape(label)}(?:\s*\([^)]*\))?:\*\*\s*(.+?)(?=\n\*\*[^\n]+:\*\*|\Z)"
    match = re.search(pattern, body, flags=re.S)
    if not match:
        return None
    return strip_markdown(match.group(1))


def load_lessons_learned() -> dict:
    path = REPO_ROOT / "docs" / "ops" / "lessons-learned.md"
    if not path.exists():
        return {"source": str(path), "updated_at": None, "entries": []}
    try:
        raw = path.read_text(encoding="utf-8")
    except Exception:
        return {"source": str(path), "updated_at": None, "entries": []}

    entries = []
    chunks = re.split(r"(?m)^###\s+", raw)
    for chunk in chunks[1:]:
        lines = chunk.splitlines()
        if not lines:
            continue
        heading = lines[0].strip()
        body = "\n".join(lines[1:]).strip()
        heading_parts = [part.strip() for part in heading.split("·")]
        lesson_date = heading_parts[0] if heading_parts else None
        category = heading_parts[1] if len(heading_parts) > 1 else None
        title = " · ".join(heading_parts[2:]).strip() if len(heading_parts) > 2 else heading
        searchable = " ".join(
            part for part in [
                heading,
                body,
                extract_lesson_field(body, "Was"),
                extract_lesson_field(body, "Warum"),
                extract_lesson_field(body, "Fix"),
                extract_lesson_field(body, "Prävention"),
            ] if part
        ).lower()
        entries.append(
            {
                "date": lesson_date,
                "category": category,
                "title": title or heading,
                "what": extract_lesson_field(body, "Was"),
                "why": extract_lesson_field(body, "Warum"),
                "fix": extract_lesson_field(body, "Fix"),
                "prevention": extract_lesson_field(body, "Prävention"),
                "searchable": searchable,
            }
        )

    return {
        "source": str(path),
        "updated_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "entries": list(reversed(entries[:]))[:10],
    }


def keywords_for_failure(signature: str | None, step_id: str | None) -> list[str]:
    tokens = set()
    for raw in (signature or "", step_id or ""):
        pass
    if signature:
        for token in str(signature).replace("_", " ").split():
            if len(token) >= 3:
                tokens.add(token.lower())
    if step_id:
        for token in str(step_id).replace("_", " ").split():
            if len(token) >= 3:
                tokens.add(token.lower())
    signature_hints = {
        "missing_pyarrow": ["pyarrow", "python", "interpreter"],
        "missing_pandas": ["pandas", "python", "interpreter"],
        "missing_requests": ["requests", "python", "interpreter"],
        "missing_provider_key": ["provider", "key", "env", "eodhd"],
        "placeholder_provider_key": ["provider", "key", "env", "eodhd"],
        "lock_conflict": ["lock", "conflict"],
        "q1_writer_conflict": ["q1", "writer", "conflict", "lock"],
        "timeout": ["timeout", "stalled", "runtime"],
        "terminated_signal_15": ["timeout", "terminated", "signal"],
        "missing_registry_entry": ["registry", "manifest", "scope"],
        "runtime_drift": ["runtime", "drift", "quarantine"],
        "api_limit": ["api", "quota", "provider"],
    }
    for token in signature_hints.get(signature or "", []):
        tokens.add(token.lower())
    return sorted(tokens)


def match_lessons(entries: list[dict], signature: str | None, step_id: str | None) -> list[dict]:
    tokens = keywords_for_failure(signature, step_id)
    if not tokens:
        return []
    scored = []
    for entry in entries:
        searchable = entry.get("searchable") or ""
        score = sum(1 for token in tokens if token in searchable)
        if score > 0:
            scored.append((score, entry))
    scored.sort(key=lambda item: (-item[0], item[1].get("date") or "", item[1].get("title") or ""), reverse=False)
    matched = []
    for score, entry in scored[:2]:
        matched.append(
            {
                "date": entry.get("date"),
                "category": entry.get("category"),
                "title": entry.get("title"),
                "fix": entry.get("fix"),
                "prevention": entry.get("prevention"),
                "match_score": score,
            }
        )
    return matched


def scope_doc() -> dict:
    rows = read_json(REPO_ROOT / "mirrors" / "universe-v7" / "ssot" / "assets.global.rows.json", {}) or {}
    counts = rows.get("counts") or {}
    total_assets = None
    if isinstance(counts, dict):
        total_assets = counts.get("total_assets") or counts.get("total")
    if total_assets is None:
        total_assets = rows.get("count")
    return {
        "global_allowlist_assets": int(total_assets or 0) or None,
        "global_stock_assets": int(((counts.get("by_type") or {}).get("STOCK") or 0)) if isinstance(counts, dict) else None,
        "global_etf_assets": int(((counts.get("by_type") or {}).get("ETF") or 0)) if isinstance(counts, dict) else None,
        "global_index_assets": int(((counts.get("by_type") or {}).get("INDEX") or 0)) if isinstance(counts, dict) else None,
        "global_us_assets": int(((counts.get("by_region") or {}).get("US") or 0)) if isinstance(counts, dict) else None,
        "global_eu_assets": int(((counts.get("by_region") or {}).get("EU") or 0)) if isinstance(counts, dict) else None,
        "global_asia_assets": int(((counts.get("by_region") or {}).get("ASIA") or 0)) if isinstance(counts, dict) else None,
        "global_symbol_count": int((counts.get("total_symbols") or 0)) if isinstance(counts, dict) else None,
    }


def manifest_counts() -> dict:
    manifest = read_json(REPO_ROOT / "public/data/eod/history/pack-manifest.global.json", {}) or {}
    counts = manifest.get("counts") or {}
    return {
        "allowlist_assets": counts.get("allowlist_canonical_ids"),
        "history_pack_assets": counts.get("canonical_ids"),
        "missing_history_pack_assets": counts.get("missing_pack_canonical_ids"),
        "unique_pack_files": counts.get("unique_pack_files"),
        "generated_at": manifest.get("generated_at"),
    }


def fundamentals_scope_counts() -> dict:
    report = read_json(REPO_ROOT / "public/data/reports/data-freshness-latest.json", {}) or {}
    family = (report.get("families_by_id") or {}).get("fundamentals_scope") or {}
    scope = report.get("scope") or {}
    return {
        "fundamentals_expected_total": family.get("expected_total"),
        "fundamentals_scope_total": family.get("scope_total"),
        "fundamentals_scope_name": family.get("scope_name"),
        "scope_symbol_count": scope.get("symbol_count"),
        "scope_stock_count": scope.get("stock_count"),
        "scope_etf_count": scope.get("etf_count"),
        "generated_at": report.get("generated_at"),
    }


def operability_counts() -> dict | None:
    doc = read_json(REPO_ROOT / "public/data/ops/stock-analyzer-operability-summary-latest.json", None)
    if not isinstance(doc, dict):
        return None
    summary = doc.get("summary") or {}
    targetable = summary.get("targetable_assets")
    operational = summary.get("targetable_operational_assets")
    if targetable is None or operational is None:
        return None
    try:
        targetable_number = float(targetable)
        operational_number = float(operational)
    except Exception:
        return None
    ratio = summary.get("targetable_green_ratio")
    if ratio is None and targetable_number > 0:
        ratio = operational_number / targetable_number
    return {
        "ui_metric_basis": summary.get("coverage_denominator") or "targetable_assets_min_registry_bars",
        "ui_metric_source": "stock_analyzer_operability_summary",
        "ui_operability_summary_generated_at": doc.get("generated_at"),
        "ui_operability_summary_target_market_date": doc.get("target_market_date"),
        "ui_targetable_min_bars": summary.get("targetable_min_bars") or summary.get("required_min_bars"),
        "ui_targetable_assets": int(targetable_number),
        "ui_targetable_operational_assets": int(operational_number),
        "ui_targetable_non_operational_assets": summary.get("targetable_non_operational_assets"),
        "ui_non_targetable_assets": summary.get("non_targetable_assets"),
        "ui_registry_zero_or_unknown_bar_assets": summary.get("registry_zero_or_unknown_bar_assets"),
        "ui_warming_up_assets": summary.get("warming_up_assets"),
        "ui_targetable_green_ratio": ratio,
        "ui_operability_release_blocked": summary.get("release_blocked"),
        "ui_bar_count_bins": summary.get("bar_count_bins"),
    }


def ui_audit_counts() -> dict:
    candidates = []
    for path in sorted((REPO_ROOT / "public" / "data" / "reports").glob("stock-analyzer-universe-audit*.json")):
        audit = read_json(path, None)
        if not isinstance(audit, dict):
            continue
        summary = audit.get("summary") or {}
        run = audit.get("run") or {}
        total = summary.get("processed_scope_count") or summary.get("processed_assets") or summary.get("total_assets")
        healthy = summary.get("healthy_assets")
        full_universe = bool(
            summary.get("full_universe")
            or summary.get("full_universe_validated")
            or summary.get("processed_scope_full_universe")
            or summary.get("validated_scope_full_universe")
        )
        max_tickers = run.get("max_tickers")
        if str(max_tickers).strip() not in {"", "0", "None"} and max_tickers is not None:
            full_universe = False
        candidates.append(
            {
                "path": str(path),
                "generated_at": audit.get("generated_at"),
                "mtime": path.stat().st_mtime,
                "summary": summary,
                "run": run,
                "total": total,
                "healthy": healthy,
                "full_universe": full_universe,
                "target_market_date": summary.get("target_market_date") or audit.get("target_market_date"),
            }
        )

    if not candidates:
        return {
            "ui_report_scope": "missing",
            "ui_full_universe_available": False,
        }

    def sort_key(row):
        stamp = parse_iso(row.get("generated_at"))
        return (
            stamp.timestamp() if stamp else 0.0,
            float(row.get("mtime") or 0.0),
        )

    latest_any = max(candidates, key=sort_key)
    full_candidates = [row for row in candidates if row.get("full_universe")]
    selected = max(full_candidates, key=sort_key) if full_candidates else latest_any

    total = selected.get("total")
    healthy = selected.get("healthy")
    ratio = None
    if total and healthy is not None:
        try:
            ratio = float(healthy) / float(total)
        except Exception:
            ratio = None
    audit_total = total
    audit_healthy = healthy
    audit_ratio = ratio
    operability = operability_counts()
    if operability and operability.get("ui_targetable_assets") is not None:
        total = operability.get("ui_targetable_assets")
        healthy = operability.get("ui_targetable_operational_assets")
        ratio = operability.get("ui_targetable_green_ratio")

    latest_any_ratio = None
    if latest_any.get("total") and latest_any.get("healthy") is not None:
        try:
            latest_any_ratio = float(latest_any["healthy"]) / float(latest_any["total"])
        except Exception:
            latest_any_ratio = None

    return {
        "ui_all_systems_operational_assets": healthy,
        "ui_total_assets": total,
        "ui_all_systems_operational_ratio": ratio,
        "ui_metric_basis": (operability or {}).get("ui_metric_basis") or "stock_analyzer_universe_audit_total_assets",
        "ui_metric_source": (operability or {}).get("ui_metric_source") or "stock_analyzer_universe_audit",
        "ui_audit_all_systems_operational_assets": audit_healthy,
        "ui_audit_total_assets": audit_total,
        "ui_audit_all_systems_operational_ratio": audit_ratio,
        "ui_summary_generated_at": selected.get("generated_at"),
        "ui_summary_target_market_date": selected.get("target_market_date"),
        "ui_failure_family_count": selected["summary"].get("failure_family_count"),
        "ui_affected_assets": selected["summary"].get("affected_assets"),
        "ui_report_scope": "full_universe" if selected.get("full_universe") else "subset_only",
        "ui_report_path": selected.get("path"),
        "ui_report_max_tickers": selected["run"].get("max_tickers"),
        "ui_full_universe_available": bool(full_candidates),
        "ui_selected_is_full_universe": selected.get("full_universe"),
        "ui_latest_any_generated_at": latest_any.get("generated_at"),
        "ui_latest_any_is_full_universe": latest_any.get("full_universe"),
        "ui_latest_any_total_assets": latest_any.get("total"),
        "ui_latest_any_healthy_assets": latest_any.get("healthy"),
        "ui_latest_any_ratio": latest_any_ratio,
        "ui_latest_any_max_tickers": latest_any["run"].get("max_tickers"),
        "ui_latest_any_target_market_date": latest_any.get("target_market_date"),
        **(operability or {}),
    }


def scan_processes() -> list[dict]:
    patterns = (
        "rv-nas-night-supervisor.sh",
        "measure-command.py",
        "refresh_v7_history_from_eodhd.py",
        "run_daily_delta_ingest_q1.py",
    )
    procs: list[dict] = []
    for path in glob.glob("/proc/[0-9]*/cmdline"):
        try:
            cmd = Path(path).read_bytes().replace(b"\0", b" ").decode("utf-8", "ignore").strip()
        except Exception:
            continue
        if not cmd or "python3 - <<" in cmd or "grep" in cmd:
            continue
        if not any(token in cmd for token in patterns):
            continue
        pid = int(path.split("/")[2])
        status = {}
        try:
            for line in Path(f"/proc/{pid}/status").read_text().splitlines():
                if line.startswith(("State:", "VmRSS:", "VmSwap:", "Threads:")):
                    key, _, value = line.partition(":")
                    status[key] = value.strip()
        except Exception:
            pass
        procs.append({"pid": pid, "cmdline": cmd[:320], "status": status})
    return procs


def q1_state_for_target(target_market_date: str | None, started_at: str | None) -> dict | None:
    jobs = []
    started_epoch = parse_iso(started_at).timestamp() if parse_iso(started_at) else None
    for path_str in glob.glob(str(QUANT_ROOT / "jobs" / "*" / "state.json")):
        path = Path(path_str)
        doc = read_json(path, None)
        if not isinstance(doc, dict) or doc.get("schema") != "q1_daily_delta_ingest_state_v1":
            continue
        ingest_date = doc.get("ingest_date")
        if target_market_date and ingest_date != target_market_date:
            continue
        updated = parse_iso(doc.get("updated_at"))
        mtime = path.stat().st_mtime
        if started_epoch is not None and mtime + 120 < started_epoch:
            continue
        stats = doc.get("stats") or {}
        jobs.append({
            "path": str(path),
            "mtime": mtime,
            "updated_at": doc.get("updated_at"),
            "started_at": doc.get("started_at"),
            "finished_at": doc.get("finished_at"),
            "ingest_date": ingest_date,
            "stats": stats,
            "resume": doc.get("resume"),
        })
    jobs.sort(key=lambda row: row["mtime"], reverse=True)
    if not jobs:
        return None
    row = jobs[0]
    stats = row["stats"]
    selected_total = stats.get("selected_packs_total") or stats.get("candidate_packs_total")
    completed = stats.get("packs_done") or 0
    percent = None
    if selected_total:
        try:
            percent = completed / selected_total
        except Exception:
            percent = None
    elapsed_sec = None
    rate_per_min = None
    eta_sec = None
    started = parse_iso(row.get("started_at"))
    if started:
        elapsed_sec = max(0.0, (utc_now() - started).total_seconds())
        if completed and elapsed_sec > 0 and selected_total and selected_total > completed:
            rate_per_min = completed / (elapsed_sec / 60.0)
            if rate_per_min > 0:
                eta_sec = ((selected_total - completed) / rate_per_min) * 60.0
    return {
        "path": row["path"],
        "job_name": Path(row["path"]).parent.name,
        "updated_at": row.get("updated_at"),
        "started_at": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "ingest_date": row.get("ingest_date"),
        "selected_packs_total": selected_total,
        "candidate_packs_total": stats.get("candidate_packs_total"),
        "packs_done": completed,
        "packs_failed": stats.get("packs_failed"),
        "rows_emitted": stats.get("bars_rows_emitted_delta"),
        "process_peak_vmrss_kb": stats.get("process_peak_vmrss_kb"),
        "process_peak_vmswap_kb": stats.get("process_peak_vmswap_kb"),
        "percent": percent,
        "elapsed_sec": elapsed_sec,
        "rate_per_min": rate_per_min,
        "eta_sec": eta_sec,
        "resume": row.get("resume"),
    }


def q1_run_status_for_job(job_name: str | None, started_at: str | None) -> dict | None:
    if not job_name:
        return None
    started_epoch = parse_iso(started_at).timestamp() if parse_iso(started_at) else None
    rows = []
    for path in (QUANT_ROOT / "runs").glob("run_id=*/q1_daily_delta_ingest_run_status.json"):
        doc = read_json(path, None)
        if not isinstance(doc, dict):
            continue
        if doc.get("job_name") != job_name:
            continue
        try:
            mtime = path.stat().st_mtime
        except Exception:
            mtime = 0.0
        if started_epoch is not None and mtime + 120 < started_epoch:
            continue
        rows.append(
            {
                "path": str(path),
                "mtime": mtime,
                "generated_at": doc.get("generated_at"),
                "stage": doc.get("stage"),
                "ok": doc.get("ok"),
                "exit_code": doc.get("exit_code"),
                "reason": doc.get("reason"),
                "stats": doc.get("stats") or {},
                "extra": doc.get("extra") or {},
            }
        )
    if not rows:
        return None
    rows.sort(key=lambda row: (parse_iso(row.get("generated_at")).timestamp() if parse_iso(row.get("generated_at")) else 0.0, row.get("mtime") or 0.0), reverse=True)
    return rows[0]


def derive_carry_forward_steps(current_step: str | None, current_stamp: str | None, target_market_date: str | None, lane: str | None) -> list[str]:
    if not current_step or current_step not in STEP_ORDER or STEP_ORDER.index(current_step) == 0:
        return []
    candidate_runs = []
    for run_dir_str in glob.glob(str(PIPELINE_ROOT / "runs" / "*")):
        run_dir = Path(run_dir_str)
        if not run_dir.is_dir():
            continue
        stamp = run_dir.name
        if current_stamp and stamp >= current_stamp:
            continue
        status = read_json(run_dir / "status.json", None)
        if not status:
            continue
        if lane and status.get("evaluation_lane") != lane:
            continue
        if target_market_date and status.get("target_market_date") != target_market_date:
            continue
        candidate_runs.append((stamp, run_dir))
    candidate_runs.sort(reverse=True)
    prior_needed = STEP_ORDER[:STEP_ORDER.index(current_step)]
    for _stamp, run_dir in candidate_runs:
        carried = []
        for step_id in prior_needed:
            result = read_json(run_dir / step_id / "result.json", None)
            if result and result.get("status") == "success":
                carried.append(step_id)
        if carried:
            return carried
    return []


def build_history() -> dict:
    runs_root = PIPELINE_ROOT / "runs"
    run_dirs = sorted(
        [path for path in runs_root.glob("*") if path.is_dir()],
        key=lambda path: path.name,
        reverse=True,
    )[:80]
    per_step = defaultdict(lambda: {
        "total_runs": 0,
        "success_count": 0,
        "failure_count": 0,
        "success_durations": [],
        "failure_durations": [],
        "last_seen_at": None,
        "last_status": None,
        "last_duration_sec": None,
        "error_signatures": Counter(),
        "last_failure_at": None,
        "last_failure_message": None,
    })
    failure_protocol = defaultdict(lambda: {
        "count": 0,
        "steps": Counter(),
        "last_seen_at": None,
        "last_message": None,
        "durations": [],
    })
    for run_dir in run_dirs:
        for step_dir in run_dir.iterdir():
            if not step_dir.is_dir() or step_dir.name == "logs":
                continue
            result_path = step_dir / "result.json"
            if not result_path.exists():
                continue
            result = read_json(result_path, None)
            if not isinstance(result, dict):
                continue
            step_id = step_dir.name
            status = str(result.get("status") or "unknown")
            duration_sec = safe_float(result.get("duration_sec"))
            generated_at = result.get("generated_at")
            entry = per_step[step_id]
            entry["total_runs"] += 1
            if duration_sec is not None:
                entry["last_duration_sec"] = duration_sec
            if generated_at and not entry["last_seen_at"]:
                entry["last_seen_at"] = generated_at
                entry["last_status"] = status
            if status == "success":
                entry["success_count"] += 1
                if duration_sec is not None:
                    entry["success_durations"].append(duration_sec)
            else:
                entry["failure_count"] += 1
                if duration_sec is not None:
                    entry["failure_durations"].append(duration_sec)
                message = read_first_line(step_dir / "stderr.log") or result.get("guard_reason") or f"exit_code={result.get('command_exit_code')}"
                signature = human_error_signature(message)
                if signature:
                    entry["error_signatures"][signature] += 1
                    protocol = failure_protocol[signature]
                    protocol["count"] += 1
                    protocol["steps"][step_id] += 1
                    if duration_sec is not None:
                        protocol["durations"].append(duration_sec)
                    parsed_generated_at = parse_iso(generated_at)
                    parsed_last_seen = parse_iso(protocol["last_seen_at"])
                    if protocol["last_seen_at"] is None or (parsed_generated_at and (parsed_last_seen is None or parsed_generated_at > parsed_last_seen)):
                        protocol["last_seen_at"] = generated_at
                        protocol["last_message"] = str(message)[:240] if message else None
                if not entry["last_failure_at"]:
                    entry["last_failure_at"] = generated_at
                    entry["last_failure_message"] = str(message)[:200] if message else None

    output = {}
    for step_id, raw in per_step.items():
        success_durations = [float(v) for v in raw["success_durations"] if v is not None]
        failure_durations = [float(v) for v in raw["failure_durations"] if v is not None]
        output[step_id] = {
            "total_runs": raw["total_runs"],
            "success_count": raw["success_count"],
            "failure_count": raw["failure_count"],
            "avg_duration_sec": round(sum(success_durations) / len(success_durations), 2) if success_durations else None,
            "median_duration_sec": round(statistics.median(success_durations), 2) if success_durations else None,
            "p90_duration_sec": round(percentile(success_durations, 90) or 0, 2) if success_durations else None,
            "failure_median_duration_sec": round(statistics.median(failure_durations), 2) if failure_durations else None,
            "last_seen_at": raw["last_seen_at"],
            "last_status": raw["last_status"],
            "last_duration_sec": raw["last_duration_sec"],
            "most_common_error_signature": raw["error_signatures"].most_common(1)[0][0] if raw["error_signatures"] else None,
            "most_common_error_count": raw["error_signatures"].most_common(1)[0][1] if raw["error_signatures"] else 0,
            "last_failure_at": raw["last_failure_at"],
            "last_failure_message": raw["last_failure_message"],
        }
    protocol_rows = []
    for signature, raw in failure_protocol.items():
        top_steps = raw["steps"].most_common(3)
        top_step = top_steps[0][0] if top_steps else None
        durations = [float(v) for v in raw["durations"] if v is not None]
        protocol_rows.append(
            {
                "signature": signature,
                "count": raw["count"],
                "top_step": top_step,
                "top_steps": [{"step_id": step, "count": count} for step, count in top_steps],
                "last_seen_at": raw["last_seen_at"],
                "last_message": raw["last_message"],
                "median_duration_sec": round(statistics.median(durations), 2) if durations else None,
                "fix_suggestion": fix_suggestion(top_step, signature),
            }
        )
    protocol_rows.sort(key=lambda row: (-int(row.get("count") or 0), row.get("last_seen_at") or ""), reverse=False)
    return {"runs_scanned": len(run_dirs), "steps": output, "failure_protocol": protocol_rows[:12]}


latest = read_json(PIPELINE_ROOT / "latest.json", {}) or {}
watchdog = read_json(PIPELINE_ROOT / "watchdog-latest.json", {}) or {}
history = build_history() if FETCH_MODE != "fast" else {"runs_scanned": None, "steps": {}}
processes = scan_processes()
global_scope = scope_doc()
history_manifest = manifest_counts()
fundamentals_counts = fundamentals_scope_counts()
ui_counts = ui_audit_counts()
lessons = load_lessons_learned()

current_stamp = latest.get("campaign_stamp")
current_step = latest.get("current_step")
current_status = latest.get("last_status")
current_lane = latest.get("evaluation_lane")
target_market_date = latest.get("target_market_date")
started_at = latest.get("started_at")

watchdog_current = watchdog.get("current") or {}
watchdog_same_campaign = bool(
    watchdog_current
    and watchdog_current.get("campaign_stamp") == current_stamp
    and watchdog_current.get("step") == current_step
)

q1_state = q1_state_for_target(target_market_date, started_at) if current_step == "q1_delta_ingest" else None
q1_run_status = q1_run_status_for_job(q1_state.get("job_name") if q1_state else None, started_at) if current_step == "q1_delta_ingest" else None
carry_forward_completed_steps = derive_carry_forward_steps(current_step, current_stamp, target_market_date, current_lane)

completed_steps = list(carry_forward_completed_steps)
for step_id in latest.get("completed_steps") or []:
    if step_id not in completed_steps:
        completed_steps.append(step_id)

step_scope = {
    "build_global_scope": {
        "label": "global allowlist assets",
        "total": global_scope.get("global_allowlist_assets") or history_manifest.get("allowlist_assets"),
        "unit": "assets",
        "source": "assets.global.rows / pack-manifest.global",
    },
    "market_data_refresh": {
        "label": "history-backed assets",
        "total": (watchdog_current.get("last_progress") or {}).get("total") if watchdog_same_campaign else history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "watchdog progress or pack-manifest.global",
    },
    "q1_delta_ingest": {
        "label": "selected history packs",
        "total": q1_state.get("selected_packs_total") if q1_state else None,
        "unit": "packs",
        "asset_scope_total": history_manifest.get("history_pack_assets"),
        "asset_scope_label": "asset-backed history scope",
        "asset_scope_unit": "assets",
        "source": "q1 state.json + pack-manifest.global",
    },
    "build_fundamentals": {
        "label": "prioritized fundamentals scope",
        "total": fundamentals_counts.get("fundamentals_expected_total"),
        "unit": "assets",
        "source": "data-freshness.fundamentals_scope",
    },
    "quantlab_daily_report": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "scientific_summary": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "forecast_daily": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "hist_probs": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "snapshot": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "etf_diagnostic": {
        "label": "global ETF scope",
        "total": global_scope.get("global_etf_assets"),
        "unit": "assets",
        "source": "assets.global.rows",
    },
    "learning_daily": {
        "label": "history-backed assets",
        "total": history_manifest.get("history_pack_assets"),
        "unit": "assets",
        "source": "pack-manifest.global",
    },
    "system_status_report": {
        "label": "observed pipeline steps",
        "total": len(STEP_ORDER),
        "unit": "steps",
        "source": "step registry",
    },
    "data_freshness_report": {
        "label": "global allowlist assets",
        "total": global_scope.get("global_allowlist_assets") or history_manifest.get("allowlist_assets"),
        "unit": "assets",
        "source": "assets.global.rows / pack-manifest.global",
    },
    "pipeline_epoch": {
        "label": "observed pipeline steps",
        "total": len(STEP_ORDER),
        "unit": "steps",
        "source": "step registry",
    },
    "generate_meta_dashboard_data": {
        "label": "dashboard status surfaces",
        "total": 1,
        "unit": "artifact",
        "source": "dashboard_v7 status artifact",
    },
}

current_progress = None
if watchdog_same_campaign and isinstance(watchdog_current.get("last_progress"), dict):
    progress = watchdog_current["last_progress"]
    total = progress.get("total")
    completed = progress.get("completed")
    percent = None
    if total:
        try:
            percent = completed / total
        except Exception:
            percent = None
    current_progress = {
        "completed": completed,
        "total": total,
        "percent": percent,
        "unit": "assets",
        "rate_per_min": watchdog_current.get("rate_assets_per_min"),
        "eta_sec": round(float(watchdog_current.get("eta_min") or 0) * 60.0, 2) if watchdog_current.get("eta_min") is not None else None,
        "eta_source": "watchdog",
        "source": "watchdog-last_progress",
    }
elif q1_state:
    current_progress = {
        "completed": q1_state.get("packs_done"),
        "total": q1_state.get("selected_packs_total") or q1_state.get("candidate_packs_total"),
        "percent": q1_state.get("percent"),
        "unit": "packs",
        "rate_per_min": q1_state.get("rate_per_min"),
        "eta_sec": q1_state.get("eta_sec"),
        "eta_source": "q1_state_rate" if q1_state.get("eta_sec") else None,
        "source": "q1-state.json",
    }

current_step_history = (history.get("steps") or {}).get(current_step or "", {}) if current_step else {}
elapsed_sec = age_seconds(started_at)
if current_progress and current_progress.get("eta_sec") is None and current_step_history.get("median_duration_sec") is not None and elapsed_sec is not None:
    remaining = max(0.0, float(current_step_history["median_duration_sec"]) - float(elapsed_sec))
    current_progress["eta_sec"] = remaining
    current_progress["eta_source"] = "historical_median_minus_elapsed"

pending_steps = []
if current_step in STEP_ORDER:
    idx = STEP_ORDER.index(current_step)
    pending_steps = STEP_ORDER[idx + 1 :]

remaining_steps = []
historical_remaining_sec = 0.0
unknown_remaining_steps = 0
for step_id in pending_steps:
    step_hist = (history.get("steps") or {}).get(step_id, {})
    median_sec = step_hist.get("median_duration_sec")
    if median_sec is None:
        unknown_remaining_steps += 1
    else:
        historical_remaining_sec += float(median_sec)
    remaining_steps.append({
        "step_id": step_id,
        "label": STEP_LABELS.get(step_id, step_id),
        "median_duration_sec": median_sec,
        "avg_duration_sec": step_hist.get("avg_duration_sec"),
        "success_count": step_hist.get("success_count"),
        "failure_count": step_hist.get("failure_count"),
        "scope": step_scope.get(step_id),
    })

current_eta_sec = current_progress.get("eta_sec") if current_progress else None
best_case_remaining_sec = None
best_case_finish_at = None
if current_eta_sec is not None:
    best_case_remaining_sec = float(current_eta_sec) + historical_remaining_sec
    best_case_finish_at = (utc_now().timestamp() + best_case_remaining_sec)
elif current_status == "completed":
    best_case_remaining_sec = 0.0
    best_case_finish_at = utc_now().timestamp()

runtime_state = "unknown"
if current_status == "running":
    runtime_state = "running" if any("rv-nas-night-supervisor.sh" in proc.get("cmdline", "") for proc in processes) else "stalled"
elif current_status == "failed":
    runtime_state = "failed"
elif current_status == "completed":
    runtime_state = "completed"

current_error = None
failed_step = latest.get("failed_step")
if current_status == "failed" and failed_step:
    result = read_json(PIPELINE_ROOT / "runs" / str(current_stamp) / failed_step / "result.json", {}) or {}
    stderr_head = read_first_line(PIPELINE_ROOT / "runs" / str(current_stamp) / failed_step / "stderr.log")
    signature = human_error_signature(stderr_head or result.get("guard_reason") or f"exit_code={result.get('command_exit_code')}")
    step_hist = (history.get("steps") or {}).get(failed_step, {})
    current_error = {
        "step_id": failed_step,
        "label": STEP_LABELS.get(failed_step, failed_step),
        "message": stderr_head or result.get("guard_reason") or "No stderr captured",
        "signature": signature,
        "command_exit_code": result.get("command_exit_code"),
        "duration_sec": result.get("duration_sec"),
        "occurrence_count": step_hist.get("most_common_error_count") if step_hist.get("most_common_error_signature") == signature else 1,
        "step_failure_count": step_hist.get("failure_count"),
        "step_total_runs": step_hist.get("total_runs"),
        "last_failure_at": step_hist.get("last_failure_at"),
        "fix_suggestion": fix_suggestion(failed_step, signature),
        "related_lessons": match_lessons(lessons.get("entries") or [], signature, failed_step),
    }

failure_protocol = []
for row in (history.get("failure_protocol") or []):
    failure_protocol.append(
        {
            **row,
            "related_lessons": match_lessons(lessons.get("entries") or [], row.get("signature"), row.get("top_step")),
        }
    )

dashboard = {
    "schema_version": "rv.nas.pipeline.dashboard.v1",
    "generated_at": utc_now_iso(),
    "fetch_mode": FETCH_MODE,
    "latest": latest,
    "watchdog": watchdog,
    "processes": processes,
    "current_run": {
        "campaign_stamp": current_stamp,
        "lane": current_lane,
        "target_market_date": target_market_date,
        "status": current_status,
        "runtime_state": runtime_state,
        "current_step": current_step,
        "current_step_label": STEP_LABELS.get(current_step, current_step) if current_step else None,
        "failed_step": failed_step,
        "completed_steps": completed_steps,
        "completed_steps_count": len(completed_steps),
        "total_steps": len(STEP_ORDER),
        "pipeline_progress_pct": (len(completed_steps) / len(STEP_ORDER)) if STEP_ORDER else None,
        "started_at": started_at,
        "updated_at": latest.get("updated_at"),
        "completed_at": latest.get("finished_at") or latest.get("completed_at"),
        "elapsed_sec": elapsed_sec,
        "current_scope": step_scope.get(current_step),
        "current_progress": current_progress,
        "pending_steps": pending_steps,
        "remaining_steps": remaining_steps,
        "historical_remaining_sec": round(historical_remaining_sec, 2),
        "unknown_remaining_steps": unknown_remaining_steps,
        "best_case_remaining_sec": round(best_case_remaining_sec, 2) if best_case_remaining_sec is not None else None,
        "best_case_finish_at": datetime.fromtimestamp(best_case_finish_at, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z") if best_case_finish_at is not None else None,
        "carry_forward_completed_steps": carry_forward_completed_steps,
        "step_history": current_step_history,
        "q1_state": q1_state,
        "q1_run_status": q1_run_status,
    },
    "historical": history,
    "failure_protocol": failure_protocol,
    "lessons_learned": lessons,
    "current_error": current_error,
    "step_scope": step_scope,
    "universe": {
        **global_scope,
        **history_manifest,
        **fundamentals_counts,
        **ui_counts,
    },
}

print(json.dumps(dashboard, ensure_ascii=False, indent=2))
PY
REMOTE

python3 - "$TMP_BUNDLE" "$OUT_DIR" "$SSH_TARGET_LABEL" "$FETCH_MODE" <<'PY'
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

bundle_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
ssh_target = sys.argv[3]
fetch_mode = sys.argv[4]

bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
existing_path = out_dir / "nas-pipeline-dashboard.json"
existing = {}
if existing_path.exists():
    try:
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
    except Exception:
        existing = {}

STEP_ORDER = [
    "safe_code_sync",
    "build_global_scope",
    "market_data_refresh",
    "q1_delta_ingest",
    "build_fundamentals",
    "quantlab_daily_report",
    "scientific_summary",
    "forecast_daily",
    "hist_probs",
    "snapshot",
    "etf_diagnostic",
    "learning_daily",
    "v1_audit",
    "cutover_readiness",
    "stage1_ops_pack",
    "system_status_report",
    "data_freshness_report",
    "pipeline_epoch",
    "generate_meta_dashboard_data",
]

def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None

def recompute_history_fields(doc):
    current = (doc.get("current_run") or {})
    historical = ((doc.get("historical") or {}).get("steps") or {})
    step_scope = doc.get("step_scope") or {}
    current_step = current.get("current_step")
    if not current_step:
        return
    current["step_history"] = historical.get(current_step) or current.get("step_history") or {}
    if current_step not in STEP_ORDER:
        return
    idx = STEP_ORDER.index(current_step)
    pending_steps = STEP_ORDER[idx + 1 :]
    remaining_steps = []
    historical_remaining_sec = 0.0
    unknown_remaining_steps = 0
    for step_id in pending_steps:
        step_hist = historical.get(step_id) or {}
        median_sec = step_hist.get("median_duration_sec")
        if median_sec is None:
            unknown_remaining_steps += 1
        else:
            historical_remaining_sec += float(median_sec)
        remaining_steps.append({
            "step_id": step_id,
            "label": (step_id.replace("_", " ").title()),
            "median_duration_sec": median_sec,
            "avg_duration_sec": step_hist.get("avg_duration_sec"),
            "success_count": step_hist.get("success_count"),
            "failure_count": step_hist.get("failure_count"),
            "scope": step_scope.get(step_id),
        })
    current["pending_steps"] = pending_steps
    current["remaining_steps"] = remaining_steps
    current["historical_remaining_sec"] = round(historical_remaining_sec, 2)
    current["unknown_remaining_steps"] = unknown_remaining_steps
    current_progress = current.get("current_progress") or {}
    elapsed_sec = current.get("elapsed_sec")
    eta_sec = current_progress.get("eta_sec")
    median_current = (current.get("step_history") or {}).get("median_duration_sec")
    if eta_sec is None and median_current is not None and elapsed_sec is not None:
        eta_sec = max(0.0, float(median_current) - float(elapsed_sec))
        current_progress["eta_sec"] = round(eta_sec, 2)
        current_progress["eta_source"] = "historical_median_minus_elapsed"
        current["current_progress"] = current_progress
    if eta_sec is not None:
        best_case_remaining_sec = float(eta_sec) + historical_remaining_sec
        current["best_case_remaining_sec"] = round(best_case_remaining_sec, 2)
        current["best_case_finish_at"] = datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + best_case_remaining_sec,
            tz=timezone.utc,
        ).replace(microsecond=0).isoformat().replace("+00:00", "Z")

if fetch_mode == "fast" and existing:
    if not ((bundle.get("historical") or {}).get("steps")) and ((existing.get("historical") or {}).get("steps")):
        bundle["historical"] = existing.get("historical")
        bundle["history_source"] = "carried_forward"
    if not bundle.get("failure_protocol") and existing.get("failure_protocol"):
        bundle["failure_protocol"] = existing.get("failure_protocol")
    if not bundle.get("lessons_learned") and existing.get("lessons_learned"):
        bundle["lessons_learned"] = existing.get("lessons_learned")
    recompute_history_fields(bundle)

prev_local_sync = existing.get("local_sync") or {}
synced_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
last_full_sync_at = prev_local_sync.get("last_full_sync_at")
if fetch_mode == "full":
    last_full_sync_at = synced_at
bundle["local_sync"] = {
    "synced_at": synced_at,
    "ssh_target": ssh_target,
    "fetch_mode": fetch_mode,
    "last_full_sync_at": last_full_sync_at,
}

payloads = {
    "nas-pipeline-dashboard.json": bundle,
    "nas-supervisor-state.json": bundle.get("latest") or {"last_status": "unknown"},
    "nas-pipeline-live.json": bundle.get("watchdog") or {"severity": "offline", "reasons": ["watchdog_file_not_found"]},
}

for filename, payload in payloads.items():
    tmp = out_dir / f"{filename}.tmp"
    final = out_dir / filename
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, final)
PY

log "✅ NAS dashboard snapshot synced"
ls -la \
  "$OUT_DIR/nas-pipeline-dashboard.json" \
  "$OUT_DIR/nas-pipeline-live.json" \
  "$OUT_DIR/nas-supervisor-state.json"
