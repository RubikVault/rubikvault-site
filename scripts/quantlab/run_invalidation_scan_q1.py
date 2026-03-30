#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="", help="current snapshot id; default latest")
    p.add_argument("--write-queue", action="store_true", default=True)
    p.add_argument("--skip-write-queue", dest="write_queue", action="store_false")
    return p.parse_args(list(argv))


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _snapshot_dirs(base: Path) -> list[Path]:
    out = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    out.sort(key=lambda p: p.stat().st_mtime_ns)
    return out


def _pick_snapshot(snapshots: list[Path], snapshot_id: str) -> Path:
    if not snapshots:
        raise FileNotFoundError("no snapshots found")
    if not snapshot_id:
        return snapshots[-1]
    needle = f"snapshot_id={snapshot_id}"
    for s in snapshots:
        if s.name == needle:
            return s
    raise FileNotFoundError(f"snapshot not found: {needle}")


def _hash_val(manifest: dict[str, Any], keys: list[str]) -> str:
    hashes = manifest.get("hashes") or {}
    artifacts = manifest.get("artifacts") or {}
    for k in keys:
        v = hashes.get(k)
        if v:
            return str(v)
    for k in keys:
        v = artifacts.get(k)
        if v:
            return str(v)
    return ""


def _severity(changes: dict[str, bool]) -> str:
    if changes.get("corp_actions") or changes.get("delistings"):
        return "critical"
    if changes.get("bars") or changes.get("tri"):
        return "major"
    return "minor"


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    snapshots_root = quant_root / "data" / "snapshots"
    snapshots = _snapshot_dirs(snapshots_root)
    if not snapshots:
        raise SystemExit(f"FATAL: no snapshots under {snapshots_root}")

    current_dir = _pick_snapshot(snapshots, args.snapshot_id)
    current_manifest_path = current_dir / "snapshot_manifest.json"
    if not current_manifest_path.exists():
        raise SystemExit(f"FATAL: missing manifest: {current_manifest_path}")
    current_manifest = _read_json(current_manifest_path)
    current_idx = snapshots.index(current_dir)
    prev_dir = snapshots[current_idx - 1] if current_idx > 0 else None

    run_id = f"q1inv_{stable_hash_obj({'ts': utc_now_iso(), 'snapshot': current_dir.name})[:16]}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_invalidation_scan_report.json"

    event: dict[str, Any] | None = None
    queue_path = quant_root / "ops" / "invalidation_queue.ndjson"
    latest_ptr = quant_root / "ops" / "invalidation_latest.json"

    if prev_dir is None:
        out = {
            "schema": "quantlab_q1_invalidation_scan_report_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "ok": True,
            "reason": "no_previous_snapshot",
            "current_snapshot_id": str(current_manifest.get("snapshot_id") or current_dir.name.split("=", 1)[-1]),
            "previous_snapshot_id": None,
            "event_written": False,
            "changes": {},
        }
        atomic_write_json(report_path, out)
        atomic_write_json(
            latest_ptr,
            {
                "schema": "quantlab_q1_invalidation_latest_v1",
                "updated_at": utc_now_iso(),
                "run_id": run_id,
                "report_path": str(report_path),
                "event_written": False,
            },
        )
        print(f"run_id={run_id}")
        print("event_written=false")
        print(f"report={report_path}")
        return 0

    prev_manifest_path = prev_dir / "snapshot_manifest.json"
    if not prev_manifest_path.exists():
        raise SystemExit(f"FATAL: missing previous manifest: {prev_manifest_path}")
    prev_manifest = _read_json(prev_manifest_path)

    current_snapshot_id = str(current_manifest.get("snapshot_id") or current_dir.name.split("=", 1)[-1])
    previous_snapshot_id = str(prev_manifest.get("snapshot_id") or prev_dir.name.split("=", 1)[-1])

    prev_hash = {
        "bars": _hash_val(prev_manifest, ["bars_dataset_manifest_hash", "bars_dataset_hash", "bars_hash"]),
        "corp_actions": _hash_val(prev_manifest, ["corp_actions_hash"]),
        "delistings": _hash_val(prev_manifest, ["delistings_hash"]),
        "tri": _hash_val(prev_manifest, ["tri_parquet_hash", "tri_layers_manifest_hash"]),
    }
    curr_hash = {
        "bars": _hash_val(current_manifest, ["bars_dataset_manifest_hash", "bars_dataset_hash", "bars_hash"]),
        "corp_actions": _hash_val(current_manifest, ["corp_actions_hash"]),
        "delistings": _hash_val(current_manifest, ["delistings_hash"]),
        "tri": _hash_val(current_manifest, ["tri_parquet_hash", "tri_layers_manifest_hash"]),
    }

    changed = {
        "bars": bool(prev_hash["bars"] and curr_hash["bars"] and prev_hash["bars"] != curr_hash["bars"]),
        "corp_actions": bool(prev_hash["corp_actions"] and curr_hash["corp_actions"] and prev_hash["corp_actions"] != curr_hash["corp_actions"]),
        "delistings": bool(prev_hash["delistings"] and curr_hash["delistings"] and prev_hash["delistings"] != curr_hash["delistings"]),
        "tri": bool(prev_hash["tri"] and curr_hash["tri"] and prev_hash["tri"] != curr_hash["tri"]),
    }

    any_change = any(changed.values())
    sev = _severity(changed) if any_change else "none"
    reason_codes: list[str] = []
    if changed["bars"]:
        reason_codes.append("SNAPSHOT_BARS_HASH_CHANGED")
    if changed["corp_actions"]:
        reason_codes.append("SNAPSHOT_CORP_ACTIONS_HASH_CHANGED")
    if changed["delistings"]:
        reason_codes.append("SNAPSHOT_DELISTINGS_HASH_CHANGED")
    if changed["tri"]:
        reason_codes.append("SNAPSHOT_TRI_HASH_CHANGED")

    if any_change:
        event = {
            "schema": "quantlab_q1_invalidation_event_v1",
            "event_id": f"inv_{stable_hash_obj({'prev': previous_snapshot_id, 'curr': current_snapshot_id, 'reasons': reason_codes})[:20]}",
            "generated_at": utc_now_iso(),
            "severity": sev,
            "reason_codes": reason_codes,
            "current_snapshot_id": current_snapshot_id,
            "previous_snapshot_id": previous_snapshot_id,
            "hashes": {"previous": prev_hash, "current": curr_hash},
            "action_hint": (
                "critical_recompute_and_suspend_promotions"
                if sev == "critical"
                else "targeted_recompute_and_re_evaluate"
            ),
        }
        if args.write_queue:
            queue_path.parent.mkdir(parents=True, exist_ok=True)
            with queue_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False, sort_keys=True))
                fh.write("\n")

    report = {
        "schema": "quantlab_q1_invalidation_scan_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": True,
        "current_snapshot_id": current_snapshot_id,
        "previous_snapshot_id": previous_snapshot_id,
        "changes": changed,
        "severity": sev,
        "reason_codes": reason_codes,
        "event_written": bool(event is not None and args.write_queue),
        "queue_path": str(queue_path),
        "event": event,
    }
    atomic_write_json(report_path, report)
    atomic_write_json(
        latest_ptr,
        {
            "schema": "quantlab_q1_invalidation_latest_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "report_path": str(report_path),
            "event_written": bool(event is not None and args.write_queue),
            "severity": sev,
            "reason_codes": reason_codes,
        },
    )

    print(f"run_id={run_id}")
    print(f"event_written={str(bool(event is not None and args.write_queue)).lower()}")
    print(f"severity={sev}")
    print(f"report={report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
