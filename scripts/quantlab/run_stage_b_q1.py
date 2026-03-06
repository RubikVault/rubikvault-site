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
    p.add_argument(
        "--stageb-input-scope",
        choices=["survivors_a", "all_candidates"],
        default="survivors_a",
        help="survivors_a evaluates Stage-B over Stage-A survivors only; all_candidates keeps legacy full-candidate scope.",
    )
    p.add_argument("--strict-survivors-max", type=int, default=6)
    p.add_argument("--psr-strict-min", type=float, default=0.65)
    p.add_argument("--dsr-strict-min", type=float, default=0.55)
    p.add_argument("--psr-cpcv-strict-min", type=float, default=0.65)
    p.add_argument("--dsr-cpcv-strict-min", type=float, default=0.55)
    p.add_argument("--dsr-trials-total", type=int, default=0)
    p.add_argument("--cpcv-light-p10-min", type=float, default=-0.03)
    p.add_argument("--cpcv-light-p25-min", type=float, default=0.00)
    p.add_argument("--cpcv-light-p05-min", type=float, default=-0.06)
    p.add_argument("--cpcv-light-es10-min", type=float, default=-0.08)
    p.add_argument("--cpcv-light-min-combo-size", type=int, default=3)
    p.add_argument("--cpcv-light-skip-adjacent-folds", action="store_true", default=True)
    p.add_argument("--skip-cpcv-light-skip-adjacent-folds", dest="cpcv_light_skip_adjacent_folds", action="store_false")
    p.add_argument("--cpcv-light-temporal-filter", action="store_true", default=True)
    p.add_argument("--skip-cpcv-light-temporal-filter", dest="cpcv_light_temporal_filter", action="store_false")
    p.add_argument("--cpcv-light-min-test-gap-days", type=int, default=10)
    p.add_argument("--cpcv-light-min-embargo-gap-days", type=int, default=5)
    p.add_argument("--cpcv-light-min-effective-paths", type=int, default=5)
    p.add_argument("--cpcv-light-min-effective-path-ratio", type=float, default=0.75)
    p.add_argument("--cpcv-light-min-paths-total", type=int, default=5)
    p.add_argument("--cpcv-light-min-combos-considered", type=int, default=3)
    p.add_argument("--cpcv-light-forbid-fallback-path", action="store_true", default=True)
    p.add_argument("--allow-cpcv-light-fallback-path", dest="cpcv_light_forbid_fallback_path", action="store_false")
    p.add_argument(
        "--cpcv-light-requirement-mode",
        choices=["feasible_min", "configured_min"],
        default="feasible_min",
    )
    p.add_argument(
        "--cpcv-light-relaxation-mode",
        choices=["allow", "strict_fail"],
        default="allow",
    )
    p.add_argument(
        "--stageb-pass-mode",
        choices=["strict", "proxy_augmented"],
        default="strict",
        help="strict excludes proxy gates from final Stage-B pass/fail",
    )
    p.add_argument(
        "--stageb-strict-gate-profile",
        choices=["hard", "broad"],
        default="hard",
        help="hard keeps strict pass focused on robust non-proxy gates; broad uses all non-proxy strict gates",
    )
    p.add_argument(
        "--stageb-strict-quality-gate-mode",
        choices=["balanced", "legacy"],
        default="balanced",
        help="balanced keeps strict quality robust while removing redundant strict-cpcv duplication from hard mode.",
    )
    p.add_argument(
        "--v4-final-profile",
        action="store_true",
        default=False,
        help="Enable final-method Stage-B defaults (strict pass, hard profile, configured CPCV minima, strict no-relax policy).",
    )
    p.add_argument("--min-survivors-b-q1", type=int, default=1)
    p.add_argument("--survivors-b-q1-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--use-stage-b-prep", action="store_true", default=True)
    p.add_argument("--skip-stage-b-prep", dest="use_stage_b_prep", action="store_false")
    p.add_argument(
        "--prep-strict-intersection-mode",
        choices=["prefer", "require", "off"],
        default="prefer",
        help="prefer: use prep_strict intersection only if non-empty overlap exists; require: enforce intersection; off: observe-only, no filtering.",
    )
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
    v4_final_profile = bool(args.v4_final_profile)
    if v4_final_profile:
        args.stageb_pass_mode = "strict"
        args.stageb_strict_gate_profile = "hard"
        args.stageb_input_scope = "survivors_a"
        args.cpcv_light_requirement_mode = "feasible_min"
        args.cpcv_light_relaxation_mode = "strict_fail"
        args.cpcv_light_forbid_fallback_path = True
        args.cpcv_light_skip_adjacent_folds = True
        args.cpcv_light_temporal_filter = True
        args.cpcv_light_min_combos_considered = 2
        args.cpcv_light_min_effective_paths = 2
        args.cpcv_light_min_paths_total = 2
        args.survivors_b_q1_failure_mode = "hard"

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

    cmd = [
        py,
        str(light_script),
        "--quant-root",
        str(quant_root),
        "--stage-a-run-id",
        stage_a_run_id,
        "--outputs-subdir",
        args.outputs_subdir,
        "--input-scope",
        str(args.stageb_input_scope),
        "--strict-survivors-max",
        str(args.strict_survivors_max),
        "--psr-strict-min",
        str(args.psr_strict_min),
        "--dsr-strict-min",
        str(args.dsr_strict_min),
        "--psr-cpcv-strict-min",
        str(args.psr_cpcv_strict_min),
        "--dsr-cpcv-strict-min",
        str(args.dsr_cpcv_strict_min),
        "--cpcv-light-p10-min",
        str(args.cpcv_light_p10_min),
        "--cpcv-light-p25-min",
        str(args.cpcv_light_p25_min),
        "--cpcv-light-p05-min",
        str(args.cpcv_light_p05_min),
        "--cpcv-light-es10-min",
        str(args.cpcv_light_es10_min),
        "--cpcv-light-min-combo-size",
        str(args.cpcv_light_min_combo_size),
        "--cpcv-light-min-test-gap-days",
        str(args.cpcv_light_min_test_gap_days),
        "--cpcv-light-min-embargo-gap-days",
        str(args.cpcv_light_min_embargo_gap_days),
        "--cpcv-light-min-effective-paths",
        str(args.cpcv_light_min_effective_paths),
        "--cpcv-light-min-effective-path-ratio",
        str(args.cpcv_light_min_effective_path_ratio),
        "--cpcv-light-min-paths-total",
        str(args.cpcv_light_min_paths_total),
        "--cpcv-light-min-combos-considered",
        str(args.cpcv_light_min_combos_considered),
        "--cpcv-light-requirement-mode",
        str(args.cpcv_light_requirement_mode),
        "--cpcv-light-relaxation-mode",
        str(args.cpcv_light_relaxation_mode),
        "--pass-mode",
        str(args.stageb_pass_mode),
        "--strict-gate-profile",
        str(args.stageb_strict_gate_profile),
        "--strict-quality-gate-mode",
        str(args.stageb_strict_quality_gate_mode),
    ]
    if bool(args.cpcv_light_skip_adjacent_folds):
        cmd += ["--cpcv-light-skip-adjacent-folds"]
    else:
        cmd += ["--skip-cpcv-light-skip-adjacent-folds"]
    if bool(args.cpcv_light_temporal_filter):
        cmd += ["--cpcv-light-temporal-filter"]
    else:
        cmd += ["--skip-cpcv-light-temporal-filter"]
    if bool(args.cpcv_light_forbid_fallback_path):
        cmd += ["--cpcv-light-forbid-fallback-path"]
    else:
        cmd += ["--allow-cpcv-light-fallback-path"]
    if int(args.dsr_trials_total) > 0:
        cmd += ["--dsr-trials-total", str(int(args.dsr_trials_total))]
    if bool(v4_final_profile):
        cmd += ["--v4-final-profile"]
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

    # Q1 stricter orchestration: final Stage-B survivors should be selected from
    # the strict-pass candidate set first. Light survivors remain useful for
    # observability, but governance should not be anchored on a proxy/light-only
    # survivor pool.
    stage_b_final_meta: dict[str, Any] = {
        "selection_mode": "strict_candidates_only",
        "prep_strict_intersection_mode": str(args.prep_strict_intersection_mode),
        "survivors_B_q1_total": 0,
        "strict_candidates_total": 0,
        "intersection_with_prep_strict_total": None,
        "intersection_with_prep_shortlist_total": None,
        "intersection_with_light_survivors_total": None,
        "selected_pass_column": "stage_b_q1_strict_pass" if str(args.stageb_pass_mode) == "strict" else "stage_b_q1_light_pass",
        "selection_priority": [
            "stage_b_q1_strict_pass",
            "stage_b_q1_light_pass",
            "q1_registry_score",
            "dsr_cpcv_strict",
            "psr_cpcv_strict",
            "dsr_strict",
            "psr_strict",
            "dsr_proxy",
            "psr_proxy",
            "ic_5d_oos_mean",
            "candidate_id",
        ],
        "warnings": [],
    }
    survivors_b_q1_path: Path | None = None
    if light_report_obj:
        try:
            light_artifacts = (light_report_obj.get("artifacts") or {})
            light_survivors_path = Path(str(light_artifacts.get("survivors_B_light") or ""))
            light_candidates_path = Path(str(light_artifacts.get("stage_b_light_candidates") or ""))
            if light_candidates_path.exists() or light_survivors_path.exists():
                survivors_light_df = pl.read_parquet(light_survivors_path) if light_survivors_path.exists() else pl.DataFrame()
                if light_candidates_path.exists():
                    light_candidates_df = pl.read_parquet(light_candidates_path)
                    if stage_b_final_meta["selected_pass_column"] in light_candidates_df.columns:
                        survivors_q1_df = light_candidates_df.filter(
                            pl.col(stage_b_final_meta["selected_pass_column"]).cast(pl.Boolean)
                        )
                    else:
                        stage_b_final_meta["warnings"].append(
                            f"selected_pass_column_missing_in_candidates:{stage_b_final_meta['selected_pass_column']}"
                        )
                        survivors_q1_df = light_candidates_df
                    priority_cols = [
                        c for c in stage_b_final_meta["selection_priority"]
                        if c in survivors_q1_df.columns
                    ]
                    if priority_cols:
                        survivors_q1_df = survivors_q1_df.sort(
                            priority_cols,
                            descending=[False if c == "candidate_id" else True for c in priority_cols],
                        )
                    strict_max = max(0, int(args.strict_survivors_max))
                    if strict_max > 0:
                        survivors_q1_df = survivors_q1_df.head(strict_max)
                    stage_b_final_meta["strict_candidates_total"] = int(survivors_q1_df.height)
                else:
                    stage_b_final_meta["warnings"].append("stage_b_light_candidates_missing_fallback_to_light_survivors")
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
                        inter_strict = survivors_q1_df.filter(
                            pl.col("candidate_id").cast(pl.Utf8).is_in(sorted(prep_strict_ids))
                        )
                        stage_b_final_meta["intersection_with_prep_strict_total"] = int(inter_strict.height)
                        prep_mode = str(args.prep_strict_intersection_mode or "prefer")
                        if prep_mode == "require":
                            stage_b_final_meta["selection_mode"] = "intersection_prep_strict_required"
                            survivors_q1_df = inter_strict
                        elif prep_mode == "prefer":
                            if len(prep_strict_ids) == 0:
                                stage_b_final_meta["warnings"].append("prep_strict_empty_fallback_to_stage_b_strict")
                            elif inter_strict.height > 0:
                                stage_b_final_meta["selection_mode"] = "intersection_prep_strict_preferred"
                                survivors_q1_df = inter_strict
                            else:
                                stage_b_final_meta["warnings"].append("prep_strict_no_overlap_fallback_to_stage_b_strict")
                        else:
                            stage_b_final_meta["warnings"].append("prep_strict_intersection_mode_off")
                    if prep_shortlist_ids is not None:
                        inter_short = survivors_q1_df.filter(
                            pl.col("candidate_id").cast(pl.Utf8).is_in(sorted(prep_shortlist_ids))
                        )
                        stage_b_final_meta["intersection_with_prep_shortlist_total"] = int(inter_short.height)
                if not survivors_light_df.is_empty() and "candidate_id" in survivors_light_df.columns:
                    light_ids = sorted(
                        set(str(x) for x in survivors_light_df.get_column("candidate_id").to_list())
                    )
                    inter_light = survivors_q1_df.filter(
                        pl.col("candidate_id").cast(pl.Utf8).is_in(light_ids)
                    )
                    stage_b_final_meta["intersection_with_light_survivors_total"] = int(inter_light.height)
                stage_b_final_meta["survivors_B_q1_total"] = int(survivors_q1_df.height)
                survivors_b_q1_path = artifacts_dir / "survivors_B_q1.parquet"
                survivors_q1_df.write_parquet(survivors_b_q1_path)
                copied["survivors_B_q1"] = str(survivors_b_q1_path)
                hashes["survivors_B_q1_hash"] = stable_hash_file(survivors_b_q1_path)
                if survivors_q1_df.height > 0:
                    top = survivors_q1_df.row(0, named=True)
                    stage_b_final_meta["top_survivor"] = {
                        "candidate_id": str(top.get("candidate_id") or ""),
                        "family": str(top.get("family") or ""),
                        "q1_registry_score": float(top.get("q1_registry_score") or 0.0),
                        "stage_b_q1_strict_pass": bool(top.get("stage_b_q1_strict_pass")),
                        "stage_b_q1_light_pass": bool(top.get("stage_b_q1_light_pass")),
                        "dsr_strict": float(top.get("dsr_strict") or 0.0),
                        "psr_strict": float(top.get("psr_strict") or 0.0),
                        "dsr_cpcv_strict": float(top.get("dsr_cpcv_strict") or 0.0),
                        "psr_cpcv_strict": float(top.get("psr_cpcv_strict") or 0.0),
                        "dsr_proxy": float(top.get("dsr_proxy") or 0.0),
                        "psr_proxy": float(top.get("psr_proxy") or 0.0),
                        "ic_5d_oos_mean": float(top.get("ic_5d_oos_mean") or 0.0),
                    }
        except Exception as exc:
            stage_b_final_meta["warnings"].append(f"failed_to_build_survivors_B_q1:{exc}")

    min_survivors = max(0, int(args.min_survivors_b_q1))
    survivors_total = int(stage_b_final_meta.get("survivors_B_q1_total") or 0)
    post_gate_failures: list[str] = []
    post_gate_warnings: list[str] = []
    if min_survivors > 0 and survivors_total < min_survivors:
        msg = f"SURVIVORS_B_Q1_BELOW_MIN:{survivors_total}<{min_survivors}"
        if str(args.survivors_b_q1_failure_mode) == "hard":
            post_gate_failures.append(msg)
        else:
            post_gate_warnings.append(msg)
            stage_b_final_meta.setdefault("warnings", []).append(msg)

    all_steps_ok = all(step.get("ok") for step in steps)
    report_ok = bool(all_steps_ok and not post_gate_failures)
    if not all_steps_ok:
        exit_code = int(next((s["exit_code"] for s in steps if not s.get("ok")), 1))
        reason = "stage_b_substep_failed"
    elif post_gate_failures:
        exit_code = 41
        reason = "stage_b_post_gate_failed"
    else:
        exit_code = 0
        reason = "ok"

    stage_b_light_counts = counts.get("stage_b_light") or {}
    stage_b_final_meta["strict_pass_total"] = int(stage_b_light_counts.get("stage_b_candidates_strict_pass_total") or 0)
    stage_b_final_meta["proxy_augmented_pass_total"] = int(stage_b_light_counts.get("stage_b_candidates_proxy_augmented_pass_total") or 0)
    stage_b_final_meta["light_survivors_total"] = int(stage_b_light_counts.get("survivors_B_light_total") or 0)

    report_out = {
        "schema": "quantlab_stage_b_q1_run_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "stage_a_run_id": stage_a_run_id,
        "ok": report_ok,
        "exit_code": int(exit_code),
        "reason": str(reason),
        "warnings": post_gate_warnings,
        "post_gate": {
            "min_survivors_b_q1": min_survivors,
            "survivors_b_q1_total": survivors_total,
            "failure_mode": str(args.survivors_b_q1_failure_mode),
            "failures": post_gate_failures,
            "warnings": post_gate_warnings,
        },
        "method": {
            "type": "q1_stage_b_orchestrated",
            "stageb_input_scope": str(args.stageb_input_scope),
            "stageb_pass_mode": str(args.stageb_pass_mode),
            "stageb_strict_gate_profile": str(args.stageb_strict_gate_profile),
            "stageb_strict_quality_gate_mode": str(args.stageb_strict_quality_gate_mode),
            "v4_final_profile": bool(v4_final_profile),
            "cpcv_light_requirement_mode": str(args.cpcv_light_requirement_mode),
            "cpcv_light_relaxation_mode": str(args.cpcv_light_relaxation_mode),
            "prep_strict_intersection_mode": str(args.prep_strict_intersection_mode),
            "notes": [
                "Runs Stage-B prep + Stage-B light in a single auditable entrypoint.",
                (
                    "v4-final profile is active: strict pass, hard profile, configured CPCV minima, strict no-relax policy."
                    if bool(v4_final_profile)
                    else "Still Q1-light; not full v4.0 CPCV/DSR/PSR final implementation."
                ),
                "Default pass mode is strict (non-proxy gates only for final pass/fail).",
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
