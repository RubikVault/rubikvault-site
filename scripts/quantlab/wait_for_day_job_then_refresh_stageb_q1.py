#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--job-dir", required=True)
    p.add_argument("--poll-sec", type=float, default=60.0)
    p.add_argument("--max-wait-minutes", type=float, default=360.0)
    return p.parse_args(list(argv))


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def active_named_lock(quant_root: Path) -> dict[str, Any] | None:
    lock_path = quant_root / "jobs" / "_locks" / "overnight_q1_training_sweep_safe.lock.json"
    if not lock_path.exists():
        return None
    try:
        lock = read_json(lock_path)
    except Exception:
        return None
    pid = int(lock.get("pid") or 0)
    if not pid_alive(pid):
        return None
    return lock


def run_and_capture(cmd: list[str], cwd: Path) -> dict[str, Any]:
    proc = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)
    return {
        "cmd": cmd,
        "rc": int(proc.returncode),
        "stdout_tail": (proc.stdout or "").strip().splitlines()[-20:],
        "stderr_tail": (proc.stderr or "").strip().splitlines()[-20:],
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root = Path(args.quant_root).resolve()
    job_dir = Path(args.job_dir).resolve()
    state_path = job_dir / "state.json"
    out_path = quant_root / "ops" / "stage_b_stability" / "post_day_refresh_latest.json"
    deadline = time.time() + max(300.0, float(args.max_wait_minutes) * 60.0)
    poll_sec = max(10.0, float(args.poll_sec))

    waited_state: dict[str, Any] = {
        "schema": "quantlab_q1_post_day_stageb_refresh_wait_v1",
        "started_at": utc_now_iso(),
        "job_dir": str(job_dir),
        "quant_root": str(quant_root),
    }

    while time.time() < deadline:
        state = read_json(state_path) if state_path.exists() else {}
        summary = state.get("summary") or {}
        pending = int(summary.get("pending") or 0)
        running = int(summary.get("running") or 0)
        if pending == 0 and running == 0:
            waited_state["job_completed_at"] = utc_now_iso()
            waited_state["job_summary"] = summary
            break
        waited_state["last_seen_state"] = {
            "updated_at": state.get("updated_at"),
            "summary": summary,
            "active_named_lock": active_named_lock(quant_root),
        }
        time.sleep(poll_sec)
    else:
        waited_state["timed_out_at"] = utc_now_iso()
        waited_state["timed_out"] = True
        atomic_write_json(out_path, waited_state)
        print(json.dumps(waited_state, indent=2))
        return 2

    python_bin = repo_root / "quantlab" / ".venv" / "bin" / "python"
    waited_state["stageb_stability_refresh"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_asof_stability_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_preferred",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["stageb_stability_refresh_v4_final"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_asof_stability_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_only",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["zero_strict_near_pass_refresh"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_zero_strict_near_pass_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_preferred",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["zero_strict_near_pass_refresh_v4_final"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_zero_strict_near_pass_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_only",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["focus_diagnostics_refresh"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_focus_diagnostics_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_preferred",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["focus_diagnostics_refresh_v4_final"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_focus_diagnostics_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_only",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["lane_comparison_refresh_v4_final"] = run_and_capture(
        [
            str(python_bin),
            str(repo_root / "scripts" / "quantlab" / "report_stageb_lane_comparison_q1.py"),
            "--quant-root",
            str(quant_root),
            "--profile-mode",
            "v4_final_only",
            "--print-summary",
        ],
        repo_root,
    )
    waited_state["v4_daily_report_refresh"] = run_and_capture(
        [
            "node",
            str(repo_root / "scripts" / "quantlab" / "build_quantlab_v4_daily_report.mjs"),
            "--quant-root",
            str(quant_root),
        ],
        repo_root,
    )
    waited_state["finished_at"] = utc_now_iso()
    atomic_write_json(out_path, waited_state)
    print(json.dumps(waited_state, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
