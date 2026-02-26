#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
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
    p.add_argument("--asof-date", default="2026-02-26")
    p.add_argument("--scales", default="20000,40000,full")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--feature-store-version", default="v4_q1min")
    return p.parse_args(list(argv))


def _read_rss_kib(pid: int) -> int:
    try:
        out = subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True).strip()
        return int(out or 0)
    except Exception:
        return 0


def _run_with_metrics(cmd: list[str]) -> tuple[int, float, int]:
    t0 = time.time()
    proc = subprocess.Popen(cmd)
    max_rss_kib = 0
    while True:
        rc = proc.poll()
        if proc.pid:
            max_rss_kib = max(max_rss_kib, _read_rss_kib(proc.pid))
        if rc is not None:
            return rc, time.time() - t0, max_rss_kib
        time.sleep(0.5)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    snap_id = args.snapshot_id
    asof_date = args.asof_date
    raw_scales = [x.strip().lower() for x in args.scales.split(",") if x.strip()]

    out_dir = quant_root / "runs" / f"run_id=feature_benchmark_{asof_date}"
    out_dir.mkdir(parents=True, exist_ok=True)
    build_script = REPO_ROOT / "scripts/quantlab/build_feature_store_q1_min.py"
    regime_script = REPO_ROOT / "scripts/quantlab/build_regime_q1_min.py"
    cheap_script = REPO_ROOT / "scripts/quantlab/run_cheap_gate_stage_a_q1.py"

    results = []
    bench_t0 = time.time()
    for scale_token in raw_scales:
        if scale_token == "full":
            scale = 0
            scale_label = "full"
        else:
            scale = int(scale_token)
            scale_label = str(scale)
        tag = f"bench_{scale_label}"
        cmd = [
            py,
            str(build_script),
            "--quant-root",
            str(quant_root),
            "--snapshot-id",
            snap_id,
            "--asset-classes",
            "stock,etf",
            "--lookback-calendar-days",
            str(args.lookback_calendar_days),
            "--max-assets",
            str(scale),
            "--output-tag",
            tag,
            "--feature-store-version",
            args.feature_store_version,
        ]
        rc, elapsed, max_rss_kib = _run_with_metrics(cmd)
        item = {
            "scale": scale_label,
            "max_assets": scale,
            "elapsed_sec": round(elapsed, 3),
            "ok": rc == 0,
            "rc": rc,
            "max_rss_kib": int(max_rss_kib),
            "max_rss_gib": round(max_rss_kib / (1024 * 1024), 3),
        }
        feat_manifest_path = (
            quant_root
            / "features/store"
            / f"feature_store_version={args.feature_store_version}"
            / f"asof_date={asof_date}"
            / "feature_manifest.json"
        )
        if feat_manifest_path.exists():
            fm = read_json(feat_manifest_path)
            item["feature_rows_total"] = int((fm.get("counts") or {}).get("rows_total") or 0)
            item["feature_rows_by_asset_class"] = (fm.get("counts") or {}).get("rows_by_asset_class") or {}
            item["feature_files_total"] = int((fm.get("counts") or {}).get("files_total") or 0)
            item["feature_manifest_hash"] = stable_hash_file(feat_manifest_path)
        if rc == 0:
            rc_r, elapsed_r, rss_r = _run_with_metrics([py, str(regime_script), "--quant-root", str(quant_root), "--asof-date", asof_date])
            rc_c, elapsed_c, rss_c = _run_with_metrics([py, str(cheap_script), "--quant-root", str(quant_root), "--asof-date", asof_date])
            item["regime_ok"] = rc_r == 0
            item["regime_elapsed_sec"] = round(elapsed_r, 3)
            item["regime_max_rss_gib"] = round(rss_r / (1024 * 1024), 3)
            item["cheap_gate_ok"] = rc_c == 0
            item["cheap_gate_elapsed_sec"] = round(elapsed_c, 3)
            item["cheap_gate_max_rss_gib"] = round(rss_c / (1024 * 1024), 3)
            cheap_report = quant_root / f"runs/run_id=cheapgateA_{asof_date}/outputs/cheap_gate_A_report.json"
            if cheap_report.exists():
                cr = read_json(cheap_report)
                item["cheap_gate_counts"] = cr.get("counts") or {}
        results.append(item)

    report = {
        "schema": "quantlab_feature_scale_benchmark_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": snap_id,
        "asof_date": asof_date,
        "lookback_calendar_days": args.lookback_calendar_days,
        "feature_store_version": args.feature_store_version,
        "benchmark_total_elapsed_sec": round(time.time() - bench_t0, 3),
        "scales": results,
        "notes": [
            "Benchmarks run sequentially on local Mac hot storage.",
            "Feature manifest is overwritten per run by current Q1-min builder; results capture per-run counts immediately.",
            "RSS is polled from the child process via ps; values are best-effort peak resident set estimates.",
        ],
    }
    out_path = out_dir / "feature_scale_benchmark_report.json"
    atomic_write_json(out_path, report)
    print(f"report={out_path}")
    for r in results:
        print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
