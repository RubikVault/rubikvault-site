#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", required=True)
    p.add_argument("--feature-store-version", default="v4_q1panel_daily_local")
    p.add_argument("--panel-output-tag", default="daily")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=320)
    p.add_argument("--panel-calendar-days", type=int, default=60)
    p.add_argument("--panel-max-assets", type=int, default=10000)
    p.add_argument("--min-bars", type=int, default=200)
    p.add_argument("--top-liquid-n", type=int, default=5000)
    p.add_argument("--fold-count", type=int, default=3)
    p.add_argument("--test-days", type=int, default=5)
    p.add_argument("--embargo-days", type=int, default=2)
    p.add_argument("--min-train-days", type=int, default=8)
    p.add_argument("--survivors-max", type=int, default=24)
    p.add_argument("--asof-end-date", default="")
    return p.parse_args(list(argv))


def _git_sha(repo_root: Path) -> str:
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True)
            .strip()
        )
    except Exception:
        return "unknown"


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    orchestrator = REPO_ROOT / "scripts" / "quantlab" / "run_q1_panel_stage_a_pipeline.py"

    cmd = [
        py,
        str(orchestrator),
        "--quant-root",
        str(quant_root),
        "--snapshot-id",
        args.snapshot_id,
        "--feature-store-version",
        args.feature_store_version,
        "--panel-output-tag",
        args.panel_output_tag,
        "--asset-classes",
        args.asset_classes,
        "--lookback-calendar-days",
        str(args.lookback_calendar_days),
        "--panel-calendar-days",
        str(args.panel_calendar_days),
        "--min-bars",
        str(args.min_bars),
        "--panel-max-assets",
        str(args.panel_max_assets),
        "--top-liquid-n",
        str(args.top_liquid_n),
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
    ]
    if args.asof_end_date:
        cmd.extend(["--asof-end-date", args.asof_end_date])

    t0 = time.time()
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    elapsed = round(time.time() - t0, 3)

    # Parse orchestrator stdout for report path
    orchestrator_stdout = proc.stdout or ""
    orchestrator_stderr = proc.stderr or ""
    orch_report_path: Path | None = None
    for line in orchestrator_stdout.splitlines():
        if line.startswith("report="):
            orch_report_path = Path(line.split("=", 1)[1].strip())

    run_id = f"q1panel_daily_local_{int(time.time())}"
    out_dir = quant_root / "runs" / f"run_id={run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    status_path = out_dir / "q1_panel_stagea_daily_run_status.json"

    status: dict = {
        "schema": "quantlab_q1_panel_stagea_daily_local_run_status_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "git_sha": _git_sha(REPO_ROOT),
        "ok": proc.returncode == 0,
        "exit_code": int(proc.returncode),
        "mode": "local_daily_q1_panel_stageA",
        "inputs": {
            "snapshot_id": args.snapshot_id,
            "feature_store_version": args.feature_store_version,
            "panel_output_tag": args.panel_output_tag,
            "asset_classes": args.asset_classes,
            "panel_max_assets": args.panel_max_assets,
            "top_liquid_n": args.top_liquid_n,
            "fold_count": args.fold_count,
            "test_days": args.test_days,
            "embargo_days": args.embargo_days,
            "min_train_days": args.min_train_days,
        },
        "steps": [
            {
                "name": "run_q1_panel_stage_a_pipeline",
                "ok": proc.returncode == 0,
                "elapsed_sec": elapsed,
                "cmd": cmd,
            }
        ],
        "artifacts": {
            "orchestrator_run_report": str(orch_report_path) if orch_report_path else None,
        },
        "stdout_tail": orchestrator_stdout.splitlines()[-20:],
        "stderr_tail": orchestrator_stderr.splitlines()[-20:],
    }

    if orch_report_path and orch_report_path.exists():
        orch = read_json(orch_report_path)
        status["references"] = {
            "orchestrator_run_id": orch.get("run_id"),
            "panel_manifest": (orch.get("artifacts") or {}).get("panel_manifest"),
            "cheap_gate_report": (orch.get("artifacts") or {}).get("cheap_gate_report"),
            "folds_manifest": (orch.get("artifacts") or {}).get("folds_manifest"),
            "panel_counts": (orch.get("references") or {}).get("panel_counts"),
            "cheap_gate_counts": (orch.get("references") or {}).get("cheap_gate_counts"),
            "panel_part_glob_hint": (orch.get("references") or {}).get("panel_part_glob_hint"),
        }
        status["hashes"] = {
            "orchestrator_run_report_hash": stable_hash_file(orch_report_path),
        }
        for key in ("panel_manifest", "cheap_gate_report", "folds_manifest"):
            ref_value = status["references"].get(key)
            if not ref_value:
                continue
            p = Path(str(ref_value))
            if p.exists() and p.is_file():
                status["hashes"][f"{key}_hash"] = stable_hash_file(p)

    atomic_write_json(status_path, status)
    print(f"run_id={run_id}")
    print(f"status={status_path}")
    if orch_report_path:
        print(f"orchestrator_report={orch_report_path}")
    print(f"ok={status['ok']}")
    return 0 if proc.returncode == 0 else proc.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
