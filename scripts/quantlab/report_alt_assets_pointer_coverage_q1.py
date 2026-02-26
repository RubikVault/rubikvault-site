#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--target-types", default="CRYPTO,FOREX,BOND,INDEX,FUND")
    p.add_argument("--sample-size", type=int, default=15)
    return p.parse_args(list(argv))


def _row_layer(obj: dict) -> str:
    return str(obj.get("layer") or ((obj.get("computed") or {}).get("layer")) or "UNKNOWN")


def _row_bars_count(obj: dict) -> int:
    try:
        return int(obj.get("bars_count") or 0)
    except Exception:
        return 0


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root = Path(args.quant_root).resolve()
    registry_path = (repo_root / args.registry).resolve()
    if not registry_path.exists():
        raise SystemExit(f"FATAL: registry not found: {registry_path}")

    target_types = [x.strip().upper() for x in args.target_types.split(",") if x.strip()]
    target_set = set(target_types)

    totals_by_type: dict[str, Counter] = defaultdict(Counter)
    layers_by_type: dict[str, Counter] = defaultdict(Counter)
    missing_samples_by_type: dict[str, list] = defaultdict(list)
    with_pack_samples_by_type: dict[str, list] = defaultdict(list)

    rows_total = 0
    rows_target_total = 0
    pointer_total_target = 0
    pointer_total_target_with_ge200 = 0
    pointer_total_target_with_bars = 0
    missing_pointer_total_target = 0

    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rows_total += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = str(obj.get("type_norm") or "").upper()
            if not t:
                continue
            cid = str(obj.get("canonical_id") or "")
            sym = str(obj.get("symbol") or "")
            exch = str(obj.get("exchange") or "")
            bars_count = _row_bars_count(obj)
            layer = _row_layer(obj)
            pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
            has_pack = bool(pack)

            totals_by_type[t]["total"] += 1
            if bars_count > 0:
                totals_by_type[t]["bars_gt_0"] += 1
            if bars_count >= 200:
                totals_by_type[t]["bars_ge_200"] += 1
            if has_pack:
                totals_by_type[t]["with_history_pack"] += 1
            else:
                totals_by_type[t]["missing_history_pack"] += 1
            layers_by_type[t][layer] += 1

            if t not in target_set:
                continue
            rows_target_total += 1
            if has_pack:
                pointer_total_target += 1
                if bars_count > 0:
                    pointer_total_target_with_bars += 1
                if bars_count >= 200:
                    pointer_total_target_with_ge200 += 1
                if len(with_pack_samples_by_type[t]) < args.sample_size:
                    with_pack_samples_by_type[t].append(
                        {
                            "canonical_id": cid,
                            "symbol": sym,
                            "exchange": exch,
                            "bars_count": bars_count,
                            "layer": layer,
                            "history_pack": pack,
                        }
                    )
            else:
                missing_pointer_total_target += 1
                if len(missing_samples_by_type[t]) < args.sample_size:
                    missing_samples_by_type[t].append(
                        {
                            "canonical_id": cid,
                            "symbol": sym,
                            "exchange": exch,
                            "bars_count": bars_count,
                            "layer": layer,
                        }
                    )

    report = {
        "schema": "quantlab_alt_assets_pointer_coverage_q1_v1",
        "generated_at": utc_now_iso(),
        "registry_path": str(registry_path),
        "target_types": target_types,
        "totals": {
            "registry_rows_total": rows_total,
            "target_types_rows_total": rows_target_total,
            "target_types_with_history_pack": pointer_total_target,
            "target_types_missing_history_pack": missing_pointer_total_target,
            "target_types_with_pack_and_bars_gt_0": pointer_total_target_with_bars,
            "target_types_with_pack_and_bars_ge_200": pointer_total_target_with_ge200,
            "target_types_with_history_pack_ratio_pct": round((pointer_total_target / rows_target_total) * 100, 3) if rows_target_total else 0.0,
        },
        "by_type": {},
        "notes": [
            "Exporter is not the limiter if type rows exist but lack history_pack pointers.",
            "Counts are based on v7 registry rows (canonical-level records) and current pointers.history_pack field.",
        ],
    }

    for t in sorted(totals_by_type):
        c = totals_by_type[t]
        total = int(c.get("total", 0))
        with_pack = int(c.get("with_history_pack", 0))
        report["by_type"][t] = {
            "counts": {
                "total": total,
                "with_history_pack": with_pack,
                "missing_history_pack": int(c.get("missing_history_pack", 0)),
                "bars_gt_0": int(c.get("bars_gt_0", 0)),
                "bars_ge_200": int(c.get("bars_ge_200", 0)),
                "with_history_pack_ratio_pct": round((with_pack / total) * 100, 3) if total else 0.0,
            },
            "top_layers": [{"layer": k, "count": v} for k, v in layers_by_type[t].most_common(10)],
            "samples": {
                "with_history_pack": with_pack_samples_by_type.get(t, []),
                "missing_history_pack": missing_samples_by_type.get(t, []),
            },
        }

    # Write to quant hot runs and repo report for quick visibility.
    run_id = "alt_assets_pointer_coverage_latest"
    out_quant_dir = quant_root / "runs" / f"run_id={run_id}"
    out_quant_dir.mkdir(parents=True, exist_ok=True)
    out_quant = out_quant_dir / "alt_assets_pointer_coverage_report.json"
    atomic_write_json(out_quant, report)

    out_repo = repo_root / "public/data/universe/v7/reports/quant_alt_assets_pointer_coverage_report.json"
    atomic_write_json(out_repo, report)

    print(f"report_quant={out_quant}")
    print(f"report_repo={out_repo}")
    print(json.dumps(report["totals"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__('sys').argv[1:]))
