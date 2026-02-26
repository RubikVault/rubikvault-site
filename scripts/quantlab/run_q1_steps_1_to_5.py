#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, read_json


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--asset-classes", default="stock,etf,crypto,index")
    p.add_argument("--feature-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--feature-max-assets", type=int, default=20000)
    return p.parse_args(list(argv))


def run_cmd(cmd: list[str]) -> None:
    print("+", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def newest_snapshot_dir(quant_root: Path) -> Path:
    base = quant_root / "data" / "snapshots"
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not candidates:
        raise FileNotFoundError(f"no snapshots found under {base}")
    candidates.sort(key=lambda p: p.stat().st_mtime_ns)
    return candidates[-1]


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    scripts_dir = Path(__file__).resolve().parent

    # Step 1: materialize snapshot bars (creates v2 snapshot)
    materialize_cmd = [
        py,
        str(scripts_dir / "materialize_snapshot_bars_q1.py"),
        "--quant-root",
        str(quant_root),
        "--include-asset-classes",
        args.asset_classes,
    ]
    if args.snapshot_id:
        materialize_cmd += ["--snapshot-id", args.snapshot_id]
    run_cmd(materialize_cmd)

    latest = newest_snapshot_dir(quant_root)
    latest_manifest = read_json(latest / "snapshot_manifest.json")
    latest_id = latest_manifest["snapshot_id"]
    asof_date = latest_manifest["asof_date"]

    # Step 2: corp actions / delistings contracted layer
    run_cmd(
        [
            py,
            str(scripts_dir / "materialize_snapshot_contract_layers_q1.py"),
            "--quant-root",
            str(quant_root),
            "--snapshot-id",
            latest_id,
        ]
    )

    # Step 3: minimal feature store
    run_cmd(
        [
            py,
            str(scripts_dir / "build_feature_store_q1_min.py"),
            "--quant-root",
            str(quant_root),
            "--snapshot-id",
            latest_id,
            "--asset-classes",
            args.feature_classes,
            "--lookback-calendar-days",
            str(args.lookback_calendar_days),
            "--max-assets",
            str(args.feature_max_assets),
        ]
    )

    # Step 4: minimal regime engine
    run_cmd(
        [
            py,
            str(scripts_dir / "build_regime_q1_min.py"),
            "--quant-root",
            str(quant_root),
            "--asof-date",
            asof_date,
        ]
    )

    # Step 5: cheap gate stage A
    run_cmd(
        [
            py,
            str(scripts_dir / "run_cheap_gate_stage_a_q1.py"),
            "--quant-root",
            str(quant_root),
            "--asof-date",
            asof_date,
        ]
    )

    print(f"q1_steps_1_to_5_done snapshot_id={latest_id} asof_date={asof_date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
