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
    p.add_argument("--run-phasea-backbone", action="store_true")
    p.add_argument("--phasea-include-types", default="STOCK,ETF")
    p.add_argument("--phasea-ingest-date", default="")
    p.add_argument("--phasea-delta-job-name", default="")
    p.add_argument("--phasea-feature-store-version", default="")
    p.add_argument("--phasea-feature-output-tag", default="")
    p.add_argument("--phasea-real-delta-test-mode", action="store_true")
    p.add_argument("--phasea-real-delta-min-emitted-rows", type=int, default=1)
    p.add_argument("--phasea-real-delta-limit-packs", type=int, default=2)
    p.add_argument("--phasea-real-delta-max-emitted-rows", type=int, default=100000)
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
    phasea_runner = REPO_ROOT / "scripts" / "quantlab" / "run_q1_daily_data_backbone_q1.py"

    phasea_report_path: Path | None = None
    phasea_stdout = ""
    phasea_stderr = ""
    phasea_elapsed = 0.0
    phasea_cmd: list[str] | None = None
    if args.run_phasea_backbone:
        phasea_rc = 0
        phasea_cmd = [
            py,
            str(phasea_runner),
            "--quant-root",
            str(quant_root),
            "--include-types",
            args.phasea_include_types,
            "--feature-store-version",
            (args.phasea_feature_store_version or args.feature_store_version),
        ]
        if args.phasea_ingest_date:
            phasea_cmd += ["--ingest-date", args.phasea_ingest_date]
        if args.phasea_delta_job_name:
            phasea_cmd += ["--delta-job-name", args.phasea_delta_job_name]
        if args.phasea_feature_output_tag:
            phasea_cmd += ["--feature-output-tag", args.phasea_feature_output_tag]
        if args.phasea_real_delta_test_mode:
            phasea_cmd += [
                "--real-delta-test-mode",
                "--real-delta-min-emitted-rows",
                str(args.phasea_real_delta_min_emitted_rows),
                "--real-delta-limit-packs",
                str(args.phasea_real_delta_limit_packs),
                "--real-delta-max-emitted-rows",
                str(args.phasea_real_delta_max_emitted_rows),
            ]
        t0_phasea = time.time()
        phasea_proc = subprocess.run(phasea_cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        phasea_elapsed = round(time.time() - t0_phasea, 3)
        phasea_stdout = phasea_proc.stdout or ""
        phasea_stderr = phasea_proc.stderr or ""
        phasea_kv: dict[str, str] = {}
        for line in phasea_stdout.splitlines():
            if "=" in line and not line.startswith("["):
                k, v = line.split("=", 1)
                if k and v:
                    phasea_kv[k.strip()] = v.strip()
        if "report" in phasea_kv:
            phasea_report_path = Path(phasea_kv["report"])
        phasea_rc = int(phasea_proc.returncode)
        if phasea_proc.returncode != 0:
            # Write a minimal status file for failed phase-A invocation and return.
            run_id = f"q1panel_daily_local_{int(time.time())}"
            out_dir = quant_root / "runs" / f"run_id={run_id}"
            out_dir.mkdir(parents=True, exist_ok=True)
            status_path = out_dir / "q1_panel_stagea_daily_run_status.json"
            status = {
                "schema": "quantlab_q1_panel_stagea_daily_local_run_status_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "git_sha": _git_sha(REPO_ROOT),
                "ok": False,
                "exit_code": int(phasea_proc.returncode),
                "mode": "local_daily_q1_panel_stageA",
                "inputs": {
                    "snapshot_id": args.snapshot_id,
                    "feature_store_version": args.feature_store_version,
                    "panel_output_tag": args.panel_output_tag,
                    "run_phasea_backbone": True,
                },
                "steps": [
                    {
                        "name": "run_q1_daily_data_backbone_q1",
                        "ok": False,
                        "exit_code": phasea_rc,
                        "elapsed_sec": phasea_elapsed,
                        "cmd": phasea_cmd,
                        "stdout_tail": phasea_stdout.splitlines()[-20:],
                        "stderr_tail": phasea_stderr.splitlines()[-20:],
                    }
                ],
                "artifacts": {
                    "phasea_backbone_run_report": str(phasea_report_path) if phasea_report_path else None,
                },
                "stdout_tail": phasea_stdout.splitlines()[-20:],
                "stderr_tail": phasea_stderr.splitlines()[-20:],
            }
            if phasea_report_path and phasea_report_path.exists():
                status["hashes"] = {"phasea_backbone_run_report_hash": stable_hash_file(phasea_report_path)}
            atomic_write_json(status_path, status)
            print(f"run_id={run_id}")
            print(f"status={status_path}")
            print("ok=False")
            return int(phasea_proc.returncode)

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
            "run_phasea_backbone": bool(args.run_phasea_backbone),
            "panel_max_assets": args.panel_max_assets,
            "top_liquid_n": args.top_liquid_n,
            "fold_count": args.fold_count,
            "test_days": args.test_days,
            "embargo_days": args.embargo_days,
            "min_train_days": args.min_train_days,
        },
        "steps": [],
        "artifacts": {
            "orchestrator_run_report": str(orch_report_path) if orch_report_path else None,
        },
        "stdout_tail": orchestrator_stdout.splitlines()[-20:],
        "stderr_tail": orchestrator_stderr.splitlines()[-20:],
    }
    if args.run_phasea_backbone:
        status["steps"].append(
            {
                "name": "run_q1_daily_data_backbone_q1",
                "ok": True,
                "exit_code": int(phasea_rc),
                "elapsed_sec": phasea_elapsed,
                "cmd": phasea_cmd,
                "stdout_tail": phasea_stdout.splitlines()[-20:],
                "stderr_tail": phasea_stderr.splitlines()[-20:],
            }
        )
        status["artifacts"]["phasea_backbone_run_report"] = str(phasea_report_path) if phasea_report_path else None
    status["steps"].append(
        {
            "name": "run_q1_panel_stage_a_pipeline",
            "ok": proc.returncode == 0,
            "exit_code": int(proc.returncode),
            "elapsed_sec": elapsed,
            "cmd": cmd,
        }
    )

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
        if args.run_phasea_backbone and phasea_report_path and phasea_report_path.exists():
            status["hashes"]["phasea_backbone_run_report_hash"] = stable_hash_file(phasea_report_path)
            phasea = read_json(phasea_report_path)
            status["references"]["phasea"] = {
                "run_id": phasea.get("run_id"),
                "ok": phasea.get("ok"),
                "exit_code": phasea.get("exit_code"),
                "real_delta_test_mode": ((phasea.get("config") or {}).get("real_delta_test_mode")),
                "real_delta_min_emitted_rows": ((phasea.get("config") or {}).get("real_delta_min_emitted_rows")),
                "step_names": [str((s or {}).get("name")) for s in (phasea.get("steps") or [])],
                "phasea_references": phasea.get("references") or {},
            }
        for key in ("panel_manifest", "cheap_gate_report", "folds_manifest"):
            ref_value = status["references"].get(key)
            if not ref_value:
                continue
            p = Path(str(ref_value))
            if p.exists() and p.is_file():
                status["hashes"][f"{key}_hash"] = stable_hash_file(p)
    elif args.run_phasea_backbone and phasea_report_path and phasea_report_path.exists():
        status["hashes"] = {
            "phasea_backbone_run_report_hash": stable_hash_file(phasea_report_path),
        }

    atomic_write_json(status_path, status)
    print(f"run_id={run_id}")
    print(f"status={status_path}")
    if orch_report_path:
        print(f"orchestrator_report={orch_report_path}")
    print(f"ok={status['ok']}")
    return 0 if proc.returncode == 0 else proc.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
