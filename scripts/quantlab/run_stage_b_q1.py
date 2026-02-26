#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from typing import Any
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--stage-a-run-id", default="")
    p.add_argument("--outputs-subdir", default="outputs")
    p.add_argument("--strict-survivors-max", type=int, default=8)
    p.add_argument("--use-stage-b-prep", action="store_true", default=True)
    p.add_argument("--skip-stage-b-prep", dest="use_stage_b_prep", action="store_false")
    return p.parse_args(list(argv))


def _latest_stage_a_run(quant_root: Path) -> str:
    runs_root = quant_root / "runs"
    cands = [p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("run_id=cheapgateA_tsplits_")]
    if not cands:
        raise FileNotFoundError(f"no Stage-A runs under {runs_root}")
    cands.sort(key=lambda p: p.stat().st_mtime_ns)
    return cands[-1].name.split("=", 1)[1]


def _run(cmd: list[str]) -> tuple[int, float, str, str]:
    t0 = time.time()
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    return proc.returncode, round(time.time() - t0, 3), proc.stdout or "", proc.stderr or ""


def _find_report_from_stdout(stdout: str, key: str = "report") -> str | None:
    for line in stdout.splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    stage_a_run_id = args.stage_a_run_id or _latest_stage_a_run(quant_root)

    prep_script = REPO_ROOT / "scripts/quantlab/prepare_stage_b_q1.py"
    light_script = REPO_ROOT / "scripts/quantlab/run_stage_b_q1_light.py"

    steps: list[dict[str, Any]] = []
    prep_report_path: Path | None = None
    light_report_path: Path | None = None

    if args.use_stage_b_prep:
        cmd = [py, str(prep_script), "--quant-root", str(quant_root), "--stage-a-run-id", stage_a_run_id, "--outputs-subdir", args.outputs_subdir]
        rc, elapsed, out, err = _run(cmd)
        steps.append({"name": "prepare_stage_b_q1", "ok": rc == 0, "exit_code": rc, "elapsed_sec": elapsed, "cmd": cmd, "stdout_tail": out.splitlines()[-20:], "stderr_tail": err.splitlines()[-20:]})
        if rc != 0:
            run_id = f"q1stageb_{stage_a_run_id}"
            run_dir = quant_root / "runs" / f"run_id={run_id}"
            run_dir.mkdir(parents=True, exist_ok=True)
            report = run_dir / "stage_b_q1_run_report.json"
            atomic_write_json(report, {"schema": "quantlab_stage_b_q1_run_report_v1", "generated_at": utc_now_iso(), "stage_a_run_id": stage_a_run_id, "ok": False, "exit_code": rc, "reason": "stage_b_prep_failed", "steps": steps})
            print(f"report={report}")
            return rc
        rp = _find_report_from_stdout(out)
        prep_report_path = Path(rp) if rp else None

    cmd = [py, str(light_script), "--quant-root", str(quant_root), "--stage-a-run-id", stage_a_run_id, "--outputs-subdir", args.outputs_subdir, "--strict-survivors-max", str(args.strict_survivors_max)]
    rc, elapsed, out, err = _run(cmd)
    steps.append({"name": "run_stage_b_q1_light", "ok": rc == 0, "exit_code": rc, "elapsed_sec": elapsed, "cmd": cmd, "stdout_tail": out.splitlines()[-20:], "stderr_tail": err.splitlines()[-20:]})
    if rc == 0:
        rp = _find_report_from_stdout(out)
        light_report_path = Path(rp) if rp else None

    run_id = f"q1stageb_{stage_a_run_id}"
    run_dir = quant_root / "runs" / f"run_id={run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = run_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    copied: dict[str, str] = {}
    hashes: dict[str, str] = {}
    for name, p in [("stage_b_prep_report", prep_report_path), ("stage_b_light_report", light_report_path)]:
        if p and p.exists():
            dst = artifacts_dir / p.name
            shutil.copy2(p, dst)
            copied[name] = str(dst)
            hashes[f"{name}_hash"] = stable_hash_file(dst)

    counts: dict[str, Any] = {}
    prep_report_obj: dict[str, Any] | None = None
    light_report_obj: dict[str, Any] | None = None
    if prep_report_path and prep_report_path.exists():
        try:
            prep = read_json(prep_report_path)
            prep_report_obj = prep
            counts["stage_b_prep"] = prep.get("counts") or {}
        except Exception:
            pass
    if light_report_path and light_report_path.exists():
        try:
            light = read_json(light_report_path)
            light_report_obj = light
            counts["stage_b_light"] = light.get("counts") or {}
            counts["stage_b_light_fail_reason_counts"] = light.get("fail_reason_counts") or {}
        except Exception:
            pass

    # Q1 stricter orchestration: final Stage-B survivors are the intersection of
    # Stage-B prep strict survivors and Stage-B light survivors. This reduces the
    # chance that a light-only survivor bypasses stricter prep robustness gates.
    stage_b_final_meta: dict[str, Any] = {
        "selection_mode": "light_only",
        "survivors_B_q1_total": 0,
        "intersection_with_prep_strict_total": None,
        "intersection_with_prep_shortlist_total": None,
        "warnings": [],
    }
    survivors_b_q1_path: Path | None = None
    if light_report_obj:
        try:
            light_artifacts = (light_report_obj.get("artifacts") or {})
            light_survivors_path = Path(str(light_artifacts.get("survivors_B_light") or ""))
            if light_survivors_path.exists():
                survivors_light_df = pl.read_parquet(light_survivors_path)
                survivors_q1_df = survivors_light_df
                stage_b_final_meta["survivors_B_light_total"] = int(survivors_light_df.height)
                if prep_report_obj:
                    prep_artifacts = (prep_report_obj.get("artifacts") or {})
                    prep_strict_path = Path(str(prep_artifacts.get("stage_b_prep_strict_survivors") or ""))
                    prep_shortlist_path = Path(str(prep_artifacts.get("stage_b_prep_shortlist") or ""))
                    prep_strict_ids = None
                    prep_shortlist_ids = None
                    if prep_strict_path.exists():
                        prep_strict_df = pl.read_parquet(prep_strict_path)
                        prep_strict_ids = set(
                            str(x) for x in (
                                prep_strict_df.get_column("candidate_id").to_list()
                                if "candidate_id" in prep_strict_df.columns else []
                            )
                        )
                        stage_b_final_meta["prep_strict_total"] = int(prep_strict_df.height)
                    else:
                        stage_b_final_meta["warnings"].append("prep_strict_survivors_missing")
                    if prep_shortlist_path.exists():
                        prep_shortlist_df = pl.read_parquet(prep_shortlist_path)
                        prep_shortlist_ids = set(
                            str(x) for x in (
                                prep_shortlist_df.get_column("candidate_id").to_list()
                                if "candidate_id" in prep_shortlist_df.columns else []
                            )
                        )
                        stage_b_final_meta["prep_shortlist_total"] = int(prep_shortlist_df.height)
                    if prep_strict_ids is not None:
                        stage_b_final_meta["selection_mode"] = "intersection_prep_strict_and_light"
                        survivors_q1_df = survivors_light_df.filter(
                            pl.col("candidate_id").cast(pl.Utf8).is_in(sorted(prep_strict_ids))
                        )
                        stage_b_final_meta["intersection_with_prep_strict_total"] = int(survivors_q1_df.height)
                    if prep_shortlist_ids is not None:
                        inter_short = survivors_light_df.filter(
                            pl.col("candidate_id").cast(pl.Utf8).is_in(sorted(prep_shortlist_ids))
                        )
                        stage_b_final_meta["intersection_with_prep_shortlist_total"] = int(inter_short.height)
                stage_b_final_meta["survivors_B_q1_total"] = int(survivors_q1_df.height)
                survivors_b_q1_path = artifacts_dir / "survivors_B_q1.parquet"
                survivors_q1_df.write_parquet(survivors_b_q1_path)
                copied["survivors_B_q1"] = str(survivors_b_q1_path)
                hashes["survivors_B_q1_hash"] = stable_hash_file(survivors_b_q1_path)
        except Exception as exc:
            stage_b_final_meta["warnings"].append(f"failed_to_build_survivors_B_q1:{exc}")

    report_out = {
        "schema": "quantlab_stage_b_q1_run_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "stage_a_run_id": stage_a_run_id,
        "ok": all(step.get("ok") for step in steps),
        "exit_code": 0 if all(step.get("ok") for step in steps) else int(next((s["exit_code"] for s in steps if not s.get("ok")), 1)),
        "reason": "ok" if all(step.get("ok") for step in steps) else "stage_b_substep_failed",
        "method": {
            "type": "q1_stage_b_orchestrated",
            "notes": [
                "Runs Stage-B prep + Stage-B light in a single auditable entrypoint.",
                "Still Q1-light; not full v4.0 CPCV/DSR/PSR final implementation.",
            ],
        },
        "steps": steps,
        "artifacts": {
            "run_dir": str(run_dir),
            **copied,
            "source_stage_a_outputs_dir": str(quant_root / 'runs' / f'run_id={stage_a_run_id}' / args.outputs_subdir),
        },
        "counts": counts,
        "stage_b_q1_final": stage_b_final_meta,
        "hashes": hashes,
    }
    report_path = run_dir / "stage_b_q1_run_report.json"
    atomic_write_json(report_path, report_out)
    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={report_out['ok']}")
    return 0 if report_out["ok"] else int(report_out["exit_code"])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
