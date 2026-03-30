#!/usr/bin/env python3
"""
Bootstrap local v7 history packs from existing Quant parquet raw data.

Purpose:
  - restore mirrors/universe-v7/history/**/*.ndjson.gz for STOCK/ETF locally
  - restore private mirrors/universe-v7/reports/history_touch_report.json
  - avoid re-pulling full history from the provider when parquet truth already exists

This is intentionally local-first and non-destructive:
  - by default it skips packs that already exist
  - it writes only to the local mirror history/reports/state paths
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


try:
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover
    print(f"FATAL: pyarrow is required: {exc}", file=sys.stderr)
    sys.exit(2)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _pid_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False


def acquire_job_lock(lock_path: Path) -> None:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getpid(),
        "started_at": utc_now_iso(),
        "host": os.uname().nodename if hasattr(os, "uname") else "",
    }
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False))
            return
        except FileExistsError:
            try:
                existing = json.loads(lock_path.read_text())
                existing_pid = int(existing.get("pid") or 0)
            except Exception:
                existing_pid = 0
            if existing_pid and _pid_is_running(existing_pid):
                raise RuntimeError(f"job_lock_active pid={existing_pid} lock={lock_path}")
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass


def release_job_lock(lock_path: Path | None) -> None:
    if not lock_path:
        return
    try:
        lock_path.unlink()
    except FileNotFoundError:
        pass


@dataclass
class AssetEntry:
    canonical_id: str
    symbol: str
    exchange: str
    currency: str
    type_norm: str
    provider_symbol: str
    country: str


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=os.getcwd())
    p.add_argument(
        "--raw-root",
        default="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/data/raw/provider=EODHD",
        help="Quant parquet raw provider root",
    )
    p.add_argument(
        "--history-root",
        default="mirrors/universe-v7/history",
        help="Target local history root (repo-relative by default)",
    )
    p.add_argument(
        "--reports-root",
        default="mirrors/universe-v7/reports",
        help="Target local reports root (repo-relative by default)",
    )
    p.add_argument(
        "--state-root",
        default="mirrors/universe-v7/state",
        help="Target local state root (repo-relative by default)",
    )
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--limit-packs", type=int, default=0)
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--job-name", default="bootstrap_v7_history_from_quant_parquet")
    return p.parse_args(list(argv))


def resolve_repo_rel(repo_root: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (repo_root / p)


def iter_parquet_files(raw_root: Path, asset_classes: list[str]) -> list[Path]:
    files: list[Path] = []
    for asset_class in asset_classes:
        files.extend(sorted(raw_root.glob(f"ingest_date=*/asset_class={asset_class}/*.parquet")))
    return files


def build_pack_rows(table: pa.Table) -> tuple[str, list[dict], list[AssetEntry]]:
    source_pack_values = pc.unique(table["source_pack_rel"]).to_pylist()
    source_pack_values = [str(x) for x in source_pack_values if x]
    if len(source_pack_values) != 1:
        raise RuntimeError(f"expected exactly one source_pack_rel, got {len(source_pack_values)}")
    rel_pack = source_pack_values[0]

    d = table.to_pydict()
    per_asset_bars: dict[str, dict[str, dict]] = defaultdict(dict)
    per_asset_meta: dict[str, AssetEntry] = {}

    n = table.num_rows
    for i in range(n):
        cid = str(d["asset_id"][i] or "").strip()
        date = str(d["date"][i] or "").strip()
        if not cid or not date:
            continue
        per_asset_bars[cid][date] = {
            "date": date,
            "open": float(d["open_raw"][i]) if d["open_raw"][i] is not None else None,
            "high": float(d["high_raw"][i]) if d["high_raw"][i] is not None else None,
            "low": float(d["low_raw"][i]) if d["low_raw"][i] is not None else None,
            "close": float(d["close_raw"][i]) if d["close_raw"][i] is not None else None,
            "volume": float(d["volume_raw"][i]) if d["volume_raw"][i] is not None else None,
            "adjusted_close": float(d["adjusted_close_raw"][i]) if d["adjusted_close_raw"][i] is not None else None,
        }
        if cid not in per_asset_meta:
            per_asset_meta[cid] = AssetEntry(
                canonical_id=cid,
                symbol=str(d["symbol"][i] or "").strip(),
                exchange=str(d["exchange"][i] or "").strip(),
                currency=str(d["currency"][i] or "").strip(),
                type_norm=str(d["asset_class"][i] or "").strip().upper(),
                provider_symbol=str(d["provider_symbol"][i] or d["symbol"][i] or "").strip(),
                country=str(d["country"][i] or "").strip(),
            )

    rows = []
    entries = []
    for cid in sorted(per_asset_bars):
        bars = [per_asset_bars[cid][date] for date in sorted(per_asset_bars[cid])]
        rows.append({"canonical_id": cid, "bars": bars})
        entries.append(per_asset_meta[cid])
    return rel_pack, rows, entries


def write_ndjson_gz(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            fh.write("\n")
    tmp.replace(path)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    raw_root = Path(args.raw_root).resolve()
    history_root = resolve_repo_rel(repo_root, args.history_root)
    reports_root = resolve_repo_rel(repo_root, args.reports_root)
    state_root = resolve_repo_rel(repo_root, args.state_root)
    state_root.mkdir(parents=True, exist_ok=True)
    lock_path = state_root / f"{args.job_name}.lock"

    asset_classes = [x.strip().lower() for x in str(args.asset_classes).split(",") if x.strip()]
    if not asset_classes:
        raise RuntimeError("no asset classes selected")
    if not raw_root.exists():
        raise RuntimeError(f"raw_root_missing:{raw_root}")

    acquire_job_lock(lock_path)
    try:
        parquet_files = iter_parquet_files(raw_root, asset_classes)
        if args.limit_packs > 0:
            parquet_files = parquet_files[: int(args.limit_packs)]

        run_id = f"bootstrap_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        entries: list[dict] = []
        packs: list[dict] = []
        processed = 0
        skipped = 0

        for parquet_path in parquet_files:
            pf = pq.ParquetFile(parquet_path)
            table = pf.read(
                columns=[
                    "asset_id",
                    "date",
                    "asset_class",
                    "exchange",
                    "symbol",
                    "provider_symbol",
                    "currency",
                    "country",
                    "source_pack_rel",
                    "open_raw",
                    "high_raw",
                    "low_raw",
                    "close_raw",
                    "volume_raw",
                    "adjusted_close_raw",
                ]
            )
            rel_pack, pack_rows, asset_entries = build_pack_rows(table)
            out_path = history_root / rel_pack
            if out_path.exists() and not args.overwrite:
                pack_sha = sha256_file(out_path)
                skipped += 1
            else:
                write_ndjson_gz(out_path, pack_rows)
                pack_sha = sha256_file(out_path)
                processed += 1

            for entry in asset_entries:
                entries.append(
                    {
                        "canonical_id": entry.canonical_id,
                        "symbol": entry.symbol,
                        "exchange": entry.exchange,
                        "currency": entry.currency,
                        "type_norm": entry.type_norm,
                        "provider_symbol": entry.provider_symbol,
                        "country": entry.country,
                        "history_pack": rel_pack,
                        "pack_sha256": f"sha256:{pack_sha}",
                    }
                )
            packs.append(
                {
                    "history_pack": rel_pack,
                    "pack_sha256": f"sha256:{pack_sha}",
                    "touched_assets": len(asset_entries),
                }
            )

        entries.sort(key=lambda x: (str(x.get("history_pack") or ""), str(x.get("canonical_id") or "")))
        packs.sort(key=lambda x: str(x.get("history_pack") or ""))
        report = {
            "schema": "rv_v7_history_touch_report_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "updated_ids_count": len(entries),
            "entries_count": len(entries),
            "packs_count": len(packs),
            "report_scope": "private_full",
            "packs": packs,
            "entries": entries,
            "meta": {
                "job_name": args.job_name,
                "raw_root": str(raw_root),
                "history_root": str(history_root),
                "asset_classes": asset_classes,
                "processed_packs": processed,
                "skipped_existing_packs": skipped,
            },
        }
        atomic_write_json(reports_root / "history_touch_report.json", report)
        atomic_write_json(
            state_root / f"{args.job_name}.json",
            {
                "status": "ok",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "processed_packs": processed,
                "skipped_existing_packs": skipped,
                "entries_count": len(entries),
                "packs_count": len(packs),
                "asset_classes": asset_classes,
            },
        )
        print(
            json.dumps(
                {
                    "status": "ok",
                    "run_id": run_id,
                    "processed_packs": processed,
                    "skipped_existing_packs": skipped,
                    "entries_count": len(entries),
                    "packs_count": len(packs),
                    "history_root": str(history_root),
                    "report_path": str(reports_root / "history_touch_report.json"),
                },
                indent=2,
            )
        )
        return 0
    finally:
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
