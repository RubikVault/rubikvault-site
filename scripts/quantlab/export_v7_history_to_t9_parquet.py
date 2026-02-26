#!/usr/bin/env python3
"""
Resumable local export: v7 history packs (ndjson.gz) -> Parquet on external SSD (T9).

This does NOT modify the existing website/v7 history store. It reads from:
  mirrors/universe-v7/history/**/*.ndjson.gz
and writes a Quant/analytics-friendly raw layer to an external target (default T9).

Scope (default):
  - type_norm in {STOCK, ETF}
  - rows flattened to one row per (asset_id, date)
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple


try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover - runtime dependency check
    print(f"FATAL: pyarrow is required: {exc}", file=sys.stderr)
    sys.exit(2)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default
    except Exception:
        return default


def sanitize_type_norm(type_norm: str) -> str:
    t = (type_norm or "").strip().upper()
    if t == "STOCK":
        return "stock"
    if t == "ETF":
        return "etf"
    return t.lower() or "unknown"


def rel_to_pack_key(rel_pack: str) -> str:
    # Stable short key for file/partition names
    return hashlib.sha1(rel_pack.encode("utf-8")).hexdigest()[:16]


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


def acquire_job_lock(job_root: Path) -> Path:
    job_root.mkdir(parents=True, exist_ok=True)
    lock_path = job_root / ".lock"
    payload = {
        "pid": os.getpid(),
        "host": os.uname().nodename if hasattr(os, "uname") else "",
        "started_at": utc_now_iso(),
    }
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False))
            return lock_path
        except FileExistsError:
            try:
                existing = json.loads(lock_path.read_text())
                existing_pid = int(existing.get("pid") or 0)
            except Exception:
                existing_pid = 0
            if existing_pid and _pid_is_running(existing_pid):
                raise RuntimeError(f"job_lock_active pid={existing_pid} lock={lock_path}")
            # stale/broken lock
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass
            except Exception as exc:
                raise RuntimeError(f"job_lock_stale_unlink_failed lock={lock_path}: {exc}") from exc


def release_job_lock(lock_path: Path | None) -> None:
    if not lock_path:
        return
    try:
        lock_path.unlink()
    except FileNotFoundError:
        pass
    except Exception:
        pass


@dataclass
class AssetMeta:
    asset_id: str
    symbol: str
    exchange: str
    currency: str
    type_norm: str
    provider_symbol: str
    country: str


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=os.getcwd())
    p.add_argument("--target-root", default="/Volumes/T9/rubikvault-quantlab")
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--ingest-date", default=datetime.now().strftime("%Y-%m-%d"))
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--limit-packs", type=int, default=0)
    p.add_argument("--force-pack", action="append", default=[])
    p.add_argument("--compression", default="snappy")
    p.add_argument("--job-name", default="")
    return p.parse_args(list(argv))


def build_registry_index(
    registry_path: Path, include_types: set[str]
) -> Tuple[Dict[str, AssetMeta], Dict[str, set[str]], dict]:
    asset_meta: Dict[str, AssetMeta] = {}
    pack_to_assets: Dict[str, set[str]] = defaultdict(set)
    stats = {"rows_total": 0, "rows_selected": 0, "missing_pack_pointer": 0, "types": defaultdict(int)}
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            stats["rows_total"] += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            type_norm = str(obj.get("type_norm") or "").upper()
            stats["types"][type_norm] += 1
            if type_norm not in include_types:
                continue
            cid = str(obj.get("canonical_id") or "").strip()
            if not cid:
                continue
            rel_pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
            if not rel_pack:
                stats["missing_pack_pointer"] += 1
                continue
            asset_meta[cid] = AssetMeta(
                asset_id=cid,
                symbol=str(obj.get("symbol") or ""),
                exchange=str(obj.get("exchange") or ""),
                currency=str(obj.get("currency") or ""),
                type_norm=type_norm,
                provider_symbol=str(obj.get("provider_symbol") or obj.get("symbol") or ""),
                country=str(obj.get("country") or ""),
            )
            pack_to_assets[rel_pack].add(cid)
            stats["rows_selected"] += 1
    stats["types"] = dict(stats["types"])
    return asset_meta, pack_to_assets, stats


def flatten_rows_for_pack(
    pack_path: Path,
    rel_pack: str,
    wanted_assets: set[str],
    asset_meta: Dict[str, AssetMeta],
) -> Tuple[Dict[str, Dict[str, List]], dict]:
    rows_by_class: Dict[str, Dict[str, List]] = {}
    per_pack_stats = {
        "records_seen": 0,
        "records_matched": 0,
        "bars_written": 0,
        "assets_emitted": 0,
        "missing_targets_in_pack": 0,
    }
    seen_assets = set()

    def ensure_bucket(asset_class: str) -> Dict[str, List]:
        if asset_class in rows_by_class:
            return rows_by_class[asset_class]
        rows_by_class[asset_class] = {k: [] for k in [
            "asset_id", "date", "asset_class", "exchange", "symbol", "provider_symbol",
            "currency", "country", "provider", "is_trading_day", "data_quality_flag",
            "source_pack_rel", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw",
            "adjusted_close_raw"
        ]}
        return rows_by_class[asset_class]

    with gzip.open(pack_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            per_pack_stats["records_seen"] += 1
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            cid = str(rec.get("canonical_id") or "").strip()
            if cid not in wanted_assets:
                continue
            meta = asset_meta.get(cid)
            if not meta:
                continue
            per_pack_stats["records_matched"] += 1
            seen_assets.add(cid)
            bars = rec.get("bars") or []
            asset_class = sanitize_type_norm(meta.type_norm)
            out = ensure_bucket(asset_class)
            for bar in bars:
                date = str(bar.get("date") or "").strip()
                if not date:
                    continue
                out["asset_id"].append(meta.asset_id)
                out["date"].append(date)
                out["asset_class"].append(asset_class)
                out["exchange"].append(meta.exchange)
                out["symbol"].append(meta.symbol)
                out["provider_symbol"].append(meta.provider_symbol)
                out["currency"].append(meta.currency)
                out["country"].append(meta.country)
                out["provider"].append("EODHD")
                out["is_trading_day"].append(True)
                out["data_quality_flag"].append(0)
                out["source_pack_rel"].append(rel_pack)
                out["open_raw"].append(bar.get("open"))
                out["high_raw"].append(bar.get("high"))
                out["low_raw"].append(bar.get("low"))
                out["close_raw"].append(bar.get("close"))
                out["volume_raw"].append(bar.get("volume"))
                out["adjusted_close_raw"].append(bar.get("adjusted_close"))
                per_pack_stats["bars_written"] += 1

    per_pack_stats["assets_emitted"] = len(seen_assets)
    per_pack_stats["missing_targets_in_pack"] = max(0, len(wanted_assets) - len(seen_assets))
    return rows_by_class, per_pack_stats


def write_parquet_rows(out_path: Path, rows: Dict[str, List], compression: str = "snappy") -> int:
    if not rows or not rows["asset_id"]:
        return 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    schema = pa.schema([
        ("asset_id", pa.string()),
        ("date", pa.string()),
        ("asset_class", pa.string()),
        ("exchange", pa.string()),
        ("symbol", pa.string()),
        ("provider_symbol", pa.string()),
        ("currency", pa.string()),
        ("country", pa.string()),
        ("provider", pa.string()),
        ("is_trading_day", pa.bool_()),
        ("data_quality_flag", pa.int32()),
        ("source_pack_rel", pa.string()),
        ("open_raw", pa.float64()),
        ("high_raw", pa.float64()),
        ("low_raw", pa.float64()),
        ("close_raw", pa.float64()),
        ("volume_raw", pa.float64()),
        ("adjusted_close_raw", pa.float64()),
    ])
    table = pa.Table.from_pydict(rows, schema=schema)
    pq.write_table(table, out_path, compression=compression)
    return table.num_rows


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    target_root = Path(args.target_root).resolve()
    registry_path = (repo_root / args.registry).resolve()
    include_types = {x.strip().upper() for x in args.include_types.split(",") if x.strip()}
    if not registry_path.exists():
        print(f"FATAL: registry not found: {registry_path}", file=sys.stderr)
        return 2

    if not target_root.exists():
        print(f"FATAL: target root not found/mounted: {target_root}", file=sys.stderr)
        return 2

    job_name = args.job_name.strip() or f"v7_stock_etf_export_{args.ingest_date.replace('-', '')}"
    job_root = target_root / "jobs" / job_name
    lock_path: Path | None = None
    try:
        lock_path = acquire_job_lock(job_root)
    except RuntimeError as exc:
        print(f"FATAL: {exc}", file=sys.stderr)
        return 3

    try:
        raw_root = target_root / "data" / "raw" / "provider=EODHD" / f"ingest_date={args.ingest_date}"
        logs_dir = target_root / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        state_path = job_root / "state.json"
        manifest_path = job_root / "manifest.json"
        packs_manifest_path = job_root / "packs_manifest.ndjson"

        state = load_json(state_path, {
            "schema": "v7_t9_export_state_v1",
            "started_at": utc_now_iso(),
            "updated_at": None,
            "repo_root": str(repo_root),
            "target_root": str(target_root),
            "registry_path": str(registry_path),
            "ingest_date": args.ingest_date,
            "include_types": sorted(include_types),
            "completed_packs": [],
            "failed_packs": {},
            "stats": {"packs_total": 0, "packs_done": 0, "packs_failed": 0, "bars_written": 0, "assets_emitted": 0}
        })
        completed_packs = set(state.get("completed_packs") or [])
        failed_packs = dict(state.get("failed_packs") or {})

        # Write an initial state immediately so background runs are monitorable
        # even while the registry index is still being built.
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)

        print(f"[export] building registry index from {registry_path}")
        asset_meta, pack_to_assets, reg_stats = build_registry_index(registry_path, include_types)
        pack_items = sorted(pack_to_assets.items(), key=lambda kv: kv[0])

        if args.force_pack:
            force = set(args.force_pack)
            pack_items = [kv for kv in pack_items if kv[0] in force]

        if args.limit_packs and args.limit_packs > 0:
            pack_items = pack_items[: args.limit_packs]

        state["stats"]["packs_total"] = len(pack_items)
        state["registry_stats"] = reg_stats
        atomic_write_json(state_path, state)
        print(
            f"[export] registry index ready: selected_assets={reg_stats.get('rows_selected', 0)} "
            f"packs_total={len(pack_items)}"
        )

        if not packs_manifest_path.exists():
            packs_manifest_path.parent.mkdir(parents=True, exist_ok=True)
            packs_manifest_path.write_text("")

        for idx, (rel_pack, wanted_assets) in enumerate(pack_items, start=1):
            if rel_pack in completed_packs:
                continue
            pack_abs = (repo_root / "mirrors/universe-v7" / rel_pack).resolve()
            if not pack_abs.exists():
                failed_packs[rel_pack] = {"error": "pack_missing", "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                continue

            started = time.time()
            print(f"[export] [{idx}/{len(pack_items)}] {rel_pack} (targets={len(wanted_assets)})")
            try:
                rows_by_class, per_pack_stats = flatten_rows_for_pack(pack_abs, rel_pack, wanted_assets, asset_meta)
                output_files = []
                pack_key = rel_to_pack_key(rel_pack)
                for asset_class, rows in rows_by_class.items():
                    out_path = raw_root / f"asset_class={asset_class}" / f"part_{pack_key}.parquet"
                    n = write_parquet_rows(out_path, rows, compression=args.compression)
                    if n > 0:
                        output_files.append({"asset_class": asset_class, "path": str(out_path), "rows": n})

                event = {
                    "ts": utc_now_iso(),
                    "rel_pack": rel_pack,
                    "pack_key": pack_key,
                    "duration_sec": round(time.time() - started, 3),
                    "targets": len(wanted_assets),
                    "stats": per_pack_stats,
                    "outputs": output_files,
                }
                with packs_manifest_path.open("a", encoding="utf-8") as outfh:
                    outfh.write(json.dumps(event, ensure_ascii=False) + "\n")

                completed_packs.add(rel_pack)
                state["completed_packs"] = sorted(completed_packs)
                state["stats"]["packs_done"] = len(completed_packs)
                state["stats"]["bars_written"] = int(state["stats"].get("bars_written", 0)) + int(per_pack_stats["bars_written"])
                state["stats"]["assets_emitted"] = int(state["stats"].get("assets_emitted", 0)) + int(per_pack_stats["assets_emitted"])
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
            except KeyboardInterrupt:
                print("[export] interrupted", file=sys.stderr)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                return 130
            except Exception as exc:  # pragma: no cover - runtime resilience
                failed_packs[rel_pack] = {"error": str(exc), "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                print(f"[export] ERROR {rel_pack}: {exc}", file=sys.stderr)

        # macOS/exFAT can create AppleDouble sidecar files (._*) on external drives.
        # Remove them in our export tree so downstream parquet scans don't choke on fake *.parquet sidecars.
        appledouble_removed = 0
        for root in (raw_root, job_root):
            if root.exists():
                for sidecar in root.rglob("._*"):
                    try:
                        sidecar.unlink()
                        appledouble_removed += 1
                    except Exception:
                        pass

        manifest = {
            "schema": "v7_t9_export_manifest_v1",
            "generated_at": utc_now_iso(),
            "job_name": job_name,
            "repo_root": str(repo_root),
            "target_root": str(target_root),
            "registry_path": str(registry_path),
            "ingest_date": args.ingest_date,
            "include_types": sorted(include_types),
            "raw_root": str(raw_root),
            "state_path": str(state_path),
            "packs_manifest_path": str(packs_manifest_path),
            "stats": state["stats"],
            "registry_stats": reg_stats,
            "completed_packs": len(completed_packs),
            "failed_packs": len(failed_packs),
            "appledouble_removed": appledouble_removed,
        }
        atomic_write_json(manifest_path, manifest)
        print(
            f"[export] done. bars_written={state['stats']['bars_written']} "
            f"packs_done={state['stats']['packs_done']} failed={len(failed_packs)} "
            f"appledouble_removed={appledouble_removed}"
        )
        print(f"[export] manifest: {manifest_path}")
        return 0 if not failed_packs else 1
    finally:
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
