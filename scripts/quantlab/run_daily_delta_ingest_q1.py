#!/usr/bin/env python3
from __future__ import annotations

"""
Q1 Daily Delta Ingest (Stocks+ETFs first)

Reads v7 history packs and appends only NEW bars (date > latest known date per asset)
into the Quant raw parquet layer. Designed to be:
- local/private
- idempotent
- resumable enough for daily operation
- manifest + run-status driven

This script does not call provider APIs directly. It consumes the local v7 history store.
"""

import argparse
import gzip
import importlib.util
import json
import os
import socket
import sys
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"FATAL: pyarrow required: {exc}")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
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


def stable_hash_obj(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    import hashlib

    return hashlib.sha256(payload).hexdigest()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=os.getcwd())
    p.add_argument("--quant-root", default="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab")
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--compression", default="snappy")
    p.add_argument("--limit-packs", type=int, default=0)
    p.add_argument("--force-pack", action="append", default=[])
    p.add_argument("--job-name", default="")
    p.add_argument(
        "--latest-date-cache-path",
        default="ops/cache/q1_daily_delta_latest_date_index.stock_etf.json",
        help="Path relative to quant-root (or absolute) for latest-date index cache",
    )
    p.add_argument(
        "--pack-state-cache-path",
        default="ops/cache/q1_daily_delta_v7_pack_state.stock_etf.json",
        help="Path relative to quant-root (or absolute) for v7 pack mtime/size state cache",
    )
    p.add_argument("--rebuild-latest-date-cache", action="store_true")
    p.add_argument("--full-scan-packs", action="store_true", help="Ignore pack mtime cache and scan all packs")
    p.add_argument("--max-emitted-rows", type=int, default=0, help="Optional safety stop for smoke tests")
    return p.parse_args(list(argv))


def _resolve_quant_rel(quant_root: Path, p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else (quant_root / path)


def _load_exporter_module(repo_root: Path):
    exp_path = repo_root / "scripts/quantlab/export_v7_history_to_t9_parquet.py"
    mod_name = "q_export_v7_history"
    spec = importlib.util.spec_from_file_location(mod_name, exp_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load exporter module: {exp_path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    return mod


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
    payload = {"pid": os.getpid(), "host": socket.gethostname(), "started_at": utc_now_iso()}
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
    except Exception:
        pass


def list_raw_parquet_files(raw_provider_root: Path, include_asset_classes: set[str]) -> list[Path]:
    files: list[Path] = []
    if not raw_provider_root.exists():
        return files
    for ingest_dir in sorted(raw_provider_root.glob("ingest_date=*")):
        for cls_dir in sorted(ingest_dir.glob("asset_class=*")):
            cls = cls_dir.name.split("=", 1)[1].lower()
            if cls not in include_asset_classes:
                continue
            files.extend(sorted(cls_dir.glob("*.parquet")))
    return files


def raw_files_fingerprint(files: list[Path], raw_provider_root: Path) -> dict[str, Any]:
    items = []
    for fp in files:
        st = fp.stat()
        try:
            rel = str(fp.relative_to(raw_provider_root))
        except Exception:
            rel = str(fp)
        items.append((rel, st.st_size, st.st_mtime_ns))
    items.sort()
    return {
        "files_total": len(items),
        "fingerprint": stable_hash_obj(items),
        "sample_head": items[:5],
        "sample_tail": items[-5:],
    }


def build_latest_date_index_from_raw(files: list[Path]) -> tuple[dict[str, str], dict[str, Any]]:
    latest: dict[str, str] = {}
    stats = {"files_scanned": 0, "rows_scanned": 0, "assets_seen": 0}
    for fp in files:
        pf = pq.ParquetFile(fp)
        tbl = pf.read(columns=["asset_id", "date"])
        data = tbl.to_pydict()
        aids = data.get("asset_id") or []
        dates = data.get("date") or []
        stats["files_scanned"] += 1
        stats["rows_scanned"] += len(aids)
        for aid, d in zip(aids, dates):
            if not aid or not d:
                continue
            d = str(d)
            prev = latest.get(aid)
            if prev is None or d > prev:
                latest[aid] = d
    stats["assets_seen"] = len(latest)
    return latest, stats


def load_or_build_latest_date_cache(
    cache_path: Path,
    raw_provider_root: Path,
    files: list[Path],
    rebuild: bool = False,
) -> tuple[dict[str, str], dict[str, Any]]:
    fp = raw_files_fingerprint(files, raw_provider_root)
    if not rebuild:
        cached = load_json(cache_path, {})
        if cached and cached.get("fingerprint") == fp["fingerprint"]:
            latest = {str(k): str(v) for k, v in (cached.get("latest_dates") or {}).items()}
            return latest, {
                "enabled": True,
                "status": "hit",
                "cache_path": str(cache_path),
                "files_total": fp["files_total"],
                "assets_total": len(latest),
                "fingerprint": fp["fingerprint"],
            }

    latest, stats = build_latest_date_index_from_raw(files)
    payload = {
        "schema": "q1_daily_delta_latest_date_cache_v1",
        "generated_at": utc_now_iso(),
        "raw_provider_root": str(raw_provider_root),
        **fp,
        "stats": stats,
        "latest_dates": latest,
    }
    atomic_write_json(cache_path, payload)
    return latest, {
        "enabled": True,
        "status": "rebuilt",
        "cache_path": str(cache_path),
        "files_total": fp["files_total"],
        "assets_total": len(latest),
        "fingerprint": fp["fingerprint"],
        "rows_scanned": stats["rows_scanned"],
    }


def load_or_build_pack_state_cache(
    cache_path: Path,
    repo_root: Path,
    rel_packs: list[str],
    force_full_scan: bool = False,
) -> tuple[dict[str, tuple[int, int]], list[str], dict[str, Any]]:
    """
    Returns:
    - current_map: rel_pack -> (size_bytes, mtime_ns)
    - changed_packs: subset that are new/changed vs cache
    - cache_meta
    """
    prev = {} if force_full_scan else load_json(cache_path, {})
    prev_map = {str(k): tuple(v) for k, v in (prev.get("packs") or {}).items() if isinstance(v, list) and len(v) == 2}
    current: dict[str, tuple[int, int]] = {}
    changed: list[str] = []
    missing = 0
    for rel_pack in rel_packs:
        abs_pack = (repo_root / "mirrors/universe-v7" / rel_pack).resolve()
        if not abs_pack.exists():
            missing += 1
            continue
        st = abs_pack.stat()
        cur = (int(st.st_size), int(st.st_mtime_ns))
        current[rel_pack] = cur
        if force_full_scan or prev_map.get(rel_pack) != cur:
            changed.append(rel_pack)
    payload = {
        "schema": "q1_daily_delta_pack_state_cache_v1",
        "generated_at": utc_now_iso(),
        "repo_root": str(repo_root),
        "packs": {k: [v[0], v[1]] for k, v in current.items()},
        "counts": {"packs_total": len(rel_packs), "packs_present": len(current), "packs_changed": len(changed), "packs_missing": missing},
    }
    atomic_write_json(cache_path, payload)
    return current, changed, {
        "enabled": True,
        "status": "rebuilt" if force_full_scan or not prev_map else "updated",
        "cache_path": str(cache_path),
        "packs_total": len(rel_packs),
        "packs_present": len(current),
        "packs_changed": len(changed),
        "packs_missing": missing,
    }


def filter_rows_newer_than_latest(
    rows: Dict[str, List],
    latest_date_by_asset: dict[str, str],
    emitted_keys_seen: set[tuple[str, str]],
) -> tuple[Dict[str, List], dict[str, Any]]:
    if not rows or not rows.get("asset_id"):
        return rows, {
            "rows_in": 0,
            "rows_out": 0,
            "rows_skipped_old_or_known": 0,
            "rows_skipped_duplicate_in_run": 0,
            "rows_invalid": 0,
        }
    n = len(rows["asset_id"])
    keep_idx = []
    old_or_known = 0
    dup_in_run = 0
    invalid = 0
    for i in range(n):
        aid = rows["asset_id"][i]
        d = rows["date"][i]
        if not aid or not d:
            invalid += 1
            continue
        d = str(d)
        last = latest_date_by_asset.get(aid)
        if last is not None and d <= last:
            old_or_known += 1
            continue
        key = (aid, d)
        if key in emitted_keys_seen:
            dup_in_run += 1
            continue
        emitted_keys_seen.add(key)
        keep_idx.append(i)

    out = {k: [v[i] for i in keep_idx] for k, v in rows.items()}
    return out, {
        "rows_in": n,
        "rows_out": len(keep_idx),
        "rows_skipped_old_or_known": old_or_known,
        "rows_skipped_duplicate_in_run": dup_in_run,
        "rows_invalid": invalid,
    }


def write_parquet_rows(out_path: Path, rows: Dict[str, List], compression: str = "snappy") -> int:
    if not rows or not rows.get("asset_id"):
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
    quant_root = Path(args.quant_root).resolve()
    registry_path = (repo_root / args.registry).resolve()
    include_types = {x.strip().upper() for x in args.include_types.split(",") if x.strip()}
    include_asset_classes = {t.lower() for t in ["stock", "etf"] if t.upper() in include_types}

    if not quant_root.exists():
        print(f"FATAL: quant root not found: {quant_root}", file=sys.stderr)
        return 2
    if not registry_path.exists():
        print(f"FATAL: registry not found: {registry_path}", file=sys.stderr)
        return 2

    exporter = _load_exporter_module(repo_root)

    job_name = args.job_name.strip() or f"q1_daily_delta_{args.ingest_date.replace('-', '')}"
    job_root = quant_root / "jobs" / job_name
    lock_path: Path | None = None
    try:
        lock_path = acquire_job_lock(job_root)
    except RuntimeError as exc:
        print(f"FATAL: {exc}", file=sys.stderr)
        return 3

    run_id = f"q1delta_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_status_path = run_root / "q1_daily_delta_ingest_run_status.json"
    state_path = job_root / "state.json"
    manifest_path = job_root / "manifest.json"
    packs_manifest_path = job_root / "packs_manifest.ndjson"
    raw_provider_root = quant_root / "data" / "raw" / "provider=EODHD"
    raw_ingest_root = raw_provider_root / f"ingest_date={args.ingest_date}"

    latest_date_cache_path = _resolve_quant_rel(quant_root, args.latest_date_cache_path)
    pack_state_cache_path = _resolve_quant_rel(quant_root, args.pack_state_cache_path)

    state = load_json(state_path, {
        "schema": "q1_daily_delta_ingest_state_v1",
        "started_at": utc_now_iso(),
        "updated_at": None,
        "repo_root": str(repo_root),
        "quant_root": str(quant_root),
        "registry_path": str(registry_path),
        "ingest_date": args.ingest_date,
        "include_types": sorted(include_types),
        "completed_packs": [],
        "failed_packs": {},
        "stats": {
            "candidate_packs_total": 0,
            "selected_packs_total": 0,
            "packs_done": 0,
            "packs_failed": 0,
            "bars_rows_scanned_in_selected_packs": 0,
            "bars_rows_emitted_delta": 0,
            "assets_emitted_delta": 0,
            "rows_skipped_old_or_known": 0,
            "rows_skipped_duplicate_in_run": 0,
        },
    })
    completed_packs = set(state.get("completed_packs") or [])
    failed_packs = dict(state.get("failed_packs") or {})

    def write_run_status(ok: bool | None = None, exit_code: int | None = None, reason: str | None = None, stage: str | None = None, extra: dict[str, Any] | None = None):
        payload = {
            "schema": "quant_q1_daily_delta_ingest_run_status_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "job_name": job_name,
            "ok": ok,
            "exit_code": exit_code,
            "reason": reason,
            "stage": stage,
            "paths": {
                "state": str(state_path),
                "manifest": str(manifest_path),
                "packs_manifest": str(packs_manifest_path),
                "raw_ingest_root": str(raw_ingest_root),
            },
            "stats": state.get("stats", {}),
            "extra": extra or {},
        }
        atomic_write_json(run_status_path, payload)

    if not packs_manifest_path.exists():
        packs_manifest_path.parent.mkdir(parents=True, exist_ok=True)
        packs_manifest_path.write_text("")

    try:
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
        write_run_status(stage="bootstrap", extra={"host": socket.gethostname()})

        # 1) registry index -> pack map
        asset_meta, pack_to_assets, reg_stats = exporter.build_registry_index(registry_path, include_types)
        rel_packs_all = sorted(pack_to_assets.keys())
        state["registry_stats"] = reg_stats
        state["stats"]["candidate_packs_total"] = len(rel_packs_all)

        # 2) pack change detection
        _, changed_packs, pack_cache_meta = load_or_build_pack_state_cache(
            pack_state_cache_path, repo_root, rel_packs_all, force_full_scan=bool(args.full_scan_packs)
        )
        selected_packs = changed_packs
        if args.force_pack:
            force = set(args.force_pack)
            selected_packs = [p for p in rel_packs_all if p in force]
        if args.limit_packs and args.limit_packs > 0:
            selected_packs = selected_packs[: args.limit_packs]
        state["pack_state_cache"] = pack_cache_meta
        state["stats"]["selected_packs_total"] = len(selected_packs)
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
        write_run_status(stage="indexed_registry_and_packs", extra={"pack_state_cache": pack_cache_meta})

        # 3) latest-date index from current raw parquet
        raw_files = list_raw_parquet_files(raw_provider_root, include_asset_classes)
        latest_date_by_asset, latest_cache_meta = load_or_build_latest_date_cache(
            latest_date_cache_path, raw_provider_root, raw_files, rebuild=bool(args.rebuild_latest_date_cache)
        )
        state["latest_date_cache"] = latest_cache_meta
        state["raw_files_total"] = len(raw_files)
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
        write_run_status(stage="built_latest_date_index", extra={"latest_date_cache": latest_cache_meta, "raw_files_total": len(raw_files)})

        emitted_keys_seen: set[tuple[str, str]] = set()
        emitted_assets: set[str] = set()
        max_emitted_rows = int(args.max_emitted_rows or 0)

        # 4) process selected changed packs
        for idx, rel_pack in enumerate(selected_packs, start=1):
            if rel_pack in completed_packs:
                continue
            wanted_assets = pack_to_assets.get(rel_pack) or set()
            pack_abs = (repo_root / "mirrors/universe-v7" / rel_pack).resolve()
            if not pack_abs.exists():
                failed_packs[rel_pack] = {"error": "pack_missing", "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                continue

            started = time.time()
            try:
                rows_by_class, per_pack_stats = exporter.flatten_rows_for_pack(pack_abs, rel_pack, wanted_assets, asset_meta)
                state["stats"]["bars_rows_scanned_in_selected_packs"] += int(per_pack_stats.get("bars_written", 0))
                pack_key = exporter.rel_to_pack_key(rel_pack)
                outputs = []
                filter_stats_total = defaultdict(int)

                for asset_class, rows in rows_by_class.items():
                    filtered, fstats = filter_rows_newer_than_latest(rows, latest_date_by_asset, emitted_keys_seen)
                    for k, v in fstats.items():
                        filter_stats_total[k] += int(v)
                    if not filtered.get("asset_id"):
                        continue
                    for aid in filtered["asset_id"]:
                        emitted_assets.add(aid)
                    out_path = raw_ingest_root / f"asset_class={asset_class}" / f"delta_{pack_key}.parquet"
                    n = write_parquet_rows(out_path, filtered, compression=args.compression)
                    if n > 0:
                        outputs.append({"asset_class": asset_class, "path": str(out_path), "rows": n})

                event = {
                    "ts": utc_now_iso(),
                    "rel_pack": rel_pack,
                    "pack_key": pack_key,
                    "duration_sec": round(time.time() - started, 3),
                    "targets": len(wanted_assets),
                    "stats": per_pack_stats,
                    "filter_stats": dict(filter_stats_total),
                    "outputs": outputs,
                }
                with packs_manifest_path.open("a", encoding="utf-8") as outfh:
                    outfh.write(json.dumps(event, ensure_ascii=False) + "\n")

                state["stats"]["bars_rows_emitted_delta"] += sum(int(o["rows"]) for o in outputs)
                state["stats"]["rows_skipped_old_or_known"] += int(filter_stats_total.get("rows_skipped_old_or_known", 0))
                state["stats"]["rows_skipped_duplicate_in_run"] += int(filter_stats_total.get("rows_skipped_duplicate_in_run", 0))
                state["stats"]["assets_emitted_delta"] = len(emitted_assets)
                completed_packs.add(rel_pack)
                state["completed_packs"] = sorted(completed_packs)
                state["stats"]["packs_done"] = len(completed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)

                if max_emitted_rows and state["stats"]["bars_rows_emitted_delta"] >= max_emitted_rows:
                    break

            except KeyboardInterrupt:
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                write_run_status(ok=False, exit_code=130, reason="interrupted", stage="process_packs")
                return 130
            except Exception as exc:
                failed_packs[rel_pack] = {"error": str(exc), "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)

        # 5) reconciliation (basic)
        reconciliation = {
            "duplicate_keys_in_emitted_delta_detected": False,  # guarded by emitted_keys_seen set
            "emitted_delta_keys_total": len(emitted_keys_seen),
            "rows_emitted_matches_keys": int(state["stats"]["bars_rows_emitted_delta"]) == len(emitted_keys_seen),
            "rows_emitted_delta": int(state["stats"]["bars_rows_emitted_delta"]),
            "assets_emitted_delta": int(state["stats"]["assets_emitted_delta"]),
            "rows_skipped_old_or_known": int(state["stats"]["rows_skipped_old_or_known"]),
            "rows_skipped_duplicate_in_run": int(state["stats"]["rows_skipped_duplicate_in_run"]),
        }

        manifest = {
            "schema": "q1_daily_delta_ingest_manifest_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "job_name": job_name,
            "repo_root": str(repo_root),
            "quant_root": str(quant_root),
            "registry_path": str(registry_path),
            "ingest_date": args.ingest_date,
            "include_types": sorted(include_types),
            "raw_ingest_root": str(raw_ingest_root),
            "state_path": str(state_path),
            "packs_manifest_path": str(packs_manifest_path),
            "latest_date_cache_path": str(latest_date_cache_path),
            "pack_state_cache_path": str(pack_state_cache_path),
            "registry_stats": reg_stats,
            "pack_state_cache": state.get("pack_state_cache", {}),
            "latest_date_cache": state.get("latest_date_cache", {}),
            "stats": state.get("stats", {}),
            "reconciliation": reconciliation,
            "artifacts": {
                "run_status": str(run_status_path),
                "run_root": str(run_root),
            },
        }
        atomic_write_json(manifest_path, manifest)

        # refresh latest success pointer for orchestration
        latest_ptr = quant_root / "ops" / "q1_daily_delta_ingest" / "latest_success.json"
        atomic_write_json(latest_ptr, {
            "schema": "q1_daily_delta_ingest_latest_success_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "job_name": job_name,
            "ingest_date": args.ingest_date,
            "manifest_path": str(manifest_path),
            "run_status_path": str(run_status_path),
            "stats": state.get("stats", {}),
            "reconciliation": reconciliation,
        })

        exit_code = 0 if not failed_packs else 1
        reason = "ok" if exit_code == 0 else "pack_failures_present"
        write_run_status(ok=(exit_code == 0), exit_code=exit_code, reason=reason, stage="completed", extra={
            "manifest_path": str(manifest_path),
            "reconciliation": reconciliation,
        })

        print(
            f"[q1-delta] done: selected_packs={state['stats']['selected_packs_total']} "
            f"packs_done={state['stats']['packs_done']} failed={state['stats']['packs_failed']} "
            f"rows_emitted_delta={state['stats']['bars_rows_emitted_delta']} assets_emitted_delta={state['stats']['assets_emitted_delta']}"
        )
        print(f"[q1-delta] manifest: {manifest_path}")
        print(f"run_id={run_id}")
        print(f"manifest={manifest_path}")
        print(f"status={run_status_path}")
        return exit_code
    finally:
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
