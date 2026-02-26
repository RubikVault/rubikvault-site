#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Any

import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--delta-manifest", default="", help="Path to q1_daily_delta_ingest manifest; default latest success pointer")
    p.add_argument("--job-name", default="q1_snapshot_incremental")
    p.add_argument("--ingest-date", default="", help="Optional expected ingest_date")
    p.add_argument("--max-delta-files", type=int, default=0)
    return p.parse_args(list(argv))


def _resolve_delta_manifest(quant_root: Path, explicit: str) -> Path:
    if explicit:
        p = Path(explicit)
        return p if p.is_absolute() else (quant_root / p)
    latest_ptr = quant_root / "ops" / "q1_daily_delta_ingest" / "latest_success.json"
    if not latest_ptr.exists():
        raise FileNotFoundError(f"delta latest success pointer missing: {latest_ptr}")
    ptr = read_json(latest_ptr)
    manifest_path = ptr.get("manifest_path")
    if not manifest_path:
        raise RuntimeError(f"manifest_path missing in {latest_ptr}")
    return Path(str(manifest_path))


def _iter_delta_files_from_packs_manifest(packs_manifest: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not packs_manifest.exists():
        return out
    for line in packs_manifest.read_text().splitlines():
        if not line.strip():
            continue
        try:
            ev = json.loads(line)
        except Exception:
            continue
        for item in (ev.get("outputs") or []):
            p = item.get("path")
            if not p:
                continue
            out.append(
                {
                    "path": str(p),
                    "asset_class": str(item.get("asset_class") or ""),
                    "rows": int(item.get("rows") or 0),
                    "rel_pack": str(ev.get("rel_pack") or ""),
                    "pack_key": str(ev.get("pack_key") or ""),
                    "duration_sec": float(ev.get("duration_sec") or 0.0),
                }
            )
    return out


def _scan_changed_assets(delta_files: list[dict[str, Any]], max_files: int = 0) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    files_used = 0
    rows_scanned = 0
    by_asset_class_rows: dict[str, int] = {}
    for rec in delta_files:
        if max_files and files_used >= max_files:
            break
        fp = Path(rec["path"])
        if not fp.exists():
            continue
        pf = pq.ParquetFile(fp)
        tbl = pf.read(columns=["asset_id", "date", "asset_class"])
        d = tbl.to_pydict()
        aids = d.get("asset_id") or []
        dates = d.get("date") or []
        classes = d.get("asset_class") or []
        files_used += 1
        rows_scanned += len(aids)
        for aid, dt, cls in zip(aids, dates, classes):
            if not aid or not dt:
                continue
            cls = str(cls or "").lower()
            row = latest.get(aid)
            if row is None:
                latest[aid] = {
                    "asset_id": str(aid),
                    "asset_class": cls,
                    "delta_rows": 1,
                    "delta_min_date": str(dt),
                    "delta_max_date": str(dt),
                }
            else:
                row["delta_rows"] += 1
                if str(dt) < row["delta_min_date"]:
                    row["delta_min_date"] = str(dt)
                if str(dt) > row["delta_max_date"]:
                    row["delta_max_date"] = str(dt)
            by_asset_class_rows[cls] = by_asset_class_rows.get(cls, 0) + 1
    rows = sorted(latest.values(), key=lambda x: (x["asset_class"], x["asset_id"]))
    return rows, {
        "delta_files_scanned": files_used,
        "delta_rows_scanned": rows_scanned,
        "changed_assets_total": len(rows),
        "delta_rows_by_asset_class": by_asset_class_rows,
    }


def _write_changed_assets_parquet(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("asset_class", pa.string()),
            ("delta_rows", pa.int64()),
            ("delta_min_date", pa.string()),
            ("delta_max_date", pa.string()),
        ]
    )
    cols = {k: [r.get(k) for r in rows] for k in ["asset_id", "asset_class", "delta_rows", "delta_min_date", "delta_max_date"]}
    tbl = pa.Table.from_pydict(cols, schema=schema)
    pq.write_table(tbl, path, compression="snappy")


def _file_sha256(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    delta_manifest_path = _resolve_delta_manifest(quant_root, args.delta_manifest).resolve()
    if not delta_manifest_path.exists():
        raise SystemExit(f"FATAL: delta manifest not found: {delta_manifest_path}")
    delta_manifest = read_json(delta_manifest_path)
    ingest_date = str(args.ingest_date or delta_manifest.get("ingest_date") or "")
    if not ingest_date:
        raise SystemExit("FATAL: ingest_date missing")

    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_materialized_snapshot_dir(quant_root)
    if not snap_dir.exists():
        raise SystemExit(f"FATAL: snapshot not found: {snap_dir}")
    snap_manifest_path = snap_dir / "snapshot_manifest.json"
    snap_manifest = read_json(snap_manifest_path)
    snapshot_id = str(snap_manifest.get("snapshot_id") or snap_dir.name.split("=",1)[-1])

    run_id = f"q1snapinc_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    run_status_path = run_root / "q1_incremental_snapshot_update_run_status.json"

    inc_root = snap_dir / "increments" / f"ingest_date={ingest_date}"
    inc_root.mkdir(parents=True, exist_ok=True)
    changed_assets_path = inc_root / "changed_assets.parquet"
    delta_files_manifest_path = inc_root / "delta_files_manifest.ndjson"
    inc_manifest_path = inc_root / "incremental_snapshot_manifest.json"

    packs_manifest_path = Path(str(delta_manifest.get("packs_manifest_path") or ""))
    if not packs_manifest_path.exists():
        raise SystemExit(f"FATAL: packs_manifest missing from delta manifest: {packs_manifest_path}")

    def write_status(stage: str, ok=None, exit_code=None, reason=None, extra: dict[str, Any] | None = None):
        payload = {
            "schema": "quantlab_q1_incremental_snapshot_update_run_status_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "ok": ok,
            "exit_code": exit_code,
            "reason": reason,
            "stage": stage,
            "snapshot_id": snapshot_id,
            "ingest_date": ingest_date,
            "paths": {
                "delta_manifest": str(delta_manifest_path),
                "snapshot_manifest": str(snap_manifest_path),
                "increment_root": str(inc_root),
                "increment_manifest": str(inc_manifest_path),
                "changed_assets": str(changed_assets_path),
                "delta_files_manifest": str(delta_files_manifest_path),
            },
            "extra": extra or {},
        }
        atomic_write_json(run_status_path, payload)

    write_status("bootstrap")
    delta_files = _iter_delta_files_from_packs_manifest(packs_manifest_path)
    if args.max_delta_files and args.max_delta_files > 0:
        delta_files = delta_files[: args.max_delta_files]

    # Persist a deterministic delta-files manifest for snapshot updates
    delta_file_lines = []
    rows_declared_total = 0
    for rec in delta_files:
        fp = Path(rec["path"])
        exists = fp.exists()
        size = fp.stat().st_size if exists else 0
        delta_file_lines.append({**rec, "exists": exists, "size_bytes": int(size)})
        rows_declared_total += int(rec.get("rows") or 0)
    with delta_files_manifest_path.open("w", encoding="utf-8") as fh:
        for rec in delta_file_lines:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    write_status("delta_files_indexed", extra={"delta_files_total": len(delta_files), "rows_declared_total": rows_declared_total})

    changed_rows, stats = _scan_changed_assets(delta_files, max_files=0)
    _write_changed_assets_parquet(changed_assets_path, changed_rows)

    counts_by_class: dict[str, int] = {}
    for r in changed_rows:
        cls = str(r.get("asset_class") or "").lower()
        counts_by_class[cls] = counts_by_class.get(cls, 0) + 1

    reconciliation = {
        "delta_files_total": len(delta_files),
        "rows_declared_total": int(rows_declared_total),
        "delta_rows_scanned": int(stats["delta_rows_scanned"]),
        "changed_assets_total": int(stats["changed_assets_total"]),
        "rows_declared_matches_scanned": int(rows_declared_total) == int(stats["delta_rows_scanned"]),
    }

    inc_manifest = {
        "schema": "quantlab_q1_incremental_snapshot_manifest_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "job_name": args.job_name,
        "mode": "delta_sidecar_snapshot_increment",
        "note": "Q1 incremental snapshot sidecar (changed assets + delta files); does not rewrite materialized bars dataset yet.",
        "snapshot_id": snapshot_id,
        "ingest_date": ingest_date,
        "inputs": {
            "delta_manifest": str(delta_manifest_path),
            "snapshot_manifest": str(snap_manifest_path),
        },
        "counts": {
            "delta_files_total": len(delta_files),
            "delta_rows_declared_total": int(rows_declared_total),
            "delta_rows_scanned_total": int(stats["delta_rows_scanned"]),
            "changed_assets_total": int(stats["changed_assets_total"]),
            "changed_assets_by_class": counts_by_class,
        },
        "artifacts": {
            "increment_root": str(inc_root),
            "changed_assets_parquet": str(changed_assets_path),
            "delta_files_manifest_ndjson": str(delta_files_manifest_path),
        },
        "reconciliation": reconciliation,
    }
    atomic_write_json(inc_manifest_path, inc_manifest)
    inc_manifest["hashes"] = {
        "increment_manifest_hash": stable_hash_file(inc_manifest_path),
        "changed_assets_parquet_hash": _file_sha256(changed_assets_path),
        "delta_files_manifest_hash": _file_sha256(delta_files_manifest_path),
    }
    atomic_write_json(inc_manifest_path, inc_manifest)

    latest_ptr = quant_root / "ops" / "q1_incremental_snapshot" / "latest_success.json"
    atomic_write_json(
        latest_ptr,
        {
            "schema": "quantlab_q1_incremental_snapshot_latest_success_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "snapshot_id": snapshot_id,
            "ingest_date": ingest_date,
            "increment_manifest": str(inc_manifest_path),
            "run_status": str(run_status_path),
            "counts": inc_manifest["counts"],
            "reconciliation": reconciliation,
        },
    )

    write_status("completed", ok=True, exit_code=0, reason="ok", extra={"reconciliation": reconciliation, "increment_manifest": str(inc_manifest_path)})
    print(f"run_id={run_id}")
    print(f"snapshot_id={snapshot_id}")
    print(f"increment_manifest={inc_manifest_path}")
    print(f"changed_assets_total={inc_manifest['counts']['changed_assets_total']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
