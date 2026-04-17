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
    p.add_argument(
        "--quant-root",
        default=os.environ.get(
            "QUANT_ROOT",
            "/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab" if Path("/volume1/homes/neoboy").exists()
            else "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab",
        ),
    )
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--compression", default="snappy")
    p.add_argument("--limit-packs", type=int, default=0)
    p.add_argument("--force-pack", action="append", default=[])
    p.add_argument(
        "--force-pack-file",
        action="append",
        default=[],
        help="Optional newline-delimited rel_pack file(s); merged with --force-pack.",
    )
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
    p.add_argument(
        "--history-touch-report",
        default="mirrors/universe-v7/reports/history_touch_report.json",
        help="Optional v7 report with touched canonical_ids/history packs from latest backfill run",
    )
    p.add_argument("--rebuild-latest-date-cache", action="store_true")
    p.add_argument("--full-scan-packs", action="store_true", help="Ignore pack mtime cache and scan all packs")
    p.add_argument("--max-emitted-rows", type=int, default=0, help="Optional safety stop for smoke tests")
    p.add_argument(
        "--slow-pack-warn-sec",
        type=float,
        default=900.0,
        help="Record a slow-pack warning in state when a single pack exceeds this duration.",
    )
    p.add_argument("--expect-nonzero-delta", action="store_true", help="Fail run if emitted delta rows are zero")
    p.add_argument("--expect-min-emitted-rows", type=int, default=0, help="Fail run if emitted rows are below this value")
    p.add_argument(
        "--max-future-date-rows",
        type=int,
        default=-1,
        help="If >=0, fail run when rows with date > ingest_date exceed this value",
    )
    p.add_argument(
        "--max-invalid-rows",
        type=int,
        default=-1,
        help="If >=0, fail run when invalid rows exceed this value",
    )
    p.add_argument(
        "--max-failed-pack-ratio",
        type=float,
        default=-1.0,
        help="If >=0, fail run when failed/selected pack ratio exceeds this threshold",
    )
    p.add_argument(
        "--max-invalid-row-ratio",
        type=float,
        default=-1.0,
        help="If >=0, fail run when invalid_rows / rows_filter_input_total exceeds this threshold",
    )
    p.add_argument(
        "--require-row-accounting-balanced",
        action="store_true",
        default=True,
        help="Fail run if rows_in != rows_out+skipped+invalid",
    )
    p.add_argument(
        "--skip-require-row-accounting-balanced",
        dest="require_row_accounting_balanced",
        action="store_false",
    )
    return p.parse_args(list(argv))


def _load_force_packs(args: argparse.Namespace) -> set[str]:
    force_packs = {str(item).strip() for item in (args.force_pack or []) if str(item).strip()}
    for raw_path in (args.force_pack_file or []):
        path = Path(str(raw_path)).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(f"force-pack-file not found: {path}")
        for line in path.read_text(encoding="utf-8").splitlines():
            rel_pack = str(line).strip()
            if rel_pack:
                force_packs.add(rel_pack)
    return force_packs


def _resolve_quant_rel(quant_root: Path, p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else (quant_root / path)


def _resolve_repo_rel(repo_root: Path, p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else (repo_root / path)


def _history_pack_path(repo_root: Path, rel_pack: str) -> Path:
    # Local Mac storage can be mounted either as mirrors/universe-v7/<rel_pack>
    # or under the history symlink target as mirrors/universe-v7/history/<rel_pack>.
    primary = repo_root / "mirrors/universe-v7" / rel_pack
    if primary.exists():
        return primary
    fallback = repo_root / "mirrors/universe-v7" / "history" / rel_pack
    if fallback.exists():
        return fallback
    return primary


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


def build_registry_pack_sha_index(registry_path: Path, include_types: set[str]) -> tuple[dict[str, str], dict[str, Any]]:
    pack_sha: dict[str, str] = {}
    rows_total = 0
    rows_selected = 0
    missing_pack_sha = 0
    conflicting_pack_sha = 0
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
            type_norm = str(obj.get("type_norm") or "").upper()
            if type_norm not in include_types:
                continue
            rel_pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
            if not rel_pack:
                continue
            rows_selected += 1
            sha = str(((obj.get("pointers") or {}).get("pack_sha256")) or "").strip()
            if not sha:
                missing_pack_sha += 1
                continue
            prev = pack_sha.get(rel_pack)
            if prev and prev != sha:
                conflicting_pack_sha += 1
                continue
            pack_sha[rel_pack] = sha
    return pack_sha, {
        "rows_total": rows_total,
        "rows_selected": rows_selected,
        "packs_with_sha": len(pack_sha),
        "missing_pack_sha_rows": missing_pack_sha,
        "conflicting_pack_sha_rows": conflicting_pack_sha,
    }


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
    registry_path: Path | None = None,
    registry_pack_sha: dict[str, str] | None = None,
    force_full_scan: bool = False,
    commit_cache: bool = True,
) -> tuple[dict[str, tuple[int, int]], list[str], dict[str, Any]]:
    """
    Returns:
    - current_map: rel_pack -> (size_bytes, mtime_ns)
    - changed_packs: subset that are new/changed vs cache
    - cache_meta
    """
    prev = {} if force_full_scan else load_json(cache_path, {})
    prev_map = {str(k): tuple(v) for k, v in (prev.get("packs") or {}).items() if isinstance(v, list) and len(v) == 2}
    prev_sha = {str(k): str(v) for k, v in (prev.get("registry_pack_sha") or {}).items() if v}
    prev_counts = prev.get("counts") or {}
    cache_mtime_ns = 0
    try:
        cache_mtime_ns = int(cache_path.stat().st_mtime_ns)
    except Exception:
        cache_mtime_ns = 0
    registry_mtime_ns = 0
    if registry_path is not None:
        try:
            registry_mtime_ns = int(registry_path.stat().st_mtime_ns)
        except Exception:
            registry_mtime_ns = 0

    rel_packs_hash = stable_hash_obj(rel_packs)
    sha_mode_requested = bool(registry_pack_sha) and not force_full_scan
    sha_missing = 0

    if sha_mode_requested and prev_map:
        sha_missing = sum(1 for rel_pack in rel_packs if not registry_pack_sha.get(rel_pack))
        # Fast migration path from older cache payloads: if the cache is newer than the
        # registry and covers the full current pack set, trust it once and seed sha mode.
        can_migrate_without_rescan = (
            not prev_sha
            and int(prev_counts.get("packs_present") or 0) == len(rel_packs)
            and len(prev_map) == len(rel_packs)
            and cache_mtime_ns > 0
            and registry_mtime_ns > 0
            and cache_mtime_ns >= registry_mtime_ns
        )
        if can_migrate_without_rescan:
            payload = {
                "schema": "q1_daily_delta_pack_state_cache_v1",
                "generated_at": utc_now_iso(),
                "repo_root": str(repo_root),
                "rel_packs_hash": rel_packs_hash,
                "packs": {k: [int(v[0]), int(v[1])] for k, v in prev_map.items()},
                "registry_pack_sha": {k: str(v) for k, v in registry_pack_sha.items() if v},
                "counts": {
                    "packs_total": len(rel_packs),
                    "packs_present": len(prev_map),
                    "packs_changed": 0,
                    "packs_missing": 0,
                    "registry_pack_sha_missing": sha_missing,
                },
            }
            if commit_cache:
                atomic_write_json(cache_path, payload)
            return prev_map, [], {
                "enabled": True,
                "status": "migrated_registry_sha_fast",
                "cache_path": str(cache_path),
                "cache_commit": bool(commit_cache),
                "packs_total": len(rel_packs),
                "packs_present": len(prev_map),
                "packs_changed": 0,
                "packs_missing": 0,
                "registry_pack_sha_missing": sha_missing,
                "rel_packs_hash": rel_packs_hash,
            }

        if prev_sha:
            stat_targets = [rel_pack for rel_pack in rel_packs if prev_sha.get(rel_pack) != registry_pack_sha.get(rel_pack) or rel_pack not in prev_map]
            current: dict[str, tuple[int, int]] = {
                rel_pack: prev_map[rel_pack] for rel_pack in rel_packs if rel_pack in prev_map and rel_pack not in stat_targets
            }
            changed: list[str] = []
            missing = 0
            for rel_pack in stat_targets:
                abs_pack = _history_pack_path(repo_root, rel_pack)
                try:
                    st = abs_pack.stat()
                except FileNotFoundError:
                    missing += 1
                    changed.append(rel_pack)
                    continue
                current[rel_pack] = (int(st.st_size), int(st.st_mtime_ns))
                changed.append(rel_pack)
            payload = {
                "schema": "q1_daily_delta_pack_state_cache_v1",
                "generated_at": utc_now_iso(),
                "repo_root": str(repo_root),
                "rel_packs_hash": rel_packs_hash,
                "packs": {k: [int(v[0]), int(v[1])] for k, v in current.items()},
                "registry_pack_sha": {k: str(v) for k, v in registry_pack_sha.items() if v},
                "counts": {
                    "packs_total": len(rel_packs),
                    "packs_present": len(current),
                    "packs_changed": len(changed),
                    "packs_missing": missing,
                    "registry_pack_sha_missing": sha_missing,
                },
            }
            if commit_cache:
                atomic_write_json(cache_path, payload)
            return current, changed, {
                "enabled": True,
                "status": "registry_sha_fast" if not stat_targets else "registry_sha_partial_stat",
                "cache_path": str(cache_path),
                "cache_commit": bool(commit_cache),
                "packs_total": len(rel_packs),
                "packs_present": len(current),
                "packs_changed": len(changed),
                "packs_missing": missing,
                "registry_pack_sha_missing": sha_missing,
                "rel_packs_hash": rel_packs_hash,
            }

    current: dict[str, tuple[int, int]] = {}
    changed: list[str] = []
    missing = 0
    for rel_pack in rel_packs:
        abs_pack = _history_pack_path(repo_root, rel_pack)
        try:
            st = abs_pack.stat()
        except FileNotFoundError:
            missing += 1
            continue
        cur = (int(st.st_size), int(st.st_mtime_ns))
        current[rel_pack] = cur
        if force_full_scan or prev_map.get(rel_pack) != cur:
            changed.append(rel_pack)
    payload = {
        "schema": "q1_daily_delta_pack_state_cache_v1",
        "generated_at": utc_now_iso(),
        "repo_root": str(repo_root),
        "rel_packs_hash": rel_packs_hash,
        "packs": {k: [v[0], v[1]] for k, v in current.items()},
        "registry_pack_sha": {k: str(v) for k, v in (registry_pack_sha or {}).items() if v},
        "counts": {
            "packs_total": len(rel_packs),
            "packs_present": len(current),
            "packs_changed": len(changed),
            "packs_missing": missing,
            "registry_pack_sha_missing": sha_missing,
        },
    }
    if commit_cache:
        atomic_write_json(cache_path, payload)
    return current, changed, {
        "enabled": True,
        "status": "rebuilt" if force_full_scan or not prev_map else "updated_stat_scan",
        "cache_path": str(cache_path),
        "cache_commit": bool(commit_cache),
        "packs_total": len(rel_packs),
        "packs_present": len(current),
        "packs_changed": len(changed),
        "packs_missing": missing,
        "registry_pack_sha_missing": sha_missing,
        "rel_packs_hash": rel_packs_hash,
    }


def load_history_touch_report(
    report_path: Path,
    include_types: set[str],
    *,
    newer_than_mtime_ns: int = 0,
) -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], dict[str, Any], dict[str, Any]]:
    if not report_path.exists():
        return {}, {}, {}, {"enabled": False, "status": "missing", "report_path": str(report_path)}
    try:
        report_mtime_ns = int(report_path.stat().st_mtime_ns)
    except Exception:
        report_mtime_ns = 0
    if newer_than_mtime_ns > 0 and report_mtime_ns <= newer_than_mtime_ns:
        return {}, {}, {}, {
            "enabled": True,
            "status": "stale_vs_pack_state_cache",
            "report_path": str(report_path),
            "report_mtime_ns": report_mtime_ns,
            "newer_than_mtime_ns": newer_than_mtime_ns,
        }

    report = load_json(report_path, {})
    entries = report.get("entries") or []
    asset_meta: dict[str, dict[str, Any]] = {}
    pack_to_assets: dict[str, set[str]] = defaultdict(set)
    entries_selected = 0
    entries_skipped_type = 0
    for entry in entries:
        type_norm = str(entry.get("type_norm") or "").upper()
        if type_norm not in include_types:
            entries_skipped_type += 1
            continue
        canonical_id = str(entry.get("canonical_id") or "").strip()
        rel_pack = str(entry.get("history_pack") or "").strip()
        if not canonical_id or not rel_pack:
            continue
        entries_selected += 1
        asset_meta[canonical_id] = {
            "asset_id": canonical_id,
            "symbol": str(entry.get("symbol") or ""),
            "exchange": str(entry.get("exchange") or ""),
            "currency": str(entry.get("currency") or ""),
            "type_norm": type_norm,
            "provider_symbol": str(entry.get("provider_symbol") or entry.get("symbol") or ""),
            "country": str(entry.get("country") or ""),
            "history_pack": rel_pack,
            "pack_sha256": str(entry.get("pack_sha256") or "").strip() or None,
        }
        pack_to_assets[rel_pack].add(canonical_id)

    return asset_meta, pack_to_assets, report, {
        "enabled": True,
        "status": "loaded",
        "report_path": str(report_path),
        "report_mtime_ns": report_mtime_ns,
        "entries_total": len(entries),
        "entries_selected": entries_selected,
        "entries_skipped_type": entries_skipped_type,
        "packs_selected": len(pack_to_assets),
        "run_id": report.get("run_id"),
        "generated_at": report.get("generated_at"),
    }


def filter_rows_newer_than_latest(
    rows: Dict[str, List],
    latest_date_by_asset: dict[str, str],
    emitted_keys_seen: set[tuple[str, str]],
    *,
    max_allowed_date: str,
) -> tuple[Dict[str, List], dict[str, Any]]:
    if not rows or not rows.get("asset_id"):
        return rows, {
            "rows_in": 0,
            "rows_out": 0,
            "rows_skipped_old_or_known": 0,
            "rows_skipped_duplicate_in_run": 0,
            "rows_invalid": 0,
            "rows_future_date": 0,
            "rows_invalid_identity_or_date": 0,
            "rows_invalid_ohlc": 0,
            "rows_invalid_volume": 0,
        }
    n = len(rows["asset_id"])
    keep_idx = []
    old_or_known = 0
    dup_in_run = 0
    invalid = 0
    invalid_identity_or_date = 0
    invalid_ohlc = 0
    invalid_volume = 0
    future_date = 0

    def _is_finite(x: object) -> bool:
        try:
            f = float(x)
            return f == f and f not in (float("inf"), float("-inf"))
        except Exception:
            return False

    for i in range(n):
        aid = rows["asset_id"][i]
        d = rows["date"][i]
        if not aid or not d:
            invalid += 1
            invalid_identity_or_date += 1
            continue
        d = str(d)
        if max_allowed_date and d > max_allowed_date:
            invalid += 1
            future_date += 1
            continue

        o = rows.get("open_raw", [None] * n)[i]
        h = rows.get("high_raw", [None] * n)[i]
        l = rows.get("low_raw", [None] * n)[i]
        c = rows.get("close_raw", [None] * n)[i]
        v = rows.get("volume_raw", [None] * n)[i]

        if not (_is_finite(o) and _is_finite(h) and _is_finite(l) and _is_finite(c)):
            invalid += 1
            invalid_ohlc += 1
            continue
        of = float(o)
        hf = float(h)
        lf = float(l)
        cf = float(c)
        if of < 0 or hf < 0 or lf < 0 or cf < 0 or hf < lf:
            invalid += 1
            invalid_ohlc += 1
            continue
        if not _is_finite(v):
            invalid += 1
            invalid_volume += 1
            continue
        vf = float(v)
        if vf < 0:
            invalid += 1
            invalid_volume += 1
            continue

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
        "rows_future_date": future_date,
        "rows_invalid_identity_or_date": invalid_identity_or_date,
        "rows_invalid_ohlc": invalid_ohlc,
        "rows_invalid_volume": invalid_volume,
    }


def flatten_delta_rows_for_pack(
    pack_path: Path,
    rel_pack: str,
    wanted_assets: set[str],
    asset_meta: dict[str, Any],
    latest_date_by_asset: dict[str, str],
    emitted_keys_seen: set[tuple[str, str]],
    *,
    max_allowed_date: str,
    exporter: Any,
) -> tuple[dict[str, dict[str, list[Any]]], dict[str, Any], dict[str, int]]:
    rows_by_class: dict[str, dict[str, list[Any]]] = {}
    per_pack_stats = {
        "records_seen": 0,
        "records_matched": 0,
        "bars_written": 0,
        "assets_emitted": 0,
        "missing_targets_in_pack": 0,
    }
    filter_stats = defaultdict(int)
    seen_assets: set[str] = set()

    def ensure_bucket(asset_class: str) -> dict[str, list[Any]]:
        if asset_class in rows_by_class:
            return rows_by_class[asset_class]
        rows_by_class[asset_class] = {k: [] for k in [
            "asset_id", "date", "asset_class", "exchange", "symbol", "provider_symbol",
            "currency", "country", "provider", "is_trading_day", "data_quality_flag",
            "source_pack_rel", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw",
            "adjusted_close_raw"
        ]}
        return rows_by_class[asset_class]

    def is_finite(value: object) -> bool:
        try:
            f = float(value)
            return f == f and f not in (float("inf"), float("-inf"))
        except Exception:
            return False

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
            asset_class = exporter.sanitize_type_norm(meta.type_norm)
            out = ensure_bucket(asset_class)
            for bar in rec.get("bars") or []:
                per_pack_stats["bars_written"] += 1
                filter_stats["rows_in"] += 1

                d = str(bar.get("date") or "").strip()
                if not d:
                    filter_stats["rows_invalid"] += 1
                    filter_stats["rows_invalid_identity_or_date"] += 1
                    continue
                if max_allowed_date and d > max_allowed_date:
                    filter_stats["rows_invalid"] += 1
                    filter_stats["rows_future_date"] += 1
                    continue

                o = bar.get("open")
                h = bar.get("high")
                l = bar.get("low")
                c = bar.get("close")
                v = bar.get("volume")
                if not (is_finite(o) and is_finite(h) and is_finite(l) and is_finite(c)):
                    filter_stats["rows_invalid"] += 1
                    filter_stats["rows_invalid_ohlc"] += 1
                    continue
                of = float(o)
                hf = float(h)
                lf = float(l)
                cf = float(c)
                if of < 0 or hf < 0 or lf < 0 or cf < 0 or hf < lf:
                    filter_stats["rows_invalid"] += 1
                    filter_stats["rows_invalid_ohlc"] += 1
                    continue
                if not is_finite(v) or float(v) < 0:
                    filter_stats["rows_invalid"] += 1
                    filter_stats["rows_invalid_volume"] += 1
                    continue

                last = latest_date_by_asset.get(cid)
                if last is not None and d <= last:
                    filter_stats["rows_skipped_old_or_known"] += 1
                    continue
                key = (cid, d)
                if key in emitted_keys_seen:
                    filter_stats["rows_skipped_duplicate_in_run"] += 1
                    continue
                emitted_keys_seen.add(key)

                out["asset_id"].append(meta.asset_id)
                out["date"].append(d)
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
                out["open_raw"].append(o)
                out["high_raw"].append(h)
                out["low_raw"].append(l)
                out["close_raw"].append(c)
                out["volume_raw"].append(v)
                out["adjusted_close_raw"].append(bar.get("adjusted_close"))
                filter_stats["rows_out"] += 1

    per_pack_stats["assets_emitted"] = len(seen_assets)
    per_pack_stats["missing_targets_in_pack"] = max(0, len(wanted_assets) - len(seen_assets))
    for key in [
        "rows_in", "rows_out", "rows_skipped_old_or_known", "rows_skipped_duplicate_in_run",
        "rows_invalid", "rows_future_date", "rows_invalid_identity_or_date",
        "rows_invalid_ohlc", "rows_invalid_volume",
    ]:
        filter_stats[key] += 0
    return rows_by_class, per_pack_stats, dict(filter_stats)


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
            "rows_filter_input_total": 0,
            "bars_rows_emitted_delta": 0,
            "assets_emitted_delta": 0,
            "rows_skipped_old_or_known": 0,
            "rows_skipped_duplicate_in_run": 0,
            "rows_invalid": 0,
            "rows_future_date": 0,
            "rows_invalid_identity_or_date": 0,
            "rows_invalid_ohlc": 0,
            "rows_invalid_volume": 0,
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

        stats_baseline = {
            "rows_filter_input_total": int((state.get("stats") or {}).get("rows_filter_input_total") or 0),
            "bars_rows_emitted_delta": int((state.get("stats") or {}).get("bars_rows_emitted_delta") or 0),
            "rows_skipped_old_or_known": int((state.get("stats") or {}).get("rows_skipped_old_or_known") or 0),
            "rows_skipped_duplicate_in_run": int((state.get("stats") or {}).get("rows_skipped_duplicate_in_run") or 0),
            "rows_invalid": int((state.get("stats") or {}).get("rows_invalid") or 0),
            "rows_future_date": int((state.get("stats") or {}).get("rows_future_date") or 0),
            "rows_invalid_identity_or_date": int((state.get("stats") or {}).get("rows_invalid_identity_or_date") or 0),
            "rows_invalid_ohlc": int((state.get("stats") or {}).get("rows_invalid_ohlc") or 0),
            "rows_invalid_volume": int((state.get("stats") or {}).get("rows_invalid_volume") or 0),
            "packs_failed": int((state.get("stats") or {}).get("packs_failed") or 0),
        }

        # 1) registry index -> pack map
        asset_meta, pack_to_assets, reg_stats = exporter.build_registry_index(registry_path, include_types)
        rel_packs_all = sorted(pack_to_assets.keys())
        registry_pack_sha, registry_pack_sha_stats = build_registry_pack_sha_index(registry_path, include_types)
        state["registry_stats"] = reg_stats
        state["registry_pack_sha_stats"] = registry_pack_sha_stats
        state["stats"]["candidate_packs_total"] = len(rel_packs_all)

        # 2) pack change detection
        pack_cache_mtime_before_ns = int(pack_state_cache_path.stat().st_mtime_ns) if pack_state_cache_path.exists() else 0
        _, changed_packs, pack_cache_meta = load_or_build_pack_state_cache(
            pack_state_cache_path,
            repo_root,
            rel_packs_all,
            registry_path=registry_path,
            registry_pack_sha=registry_pack_sha,
            force_full_scan=bool(args.full_scan_packs),
            commit_cache=not bool(args.full_scan_packs),
        )
        selected_packs = changed_packs
        force_packs = _load_force_packs(args)
        if force_packs:
            force = set(force_packs)
            selected_packs = [p for p in rel_packs_all if p in force]
        if args.limit_packs and args.limit_packs > 0:
            selected_packs = selected_packs[: args.limit_packs]
        state["pack_state_cache"] = pack_cache_meta
        history_touch_report_path = _resolve_repo_rel(repo_root, args.history_touch_report)
        history_touch_asset_meta, history_touch_pack_to_assets, history_touch_report, history_touch_meta = load_history_touch_report(
            history_touch_report_path,
            include_types,
            newer_than_mtime_ns=pack_cache_mtime_before_ns,
        )
        if history_touch_pack_to_assets and not args.force_pack:
            selected_packs_merged: list[str] = []
            seen_selected_packs: set[str] = set()
            for rel_pack in list(selected_packs) + sorted(history_touch_pack_to_assets.keys()):
                if rel_pack in seen_selected_packs:
                    continue
                seen_selected_packs.add(rel_pack)
                selected_packs_merged.append(rel_pack)
            selected_packs = selected_packs_merged
            for canonical_id, meta in history_touch_asset_meta.items():
                if canonical_id not in asset_meta:
                    asset_meta[canonical_id] = exporter.AssetMeta(
                        asset_id=str(meta["asset_id"]),
                        symbol=str(meta["symbol"]),
                        exchange=str(meta["exchange"]),
                        currency=str(meta["currency"]),
                        type_norm=str(meta["type_norm"]),
                        provider_symbol=str(meta["provider_symbol"]),
                        country=str(meta["country"]),
                    )
            for rel_pack, touched_assets in history_touch_pack_to_assets.items():
                pack_to_assets[rel_pack].update(touched_assets)
        if args.limit_packs and args.limit_packs > 0:
            selected_packs = selected_packs[: args.limit_packs]
        prior_selected_total = int((state.get("stats") or {}).get("selected_packs_total") or 0)
        prior_packs_done = len(completed_packs)
        resume_incomplete_full_scan = (
            not args.full_scan_packs
            and not force_packs
            and not args.limit_packs
            and str(state.get("ingest_date") or "") == str(args.ingest_date)
            and prior_selected_total >= len(rel_packs_all)
            and prior_packs_done < prior_selected_total
            and len(selected_packs) == 0
        )
        if resume_incomplete_full_scan:
            selected_packs = [rel_pack for rel_pack in rel_packs_all if rel_pack not in completed_packs]
            state["resume_incomplete_full_scan"] = {
                "enabled": True,
                "reason": "prior_full_scan_incomplete",
                "prior_selected_packs_total": prior_selected_total,
                "prior_packs_done": prior_packs_done,
                "remaining_packs_total": len(selected_packs),
                "detected_at": utc_now_iso(),
            }
        state["history_touch_report"] = history_touch_meta
        selected_pack_set = set(selected_packs)
        state["pack_selection"] = {
            "mode": "force" if force_packs else ("full_scan" if args.full_scan_packs else "changed_packs"),
            "force_pack_file": [str(Path(str(p)).expanduser().resolve()) for p in (args.force_pack_file or [])],
            "selected_packs_total": len(selected_packs),
            "selected_packs_already_done": len(selected_pack_set.intersection(completed_packs)),
            "selected_packs_done": len(selected_pack_set.intersection(completed_packs)),
            "selected_packs_remaining": max(0, len(selected_packs) - len(selected_pack_set.intersection(completed_packs))),
        }
        if history_touch_report:
            state["history_touch_report_summary"] = {
                "run_id": history_touch_report.get("run_id"),
                "generated_at": history_touch_report.get("generated_at"),
                "entries_count": int(history_touch_report.get("entries_count") or 0),
                "packs_count": int(history_touch_report.get("packs_count") or 0),
            }
        state["stats"]["selected_packs_total"] = len(selected_packs)
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
        write_run_status(
            stage="indexed_registry_and_packs",
            extra={
                "pack_state_cache": pack_cache_meta,
                "registry_pack_sha_stats": registry_pack_sha_stats,
                "history_touch_report": history_touch_meta,
            },
        )

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
            pack_abs = _history_pack_path(repo_root, rel_pack)
            try:
                pack_abs.stat()
            except FileNotFoundError:
                failed_packs[rel_pack] = {"error": "pack_missing", "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                continue

            started = time.time()
            state["current_pack"] = {
                "rel_pack": rel_pack,
                "index": idx,
                "selected_packs_total": len(selected_packs),
                "targets": len(wanted_assets),
                "started_at": utc_now_iso(),
                "pack_path": str(pack_abs),
            }
            state["updated_at"] = utc_now_iso()
            atomic_write_json(state_path, state)
            write_run_status(stage="processing_pack", extra={"current_pack": state["current_pack"]})
            print(f"[q1-delta] [{idx}/{len(selected_packs)}] {rel_pack} targets={len(wanted_assets)}", flush=True)
            try:
                rows_by_class, per_pack_stats, filter_stats_total = flatten_delta_rows_for_pack(
                    pack_abs,
                    rel_pack,
                    wanted_assets,
                    asset_meta,
                    latest_date_by_asset,
                    emitted_keys_seen,
                    max_allowed_date=str(args.ingest_date),
                    exporter=exporter,
                )
                duration_sec = round(time.time() - started, 3)
                state["stats"]["bars_rows_scanned_in_selected_packs"] += int(per_pack_stats.get("bars_written", 0))
                pack_key = exporter.rel_to_pack_key(rel_pack)
                outputs = []

                for asset_class, rows in rows_by_class.items():
                    if not rows.get("asset_id"):
                        continue
                    for aid in rows["asset_id"]:
                        emitted_assets.add(aid)
                    out_path = raw_ingest_root / f"asset_class={asset_class}" / f"delta_{pack_key}.parquet"
                    n = write_parquet_rows(out_path, rows, compression=args.compression)
                    if n > 0:
                        outputs.append({"asset_class": asset_class, "path": str(out_path), "rows": n})

                event = {
                    "ts": utc_now_iso(),
                    "rel_pack": rel_pack,
                    "pack_key": pack_key,
                    "duration_sec": duration_sec,
                    "slow_pack": duration_sec > float(args.slow_pack_warn_sec),
                    "targets": len(wanted_assets),
                    "stats": per_pack_stats,
                    "filter_stats": dict(filter_stats_total),
                    "outputs": outputs,
                }
                with packs_manifest_path.open("a", encoding="utf-8") as outfh:
                    outfh.write(json.dumps(event, ensure_ascii=False) + "\n")

                state["stats"]["bars_rows_emitted_delta"] += sum(int(o["rows"]) for o in outputs)
                state["stats"]["rows_filter_input_total"] += int(filter_stats_total.get("rows_in", 0))
                state["stats"]["rows_skipped_old_or_known"] += int(filter_stats_total.get("rows_skipped_old_or_known", 0))
                state["stats"]["rows_skipped_duplicate_in_run"] += int(filter_stats_total.get("rows_skipped_duplicate_in_run", 0))
                state["stats"]["rows_invalid"] += int(filter_stats_total.get("rows_invalid", 0))
                state["stats"]["rows_future_date"] += int(filter_stats_total.get("rows_future_date", 0))
                state["stats"]["rows_invalid_identity_or_date"] += int(filter_stats_total.get("rows_invalid_identity_or_date", 0))
                state["stats"]["rows_invalid_ohlc"] += int(filter_stats_total.get("rows_invalid_ohlc", 0))
                state["stats"]["rows_invalid_volume"] += int(filter_stats_total.get("rows_invalid_volume", 0))
                state["stats"]["assets_emitted_delta"] = len(emitted_assets)
                completed_packs.add(rel_pack)
                state["completed_packs"] = sorted(completed_packs)
                state["stats"]["packs_done"] = len(completed_packs)
                if state.get("pack_selection"):
                    selected_done = len(selected_pack_set.intersection(completed_packs))
                    state["pack_selection"]["selected_packs_done"] = selected_done
                    state["pack_selection"]["selected_packs_remaining"] = max(0, len(selected_packs) - selected_done)
                state.pop("current_pack", None)
                if duration_sec > float(args.slow_pack_warn_sec):
                    slow_packs = list(state.get("slow_packs") or [])
                    slow_packs.append({
                        "rel_pack": rel_pack,
                        "duration_sec": duration_sec,
                        "warn_threshold_sec": float(args.slow_pack_warn_sec),
                        "completed_at": utc_now_iso(),
                    })
                    state["slow_packs"] = slow_packs[-100:]
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)

                if max_emitted_rows and state["stats"]["bars_rows_emitted_delta"] >= max_emitted_rows:
                    break

            except KeyboardInterrupt:
                state.pop("current_pack", None)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)
                write_run_status(ok=False, exit_code=130, reason="interrupted", stage="process_packs")
                return 130
            except Exception as exc:
                failed_packs[rel_pack] = {"error": str(exc), "at": utc_now_iso()}
                state["failed_packs"] = failed_packs
                state["stats"]["packs_failed"] = len(failed_packs)
                state.pop("current_pack", None)
                state["updated_at"] = utc_now_iso()
                atomic_write_json(state_path, state)

        # 5) reconciliation and threshold gates
        def _run_delta(key: str) -> int:
            cur = int((state.get("stats") or {}).get(key) or 0)
            base = int(stats_baseline.get(key) or 0)
            return max(0, cur - base)

        rows_filter_input_total = _run_delta("rows_filter_input_total")
        rows_skipped_old_or_known = _run_delta("rows_skipped_old_or_known")
        rows_skipped_duplicate_in_run = _run_delta("rows_skipped_duplicate_in_run")
        rows_invalid = _run_delta("rows_invalid")
        rows_emitted_delta = _run_delta("bars_rows_emitted_delta")
        rows_future_date = _run_delta("rows_future_date")
        rows_accounted_total = rows_emitted_delta + rows_skipped_old_or_known + rows_skipped_duplicate_in_run + rows_invalid
        selected_packs_total = int(state["stats"].get("selected_packs_total") or 0)
        noop_no_changed_packs = selected_packs_total <= 0
        failed_packs_total = _run_delta("packs_failed")
        failed_pack_ratio = (float(failed_packs_total) / float(selected_packs_total)) if selected_packs_total > 0 else 0.0
        invalid_row_ratio = (float(rows_invalid) / float(rows_filter_input_total)) if rows_filter_input_total > 0 else 0.0

        threshold_failures: list[str] = []
        if bool(args.expect_nonzero_delta) and rows_emitted_delta <= 0 and not noop_no_changed_packs:
            threshold_failures.append("EXPECTED_NONZERO_DELTA_NOT_MET")
        if int(args.expect_min_emitted_rows or 0) > 0 and rows_emitted_delta < int(args.expect_min_emitted_rows) and not noop_no_changed_packs:
            threshold_failures.append(f"EXPECTED_MIN_EMITTED_ROWS_NOT_MET:{rows_emitted_delta}<{int(args.expect_min_emitted_rows)}")
        if int(args.max_future_date_rows) >= 0 and rows_future_date > int(args.max_future_date_rows):
            threshold_failures.append(f"FUTURE_DATE_ROWS_EXCEEDED:{rows_future_date}>{int(args.max_future_date_rows)}")
        if int(args.max_invalid_rows) >= 0 and rows_invalid > int(args.max_invalid_rows):
            threshold_failures.append(f"INVALID_ROWS_EXCEEDED:{rows_invalid}>{int(args.max_invalid_rows)}")
        if bool(args.require_row_accounting_balanced) and rows_accounted_total != rows_filter_input_total:
            threshold_failures.append(f"ROW_ACCOUNTING_UNBALANCED:{rows_accounted_total}!={rows_filter_input_total}")
        if float(args.max_failed_pack_ratio) >= 0.0 and failed_pack_ratio > float(args.max_failed_pack_ratio):
            threshold_failures.append(
                f"FAILED_PACK_RATIO_EXCEEDED:{failed_pack_ratio:.6f}>{float(args.max_failed_pack_ratio):.6f}"
            )
        if float(args.max_invalid_row_ratio) >= 0.0 and invalid_row_ratio > float(args.max_invalid_row_ratio):
            threshold_failures.append(
                f"INVALID_ROW_RATIO_EXCEEDED:{invalid_row_ratio:.6f}>{float(args.max_invalid_row_ratio):.6f}"
            )

        reconciliation = {
            "duplicate_keys_in_emitted_delta_detected": False,  # guarded by emitted_keys_seen set
            "emitted_delta_keys_total": len(emitted_keys_seen),
            "rows_emitted_matches_keys": rows_emitted_delta == len(emitted_keys_seen),
            "rows_filter_input_total": rows_filter_input_total,
            "rows_filter_accounted_total": rows_accounted_total,
            "rows_filter_accounting_balanced": rows_accounted_total == rows_filter_input_total,
            "rows_emitted_delta": rows_emitted_delta,
            "assets_emitted_delta": int(state["stats"]["assets_emitted_delta"]),
            "rows_skipped_old_or_known": rows_skipped_old_or_known,
            "rows_skipped_duplicate_in_run": rows_skipped_duplicate_in_run,
            "rows_invalid": rows_invalid,
            "rows_future_date": rows_future_date,
            "rows_invalid_identity_or_date": _run_delta("rows_invalid_identity_or_date"),
            "rows_invalid_ohlc": _run_delta("rows_invalid_ohlc"),
            "rows_invalid_volume": _run_delta("rows_invalid_volume"),
            "failed_packs_total": failed_packs_total,
            "selected_packs_total": selected_packs_total,
            "noop_no_changed_packs": noop_no_changed_packs,
            "failed_pack_ratio": failed_pack_ratio,
            "invalid_row_ratio": invalid_row_ratio,
            "stats_baseline": stats_baseline,
            "threshold_config": {
                "expect_nonzero_delta": bool(args.expect_nonzero_delta),
                "expect_min_emitted_rows": int(args.expect_min_emitted_rows or 0),
                "max_future_date_rows": int(args.max_future_date_rows),
                "max_invalid_rows": int(args.max_invalid_rows),
                "require_row_accounting_balanced": bool(args.require_row_accounting_balanced),
                "max_failed_pack_ratio": float(args.max_failed_pack_ratio),
                "max_invalid_row_ratio": float(args.max_invalid_row_ratio),
            },
            "threshold_failures": threshold_failures,
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
            "pack_selection": state.get("pack_selection", {}),
            "reconciliation": reconciliation,
            "artifacts": {
                "run_status": str(run_status_path),
                "run_root": str(run_root),
            },
        }
        atomic_write_json(manifest_path, manifest)

        exit_code = 0
        reason = "ok"
        if failed_packs:
            exit_code = 1
            reason = "pack_failures_present"
        elif threshold_failures:
            exit_code = 6
            reason = "reconciliation_threshold_failed"
        elif noop_no_changed_packs:
            reason = "noop_no_changed_packs"

        ptr_payload = {
            "schema": "q1_daily_delta_ingest_latest_success_v1" if exit_code == 0 else "q1_daily_delta_ingest_latest_failure_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "job_name": job_name,
            "ingest_date": args.ingest_date,
            "manifest_path": str(manifest_path),
            "run_status_path": str(run_status_path),
            "stats": state.get("stats", {}),
            "pack_selection": state.get("pack_selection", {}),
            "reconciliation": reconciliation,
            "exit_code": exit_code,
            "reason": reason,
        }
        if exit_code == 0:
            if args.full_scan_packs:
                _, _, committed_pack_cache_meta = load_or_build_pack_state_cache(
                    pack_state_cache_path,
                    repo_root,
                    rel_packs_all,
                    registry_path=registry_path,
                    registry_pack_sha=registry_pack_sha,
                    force_full_scan=False,
                    commit_cache=True,
                )
                ptr_payload["pack_state_cache_commit"] = committed_pack_cache_meta
            latest_ptr = quant_root / "ops" / "q1_daily_delta_ingest" / "latest_success.json"
            atomic_write_json(latest_ptr, ptr_payload)
        else:
            latest_failure_ptr = quant_root / "ops" / "q1_daily_delta_ingest" / "latest_failure.json"
            atomic_write_json(latest_failure_ptr, ptr_payload)

        write_run_status(ok=(exit_code == 0), exit_code=exit_code, reason=reason, stage="completed", extra={
            "manifest_path": str(manifest_path),
            "reconciliation": reconciliation,
        })

        print(
            f"[q1-delta] done: selected_packs={state['stats']['selected_packs_total']} "
            f"packs_done={state['stats']['packs_done']} failed={state['stats']['packs_failed']} "
            f"rows_emitted_delta={state['stats']['bars_rows_emitted_delta']} assets_emitted_delta={state['stats']['assets_emitted_delta']}"
        )
        if noop_no_changed_packs:
            print("[q1-delta] noop: no changed v7 packs detected for this ingest window")
        print(f"[q1-delta] manifest: {manifest_path}")
        print(f"run_id={run_id}")
        print(f"manifest={manifest_path}")
        print(f"status={run_status_path}")
        return exit_code
    finally:
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
