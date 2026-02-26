#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


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
    p.add_argument("--real-delta-test-mode", action="store_true", help="Require non-zero delta rows and tighten reconciliation checks")
    p.add_argument("--real-delta-min-emitted-rows", type=int, default=1)
    p.add_argument("--real-delta-limit-packs", type=int, default=2)
    p.add_argument("--real-delta-max-emitted-rows", type=int, default=100000)
    p.add_argument("--warn-min-delta-rows", type=int, default=0)
    p.add_argument("--warn-max-delta-rows", type=int, default=0)
    p.add_argument("--fail-min-delta-rows", type=int, default=0)
    p.add_argument("--fail-max-delta-rows", type=int, default=0)
    p.add_argument("--ops-ledger-disabled", action="store_true")
    p.add_argument("--ops-ledger-path", default="")
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


def _append_jsonl(path: Path, rec: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def _read_json_if_exists(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        p = Path(value)
        if p.exists() and p.is_file():
            return read_json(p)
    except Exception:
        return None
    return None


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
    warnings_list: list[str] = []
    threshold_failures: list[str] = []

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
    if args.real_delta_test_mode:
        if not args.delta_full_scan_packs:
            delta_cmd += ["--full-scan-packs"]
        if not (args.delta_limit_packs and args.delta_limit_packs > 0):
            delta_cmd += ["--limit-packs", str(max(1, int(args.real_delta_limit_packs)))]
        if not (args.delta_max_emitted_rows and args.delta_max_emitted_rows > 0):
            delta_cmd += ["--max-emitted-rows", str(max(1, int(args.real_delta_max_emitted_rows)))]
        if not args.delta_job_name:
            delta_cmd += ["--job-name", f"q1_daily_delta_realtest_{int(time.time())}"]

    step_specs = [
        ("daily_delta_ingest", delta_cmd),
        ("incremental_snapshot_update", [py, str(scripts["snap_inc"]), "--quant-root", str(quant_root)]),
        ("incremental_feature_update", [py, str(scripts["feat_inc"]), "--quant-root", str(quant_root), "--feature-store-version", args.feature_store_version] + (["--output-tag", args.feature_output_tag] if args.feature_output_tag else [])),
        (
            "reconciliation_checks",
            [py, str(scripts["recon"]), "--quant-root", str(quant_root)]
            + (
                ["--expect-nonzero-delta", "--expected-min-delta-rows", str(max(1, int(args.real_delta_min_emitted_rows)))]
                if args.real_delta_test_mode
                else []
            ),
        ),
    ]

    for step_name, cmd in step_specs:
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
        if step_name == "daily_delta_ingest" and rc == 0 and args.real_delta_test_mode:
            dm_path = kv.get("manifest")
            if dm_path:
                try:
                    dm = read_json(Path(dm_path))
                    emitted = int(((dm.get("stats") or {}).get("bars_rows_emitted_delta")) or 0)
                    step["real_delta_test"] = {
                        "expected_min_rows": int(max(1, args.real_delta_min_emitted_rows)),
                        "bars_rows_emitted_delta": emitted,
                        "ok": emitted >= int(max(1, args.real_delta_min_emitted_rows)),
                    }
                    if emitted < int(max(1, args.real_delta_min_emitted_rows)):
                        step["ok"] = False
                        step["exit_code"] = 91
                        step["stderr_tail"] = (step.get("stderr_tail") or []) + [
                            f"REAL_DELTA_TEST_FAILED emitted={emitted} expected_min={int(max(1, args.real_delta_min_emitted_rows))}"
                        ]
                        rc = 91
                except Exception as exc:
                    step["ok"] = False
                    step["exit_code"] = 92
                    step["stderr_tail"] = (step.get("stderr_tail") or []) + [f"REAL_DELTA_TEST_READ_MANIFEST_FAILED {exc}"]
                    rc = 92
        if rc != 0:
            break

    ok = all(s["ok"] for s in steps)
    # Extract metrics from step artifacts for drift/failure tracking.
    delta_manifest = _read_json_if_exists(refs.get("daily_delta_ingest.manifest"))
    recon_report = _read_json_if_exists(refs.get("reconciliation_checks.report"))
    snap_inc_manifest = _read_json_if_exists(refs.get("incremental_snapshot_update.increment_manifest"))
    feat_inc_manifest = _read_json_if_exists(refs.get("incremental_feature_update.manifest"))

    delta_stats = ((delta_manifest or {}).get("stats") or {})
    delta_recon = ((delta_manifest or {}).get("reconciliation") or {})
    recon_checks = ((recon_report or {}).get("checks") or {})
    recon_stats = ((recon_report or {}).get("stats") or {})
    bars_rows_emitted_delta = int(delta_stats.get("bars_rows_emitted_delta") or 0)
    assets_emitted_delta = int(delta_stats.get("assets_emitted_delta") or 0)
    packs_done = int(delta_stats.get("packs_done") or 0)
    packs_failed = int(delta_stats.get("packs_failed") or 0)

    def _thresh_warn(name: str, cond: bool, detail: str) -> None:
        if cond:
            warnings_list.append(f"{name}:{detail}")

    def _thresh_fail(name: str, cond: bool, detail: str) -> None:
        if cond:
            threshold_failures.append(f"{name}:{detail}")

    if args.warn_min_delta_rows > 0:
        _thresh_warn("WARN_MIN_DELTA_ROWS", bars_rows_emitted_delta < int(args.warn_min_delta_rows), f"{bars_rows_emitted_delta}<{int(args.warn_min_delta_rows)}")
    if args.warn_max_delta_rows > 0:
        _thresh_warn("WARN_MAX_DELTA_ROWS", bars_rows_emitted_delta > int(args.warn_max_delta_rows), f"{bars_rows_emitted_delta}>{int(args.warn_max_delta_rows)}")
    if args.fail_min_delta_rows > 0:
        _thresh_fail("FAIL_MIN_DELTA_ROWS", bars_rows_emitted_delta < int(args.fail_min_delta_rows), f"{bars_rows_emitted_delta}<{int(args.fail_min_delta_rows)}")
    if args.fail_max_delta_rows > 0:
        _thresh_fail("FAIL_MAX_DELTA_ROWS", bars_rows_emitted_delta > int(args.fail_max_delta_rows), f"{bars_rows_emitted_delta}>{int(args.fail_max_delta_rows)}")
    if packs_failed > 0:
        _thresh_fail("PACKS_FAILED_NONZERO", True, str(packs_failed))

    if ok and threshold_failures:
        ok = False

    ops_metrics_entry = {
        "schema": "quantlab_q1_daily_backbone_metrics_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": bool(ok),
        "threshold_failures": list(threshold_failures),
        "warnings": list(warnings_list),
        "delta": {
            "bars_rows_emitted_delta": bars_rows_emitted_delta,
            "assets_emitted_delta": assets_emitted_delta,
            "packs_done": packs_done,
            "packs_failed": packs_failed,
            "candidate_packs_total": int(delta_stats.get("candidate_packs_total") or 0),
            "selected_packs_total": int(delta_stats.get("selected_packs_total") or 0),
            "rows_scanned": int(delta_stats.get("bars_rows_scanned_in_selected_packs") or 0),
            "rows_skipped_old_or_known": int(delta_stats.get("rows_skipped_old_or_known") or 0),
            "rows_skipped_duplicate_in_run": int(delta_stats.get("rows_skipped_duplicate_in_run") or 0),
        },
        "delta_reconciliation": {
            "rows_before": int(delta_recon.get("raw_rows_before") or 0),
            "rows_after": int(delta_recon.get("raw_rows_after") or 0),
            "rows_delta_observed": int(delta_recon.get("raw_rows_delta_observed") or 0),
            "rows_delta_expected": int(delta_recon.get("raw_rows_delta_expected") or 0),
        },
        "snapshot_increment": {
            "changed_assets_total": int(((snap_inc_manifest or {}).get("counts") or {}).get("changed_assets_total") or 0),
            "rows_materialized_total": int(((snap_inc_manifest or {}).get("counts") or {}).get("rows_materialized_total") or 0),
        },
        "feature_increment": {
            "changed_assets_total": int(((feat_inc_manifest or {}).get("counts") or {}).get("changed_assets_total") or 0),
            "feature_rows_total": int(((feat_inc_manifest or {}).get("counts") or {}).get("feature_rows_total") or 0),
        },
        "reconciliation": {
            "checks_failed_total": int(sum(1 for v in recon_checks.values() if v is False)),
            "checks_total": int(len(recon_checks)),
            "checks": recon_checks,
            "delta_quality_scan": (recon_stats.get("delta_quality_scan") or {}),
            "delta_scan_accounting": (recon_stats.get("delta_scan_accounting") or {}),
        },
        "refs": refs,
    }
    ops_ledger_path = Path(args.ops_ledger_path).resolve() if args.ops_ledger_path else (quant_root / "ops" / "daily_backbone_metrics.ndjson")
    if not args.ops_ledger_disabled:
        _append_jsonl(ops_ledger_path, ops_metrics_entry)
        refs["ops.daily_backbone_metrics_ledger"] = str(ops_ledger_path)
    report = {
        "schema": "quantlab_q1_daily_data_backbone_run_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": ok,
        "exit_code": 0 if ok else int(next((s["exit_code"] for s in steps if not s["ok"]), 95 if threshold_failures else 1)),
        "steps": steps,
        "references": refs,
        "hashes": hashes,
        "thresholds": {
            "warn_min_delta_rows": int(args.warn_min_delta_rows),
            "warn_max_delta_rows": int(args.warn_max_delta_rows),
            "fail_min_delta_rows": int(args.fail_min_delta_rows),
            "fail_max_delta_rows": int(args.fail_max_delta_rows),
        },
        "warnings": warnings_list,
        "threshold_failures": threshold_failures,
        "metrics_summary": {
            "bars_rows_emitted_delta": bars_rows_emitted_delta,
            "assets_emitted_delta": assets_emitted_delta,
            "packs_done": packs_done,
            "packs_failed": packs_failed,
            "reconciliation_checks_failed_total": int(sum(1 for v in recon_checks.values() if v is False)),
        },
        "notes": [
            "Phase A daily data backbone orchestrator (Q1): delta ingest -> incremental snapshot -> incremental feature -> reconciliation.",
            "Designed for local/private operation on Stocks+ETFs first.",
            "real-delta-test-mode enforces non-zero delta rows and tighter reconciliation expectations.",
            "Writes append-only ops daily backbone metrics ledger unless disabled.",
        ],
        "config": {
            "real_delta_test_mode": bool(args.real_delta_test_mode),
            "real_delta_min_emitted_rows": int(args.real_delta_min_emitted_rows),
        },
    }
    if refs.get("ops.daily_backbone_metrics_ledger"):
        try:
            hashes["ops.daily_backbone_metrics_ledger_hash"] = stable_hash_file(Path(str(refs["ops.daily_backbone_metrics_ledger"])))
        except Exception:
            pass
    atomic_write_json(report_path, report)
    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={ok}")
    return 0 if ok else report["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
