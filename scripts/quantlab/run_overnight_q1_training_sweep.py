#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import shlex
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import polars as pl

from q1_common import (
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    safe_panel_lookback_calendar_days,
    stable_hash_obj,
    utc_now_iso,
)
from run_night_preflight_q1 import run_preflight_checks


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--feature-store-version", default="v4_q1panel_overnight")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--panel-max-assets", type=int, default=0)
    p.add_argument("--min-bars", type=int, default=200)
    p.add_argument("--panel-days-list", default="60,90")
    p.add_argument("--top-liquid-list", default="20000,30000,40000,50000")
    p.add_argument("--asof-dates-count", type=int, default=8)
    p.add_argument("--fold-count", type=int, default=3)
    p.add_argument("--test-days", type=int, default=5)
    p.add_argument("--embargo-days", type=int, default=2)
    p.add_argument("--min-train-days", type=int, default=8)
    p.add_argument("--survivors-max", type=int, default=24)
    p.add_argument("--redflags-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--stageb-q1-strict-survivors-max", type=int, default=8)
    p.add_argument("--stageb-pass-mode", choices=["strict", "proxy_augmented"], default="strict")
    p.add_argument("--stageb-strict-gate-profile", choices=["hard", "broad"], default="hard")
    p.add_argument("--stageb-input-scope", choices=["survivors_a", "all_candidates"], default="survivors_a")
    p.add_argument("--stageb-min-survivors-b-q1", type=int, default=1)
    p.add_argument("--stageb-survivors-b-q1-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--stageb-psr-strict-min", type=float, default=0.60)
    p.add_argument("--stageb-dsr-strict-min", type=float, default=0.50)
    p.add_argument("--stageb-psr-cpcv-strict-min", type=float, default=0.55)
    p.add_argument("--stageb-dsr-cpcv-strict-min", type=float, default=0.45)
    p.add_argument("--stageb-dsr-trials-total", type=int, default=0)
    p.add_argument("--stageb-cpcv-light-p10-min", type=float, default=-0.04)
    p.add_argument("--stageb-cpcv-light-p25-min", type=float, default=-0.01)
    p.add_argument("--stageb-cpcv-light-p05-min", type=float, default=-0.08)
    p.add_argument("--stageb-cpcv-light-es10-min", type=float, default=-0.10)
    p.add_argument("--stageb-cpcv-light-min-combo-size", type=int, default=2)
    p.add_argument("--stageb-cpcv-light-skip-adjacent-folds", action="store_true", default=True)
    p.add_argument(
        "--skip-stageb-cpcv-light-skip-adjacent-folds",
        dest="stageb_cpcv_light_skip_adjacent_folds",
        action="store_false",
    )
    p.add_argument("--stageb-cpcv-light-temporal-filter", action="store_true", default=True)
    p.add_argument(
        "--skip-stageb-cpcv-light-temporal-filter",
        dest="stageb_cpcv_light_temporal_filter",
        action="store_false",
    )
    p.add_argument("--stageb-cpcv-light-min-test-gap-days", type=int, default=5)
    p.add_argument("--stageb-cpcv-light-min-embargo-gap-days", type=int, default=2)
    p.add_argument("--stageb-cpcv-light-min-effective-paths", type=int, default=3)
    p.add_argument("--stageb-cpcv-light-min-effective-path-ratio", type=float, default=0.50)
    p.add_argument("--stageb-cpcv-light-min-paths-total", type=int, default=3)
    p.add_argument("--registry-score-epsilon", type=float, default=0.01)
    p.add_argument("--registry-demotion-shadow-score-gap", type=float, default=0.03)
    p.add_argument("--registry-demotion-retire-score-gap", type=float, default=0.08)
    p.add_argument("--registry-stageb-pass-column", choices=["strict", "selected"], default="strict")
    p.add_argument("--registry-freeze-on-zero-strict-pass", action="store_true", default=True)
    p.add_argument(
        "--skip-registry-freeze-on-zero-strict-pass",
        dest="registry_freeze_on_zero_strict_pass",
        action="store_false",
    )
    p.add_argument("--registry-require-top-survivor-hard-gates-pass", action="store_true", default=True)
    p.add_argument(
        "--skip-registry-require-top-survivor-hard-gates-pass",
        dest="registry_require_top_survivor_hard_gates_pass",
        action="store_false",
    )
    p.add_argument("--run-portfolio-q1", action="store_true", default=True)
    p.add_argument("--fixed-universe-path", default="")
    p.add_argument("--skip-run-portfolio-q1", dest="run_portfolio_q1", action="store_false")
    p.add_argument("--run-v4-final-gate-matrix", action="store_true", default=True)
    p.add_argument("--skip-run-v4-final-gate-matrix", dest="run_v4_final_gate_matrix", action="store_false")
    p.add_argument("--portfolio-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--portfolio-feature-store-version", default="")
    p.add_argument("--portfolio-part-glob", default="part-*.parquet")
    p.add_argument("--portfolio-panel-output-tag", default="")
    p.add_argument("--portfolio-min-adv-dollar", type=float, default=250000.0)
    p.add_argument("--portfolio-top-n-long", type=int, default=120)
    p.add_argument("--portfolio-top-n-short", type=int, default=120)
    p.add_argument("--portfolio-allow-shorts", action="store_true", default=True)
    p.add_argument("--skip-portfolio-allow-shorts", dest="portfolio_allow_shorts", action="store_false")
    p.add_argument("--portfolio-target-gross", type=float, default=1.0)
    p.add_argument("--portfolio-max-gross", type=float, default=1.5)
    p.add_argument("--portfolio-max-net", type=float, default=1.0)
    p.add_argument("--portfolio-max-position-weight", type=float, default=0.08)
    p.add_argument("--portfolio-min-rebalance-delta", type=float, default=0.002)
    p.add_argument(
        "--portfolio-no-rebalance-orders-failure-mode",
        choices=["off", "warn", "hard"],
        default="off",
    )
    p.add_argument(
        "--portfolio-registry-slot-consistency-failure-mode",
        choices=["off", "warn", "hard"],
        default="warn",
    )
    p.add_argument("--portfolio-require-nonempty", action="store_true", default=True)
    p.add_argument("--skip-portfolio-require-nonempty", dest="portfolio_require_nonempty", action="store_false")
    p.add_argument("--max-hours", type=float, default=9.5)
    p.add_argument("--task-timeout-minutes", type=float, default=120.0)
    p.add_argument("--task-order", choices=["safe_light_first", "heavy_first"], default="safe_light_first")
    p.add_argument("--task-nice", type=int, default=16)
    p.add_argument("--threads-cap", type=int, default=2)
    p.add_argument("--max-rss-gib", type=float, default=6.5)
    p.add_argument("--state-heartbeat-interval-sec", type=float, default=60.0)
    p.add_argument("--monitor-interval-sec", type=float, default=5.0)
    p.add_argument("--metrics-log-interval-sec", type=float, default=30.0)
    p.add_argument("--stale-orphan-minutes", type=float, default=8.0)
    p.add_argument("--stale-heartbeat-minutes", type=float, default=45.0)
    p.add_argument("--stale-min-elapsed-minutes", type=float, default=20.0)
    p.add_argument("--stale-cpu-pct-max", type=float, default=1.0)
    p.add_argument("--enforce-system-guardrails", action="store_true", default=True)
    p.add_argument("--skip-enforce-system-guardrails", dest="enforce_system_guardrails", action="store_false")
    p.add_argument("--max-load-per-core", type=float, default=1.20)
    p.add_argument("--min-free-disk-gb", type=float, default=30.0)
    p.add_argument("--run-preflight", action="store_true", default=True)
    p.add_argument("--skip-run-preflight", dest="run_preflight", action="store_false")
    p.add_argument("--preflight-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--preflight-max-rss-mem-fraction", type=float, default=0.8)
    p.add_argument("--preflight-raw-bars-provider", default="EODHD")
    p.add_argument("--preflight-raw-bars-stale-after-calendar-days", type=int, default=3)
    p.add_argument("--system-guard-check-interval-sec", type=float, default=20.0)
    p.add_argument("--max-system-guard-wait-minutes", type=float, default=30.0)
    p.add_argument("--sleep-between-tasks-sec", type=float, default=20.0)
    p.add_argument("--retry-cooldown-sec", type=float, default=30.0)
    p.add_argument("--max-retries-per-task", type=int, default=1)
    p.add_argument("--max-failed-task-resume-retries", type=int, default=0)
    p.add_argument("--retryable-exit-codes", default="124,137,142")
    p.add_argument("--oom-downshift-on-rss-kill", action="store_true", default=True)
    p.add_argument("--skip-oom-downshift-on-rss-kill", dest="oom_downshift_on_rss_kill", action="store_false")
    p.add_argument("--oom-downshift-factor", type=float, default=0.65)
    p.add_argument("--oom-downshift-min-top-liquid", type=int, default=500)
    p.add_argument("--stop-after-consecutive-failures", type=int, default=3)
    p.add_argument("--job-name", default="")
    p.add_argument("--plan-only", action="store_true")
    p.add_argument("--resume-from", default="")
    p.add_argument("--retry-failed", action="store_true")
    p.add_argument("--global-lock-name", default="overnight_q1_training_sweep")
    p.add_argument("--run-phasea-backbone", action="store_true", default=True)
    p.add_argument("--skip-run-phasea-backbone", dest="run_phasea_backbone", action="store_false")
    p.add_argument("--phasea-include-types", default="STOCK,ETF")
    p.add_argument("--phasea-auto-thresholds-from-ledger", action="store_true", default=True)
    p.add_argument("--skip-phasea-auto-thresholds-from-ledger", dest="phasea_auto_thresholds_from_ledger", action="store_false")
    p.add_argument("--phasea-auto-thresholds-path", default="")
    p.add_argument("--phasea-auto-thresholds-min-history", type=int, default=10)
    p.add_argument("--phasea-warn-min-delta-rows", type=int, default=0)
    p.add_argument("--phasea-warn-max-delta-rows", type=int, default=0)
    p.add_argument("--phasea-fail-min-delta-rows", type=int, default=0)
    p.add_argument("--phasea-fail-max-delta-rows", type=int, default=0)
    p.add_argument("--phasea-production-mode", action="store_true", default=True)
    p.add_argument("--skip-phasea-production-mode", dest="phasea_production_mode", action="store_false")
    p.add_argument("--phasea-real-delta-test-mode", action="store_true", default=False)
    p.add_argument("--phasea-real-delta-min-emitted-rows", type=int, default=1)
    p.add_argument("--phasea-real-delta-limit-packs", type=int, default=2)
    p.add_argument("--phasea-real-delta-max-emitted-rows", type=int, default=100000)
    p.add_argument("--v4-final-profile", action="store_true", default=False)
    return p.parse_args(list(argv))


@dataclass
class Task:
    task_id: str
    asof_end_date: str
    panel_days: int
    top_liquid_n: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "asof_end_date": self.asof_end_date,
            "panel_days": self.panel_days,
            "top_liquid_n": self.top_liquid_n,
        }


def _parse_csv_ints(value: str) -> list[int]:
    out: list[int] = []
    for part in (value or "").split(","):
        s = part.strip()
        if not s:
            continue
        out.append(int(s))
    return out


def _parse_csv_int_set(value: str) -> set[int]:
    return {int(v) for v in _parse_csv_ints(value)}


_RC1_TRANSIENT_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"resource temporarily unavailable",
        r"temporarily unavailable",
        r"try again",
        r"timed out",
        r"timeout",
        r"connection reset",
        r"broken pipe",
        r"input/output error",
        r"i/o error",
        r"interrupted system call",
        r"device not configured",
    ]
]

_RC1_NON_TRANSIENT_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"bad file descriptor",
        r"can't initialize sys standard streams",
        r"syntaxerror",
        r"module not found",
        r"no module named",
        r"permission denied",
        r"file not found",
        r"fatal python error",
    ]
]


def _failed_by_class(tasks: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in tasks:
        if str(row.get("status")) != "failed":
            continue
        cls = str(row.get("failure_class") or "unknown")
        out[cls] = int(out.get(cls, 0)) + 1
    return out


def _refresh_summary(state: dict[str, Any]) -> tuple[int, int, int, int]:
    pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
    running = sum(1 for t in state["tasks"] if t["status"] == "running")
    done = sum(1 for t in state["tasks"] if t["status"] == "done")
    failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
    state["summary"].update(
        {
            "pending": pending,
            "running": running,
            "done": done,
            "failed": failed,
            "failed_by_class": _failed_by_class(state["tasks"]),
        }
    )
    return pending, running, done, failed


def _read_status_reason_codes(status_path: str | None) -> list[str]:
    if not status_path:
        return []
    p = Path(str(status_path))
    if not p.exists() or not p.is_file():
        return []
    try:
        obj = json.loads(p.read_text())
    except Exception:
        return []
    raw = obj.get("failure_reason_codes") or []
    out: list[str] = []
    for v in raw:
        if v is None:
            continue
        out.append(str(v))
    return out


def _read_status_progress(status_path: str | None) -> dict[str, Any] | None:
    if not status_path:
        return None
    p = Path(str(status_path))
    if not p.exists() or not p.is_file():
        return None
    try:
        obj = json.loads(p.read_text())
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    return obj


def _status_has_structural_progress(obj: dict[str, Any]) -> bool:
    steps = obj.get("steps") or []
    if isinstance(steps, list) and any(isinstance(step, dict) for step in steps):
        return True
    artifacts = obj.get("artifacts") or {}
    if isinstance(artifacts, dict):
        orch_report = str(artifacts.get("orchestrator_run_report") or "").strip()
        if orch_report and Path(orch_report).exists():
            return True
    current_step = str(obj.get("current_step") or "").strip()
    if current_step and current_step not in {"bootstrap", "run_q1_daily_data_backbone_q1"}:
        return True
    stdout_tail = obj.get("stdout_tail") or []
    stderr_tail = obj.get("stderr_tail") or []
    if isinstance(stdout_tail, list) and stdout_tail:
        return True
    if isinstance(stderr_tail, list) and stderr_tail:
        return True
    return False


def _status_has_material_progress(status_path: str | None) -> bool:
    obj = _read_status_progress(status_path)
    if not obj:
        return False
    structural_progress = _status_has_structural_progress(obj)
    if structural_progress:
        return True
    reasons = {str(v).upper() for v in (obj.get("failure_reason_codes") or []) if v is not None}
    synthetic_finalize = bool(
        reasons.intersection(
            {
                "RUNNER_FINALIZED_BY_SWEEP_MONITOR",
                "RUNNER_TERMINATED_BY_SIGNAL",
            }
        )
    )
    if obj.get("ok") is not None or obj.get("exit_code") is not None:
        return not synthetic_finalize
    return False


def _append_unique_reason_codes(target: list[str], codes: Iterable[str]) -> list[str]:
    out: list[str] = [str(v) for v in target if v is not None]
    seen = {str(v).upper() for v in out}
    for code in codes:
        raw = str(code or "").strip()
        if not raw:
            continue
        key = raw.upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(raw)
    return out


def _finalize_incomplete_runner_status(
    *,
    status_path: str | None,
    rc: int,
    monitor: dict[str, Any] | None,
    failure_class: str,
    log_lines: list[str],
) -> bool:
    obj = _read_status_progress(status_path)
    if not obj:
        return False
    if obj.get("ok") is not None or obj.get("exit_code") is not None:
        return False
    reason_codes: list[str] = ["RUNNER_FINALIZED_BY_SWEEP_MONITOR"]
    mon = monitor or {}
    if bool(mon.get("killed_for_rss")) or int(rc) == 137:
        reason_codes.append("OOM_FINALIZED")
    if bool(mon.get("killed_for_bootstrap_stall")):
        reason_codes.append("BOOTSTRAP_STALL_FINALIZED")
    if bool(mon.get("killed_for_stale_heartbeat")) or str(failure_class) == "heartbeat":
        reason_codes.append("STALE_HEARTBEAT_FINALIZED")
    if bool(mon.get("killed_for_stale_orphan")) or str(failure_class) == "orphan":
        reason_codes.append("STALE_ORPHAN_FINALIZED")
    if int(rc) == 124:
        reason_codes.append("TASK_TIMEOUT_FINALIZED")
    if int(rc) != 0:
        reason_codes.append(f"RUNNER_EXIT_CODE_{int(rc)}")
    obj["generated_at"] = utc_now_iso()
    obj["ok"] = False
    obj["exit_code"] = int(rc)
    obj["state"] = "failed"
    obj["current_step"] = str(obj.get("current_step") or "unknown")
    obj["failure_reason_codes"] = _append_unique_reason_codes(
        list(obj.get("failure_reason_codes") or []),
        reason_codes,
    )
    if log_lines:
        stdout_tail = list(obj.get("stdout_tail") or [])
        stderr_tail = list(obj.get("stderr_tail") or [])
        if not stdout_tail:
            obj["stdout_tail"] = log_lines[-20:]
        finalize_note = (
            f"RUNNER_FINALIZED_BY_SWEEP_MONITOR rc={int(rc)} "
            f"failure_class={str(failure_class)} current_step={obj['current_step']}"
        )
        if finalize_note not in stderr_tail:
            stderr_tail = [*stderr_tail[-19:], finalize_note]
        obj["stderr_tail"] = stderr_tail
    artifacts = obj.get("artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
        obj["artifacts"] = artifacts
    orch_report = str(mon.get("orchestrator_report") or "").strip()
    if orch_report and not str(artifacts.get("orchestrator_run_report") or "").strip():
        artifacts["orchestrator_run_report"] = orch_report
    obj["heartbeat"] = {
        "at": utc_now_iso(),
        "note": "finalized_by_sweep_monitor",
    }
    obj["monitor_finalize"] = {
        "at": utc_now_iso(),
        "rc": int(rc),
        "failure_class": str(failure_class),
    }
    atomic_write_json(Path(str(status_path)), obj)
    return True


def _runner_refs_have_material_progress(
    *,
    runner_run_id: str | None,
    status_path: str | None,
    orchestrator_report: str | None,
) -> bool:
    if _status_has_material_progress(status_path):
        return True
    report_raw = str(orchestrator_report or "").strip()
    if report_raw and Path(report_raw).exists():
        return True
    run_id = str(runner_run_id or "").strip()
    if not run_id:
        return False
    return False


def _attempt_history_has_runner_activity(attempt_history: list[dict[str, Any]] | None) -> bool:
    for attempt in list(attempt_history or []):
        monitor = attempt.get("monitor") or {}
        if _runner_refs_have_material_progress(
            runner_run_id=monitor.get("runner_run_id"),
            status_path=monitor.get("status_path"),
            orchestrator_report=monitor.get("orchestrator_report"),
        ):
            return True
    return False


def _is_rc1_transient(log_lines: list[str]) -> bool:
    txt = "\n".join(log_lines[-300:])
    for pat in _RC1_NON_TRANSIENT_PATTERNS:
        if pat.search(txt):
            return False
    for pat in _RC1_TRANSIENT_PATTERNS:
        if pat.search(txt):
            return True
    return False


def _classify_failure(
    *,
    rc: int,
    ok: bool,
    monitor: dict[str, Any] | None,
    log_lines: list[str],
    status_path: str | None,
) -> str:
    if ok and int(rc) == 0:
        return "ok"
    m = monitor or {}
    if bool(m.get("killed_for_rss")) or int(rc) == 137:
        return "oom"
    if bool(m.get("killed_for_bootstrap_stall")):
        return "bootstrap"
    if bool(m.get("killed_for_stale_heartbeat")):
        return "heartbeat"
    if bool(m.get("killed_for_stale_orphan")):
        return "orphan"
    if int(rc) == 142:
        return "heartbeat"
    txt = "\n".join(log_lines[-300:]).lower()
    if ("bad file descriptor" in txt) or ("can't initialize sys standard streams" in txt):
        return "fd"
    reasons = [r.upper() for r in _read_status_reason_codes(status_path)]
    if any(("UPSTREAM" in r) or ("STAGE_A" in r) for r in reasons):
        return "upstream"
    if any(("GATE" in r) or ("REDFLAG" in r) for r in reasons):
        return "gate"
    if ("upstream_stage_a_failed" in txt) or ("stage_a_pipeline_failed" in txt):
        return "upstream"
    if ("strict_pass" in txt) or ("hard_gate" in txt) or ("gate" in txt):
        return "gate"
    return "unknown"


def _downshift_top_liquid(current: int, factor: float, min_top: int) -> int:
    curr = max(1, int(current))
    minv = max(1, int(min_top))
    f = float(factor)
    if f <= 0.0:
        f = 0.5
    nxt = int(curr * f)
    if nxt >= curr:
        nxt = curr - 1
    return max(minv, nxt)


def _prepare_failed_task_for_resume(
    row: dict[str, Any],
    args: argparse.Namespace,
    max_attempts_per_task: int,
) -> tuple[bool, str]:
    if not bool(args.retry_failed):
        return False, "retry_failed_disabled"
    max_resume_retries = max(0, int(args.max_failed_task_resume_retries))
    if max_resume_retries <= 0:
        return False, "resume_retry_budget_disabled"
    resume_retry_count = int(row.get("resume_retry_count") or 0)
    if resume_retry_count >= max_resume_retries:
        return False, "resume_retry_budget_exhausted"

    failure_class = str(row.get("failure_class") or "unknown")
    attempt_history = list(row.get("attempt_history") or [])
    has_runner_activity = _attempt_history_has_runner_activity(attempt_history)
    if int(row.get("current_top_liquid_n") or row.get("top_liquid_n") or 0) < int(row.get("top_liquid_n") or 0):
        failure_class = "oom"
    elif row.get("oom_downshift_history"):
        failure_class = "oom"
    else:
        for attempt in reversed(attempt_history):
            hist_class = str(attempt.get("failure_class") or "")
            monitor = attempt.get("monitor") or {}
            rc = int(attempt.get("rc") or 0)
            if hist_class == "oom" or bool(monitor.get("killed_for_rss")) or rc == 137:
                failure_class = "oom"
                break
    retry_reason = ""
    if failure_class == "oom":
        prev_top = int(row.get("current_top_liquid_n") or row.get("top_liquid_n") or 0)
        next_top = _downshift_top_liquid(
            prev_top,
            float(args.oom_downshift_factor),
            int(args.oom_downshift_min_top_liquid),
        )
        if next_top >= prev_top:
            return False, "oom_min_top_reached"
        row["current_top_liquid_n"] = int(next_top)
        row.setdefault("oom_downshift_history", [])
        row["oom_downshift_history"].append(
            {
                "attempt_no": int(row.get("attempts") or 0),
                "from_top_liquid_n": int(prev_top),
                "to_top_liquid_n": int(next_top),
                "reason": "resume_retry_failed_oom",
                "ts": utc_now_iso(),
            }
        )
        retry_reason = f"resume_retry_oom_downshift_{prev_top}_to_{next_top}"
    elif failure_class == "bootstrap":
        return False, "bootstrap_stall_non_retryable"
    elif failure_class in {"heartbeat", "orphan", "unknown"}:
        if not has_runner_activity:
            if failure_class == "unknown":
                return False, "unknown_without_material_runner_progress_non_retryable"
            return False, f"{failure_class}_without_material_runner_progress_non_retryable"
        retry_reason = f"resume_retry_{failure_class}"
    else:
        return False, f"non_resume_retryable_failure_class_{failure_class}"

    row["status"] = "pending"
    row["finished_at"] = None
    row["rc"] = None
    row["ok"] = None
    row["retry_scheduled"] = True
    row["retry_reason"] = retry_reason
    row["resume_retry_count"] = resume_retry_count + 1
    row["attempts"] = min(int(row.get("attempts") or 0), max(0, int(max_attempts_per_task) - 1))
    row.setdefault("recovered_notes", []).append(retry_reason)
    return True, retry_reason


def _resolve_sweep_snapshot_id(quant_root: Path, requested_snapshot_id: str) -> str:
    raw = str(requested_snapshot_id or "").strip()
    if raw and raw.lower() != "latest":
        return raw
    snap_dir = latest_materialized_snapshot_dir(quant_root)
    try:
        manifest = json.loads((snap_dir / "snapshot_manifest.json").read_text())
        snap = str(manifest.get("snapshot_id") or "").strip()
        if snap:
            return snap
    except Exception:
        pass
    return snap_dir.name.split("snapshot_id=", 1)[-1]


def _candidate_panel_roots(
    quant_root: Path,
    *,
    preferred_feature_store_version: str,
    snapshot_id: str,
) -> list[Path]:
    store_root = quant_root / "features" / "store"
    candidates: list[dict[str, Any]] = []
    for root in sorted(store_root.glob("feature_store_version=*")):
        manifest_path = root / "feature_panel_manifest.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            continue
        ranges = manifest.get("ranges") or {}
        panel_max = str(ranges.get("panel_max_asof_date") or "").strip()
        if not panel_max:
            continue
        candidates.append(
            {
                "root": root,
                "preferred": root.name == f"feature_store_version={preferred_feature_store_version}",
                "snapshot_match": str(manifest.get("snapshot_id") or "").strip() == str(snapshot_id or "").strip(),
                "panel_max_asof_date": panel_max,
                "generated_at": str(manifest.get("generated_at") or "").strip(),
            }
        )
    candidates.sort(
        key=lambda row: (
            1 if bool(row["snapshot_match"]) else 0,
            str(row["panel_max_asof_date"]),
            1 if bool(row["preferred"]) else 0,
            str(row["generated_at"]),
            str((row["root"]).name),
        ),
        reverse=True,
    )
    return [row["root"] for row in candidates]


def _recent_asof_dates_from_existing_panel(
    quant_root: Path,
    count: int,
    *,
    preferred_feature_store_version: str,
    requested_snapshot_id: str,
) -> list[str]:
    snapshot_id = _resolve_sweep_snapshot_id(quant_root, requested_snapshot_id)
    panel_roots = _candidate_panel_roots(
        quant_root,
        preferred_feature_store_version=preferred_feature_store_version,
        snapshot_id=snapshot_id,
    )
    if not panel_roots:
        raise FileNotFoundError("No feature panel manifests found to derive asof dates")
    last_error: Exception | None = None
    for panel_root in panel_roots:
        all_parts = sorted(panel_root.rglob("*.parquet"))
        if not all_parts:
            continue
        try:
            lf = pl.scan_parquet([str(p) for p in all_parts])
            labeled = (
                lf.filter(pl.col("fwd_ret_5d").is_not_null())
                .select(pl.col("asof_date"))
                .unique()
                .sort("asof_date")
                .collect()
            )
            vals = [str(v) for v in labeled.get_column("asof_date").to_list()]
            if not vals:
                all_df = (
                    lf.select(pl.col("asof_date"))
                    .unique()
                    .sort("asof_date")
                    .collect()
                )
                vals = [str(v) for v in all_df.get_column("asof_date").to_list()]
            if vals:
                return vals if len(vals) <= count else vals[-count:]
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    raise FileNotFoundError("No panel parquet files found to derive asof dates")


def _preferred_asof_dates_from_stageb_stability(quant_root: Path, count: int) -> list[str]:
    latest = quant_root / "ops" / "stage_b_stability" / "latest.json"
    if not latest.exists():
        return []
    try:
        obj = json.loads(latest.read_text())
    except Exception:
        return []
    rows = list(obj.get("asof_series") or [])
    scored: list[tuple[int, int, str]] = []
    for row in rows:
        asof_date = str(row.get("asof_date") or "").strip()
        if not asof_date:
            continue
        strict_pass_total = int(row.get("strict_pass_total") or 0)
        ok_score = 1 if bool(row.get("ok")) and strict_pass_total > 0 else 0
        scored.append((ok_score, strict_pass_total, asof_date))
    scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    ordered: list[str] = []
    seen: set[str] = set()
    for _, _, asof_date in scored:
        if asof_date in seen:
            continue
        seen.add(asof_date)
        ordered.append(asof_date)
        if len(ordered) >= count:
            break
    return ordered


def _build_tasks(args: argparse.Namespace, quant_root: Path) -> list[Task]:
    panel_days_values = _parse_csv_ints(args.panel_days_list)
    top_values = _parse_csv_ints(args.top_liquid_list)
    if bool(args.v4_final_profile):
        panel_days_values = [max(int(v), 90) for v in panel_days_values]
        top_values = [max(int(v), 2500) for v in top_values]
    panel_days_values = list(dict.fromkeys(int(v) for v in panel_days_values))
    top_values = list(dict.fromkeys(int(v) for v in top_values))
    feasible_asof_dates = _recent_asof_dates_from_existing_panel(
        quant_root,
        args.asof_dates_count,
        preferred_feature_store_version=str(args.feature_store_version),
        requested_snapshot_id=str(args.snapshot_id or ""),
    )
    preferred_asofs = _preferred_asof_dates_from_stageb_stability(quant_root, len(feasible_asof_dates))
    if preferred_asofs:
        feasible_set = set(feasible_asof_dates)
        preferred_asofs = [d for d in preferred_asofs if d in feasible_set]
        preferred_set = set(preferred_asofs)
        recent_sorted = sorted(feasible_asof_dates, reverse=True)
        asof_dates = preferred_asofs + [d for d in recent_sorted if d not in preferred_set]
    else:
        asof_dates = sorted(feasible_asof_dates, reverse=True)
    if args.task_order == "heavy_first":
        panel_days_values = sorted(panel_days_values, reverse=True)
        top_values = sorted(top_values, reverse=True)
    else:
        # Safer default: warm caches and avoid immediate system pressure spikes.
        panel_days_values = sorted(panel_days_values)
        top_values = sorted(top_values)
    tasks: list[Task] = []
    for asof_end_date in asof_dates:
        for panel_days in panel_days_values:
            for top_n in top_values:
                tid = f"asof{asof_end_date}_p{panel_days}_top{top_n}"
                tasks.append(Task(task_id=tid, asof_end_date=asof_end_date, panel_days=panel_days, top_liquid_n=top_n))
    return tasks


def _parse_runner_stdout(lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in lines:
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        k = key.strip()
        if k in {"run_id", "status", "orchestrator_report", "ok"}:
            out[k] = value.strip()
    return out


def _read_tail_lines(path: Path, max_lines: int = 200) -> list[str]:
    try:
        return path.read_text(errors="replace").splitlines()[-max_lines:]
    except Exception:
        return []


def _discover_runner_refs(task_log: Path, previous: dict[str, str] | None = None) -> dict[str, str]:
    discovered = dict(previous or {})
    parsed = _parse_runner_stdout(_read_tail_lines(task_log, max_lines=200))
    for key, value in parsed.items():
        if value:
            discovered[key] = value
    return discovered


def _progress_paths(task_log: Path, runner_refs: dict[str, str]) -> list[Path]:
    paths: list[Path] = [task_log]
    for key in ("status", "orchestrator_report"):
        raw = str(runner_refs.get(key) or "").strip()
        if not raw:
            continue
        p = Path(raw)
        if p.exists():
            paths.append(p)
    return paths


def _latest_progress_mtime(task_log: Path, runner_refs: dict[str, str]) -> float:
    latest = 0.0
    for path in _progress_paths(task_log, runner_refs):
        try:
            latest = max(latest, float(path.stat().st_mtime))
        except Exception:
            continue
    return latest if latest > 0.0 else time.time()


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _acquire_job_lock(job_dir: Path) -> Path:
    lock_path = job_dir / "job_lock.json"
    if lock_path.exists():
        try:
            lock = json.loads(lock_path.read_text())
        except Exception:
            lock = {}
        pid = int(lock.get("pid") or 0)
        if pid > 0 and _pid_alive(pid):
            raise RuntimeError(f"job_lock_active pid={pid} path={lock_path}")
    lock_obj = {
        "schema": "quantlab_q1_overnight_job_lock_v1",
        "pid": os.getpid(),
        "acquired_at": utc_now_iso(),
        "job_dir": str(job_dir),
    }
    atomic_write_json(lock_path, lock_obj)

    def _release() -> None:
        try:
            if not lock_path.exists():
                return
            curr = json.loads(lock_path.read_text())
            if int(curr.get("pid") or 0) == os.getpid():
                lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    atexit.register(_release)
    return lock_path


def _acquire_named_lock(quant_root: Path, lock_name: str) -> Path:
    safe = "".join(ch if (ch.isalnum() or ch in {"_", "-", "."}) else "_" for ch in str(lock_name or "").strip())
    if not safe:
        safe = "overnight_q1_training_sweep"
    lock_dir = quant_root / "jobs" / "_locks"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / f"{safe}.lock.json"
    if lock_path.exists():
        try:
            lock = json.loads(lock_path.read_text())
        except Exception:
            lock = {}
        pid = int(lock.get("pid") or 0)
        if pid > 0 and _pid_alive(pid):
            raise RuntimeError(f"named_lock_active name={safe} pid={pid} path={lock_path}")
    lock_obj = {
        "schema": "quantlab_q1_named_lock_v1",
        "name": safe,
        "pid": os.getpid(),
        "acquired_at": utc_now_iso(),
        "quant_root": str(quant_root),
    }
    atomic_write_json(lock_path, lock_obj)

    def _release() -> None:
        try:
            if not lock_path.exists():
                return
            curr = json.loads(lock_path.read_text())
            if int(curr.get("pid") or 0) == os.getpid():
                lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    atexit.register(_release)
    return lock_path


def _task_cmd(args: argparse.Namespace, task: Task, quant_root: Path, snapshot_id: str) -> list[str]:
    repo_root = Path.cwd()
    runner = repo_root / "scripts" / "quantlab" / "run_q1_panel_stage_a_daily_local.py"
    effective_panel_days = max(int(task.panel_days), 90) if bool(args.v4_final_profile) else int(task.panel_days)
    effective_top_liquid = max(int(task.top_liquid_n), 2500) if bool(args.v4_final_profile) else int(task.top_liquid_n)
    effective_lookback = (
        safe_panel_lookback_calendar_days(
            min_bars=int(args.min_bars),
            panel_days=int(effective_panel_days),
            minimum=max(420, int(args.lookback_calendar_days)),
        )
        if bool(args.v4_final_profile)
        else int(args.lookback_calendar_days)
    )
    requested_panel_max_assets = int(args.panel_max_assets)
    effective_panel_max_assets = (
        max(int(effective_top_liquid), requested_panel_max_assets)
        if requested_panel_max_assets > 0
        else int(effective_top_liquid)
    )
    panel_tag = f"overnight_p{effective_panel_days}_top{effective_top_liquid}_{task.asof_end_date}"
    cmd = [
        args.python,
        str(runner),
        "--quant-root",
        str(quant_root),
        "--snapshot-id",
        snapshot_id,
        "--feature-store-version",
        args.feature_store_version,
        "--panel-output-tag",
        panel_tag,
        "--asset-classes",
        args.asset_classes,
        "--lookback-calendar-days",
        str(effective_lookback),
        "--panel-calendar-days",
        str(effective_panel_days),
        "--panel-max-assets",
        str(effective_panel_max_assets),
        "--min-bars",
        str(args.min_bars),
        "--top-liquid-n",
        str(effective_top_liquid),
        "--fold-count",
        str(args.fold_count),
        "--test-days",
        str(args.test_days),
        "--embargo-days",
        str(args.embargo_days),
        "--min-train-days",
        str(args.min_train_days),
        "--survivors-max",
        str(args.survivors_max),
        "--asof-end-date",
        task.asof_end_date,
        "--run-stageb-q1",
        "--run-registry-q1",
        "--run-redflags-q1",
        "--redflags-failure-mode",
        str(args.redflags_failure_mode),
        "--stageb-q1-strict-survivors-max",
        str(args.stageb_q1_strict_survivors_max),
        "--stageb-pass-mode",
        str(args.stageb_pass_mode),
        "--stageb-strict-gate-profile",
        str(args.stageb_strict_gate_profile),
        "--stageb-input-scope",
        str(args.stageb_input_scope),
        "--stageb-min-survivors-b-q1",
        str(args.stageb_min_survivors_b_q1),
        "--stageb-survivors-b-q1-failure-mode",
        str(args.stageb_survivors_b_q1_failure_mode),
        "--stageb-psr-strict-min",
        str(args.stageb_psr_strict_min),
        "--stageb-dsr-strict-min",
        str(args.stageb_dsr_strict_min),
        "--stageb-psr-cpcv-strict-min",
        str(args.stageb_psr_cpcv_strict_min),
        "--stageb-dsr-cpcv-strict-min",
        str(args.stageb_dsr_cpcv_strict_min),
        "--stageb-cpcv-light-p10-min",
        str(args.stageb_cpcv_light_p10_min),
        "--stageb-cpcv-light-p25-min",
        str(args.stageb_cpcv_light_p25_min),
        "--stageb-cpcv-light-p05-min",
        str(args.stageb_cpcv_light_p05_min),
        "--stageb-cpcv-light-es10-min",
        str(args.stageb_cpcv_light_es10_min),
        "--stageb-cpcv-light-min-combo-size",
        str(args.stageb_cpcv_light_min_combo_size),
        "--stageb-cpcv-light-min-test-gap-days",
        str(args.stageb_cpcv_light_min_test_gap_days),
        "--stageb-cpcv-light-min-embargo-gap-days",
        str(args.stageb_cpcv_light_min_embargo_gap_days),
        "--stageb-cpcv-light-min-effective-paths",
        str(args.stageb_cpcv_light_min_effective_paths),
        "--stageb-cpcv-light-min-effective-path-ratio",
        str(args.stageb_cpcv_light_min_effective_path_ratio),
        "--stageb-cpcv-light-min-paths-total",
        str(args.stageb_cpcv_light_min_paths_total),
        "--registry-score-epsilon",
        str(args.registry_score_epsilon),
        "--registry-demotion-shadow-score-gap",
        str(args.registry_demotion_shadow_score_gap),
        "--registry-demotion-retire-score-gap",
        str(args.registry_demotion_retire_score_gap),
        "--registry-stageb-pass-column",
        str(args.registry_stageb_pass_column),
    ]
    if bool(args.registry_freeze_on_zero_strict_pass):
        cmd += ["--registry-freeze-on-zero-strict-pass"]
    else:
        cmd += ["--skip-registry-freeze-on-zero-strict-pass"]
    if bool(args.registry_require_top_survivor_hard_gates_pass):
        cmd += ["--registry-require-top-survivor-hard-gates-pass"]
    else:
        cmd += ["--skip-registry-require-top-survivor-hard-gates-pass"]
    if bool(args.run_portfolio_q1):
        cmd += ["--run-portfolio-q1"]
    else:
        cmd += ["--skip-run-portfolio-q1"]
    # Final gate matrix requires a portfolio report; skip automatically in no-portfolio sweeps.
    if bool(args.run_v4_final_gate_matrix) and bool(args.run_portfolio_q1):
        cmd += ["--run-v4-final-gate-matrix"]
    else:
        cmd += ["--skip-run-v4-final-gate-matrix"]
    cmd += [
        "--portfolio-failure-mode",
        str(args.portfolio_failure_mode),
        "--portfolio-feature-store-version",
        str(args.portfolio_feature_store_version or args.feature_store_version),
        "--portfolio-part-glob",
        str(args.portfolio_part_glob),
        "--portfolio-panel-output-tag",
        str(args.portfolio_panel_output_tag),
        "--portfolio-min-adv-dollar",
        str(float(args.portfolio_min_adv_dollar)),
        "--portfolio-top-n-long",
        str(int(args.portfolio_top_n_long)),
        "--portfolio-top-n-short",
        str(int(args.portfolio_top_n_short)),
        "--portfolio-target-gross",
        str(float(args.portfolio_target_gross)),
        "--portfolio-max-gross",
        str(float(args.portfolio_max_gross)),
        "--portfolio-max-net",
        str(float(args.portfolio_max_net)),
        "--portfolio-max-position-weight",
        str(float(args.portfolio_max_position_weight)),
        "--portfolio-min-rebalance-delta",
        str(float(args.portfolio_min_rebalance_delta)),
        "--portfolio-no-rebalance-orders-failure-mode",
        str(args.portfolio_no_rebalance_orders_failure_mode),
        "--portfolio-registry-slot-consistency-failure-mode",
        str(args.portfolio_registry_slot_consistency_failure_mode),
    ]
    if bool(args.portfolio_allow_shorts):
        cmd += ["--portfolio-allow-shorts"]
    else:
        cmd += ["--skip-portfolio-allow-shorts"]
    if bool(args.portfolio_require_nonempty):
        cmd += ["--portfolio-require-nonempty"]
    else:
        cmd += ["--skip-portfolio-require-nonempty"]
    if bool(args.v4_final_profile):
        cmd += ["--v4-final-profile"]
    if bool(args.run_phasea_backbone):
        cmd += [
            "--run-phasea-backbone",
            "--phasea-include-types",
            str(args.phasea_include_types),
            "--phasea-auto-thresholds-min-history",
            str(int(args.phasea_auto_thresholds_min_history)),
        ]
        if bool(args.phasea_auto_thresholds_from_ledger):
            cmd += ["--phasea-auto-thresholds-from-ledger"]
        if str(args.phasea_auto_thresholds_path or "").strip():
            cmd += ["--phasea-auto-thresholds-path", str(args.phasea_auto_thresholds_path)]
        if bool(args.phasea_production_mode):
            cmd += ["--phasea-production-mode"]
        for flag_name, val in [
            ("--phasea-warn-min-delta-rows", args.phasea_warn_min_delta_rows),
            ("--phasea-warn-max-delta-rows", args.phasea_warn_max_delta_rows),
            ("--phasea-fail-min-delta-rows", args.phasea_fail_min_delta_rows),
            ("--phasea-fail-max-delta-rows", args.phasea_fail_max_delta_rows),
        ]:
            if int(val or 0) > 0:
                cmd += [flag_name, str(int(val))]
        if bool(args.phasea_real_delta_test_mode):
            cmd += [
                "--phasea-real-delta-test-mode",
                "--phasea-real-delta-min-emitted-rows",
                str(int(args.phasea_real_delta_min_emitted_rows)),
                "--phasea-real-delta-limit-packs",
                str(int(args.phasea_real_delta_limit_packs)),
                "--phasea-real-delta-max-emitted-rows",
                str(int(args.phasea_real_delta_max_emitted_rows)),
            ]
    if int(args.stageb_dsr_trials_total) > 0:
        cmd += [
            "--stageb-dsr-trials-total",
            str(int(args.stageb_dsr_trials_total)),
        ]
    if bool(args.stageb_cpcv_light_skip_adjacent_folds):
        cmd += ["--stageb-cpcv-light-skip-adjacent-folds"]
    else:
        cmd += ["--skip-stageb-cpcv-light-skip-adjacent-folds"]
    if bool(args.stageb_cpcv_light_temporal_filter):
        cmd += ["--stageb-cpcv-light-temporal-filter"]
    else:
        cmd += ["--skip-stageb-cpcv-light-temporal-filter"]
    if args.fixed_universe_path:
        cmd += ["--fixed-universe-path", args.fixed_universe_path]
    return cmd


def _restore_runtime_args_from_state(args: argparse.Namespace, state: dict[str, Any], snapshot_id: str) -> str:
    """On resume, force runtime knobs to the persisted job configuration."""
    cfg = state.get("config") or {}
    state_snapshot_id = str(state.get("snapshot_id") or snapshot_id or "")
    if state_snapshot_id:
        snapshot_id = state_snapshot_id

    top_level_mappings: dict[str, tuple[str, Any]] = {
        "feature_store_version": ("feature_store_version", str),
        "run_v4_final_gate_matrix": ("run_v4_final_gate_matrix", bool),
        "v4_final_profile": ("v4_final_profile", bool),
    }
    cfg_mappings: dict[str, tuple[str, Any]] = {
        "task_order": ("task_order", str),
        "asset_classes": ("asset_classes", str),
        "lookback_calendar_days": ("lookback_calendar_days", int),
        "panel_max_assets": ("panel_max_assets", int),
        "min_bars": ("min_bars", int),
        "fold_count": ("fold_count", int),
        "test_days": ("test_days", int),
        "embargo_days": ("embargo_days", int),
        "min_train_days": ("min_train_days", int),
        "survivors_max": ("survivors_max", int),
        "redflags_failure_mode": ("redflags_failure_mode", str),
    }
    nested_stageb_mappings: dict[str, tuple[str, Any]] = {
        "strict_survivors_max": ("stageb_q1_strict_survivors_max", int),
        "pass_mode": ("stageb_pass_mode", str),
        "strict_gate_profile": ("stageb_strict_gate_profile", str),
        "input_scope": ("stageb_input_scope", str),
        "min_survivors_b_q1": ("stageb_min_survivors_b_q1", int),
        "survivors_b_q1_failure_mode": ("stageb_survivors_b_q1_failure_mode", str),
        "psr_strict_min": ("stageb_psr_strict_min", float),
        "dsr_strict_min": ("stageb_dsr_strict_min", float),
        "psr_cpcv_strict_min": ("stageb_psr_cpcv_strict_min", float),
        "dsr_cpcv_strict_min": ("stageb_dsr_cpcv_strict_min", float),
        "dsr_trials_total": ("stageb_dsr_trials_total", int),
        "cpcv_light_p10_min": ("stageb_cpcv_light_p10_min", float),
        "cpcv_light_p25_min": ("stageb_cpcv_light_p25_min", float),
        "cpcv_light_p05_min": ("stageb_cpcv_light_p05_min", float),
        "cpcv_light_es10_min": ("stageb_cpcv_light_es10_min", float),
        "cpcv_light_min_combo_size": ("stageb_cpcv_light_min_combo_size", int),
        "cpcv_light_skip_adjacent_folds": ("stageb_cpcv_light_skip_adjacent_folds", bool),
        "cpcv_light_temporal_filter": ("stageb_cpcv_light_temporal_filter", bool),
        "cpcv_light_min_test_gap_days": ("stageb_cpcv_light_min_test_gap_days", int),
        "cpcv_light_min_embargo_gap_days": ("stageb_cpcv_light_min_embargo_gap_days", int),
        "cpcv_light_min_effective_paths": ("stageb_cpcv_light_min_effective_paths", int),
        "cpcv_light_min_effective_path_ratio": ("stageb_cpcv_light_min_effective_path_ratio", float),
        "cpcv_light_min_paths_total": ("stageb_cpcv_light_min_paths_total", int),
    }
    nested_registry_mappings: dict[str, tuple[str, Any]] = {
        "score_epsilon": ("registry_score_epsilon", float),
        "demotion_shadow_score_gap": ("registry_demotion_shadow_score_gap", float),
        "demotion_retire_score_gap": ("registry_demotion_retire_score_gap", float),
        "require_top_survivor_hard_gates_pass": ("registry_require_top_survivor_hard_gates_pass", bool),
        "stageb_pass_column": ("registry_stageb_pass_column", str),
        "freeze_on_zero_strict_pass": ("registry_freeze_on_zero_strict_pass", bool),
    }
    nested_portfolio_mappings: dict[str, tuple[str, Any]] = {
        "run_portfolio_q1": ("run_portfolio_q1", bool),
        "failure_mode": ("portfolio_failure_mode", str),
        "feature_store_version": ("portfolio_feature_store_version", str),
        "part_glob": ("portfolio_part_glob", str),
        "panel_output_tag": ("portfolio_panel_output_tag", str),
        "min_adv_dollar": ("portfolio_min_adv_dollar", float),
        "top_n_long": ("portfolio_top_n_long", int),
        "top_n_short": ("portfolio_top_n_short", int),
        "allow_shorts": ("portfolio_allow_shorts", bool),
        "target_gross": ("portfolio_target_gross", float),
        "max_gross": ("portfolio_max_gross", float),
        "max_net": ("portfolio_max_net", float),
        "max_position_weight": ("portfolio_max_position_weight", float),
        "min_rebalance_delta": ("portfolio_min_rebalance_delta", float),
        "no_rebalance_orders_failure_mode": ("portfolio_no_rebalance_orders_failure_mode", str),
        "registry_slot_consistency_failure_mode": ("portfolio_registry_slot_consistency_failure_mode", str),
        "require_nonempty": ("portfolio_require_nonempty", bool),
    }
    for state_key, (arg_name, cast) in top_level_mappings.items():
        val = state.get(state_key, None)
        if val is None:
            continue
        try:
            setattr(args, arg_name, cast(val))
        except Exception:
            continue
    for cfg_key, (arg_name, cast) in cfg_mappings.items():
        val = cfg.get(cfg_key, None)
        if val is None:
            continue
        try:
            setattr(args, arg_name, cast(val))
        except Exception:
            continue
    stageb_cfg = cfg.get("stageb") or {}
    for cfg_key, (arg_name, cast) in nested_stageb_mappings.items():
        val = stageb_cfg.get(cfg_key, None)
        if val is None:
            continue
        try:
            setattr(args, arg_name, cast(val))
        except Exception:
            continue
    registry_cfg = cfg.get("registry") or {}
    for cfg_key, (arg_name, cast) in nested_registry_mappings.items():
        val = registry_cfg.get(cfg_key, None)
        if val is None:
            continue
        try:
            setattr(args, arg_name, cast(val))
        except Exception:
            continue
    portfolio_cfg = cfg.get("portfolio") or {}
    for cfg_key, (arg_name, cast) in nested_portfolio_mappings.items():
        val = portfolio_cfg.get(cfg_key, None)
        if val is None:
            continue
        try:
            setattr(args, arg_name, cast(val))
        except Exception:
            continue
    return snapshot_id

def _subprocess_env(args: argparse.Namespace) -> dict[str, str]:
    env = os.environ.copy()
    tc = str(max(1, int(args.threads_cap)))
    env.setdefault("POLARS_MAX_THREADS", tc)
    env.setdefault("OMP_NUM_THREADS", tc)
    env.setdefault("OPENBLAS_NUM_THREADS", tc)
    env.setdefault("MKL_NUM_THREADS", tc)
    env.setdefault("VECLIB_MAXIMUM_THREADS", tc)
    env.setdefault("NUMEXPR_NUM_THREADS", tc)
    env.setdefault("RAYON_NUM_THREADS", tc)
    return env


def _rss_kib_for_pid(pid: int) -> int | None:
    try:
        out = subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True, timeout=2.0).strip()
        if not out:
            return None
        return int(out.splitlines()[0].strip())
    except Exception:
        return None


def _cpu_pct_for_pid(pid: int) -> float:
    try:
        out = subprocess.check_output(["ps", "-o", "%cpu=", "-p", str(pid)], text=True, timeout=2.0).strip()
        if not out:
            return 0.0
        return float(out.splitlines()[0].strip())
    except Exception:
        return 0.0


def _child_pids_recursive(pid: int) -> list[int]:
    seen: set[int] = set()
    queue = [pid]
    while queue:
        parent = queue.pop(0)
        if parent in seen:
            continue
        seen.add(parent)
        try:
            out = subprocess.check_output(["pgrep", "-P", str(parent)], text=True, timeout=2.0).strip()
        except Exception:
            out = ""
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                child = int(line)
            except ValueError:
                continue
            if child not in seen:
                queue.append(child)
    return sorted(seen)


def _rss_kib_for_pid_tree(pid: int) -> int:
    total = 0
    for p in _child_pids_recursive(pid):
        total += _rss_kib_for_pid(p) or 0
    return total


def _cpu_pct_for_pid_tree(pid: int) -> float:
    total = 0.0
    for p in _child_pids_recursive(pid):
        total += _cpu_pct_for_pid(p)
    return total


def _load_per_core() -> float:
    try:
        la1, _, _ = os.getloadavg()
        cores = max(1, int(os.cpu_count() or 1))
        return float(la1) / float(cores)
    except Exception:
        return 0.0


def _disk_free_gb(path: Path) -> float:
    try:
        st = os.statvfs(str(path))
        return float(st.f_bavail * st.f_frsize) / float(1024 ** 3)
    except Exception:
        return 0.0


def _wait_for_system_guardrails(args: argparse.Namespace, quant_root: Path, driver) -> tuple[bool, dict[str, Any]]:
    check_interval = max(5.0, float(args.system_guard_check_interval_sec))
    max_wait_sec = max(60.0, float(args.max_system_guard_wait_minutes) * 60.0)
    start = time.monotonic()
    next_log = start
    samples = 0
    while True:
        now = time.monotonic()
        load_per_core = _load_per_core()
        free_disk_gb = _disk_free_gb(quant_root)
        samples += 1
        ok = (load_per_core <= float(args.max_load_per_core)) and (free_disk_gb >= float(args.min_free_disk_gb))
        if ok:
            return True, {
                "ok": True,
                "samples": int(samples),
                "elapsed_sec": round(now - start, 3),
                "load_per_core": round(load_per_core, 3),
                "max_load_per_core": float(args.max_load_per_core),
                "free_disk_gb": round(free_disk_gb, 3),
                "min_free_disk_gb": float(args.min_free_disk_gb),
            }
        if now >= next_log:
            driver.write(
                f"[{utc_now_iso()}] GUARD waiting load_per_core={load_per_core:.3f}/{float(args.max_load_per_core):.3f} "
                f"free_disk_gb={free_disk_gb:.2f}/{float(args.min_free_disk_gb):.2f} "
                f"elapsed_sec={round(now-start,1)}\n"
            )
            driver.flush()
            next_log = now + max(30.0, check_interval)
        if (now - start) >= max_wait_sec:
            return False, {
                "ok": False,
                "samples": int(samples),
                "elapsed_sec": round(now - start, 3),
                "load_per_core": round(load_per_core, 3),
                "max_load_per_core": float(args.max_load_per_core),
                "free_disk_gb": round(free_disk_gb, 3),
                "min_free_disk_gb": float(args.min_free_disk_gb),
                "reason": "system_guardrails_wait_timeout",
                "max_wait_sec": round(max_wait_sec, 3),
            }
        time.sleep(check_interval)


def _child_preexec_nice(task_nice: int):
    def _fn() -> None:
        try:
            if task_nice:
                os.nice(int(task_nice))
        except Exception:
            pass
    return _fn


def _run_task_with_monitor(
    cmd: list[str],
    task_log: Path,
    args: argparse.Namespace,
    driver,
    heartbeat_cb=None,
    heartbeat_interval_sec: float = 60.0,
) -> tuple[int, dict[str, Any]]:
    env = _subprocess_env(args)
    max_rss_kib = int(float(args.max_rss_gib) * 1024 * 1024)
    monitor_interval = max(1.0, float(args.monitor_interval_sec))
    metrics_interval = max(monitor_interval, float(args.metrics_log_interval_sec))
    timeout_sec = max(60.0, float(args.task_timeout_minutes) * 60.0)
    stale_heartbeat_sec = max(300.0, float(args.stale_heartbeat_minutes) * 60.0)
    stale_orphan_sec = max(120.0, float(args.stale_orphan_minutes) * 60.0)
    stale_min_elapsed_sec = max(120.0, float(args.stale_min_elapsed_minutes) * 60.0)
    stale_cpu_pct_max = max(0.0, float(args.stale_cpu_pct_max))

    peak_rss_kib = 0
    peak_cpu_pct = 0.0
    samples = 0
    timed_out = False
    killed_for_rss = False
    killed_for_stale_heartbeat = False
    killed_for_stale_orphan = False
    killed_for_bootstrap_stall = False
    stale_last_output_age_sec = 0.0
    start = time.monotonic()
    next_metrics_log = start + metrics_interval
    next_state_heartbeat = start + max(10.0, float(heartbeat_interval_sec))
    bootstrap_stall_sec = min(
        max(480.0, float(args.stale_min_elapsed_minutes) * 30.0),
        max(720.0, float(args.stale_heartbeat_minutes) * 60.0 * 0.5),
    )
    runner_refs: dict[str, str] = {}

    def _terminate_process_group(pid: int) -> None:
        try:
            os.killpg(pid, signal.SIGTERM)
        except Exception:
            pass
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(pid, signal.SIGKILL)
            except Exception:
                pass

    with task_log.open("a") as tlog:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=tlog,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            preexec_fn=_child_preexec_nice(int(args.task_nice)),
            start_new_session=True,
        )
        last_child_output_mtime = float(task_log.stat().st_mtime if task_log.exists() else time.time())
        driver.write(
            f"[{utc_now_iso()}] MONITOR start pid={proc.pid} task_nice={args.task_nice} "
            f"threads_cap={args.threads_cap} max_rss_gib={args.max_rss_gib} "
            f"stale_heartbeat_minutes={args.stale_heartbeat_minutes}\n"
        )
        driver.flush()

        rc: int | None = None
        while True:
            rc = proc.poll()
            now = time.monotonic()
            runner_refs = _discover_runner_refs(task_log, runner_refs)
            rss_kib = _rss_kib_for_pid_tree(proc.pid)
            cpu_pct = _cpu_pct_for_pid_tree(proc.pid)
            if rss_kib > peak_rss_kib:
                peak_rss_kib = rss_kib
            if cpu_pct > peak_cpu_pct:
                peak_cpu_pct = cpu_pct
            samples += 1

            curr_mtime = _latest_progress_mtime(task_log, runner_refs)
            if curr_mtime > last_child_output_mtime:
                last_child_output_mtime = curr_mtime
            stale_last_output_age_sec = max(0.0, time.time() - last_child_output_mtime)

            if now >= next_metrics_log:
                msg = (
                    f"[{utc_now_iso()}] MONITOR rss_gib={rss_kib / (1024*1024):.3f} "
                    f"cpu_pct={cpu_pct:.2f} peak_cpu_pct={peak_cpu_pct:.2f} "
                    f"peak_rss_gib={peak_rss_kib / (1024*1024):.3f} "
                    f"elapsed_sec={round(now-start,1)} stale_output_age_sec={round(stale_last_output_age_sec,1)} "
                    f"runner_run_id={runner_refs.get('run_id', '')} status_path={runner_refs.get('status', '')}"
                )
                driver.write(msg + "\n")
                driver.flush()
                next_metrics_log = now + metrics_interval

            if heartbeat_cb is not None and now >= next_state_heartbeat:
                try:
                    heartbeat_cb(
                        {
                            "rss_gib": round(rss_kib / (1024 * 1024), 3),
                            "cpu_pct": round(float(cpu_pct), 3),
                            "peak_rss_gib": round(peak_rss_kib / (1024 * 1024), 3),
                            "peak_cpu_pct": round(float(peak_cpu_pct), 3),
                            "elapsed_sec": round(now - start, 3),
                            "stale_output_age_sec": round(float(stale_last_output_age_sec), 3),
                            "samples": int(samples),
                            "runner_run_id": runner_refs.get("run_id"),
                            "status_path": runner_refs.get("status"),
                            "orchestrator_report": runner_refs.get("orchestrator_report"),
                        }
                    )
                except Exception:
                    pass
                next_state_heartbeat = now + max(10.0, float(heartbeat_interval_sec))

            if rc is not None:
                break

            if rss_kib > 0 and rss_kib > max_rss_kib:
                killed_for_rss = True
                driver.write(
                    f"[{utc_now_iso()}] MONITOR kill reason=max_rss_exceeded "
                    f"rss_gib={rss_kib/(1024*1024):.3f} limit_gib={args.max_rss_gib}\n"
                )
                driver.flush()
                _terminate_process_group(proc.pid)
                rc = proc.poll()
                break

            if (
                (now - start) > bootstrap_stall_sec
                and not str(runner_refs.get("run_id") or "").strip()
                and not str(runner_refs.get("status") or "").strip()
                and cpu_pct <= stale_cpu_pct_max
                and rss_kib <= int(256 * 1024)
            ):
                killed_for_bootstrap_stall = True
                driver.write(
                    f"[{utc_now_iso()}] MONITOR kill reason=bootstrap_stall "
                    f"elapsed_sec={round(now-start,1)} bootstrap_stall_sec={round(bootstrap_stall_sec,1)} "
                    f"cpu_pct={cpu_pct:.2f} rss_gib={rss_kib/(1024*1024):.3f}\n"
                )
                driver.flush()
                _terminate_process_group(proc.pid)
                rc = proc.poll()
                break

            if (now - start) > timeout_sec:
                timed_out = True
                driver.write(f"[{utc_now_iso()}] TIMEOUT task_timeout_minutes={args.task_timeout_minutes}\n")
                driver.flush()
                _terminate_process_group(proc.pid)
                rc = proc.poll()
                break

            if (
                (now - start) > stale_min_elapsed_sec
                and stale_last_output_age_sec > stale_heartbeat_sec
                and cpu_pct <= stale_cpu_pct_max
            ):
                killed_for_stale_heartbeat = True
                driver.write(
                    f"[{utc_now_iso()}] MONITOR kill reason=stale_heartbeat "
                    f"stale_output_age_sec={round(stale_last_output_age_sec,1)} "
                    f"stale_heartbeat_sec={round(stale_heartbeat_sec,1)} cpu_pct={cpu_pct:.2f}\n"
                )
                driver.flush()
                _terminate_process_group(proc.pid)
                rc = proc.poll()
                break

            # Detect likely orphan/stuck parent process: no output, no cpu, no rss for a sustained window.
            orphan_min_elapsed_sec = max(120.0, stale_orphan_sec)
            if (
                (now - start) > orphan_min_elapsed_sec
                and stale_last_output_age_sec > stale_orphan_sec
                and cpu_pct <= stale_cpu_pct_max
                and rss_kib <= 0
            ):
                killed_for_stale_orphan = True
                driver.write(
                    f"[{utc_now_iso()}] MONITOR kill reason=stale_orphan "
                    f"stale_output_age_sec={round(stale_last_output_age_sec,1)} "
                    f"stale_orphan_sec={round(stale_orphan_sec,1)} cpu_pct={cpu_pct:.2f} rss_kib={rss_kib}\n"
                )
                driver.flush()
                _terminate_process_group(proc.pid)
                rc = proc.poll()
                break

            time.sleep(monitor_interval)

        if timed_out:
            final_rc = 124
        elif killed_for_rss:
            final_rc = 137
        elif killed_for_stale_heartbeat:
            final_rc = 142
        elif killed_for_stale_orphan:
            final_rc = 142
        elif killed_for_bootstrap_stall:
            final_rc = 142
        else:
            final_rc = int(rc or 0)
        return final_rc, {
            "peak_rss_kib": peak_rss_kib,
            "peak_rss_gib": round(peak_rss_kib / (1024 * 1024), 3),
            "peak_cpu_pct": round(float(peak_cpu_pct), 3),
            "samples": samples,
            "timed_out": timed_out,
            "killed_for_rss": killed_for_rss,
            "killed_for_stale_heartbeat": killed_for_stale_heartbeat,
            "killed_for_stale_orphan": killed_for_stale_orphan,
            "killed_for_bootstrap_stall": killed_for_bootstrap_stall,
            "stale_last_output_age_sec": round(float(stale_last_output_age_sec), 3),
            "threads_cap": int(args.threads_cap),
            "task_nice": int(args.task_nice),
            "runner_run_id": runner_refs.get("run_id"),
            "status_path": runner_refs.get("status"),
            "orchestrator_report": runner_refs.get("orchestrator_report"),
        }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root)
    snapshot_id = _resolve_sweep_snapshot_id(quant_root, str(args.snapshot_id or ""))
    snapshot_dir = quant_root / "data" / "snapshots" / f"snapshot_id={snapshot_id}"
    if not snapshot_dir.exists():
        raise FileNotFoundError(f"snapshot not found: {snapshot_dir}")
    preflight_report_path: Path | None = None
    if bool(args.run_preflight):
        preflight_raw_bars_asset_types = [
            v.strip().upper()
            for v in (
                str(args.phasea_include_types or "").split(",")
                if bool(args.run_phasea_backbone)
                else str(args.asset_classes or "").split(",")
            )
            if v.strip()
        ]
        preflight = run_preflight_checks(
            quant_root=quant_root.resolve(),
            python_bin=Path(args.python),
            snapshot_dir=snapshot_dir.resolve(),
            global_lock_name=str(args.global_lock_name),
            min_free_disk_gb=float(args.min_free_disk_gb),
            max_rss_gib=float(args.max_rss_gib),
            max_rss_mem_fraction=float(args.preflight_max_rss_mem_fraction),
            skip_lock_check=False,
            raw_bars_asset_types=preflight_raw_bars_asset_types,
            raw_bars_provider=str(args.preflight_raw_bars_provider),
            raw_bars_stale_after_calendar_days=int(args.preflight_raw_bars_stale_after_calendar_days),
            require_fresh_raw_bars=bool(args.run_phasea_backbone),
        )
        preflight_dir = quant_root / "ops" / "preflight"
        preflight_dir.mkdir(parents=True, exist_ok=True)
        ts = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
        preflight_report_path = preflight_dir / f"night_preflight_{ts}.json"
        atomic_write_json(preflight_report_path, preflight)
        atomic_write_json(preflight_dir / "night_preflight_latest.json", preflight)
        if not bool(preflight.get("ok")):
            print(f"preflight_report={preflight_report_path}")
            print(f"preflight_ok=false")
            print(f"preflight_failed_checks={','.join(preflight.get('failed_checks') or [])}")
            if str(args.preflight_failure_mode).lower() == "hard":
                return 96

    now = int(time.time())
    job_name = args.job_name or f"overnight_q1_training_sweep_{now}"
    if args.resume_from:
        job_dir = Path(args.resume_from)
    else:
        job_dir = quant_root / "jobs" / job_name
    job_dir.mkdir(parents=True, exist_ok=True)
    _acquire_job_lock(job_dir)
    _acquire_named_lock(quant_root, args.global_lock_name)
    logs_dir = job_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    state_path = job_dir / "state.json"
    stdout_log = logs_dir / "driver.log"
    tasks = _build_tasks(args, quant_root)
    plan_hash = stable_hash_obj([t.to_dict() for t in tasks])

    state_config = {
        "feature_store_version": str(args.feature_store_version),
        "v4_final_profile": bool(args.v4_final_profile),
        "asset_classes": str(args.asset_classes),
        "lookback_calendar_days": int(args.lookback_calendar_days),
        "panel_max_assets": int(args.panel_max_assets),
        "panel_max_assets_effective_policy": "max(requested_panel_max_assets, effective_top_liquid); if requested<=0 then effective_top_liquid",
        "min_bars": int(args.min_bars),
        "fold_count": int(args.fold_count),
        "test_days": int(args.test_days),
        "embargo_days": int(args.embargo_days),
        "min_train_days": int(args.min_train_days),
        "survivors_max": int(args.survivors_max),
        "redflags_failure_mode": str(args.redflags_failure_mode),
        "task_order": args.task_order,
        "task_nice": int(args.task_nice),
        "threads_cap": int(args.threads_cap),
        "max_rss_gib": float(args.max_rss_gib),
        "state_heartbeat_interval_sec": float(args.state_heartbeat_interval_sec),
        "monitor_interval_sec": float(args.monitor_interval_sec),
        "metrics_log_interval_sec": float(args.metrics_log_interval_sec),
        "stale_orphan_minutes": float(args.stale_orphan_minutes),
        "stale_heartbeat_minutes": float(args.stale_heartbeat_minutes),
        "stale_min_elapsed_minutes": float(args.stale_min_elapsed_minutes),
        "stale_cpu_pct_max": float(args.stale_cpu_pct_max),
        "enforce_system_guardrails": bool(args.enforce_system_guardrails),
        "max_load_per_core": float(args.max_load_per_core),
        "min_free_disk_gb": float(args.min_free_disk_gb),
        "run_preflight": bool(args.run_preflight),
        "preflight_failure_mode": str(args.preflight_failure_mode),
        "preflight_max_rss_mem_fraction": float(args.preflight_max_rss_mem_fraction),
        "preflight_raw_bars_provider": str(args.preflight_raw_bars_provider),
        "preflight_raw_bars_stale_after_calendar_days": int(args.preflight_raw_bars_stale_after_calendar_days),
        "system_guard_check_interval_sec": float(args.system_guard_check_interval_sec),
        "max_system_guard_wait_minutes": float(args.max_system_guard_wait_minutes),
        "sleep_between_tasks_sec": float(args.sleep_between_tasks_sec),
        "retry_cooldown_sec": float(args.retry_cooldown_sec),
        "max_retries_per_task": int(args.max_retries_per_task),
        "max_failed_task_resume_retries": int(args.max_failed_task_resume_retries),
        "retryable_exit_codes": sorted(_parse_csv_int_set(args.retryable_exit_codes)),
        "oom_downshift_on_rss_kill": bool(args.oom_downshift_on_rss_kill),
        "oom_downshift_factor": float(args.oom_downshift_factor),
        "oom_downshift_min_top_liquid": int(args.oom_downshift_min_top_liquid),
        "stop_after_consecutive_failures": int(args.stop_after_consecutive_failures),
        "task_timeout_minutes": float(args.task_timeout_minutes),
        "max_hours": float(args.max_hours),
        "global_lock_name": str(args.global_lock_name),
        "run_v4_final_gate_matrix": bool(args.run_v4_final_gate_matrix),
        "phasea": {
            "run_phasea_backbone": bool(args.run_phasea_backbone),
            "include_types": str(args.phasea_include_types),
            "auto_thresholds_from_ledger": bool(args.phasea_auto_thresholds_from_ledger),
            "auto_thresholds_path": str(args.phasea_auto_thresholds_path),
            "auto_thresholds_min_history": int(args.phasea_auto_thresholds_min_history),
            "warn_min_delta_rows": int(args.phasea_warn_min_delta_rows),
            "warn_max_delta_rows": int(args.phasea_warn_max_delta_rows),
            "fail_min_delta_rows": int(args.phasea_fail_min_delta_rows),
            "fail_max_delta_rows": int(args.phasea_fail_max_delta_rows),
            "production_mode": bool(args.phasea_production_mode),
            "real_delta_test_mode": bool(args.phasea_real_delta_test_mode),
            "real_delta_min_emitted_rows": int(args.phasea_real_delta_min_emitted_rows),
            "real_delta_limit_packs": int(args.phasea_real_delta_limit_packs),
            "real_delta_max_emitted_rows": int(args.phasea_real_delta_max_emitted_rows),
        },
        "stageb": {
            "strict_survivors_max": int(args.stageb_q1_strict_survivors_max),
            "pass_mode": str(args.stageb_pass_mode),
            "strict_gate_profile": str(args.stageb_strict_gate_profile),
            "input_scope": str(args.stageb_input_scope),
            "min_survivors_b_q1": int(args.stageb_min_survivors_b_q1),
            "survivors_b_q1_failure_mode": str(args.stageb_survivors_b_q1_failure_mode),
            "psr_strict_min": float(args.stageb_psr_strict_min),
            "dsr_strict_min": float(args.stageb_dsr_strict_min),
            "psr_cpcv_strict_min": float(args.stageb_psr_cpcv_strict_min),
            "dsr_cpcv_strict_min": float(args.stageb_dsr_cpcv_strict_min),
            "dsr_trials_total": int(args.stageb_dsr_trials_total),
            "cpcv_light_p10_min": float(args.stageb_cpcv_light_p10_min),
            "cpcv_light_p25_min": float(args.stageb_cpcv_light_p25_min),
            "cpcv_light_p05_min": float(args.stageb_cpcv_light_p05_min),
            "cpcv_light_es10_min": float(args.stageb_cpcv_light_es10_min),
            "cpcv_light_min_combo_size": int(args.stageb_cpcv_light_min_combo_size),
            "cpcv_light_skip_adjacent_folds": bool(args.stageb_cpcv_light_skip_adjacent_folds),
            "cpcv_light_temporal_filter": bool(args.stageb_cpcv_light_temporal_filter),
            "cpcv_light_min_test_gap_days": int(args.stageb_cpcv_light_min_test_gap_days),
            "cpcv_light_min_embargo_gap_days": int(args.stageb_cpcv_light_min_embargo_gap_days),
            "cpcv_light_min_effective_paths": int(args.stageb_cpcv_light_min_effective_paths),
            "cpcv_light_min_effective_path_ratio": float(args.stageb_cpcv_light_min_effective_path_ratio),
            "cpcv_light_min_paths_total": int(args.stageb_cpcv_light_min_paths_total),
        },
        "registry": {
            "score_epsilon": float(args.registry_score_epsilon),
            "demotion_shadow_score_gap": float(args.registry_demotion_shadow_score_gap),
            "demotion_retire_score_gap": float(args.registry_demotion_retire_score_gap),
            "require_top_survivor_hard_gates_pass": bool(args.registry_require_top_survivor_hard_gates_pass),
            "stageb_pass_column": str(args.registry_stageb_pass_column),
            "freeze_on_zero_strict_pass": bool(args.registry_freeze_on_zero_strict_pass),
        },
        "portfolio": {
            "run_portfolio_q1": bool(args.run_portfolio_q1),
            "failure_mode": str(args.portfolio_failure_mode),
            "feature_store_version": str(args.portfolio_feature_store_version or args.feature_store_version),
            "part_glob": str(args.portfolio_part_glob),
            "panel_output_tag": str(args.portfolio_panel_output_tag),
            "min_adv_dollar": float(args.portfolio_min_adv_dollar),
            "top_n_long": int(args.portfolio_top_n_long),
            "top_n_short": int(args.portfolio_top_n_short),
            "allow_shorts": bool(args.portfolio_allow_shorts),
            "target_gross": float(args.portfolio_target_gross),
            "max_gross": float(args.portfolio_max_gross),
            "max_net": float(args.portfolio_max_net),
            "max_position_weight": float(args.portfolio_max_position_weight),
            "min_rebalance_delta": float(args.portfolio_min_rebalance_delta),
            "no_rebalance_orders_failure_mode": str(args.portfolio_no_rebalance_orders_failure_mode),
            "registry_slot_consistency_failure_mode": str(args.portfolio_registry_slot_consistency_failure_mode),
            "require_nonempty": bool(args.portfolio_require_nonempty),
        },
    }
    if args.resume_from and state_path.exists():
        state = json.loads(state_path.read_text())
        snapshot_id = _restore_runtime_args_from_state(args, state, snapshot_id)
        state["config"] = state.get("config") or state_config
        runtime_config = dict(state_config)
        runtime_config.update(
            {
                "feature_store_version": str(args.feature_store_version),
                "asset_classes": str(args.asset_classes),
                "lookback_calendar_days": int(args.lookback_calendar_days),
                "panel_max_assets": int(args.panel_max_assets),
                "panel_max_assets_effective_policy": "max(requested_panel_max_assets, effective_top_liquid); if requested<=0 then effective_top_liquid",
                "min_bars": int(args.min_bars),
                "fold_count": int(args.fold_count),
                "test_days": int(args.test_days),
                "embargo_days": int(args.embargo_days),
                "min_train_days": int(args.min_train_days),
                "survivors_max": int(args.survivors_max),
                "redflags_failure_mode": str(args.redflags_failure_mode),
                "preflight_raw_bars_provider": str(args.preflight_raw_bars_provider),
                "preflight_raw_bars_stale_after_calendar_days": int(args.preflight_raw_bars_stale_after_calendar_days),
            }
        )
        state["runtime_config"] = runtime_config
        # Recover from prior crashed/killed orchestrator: no task should stay "running" across process restarts.
        max_attempts_per_task = 1 + max(0, int(args.max_retries_per_task))
        for row in state.get("tasks", []):
            if row.get("status") == "running":
                row["status"] = "pending"
                row["finished_at"] = utc_now_iso()
                row.setdefault("recovered_notes", []).append("reset_from_running_on_resume")
            if args.retry_failed and row.get("status") == "failed":
                resumed, reason = _prepare_failed_task_for_resume(row, args, max_attempts_per_task)
                if not resumed:
                    row.setdefault("recovered_notes", []).append(f"keep_failed_on_retry_resume:{reason}")
        # Recompute summary after recovery.
        pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
        _p, _r, _d, _f = _refresh_summary(state)
        state["summary"].update(
            {
                "stopped_due_to_time_limit": False,
                "stopped_due_to_consecutive_failures": False,
                "stopped_due_to_system_guardrails": False,
            }
        )
        state["stopped_due_to_time_limit"] = False
        state["stopped_due_to_consecutive_failures"] = False
        state["stopped_due_to_system_guardrails"] = False
        state["max_consecutive_failures_reached"] = None
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
    else:
        state = {
            "schema": "quantlab_q1_overnight_training_sweep_state_v1",
            "job_name": job_name,
            "created_at": utc_now_iso(),
            "updated_at": utc_now_iso(),
            "quant_root": str(quant_root),
            "snapshot_id": snapshot_id,
            "feature_store_version": args.feature_store_version,
            "plan_hash": plan_hash,
            "max_hours": args.max_hours,
            "stopped_due_to_time_limit": False,
            "stopped_due_to_consecutive_failures": False,
            "stopped_due_to_system_guardrails": False,
            "max_consecutive_failures_reached": None,
            "artifacts": {
                "preflight_report": str(preflight_report_path) if preflight_report_path else None,
            },
            "config": state_config,
            "tasks": [
                {
                    **t.to_dict(),
                    "requested_top_liquid_n": int(t.top_liquid_n),
                    "current_top_liquid_n": int(t.top_liquid_n),
                    "status": "pending",
                    "attempts": 0,
                    "started_at": None,
                    "finished_at": None,
                    "elapsed_sec": None,
                    "rc": None,
                    "runner_run_id": None,
                    "status_path": None,
                    "orchestrator_report": None,
                    "ok": None,
                    "log_file": None,
                }
                for t in tasks
            ],
            "summary": {
                "pending": len(tasks),
                "running": 0,
                "done": 0,
                "failed": 0,
                "stopped_due_to_time_limit": False,
                "stopped_due_to_consecutive_failures": False,
                "stopped_due_to_system_guardrails": False,
            },
        }
        atomic_write_json(state_path, state)

    if args.plan_only:
        print(f"job_dir={job_dir}")
        print(f"snapshot_id={snapshot_id}")
        print(f"tasks_total={len(state['tasks'])}")
        print(f"plan_hash={state['plan_hash']}")
        for row in state["tasks"][:20]:
            print(f"- {row['task_id']} status={row['status']}")
        if len(state["tasks"]) > 20:
            print(f"... ({len(state['tasks']) - 20} more tasks)")
        return 0

    start_monotonic = time.monotonic()
    consecutive_failures = 0
    retryable_exit_codes = _parse_csv_int_set(args.retryable_exit_codes)
    max_retries_per_task = max(0, int(args.max_retries_per_task))
    max_attempts_per_task = 1 + max_retries_per_task
    with stdout_log.open("a") as driver:
        driver.write(f"[{utc_now_iso()}] start snapshot_id={snapshot_id} tasks={len(state['tasks'])} max_hours={args.max_hours}\n")
        driver.flush()
        for row in state["tasks"]:
            if row["status"] in {"done", "failed"}:
                continue
            while True:
                elapsed_hours = (time.monotonic() - start_monotonic) / 3600.0
                if elapsed_hours >= args.max_hours:
                    state["summary"]["stopped_due_to_time_limit"] = True
                    state["stopped_due_to_time_limit"] = True
                    break
                if int(args.stop_after_consecutive_failures) > 0 and consecutive_failures >= int(args.stop_after_consecutive_failures):
                    state["summary"]["stopped_due_to_consecutive_failures"] = True
                    state["stopped_due_to_consecutive_failures"] = True
                    state["max_consecutive_failures_reached"] = int(consecutive_failures)
                    break
                if bool(args.enforce_system_guardrails):
                    ok_guard, guard_meta = _wait_for_system_guardrails(args, quant_root, driver)
                    if not ok_guard:
                        state["summary"]["stopped_due_to_system_guardrails"] = True
                        state["stopped_due_to_system_guardrails"] = True
                        state["summary"]["system_guardrails"] = guard_meta
                        state["updated_at"] = utc_now_iso()
                        atomic_write_json(state_path, state)
                        driver.write(
                            f"[{utc_now_iso()}] STOP reason=system_guardrails "
                            f"load_per_core={guard_meta.get('load_per_core')} "
                            f"free_disk_gb={guard_meta.get('free_disk_gb')}\n"
                        )
                        driver.flush()
                        break

                # Guard against stale/resume inconsistencies where attempts already exceeded.
                if int(row.get("attempts") or 0) >= max_attempts_per_task:
                    row["status"] = "failed"
                    row["finished_at"] = utc_now_iso()
                    row["rc"] = int(row.get("rc") or 0) or 1
                    row["ok"] = False
                    row.setdefault("recovered_notes", []).append("attempts_exhausted_guard")
                    consecutive_failures += 1
                    state["updated_at"] = utc_now_iso()
                    pending, running, done, failed = _refresh_summary(state)
                    atomic_write_json(state_path, state)
                    driver.write(
                        f"[{utc_now_iso()}] FAIL_GUARD {row.get('task_id')} attempts={row.get('attempts')} "
                        f"max_attempts={max_attempts_per_task}\n"
                    )
                    driver.flush()
                    break

                row["status"] = "running"
                row["attempts"] = int(row.get("attempts") or 0) + 1
                attempt_no = int(row["attempts"])
                row["started_at"] = utc_now_iso()
                pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
                running = sum(1 for t in state["tasks"] if t["status"] == "running")
                done = sum(1 for t in state["tasks"] if t["status"] == "done")
                failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
                state["summary"].update(
                    {
                        "pending": pending,
                        "running": running,
                        "done": done,
                        "failed": failed,
                        "failed_by_class": _failed_by_class(state["tasks"]),
                    }
                )
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)

                task = Task(
                    task_id=row["task_id"],
                    asof_end_date=row["asof_end_date"],
                    panel_days=int(row["panel_days"]),
                    top_liquid_n=int(row.get("current_top_liquid_n") or row["top_liquid_n"]),
                )
                cmd = _task_cmd(args, task, quant_root, snapshot_id)
                log_suffix = "" if attempt_no == 1 else f".attempt{attempt_no:02d}"
                task_log = logs_dir / f"{task.task_id}{log_suffix}.log"
                row["log_file"] = str(task_log)
                row.setdefault("attempt_logs", [])
                if str(task_log) not in row["attempt_logs"]:
                    row["attempt_logs"].append(str(task_log))
                atomic_write_json(state_path, state)

                row_start = time.monotonic()
                driver.write(f"[{utc_now_iso()}] START {task.task_id} attempt={attempt_no}/{max_attempts_per_task} cmd={shlex.join(cmd)}\n")
                driver.flush()
                lines: list[str] = []
                with task_log.open("a") as tlog:
                    tlog.write(f"[{utc_now_iso()}] START {task.task_id} attempt={attempt_no}\n")
                    tlog.flush()
                def _state_heartbeat(meta: dict[str, Any]) -> None:
                    row["monitor_live"] = meta
                    row["last_monitor_at"] = utc_now_iso()
                    if meta.get("runner_run_id"):
                        row["runner_run_id"] = meta.get("runner_run_id")
                    if meta.get("status_path"):
                        row["status_path"] = meta.get("status_path")
                    if meta.get("orchestrator_report"):
                        row["orchestrator_report"] = meta.get("orchestrator_report")
                    state["updated_at"] = utc_now_iso()
                    atomic_write_json(state_path, state)

                rc, monitor_meta = _run_task_with_monitor(
                    cmd,
                    task_log,
                    args,
                    driver,
                    heartbeat_cb=_state_heartbeat,
                    heartbeat_interval_sec=float(args.state_heartbeat_interval_sec),
                )
                with task_log.open("a") as tlog:
                    tlog.write(f"[{utc_now_iso()}] END rc={rc}\n")
                    tlog.flush()
                try:
                    lines = task_log.read_text(errors="replace").splitlines()[-400:]
                except Exception:
                    lines = []
                parsed = _parse_runner_stdout(lines)
                row["rc"] = rc
                row["finished_at"] = utc_now_iso()
                row["elapsed_sec"] = round(time.monotonic() - row_start, 3)
                row["runner_run_id"] = parsed.get("run_id") or monitor_meta.get("runner_run_id")
                row["status_path"] = parsed.get("status") or monitor_meta.get("status_path")
                row["orchestrator_report"] = parsed.get("orchestrator_report") or monitor_meta.get("orchestrator_report")
                row["ok"] = (parsed.get("ok", "").lower() == "true")
                row["monitor"] = monitor_meta
                row["peak_rss_gib"] = monitor_meta.get("peak_rss_gib")

                attempt_failed = (rc != 0) or (row["ok"] is False)
                failure_class = _classify_failure(
                    rc=int(rc),
                    ok=bool(row["ok"]),
                    monitor=monitor_meta,
                    log_lines=lines,
                    status_path=row.get("status_path"),
                )
                row["failure_class"] = str(failure_class)
                retryable = bool(attempt_failed and int(rc) in retryable_exit_codes and attempt_no < max_attempts_per_task)
                retry_reason = f"retryable_exit_code_{rc}"
                current_runner_activity = _runner_refs_have_material_progress(
                    runner_run_id=row.get("runner_run_id"),
                    status_path=row.get("status_path"),
                    orchestrator_report=row.get("orchestrator_report"),
                )
                prior_runner_activity = _attempt_history_has_runner_activity(row.get("attempt_history") or [])
                if retryable and failure_class == "bootstrap":
                    retryable = False
                    retry_reason = "non_retryable_bootstrap_stall"
                elif retryable and failure_class in {"heartbeat", "orphan"} and not current_runner_activity and not prior_runner_activity:
                    retryable = False
                    retry_reason = f"non_retryable_{failure_class}_without_material_runner_progress"
                if retryable and int(rc) == 1:
                    if _is_rc1_transient(lines):
                        retry_reason = "retryable_rc1_transient_system_error"
                    else:
                        retryable = False
                        retry_reason = "non_retryable_rc1_non_transient"
                finalized_runner_status = False
                if attempt_failed:
                    finalized_runner_status = _finalize_incomplete_runner_status(
                        status_path=row.get("status_path"),
                        rc=int(rc),
                        monitor=monitor_meta,
                        failure_class=str(failure_class),
                        log_lines=lines,
                    )
                    if finalized_runner_status:
                        row.setdefault("recovered_notes", []).append(
                            f"runner_status_finalized_after_{failure_class}"
                        )
                row.setdefault("attempt_history", [])
                row["attempt_history"].append(
                    {
                        "attempt_no": attempt_no,
                        "started_at": row.get("started_at"),
                        "finished_at": row.get("finished_at"),
                        "elapsed_sec": row.get("elapsed_sec"),
                        "rc": int(rc),
                        "ok": bool(row.get("ok")),
                        "failure_class": str(failure_class),
                        "retryable": bool(retryable),
                        "retry_reason": str(retry_reason),
                        "runner_status_finalized": bool(finalized_runner_status),
                        "monitor": monitor_meta,
                        "log_file": str(task_log),
                    }
                )
                if attempt_failed and retryable:
                    if (
                        int(rc) == 137
                        and bool(monitor_meta.get("killed_for_rss"))
                        and bool(args.oom_downshift_on_rss_kill)
                    ):
                        prev_top = int(row.get("current_top_liquid_n") or row["top_liquid_n"])
                        next_top = _downshift_top_liquid(
                            prev_top,
                            float(args.oom_downshift_factor),
                            int(args.oom_downshift_min_top_liquid),
                        )
                        if next_top < prev_top:
                            row["current_top_liquid_n"] = int(next_top)
                            row.setdefault("oom_downshift_history", [])
                            row["oom_downshift_history"].append(
                                {
                                    "attempt_no": int(attempt_no),
                                    "from_top_liquid_n": int(prev_top),
                                    "to_top_liquid_n": int(next_top),
                                    "reason": "rss_kill_rc137",
                                    "ts": utc_now_iso(),
                                }
                            )
                            driver.write(
                                f"[{utc_now_iso()}] OOM_DOWNSHIFT {task.task_id} attempt={attempt_no} "
                                f"top_liquid_n={prev_top}->{next_top}\n"
                            )
                            driver.flush()
                    row["status"] = "pending"
                    row["retry_scheduled"] = True
                    row["retry_reason"] = str(retry_reason)
                    state["updated_at"] = utc_now_iso()
                    pending, running, done, failed = _refresh_summary(state)
                    atomic_write_json(state_path, state)
                    driver.write(
                        f"[{utc_now_iso()}] RETRY {task.task_id} attempt={attempt_no} rc={rc} "
                        f"cooldown_sec={args.retry_cooldown_sec}\n"
                    )
                    driver.flush()
                    if float(args.retry_cooldown_sec) > 0:
                        time.sleep(float(args.retry_cooldown_sec))
                    continue

                row["status"] = "done" if not attempt_failed else "failed"
                if row["status"] == "failed":
                    consecutive_failures += 1
                else:
                    consecutive_failures = 0
                state["updated_at"] = utc_now_iso()
                pending, running, done, failed = _refresh_summary(state)
                atomic_write_json(state_path, state)
                driver.write(
                    f"[{utc_now_iso()}] END {task.task_id} attempt={attempt_no} rc={rc} ok={row['ok']} failure_class={row.get('failure_class')} elapsed_sec={row['elapsed_sec']} "
                    f"done={done} failed={failed} pending={pending}\n"
                )
                driver.flush()
                if float(args.sleep_between_tasks_sec) > 0 and row["status"] == "done":
                    time.sleep(float(args.sleep_between_tasks_sec))
                break

            if state["summary"].get("stopped_due_to_time_limit") or state["summary"].get("stopped_due_to_consecutive_failures"):
                break
        # final summary
        state["updated_at"] = utc_now_iso()
        pending, running, done, failed = _refresh_summary(state)
        atomic_write_json(state_path, state)
        driver.write(f"[{utc_now_iso()}] FINAL summary={json.dumps(state['summary'], sort_keys=True)}\n")
        driver.flush()

    # Exit non-zero only if every attempted task failed and none succeeded.
    if state["summary"]["done"] == 0 and state["summary"]["failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
