#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--ingest-date", default="")
    p.add_argument("--delta-job-name", default="")
    p.add_argument("--delta-limit-packs", type=int, default=0)
    p.add_argument("--delta-full-scan-packs", action="store_true")
    p.add_argument("--delta-max-emitted-rows", type=int, default=0)
    p.add_argument("--feature-store-version", default="v4_q1inc")
    p.add_argument("--feature-output-tag", default="")
    return p.parse_args(list(argv))


def _run(cmd: list[str]) -> tuple[int, float, str, str]:
    t0 = time.time()
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    return proc.returncode, round(time.time() - t0, 3), proc.stdout or "", proc.stderr or ""


def _parse_kv(stdout: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in stdout.splitlines():
        if "=" in line and not line.startswith("["):
            k, v = line.split("=", 1)
            if k and v:
                out[k.strip()] = v.strip()
    return out


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    scripts = {
        "delta": REPO_ROOT / "scripts/quantlab/run_daily_delta_ingest_q1.py",
        "snap_inc": REPO_ROOT / "scripts/quantlab/run_incremental_snapshot_update_q1.py",
        "feat_inc": REPO_ROOT / "scripts/quantlab/run_incremental_feature_update_q1.py",
        "recon": REPO_ROOT / "scripts/quantlab/run_reconciliation_checks_q1.py",
    }
    run_id = f"q1backbone_{int(time.time())}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_daily_data_backbone_run_report.json"

    steps: list[dict[str, Any]] = []
    refs: dict[str, Any] = {}
    hashes: dict[str, str] = {}

    delta_cmd = [py, str(scripts["delta"]), "--quant-root", str(quant_root), "--include-types", args.include_types]
    if args.ingest_date:
        delta_cmd += ["--ingest-date", args.ingest_date]
    if args.delta_job_name:
        delta_cmd += ["--job-name", args.delta_job_name]
    if args.delta_limit_packs and args.delta_limit_packs > 0:
        delta_cmd += ["--limit-packs", str(args.delta_limit_packs)]
    if args.delta_full_scan_packs:
        delta_cmd += ["--full-scan-packs"]
    if args.delta_max_emitted_rows and args.delta_max_emitted_rows > 0:
        delta_cmd += ["--max-emitted-rows", str(args.delta_max_emitted_rows)]

    for step_name, cmd in [
        ("daily_delta_ingest", delta_cmd),
        ("incremental_snapshot_update", [py, str(scripts["snap_inc"]), "--quant-root", str(quant_root)]),
        ("incremental_feature_update", [py, str(scripts["feat_inc"]), "--quant-root", str(quant_root), "--feature-store-version", args.feature_store_version] + (["--output-tag", args.feature_output_tag] if args.feature_output_tag else [])),
        ("reconciliation_checks", [py, str(scripts["recon"]), "--quant-root", str(quant_root)]),
    ]:
        rc, elapsed, out, err = _run(cmd)
        kv = _parse_kv(out)
        step = {
            "name": step_name,
            "ok": rc == 0,
            "exit_code": rc,
            "elapsed_sec": elapsed,
            "cmd": cmd,
            "stdout_tail": out.splitlines()[-30:],
            "stderr_tail": err.splitlines()[-30:],
            "parsed": kv,
        }
        steps.append(step)
        # collect known refs
        for key in ("manifest", "increment_manifest", "report", "status", "run_id"):
            if key in kv:
                refs[f"{step_name}.{key}"] = kv[key]
        for key in ("manifest", "increment_manifest", "report", "status"):
            p = kv.get(key)
            if p:
                pp = Path(p)
                if pp.exists() and pp.is_file():
                    hashes[f"{step_name}.{key}_hash"] = stable_hash_file(pp)
        if rc != 0:
            break

    ok = all(s["ok"] for s in steps)
    report = {
        "schema": "quantlab_q1_daily_data_backbone_run_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": ok,
        "exit_code": 0 if ok else int(next((s["exit_code"] for s in steps if not s["ok"]), 1)),
        "steps": steps,
        "references": refs,
        "hashes": hashes,
        "notes": [
            "Phase A daily data backbone orchestrator (Q1): delta ingest -> incremental snapshot -> incremental feature -> reconciliation.",
            "Designed for local/private operation on Stocks+ETFs first.",
        ],
    }
    atomic_write_json(report_path, report)
    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={ok}")
    return 0 if ok else report["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
