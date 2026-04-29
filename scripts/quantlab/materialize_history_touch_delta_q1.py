#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import atomic_write_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument(
        "--quant-root",
        default=(
            "/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab"
            if Path("/volume1/homes/neoboy").exists()
            else "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"
        ),
    )
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--history-touch-report", default="mirrors/universe-v7/reports/history_touch_report.json")
    p.add_argument("--latest-date-cache-path", default="ops/cache/q1_daily_delta_latest_date_index.stock_etf.json")
    p.add_argument("--job-name", default="")
    p.add_argument("--compression", default="snappy")
    p.add_argument("--ignore-latest-date-cache", action="store_true")
    p.add_argument("--resume-completed-packs", action="store_true")
    p.add_argument(
        "--latest-date-cache-flush-every",
        type=int,
        default=25,
        help="Persist latest-date cache every N completed packs; 0 disables periodic flush.",
    )
    return p.parse_args(list(argv))


def _resolve_repo_rel(repo_root: Path, p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else (repo_root / path)


def _resolve_quant_rel(quant_root: Path, p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else (quant_root / path)


def _load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    return mod


def _load_latest_dates(cache_path: Path, *, ignore_cache: bool = False) -> tuple[dict[str, Any], dict[str, str]]:
    if ignore_cache:
        return {}, {}
    if not cache_path.exists():
        return {}, {}
    payload = json.loads(cache_path.read_text())
    latest_dates = payload.get("latest_dates") or {}
    return payload, {str(k): str(v) for k, v in dict(latest_dates).items() if str(k) and str(v)}


def _empty_stats(selected_packs_total: int) -> dict[str, int]:
    return {
        "candidate_packs_total": int(selected_packs_total),
        "selected_packs_total": int(selected_packs_total),
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
        "process_peak_vmrss_kb": 0,
        "process_peak_vmswap_kb": 0,
        "process_peak_vmsize_kb": 0,
    }


def _read_process_status_kb() -> dict[str, int]:
    status_path = Path(f"/proc/{os.getpid()}/status")
    fields = {"VmRSS", "VmSwap", "VmSize"}
    out: dict[str, int] = {}
    try:
        for line in status_path.read_text().splitlines():
            key, _, value = line.partition(":")
            if key not in fields:
                continue
            parts = value.strip().split()
            if parts:
                out[f"{key}_kb"] = int(parts[0])
    except Exception:
        pass
    return out


def _update_process_peaks(stats: dict[str, Any], *samples: dict[str, int]) -> None:
    for sample in samples:
        for source_key, target_key in (
            ("VmRSS_kb", "process_peak_vmrss_kb"),
            ("VmSwap_kb", "process_peak_vmswap_kb"),
            ("VmSize_kb", "process_peak_vmsize_kb"),
        ):
            value = int(sample.get(source_key) or 0)
            if value > int(stats.get(target_key) or 0):
                stats[target_key] = value


def _iter_manifest_events(packs_manifest_path: Path) -> Iterable[dict[str, Any]]:
    if not packs_manifest_path.exists():
        return
    with packs_manifest_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                yield event


def _completed_packs_from_manifest(packs_manifest_path: Path) -> list[str]:
    completed: list[str] = []
    seen: set[str] = set()
    for event in _iter_manifest_events(packs_manifest_path):
        rel_pack = str(event.get("rel_pack") or "").strip()
        if rel_pack and rel_pack not in seen:
            seen.add(rel_pack)
            completed.append(rel_pack)
    return completed


def _stats_from_manifest(packs_manifest_path: Path, selected_packs_total: int) -> dict[str, int]:
    stats = _empty_stats(selected_packs_total)
    completed = 0
    emitted_assets_total = 0
    for event in _iter_manifest_events(packs_manifest_path):
        completed += 1
        per_pack_stats = event.get("stats") or {}
        filter_stats = event.get("filter_stats") or {}
        outputs = event.get("outputs") or []
        stats["bars_rows_scanned_in_selected_packs"] += int(per_pack_stats.get("bars_written") or 0)
        emitted_assets_total += int(per_pack_stats.get("assets_emitted") or 0)
        stats["rows_filter_input_total"] += int(filter_stats.get("rows_in") or 0)
        stats["rows_skipped_old_or_known"] += int(filter_stats.get("rows_skipped_old_or_known") or 0)
        stats["rows_skipped_duplicate_in_run"] += int(filter_stats.get("rows_skipped_duplicate_in_run") or 0)
        stats["rows_invalid"] += int(filter_stats.get("rows_invalid") or 0)
        stats["rows_future_date"] += int(filter_stats.get("rows_future_date") or 0)
        stats["rows_invalid_identity_or_date"] += int(filter_stats.get("rows_invalid_identity_or_date") or 0)
        stats["rows_invalid_ohlc"] += int(filter_stats.get("rows_invalid_ohlc") or 0)
        stats["rows_invalid_volume"] += int(filter_stats.get("rows_invalid_volume") or 0)
        stats["bars_rows_emitted_delta"] += sum(int(item.get("rows") or 0) for item in outputs if isinstance(item, dict))
    stats["packs_done"] = completed
    stats["assets_emitted_delta"] = emitted_assets_total
    return stats


def _load_resume_state(state_path: Path, packs_manifest_path: Path, selected_packs_total: int) -> tuple[list[str], dict[str, Any], dict[str, int]]:
    state: dict[str, Any] = {}
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text())
        except Exception:
            state = {}
    completed = [str(item) for item in (state.get("completed_packs") or []) if str(item)]
    if not completed:
        completed = _completed_packs_from_manifest(packs_manifest_path)
    failed_packs = dict(state.get("failed_packs") or {})
    stats = _empty_stats(selected_packs_total)
    if isinstance(state.get("stats"), dict):
        stats.update({k: v for k, v in state["stats"].items() if k in stats})
    elif completed:
        stats.update(_stats_from_manifest(packs_manifest_path, selected_packs_total))
    stats["candidate_packs_total"] = int(selected_packs_total)
    stats["selected_packs_total"] = int(selected_packs_total)
    stats["packs_done"] = len(completed)
    stats["packs_failed"] = len(failed_packs)
    return completed, failed_packs, stats


def _merge_latest_dates_from_completed_outputs(packs_manifest_path: Path, latest_dates: dict[str, str]) -> dict[str, Any]:
    try:
        import pyarrow.parquet as pq
    except Exception as exc:  # pragma: no cover - exporter already requires pyarrow at runtime
        return {"enabled": False, "status": f"pyarrow_unavailable:{type(exc).__name__}"}

    files_scanned = 0
    rows_scanned = 0
    missing_files = 0
    for event in _iter_manifest_events(packs_manifest_path):
        for item in event.get("outputs") or []:
            output_path = Path(str((item or {}).get("path") or ""))
            if not output_path.exists():
                missing_files += 1
                continue
            files_scanned += 1
            parquet_file = pq.ParquetFile(output_path)
            for batch in parquet_file.iter_batches(columns=["asset_id", "date"], batch_size=65536):
                data = batch.to_pydict()
                for asset_id, row_date in zip(data.get("asset_id") or [], data.get("date") or []):
                    if not asset_id or not row_date:
                        continue
                    rows_scanned += 1
                    aid = str(asset_id)
                    d = str(row_date)
                    prev = latest_dates.get(aid, "")
                    if d > prev:
                        latest_dates[aid] = d
    return {
        "enabled": True,
        "status": "rebuilt_from_completed_outputs",
        "files_scanned": files_scanned,
        "rows_scanned": rows_scanned,
        "missing_files": missing_files,
        "assets_total": len(latest_dates),
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root = Path(args.quant_root).resolve()
    include_types = {str(v).strip().upper() for v in str(args.include_types).split(",") if str(v).strip()}
    if not include_types:
        raise SystemExit("FATAL: no include types")

    history_touch_report_path = _resolve_repo_rel(repo_root, args.history_touch_report)
    latest_date_cache_path = _resolve_quant_rel(quant_root, args.latest_date_cache_path)
    delta_mod = _load_module(repo_root / "scripts/quantlab/run_daily_delta_ingest_q1.py", "q1_delta_mod_fallback")
    exporter = _load_module(repo_root / "scripts/quantlab/export_v7_history_to_t9_parquet.py", "q1_export_mod_fallback")

    asset_meta, pack_to_assets, history_touch_report, history_touch_meta = delta_mod.load_history_touch_report(
        history_touch_report_path,
        include_types,
        newer_than_mtime_ns=0,
    )
    if not pack_to_assets:
        raise SystemExit(f"FATAL: no selected packs in history touch report: {history_touch_report_path}")

    cache_payload, latest_dates = _load_latest_dates(
        latest_date_cache_path,
        ignore_cache=bool(args.ignore_latest_date_cache),
    )
    asset_meta_exporter = {
        str(canonical_id): exporter.AssetMeta(
            asset_id=str(meta.get("asset_id") or canonical_id),
            symbol=str(meta.get("symbol") or ""),
            exchange=str(meta.get("exchange") or ""),
            currency=str(meta.get("currency") or ""),
            type_norm=str(meta.get("type_norm") or ""),
            provider_symbol=str(meta.get("provider_symbol") or meta.get("symbol") or ""),
            country=str(meta.get("country") or ""),
        )
        for canonical_id, meta in asset_meta.items()
    }
    job_name = str(args.job_name or "").strip() or f"q1_history_touch_delta_{str(args.ingest_date).replace('-', '')}"
    run_id = f"q1delta_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    job_root = quant_root / "jobs" / job_name
    run_root = quant_root / "runs" / f"run_id={run_id}"
    raw_ingest_root = quant_root / "data" / "raw" / "provider=EODHD" / f"ingest_date={args.ingest_date}"
    job_root.mkdir(parents=True, exist_ok=True)
    run_root.mkdir(parents=True, exist_ok=True)
    packs_manifest_path = job_root / "packs_manifest.ndjson"
    state_path = job_root / "state.json"
    manifest_path = job_root / "manifest.json"
    run_status_path = run_root / "q1_daily_delta_ingest_run_status.json"
    if not packs_manifest_path.exists():
        packs_manifest_path.write_text("")
    elif not args.resume_completed_packs:
        packs_manifest_path.write_text("")

    selected_packs = sorted(pack_to_assets.keys())
    if args.resume_completed_packs:
        completed_packs, failed_packs, stats = _load_resume_state(state_path, packs_manifest_path, len(selected_packs))
    else:
        completed_packs = []
        failed_packs = {}
        stats = _empty_stats(len(selected_packs))
    completed_pack_set = set(completed_packs)
    if args.resume_completed_packs and completed_packs:
        resume_latest_meta = _merge_latest_dates_from_completed_outputs(packs_manifest_path, latest_dates)
        stats["assets_emitted_delta"] = max(
            int(stats.get("assets_emitted_delta") or 0),
            int(resume_latest_meta.get("assets_total") or 0),
        )
    else:
        resume_latest_meta = {"enabled": False, "status": "not_requested"}
    emitted_assets: set[str] = set()
    emitted_delta_keys_total = int(stats.get("bars_rows_emitted_delta") or 0)

    atomic_write_json(
        state_path,
        {
            "schema": "q1_daily_delta_ingest_state_v1",
            "started_at": utc_now_iso(),
            "updated_at": utc_now_iso(),
            "repo_root": str(repo_root),
            "quant_root": str(quant_root),
            "ingest_date": str(args.ingest_date),
            "include_types": sorted(include_types),
            "completed_packs": completed_packs,
            "failed_packs": failed_packs,
            "stats": stats,
            "history_touch_report": history_touch_meta,
            "resume": {
                "enabled": bool(args.resume_completed_packs),
                "completed_packs_total": len(completed_packs),
                "latest_date_rebuild": resume_latest_meta,
            },
        },
    )

    for idx, rel_pack in enumerate(selected_packs, start=1):
        if rel_pack in completed_pack_set:
            continue
        wanted_assets = pack_to_assets[rel_pack]
        pack_abs = delta_mod._history_pack_path(repo_root, rel_pack)
        started = time.time()
        process_memory_before_kb = _read_process_status_kb()
        try:
            rows_by_class, per_pack_stats = exporter.flatten_rows_for_pack(pack_abs, rel_pack, wanted_assets, asset_meta_exporter)
            stats["bars_rows_scanned_in_selected_packs"] += int(per_pack_stats.get("bars_written", 0))
            filter_stats_total: dict[str, int] = {}
            outputs: list[dict[str, Any]] = []
            pack_key = exporter.rel_to_pack_key(rel_pack)
            pack_emitted_keys_seen: set[tuple[str, str]] = set()

            for asset_class, rows in rows_by_class.items():
                filtered, fstats = delta_mod.filter_rows_newer_than_latest(
                    rows,
                    latest_dates,
                    pack_emitted_keys_seen,
                    max_allowed_date=str(args.ingest_date),
                )
                for key, value in fstats.items():
                    filter_stats_total[key] = int(filter_stats_total.get(key, 0)) + int(value)
                if not filtered.get("asset_id"):
                    continue
                out_path = raw_ingest_root / f"asset_class={asset_class}" / f"delta_{pack_key}.parquet"
                rows_written = exporter.write_parquet_rows(out_path, filtered, compression=str(args.compression))
                if rows_written <= 0:
                    continue
                outputs.append({"asset_class": asset_class, "path": str(out_path), "rows": rows_written})
                dates = filtered.get("date") or []
                asset_ids = filtered.get("asset_id") or []
                for asset_id, row_date in zip(asset_ids, dates):
                    if not asset_id or not row_date:
                        continue
                    prev = latest_dates.get(str(asset_id), "")
                    latest_dates[str(asset_id)] = max(str(row_date), prev)
                    emitted_assets.add(str(asset_id))
            process_memory_after_kb = _read_process_status_kb()
            _update_process_peaks(stats, process_memory_before_kb, process_memory_after_kb)
            rows_out_total = int(filter_stats_total.get("rows_out", 0))
            emitted_delta_keys_total += rows_out_total

            event = {
                "ts": utc_now_iso(),
                "rel_pack": rel_pack,
                "pack_key": pack_key,
                "duration_sec": round(time.time() - started, 3),
                "targets": len(wanted_assets),
                "stats": per_pack_stats,
                "filter_stats": filter_stats_total,
                "dedupe_scope": "pack_local_plus_latest_date_by_asset",
                "emitted_delta_keys": rows_out_total,
                "process_memory_before_kb": process_memory_before_kb,
                "process_memory_after_kb": process_memory_after_kb,
                "outputs": outputs,
            }
            with packs_manifest_path.open("a", encoding="utf-8") as outfh:
                outfh.write(json.dumps(event, ensure_ascii=False) + "\n")

            for key in [
                "rows_in",
                "rows_skipped_old_or_known",
                "rows_skipped_duplicate_in_run",
                "rows_invalid",
                "rows_future_date",
                "rows_invalid_identity_or_date",
                "rows_invalid_ohlc",
                "rows_invalid_volume",
            ]:
                target_key = {
                    "rows_in": "rows_filter_input_total",
                    "rows_skipped_old_or_known": "rows_skipped_old_or_known",
                    "rows_skipped_duplicate_in_run": "rows_skipped_duplicate_in_run",
                    "rows_invalid": "rows_invalid",
                    "rows_future_date": "rows_future_date",
                    "rows_invalid_identity_or_date": "rows_invalid_identity_or_date",
                    "rows_invalid_ohlc": "rows_invalid_ohlc",
                    "rows_invalid_volume": "rows_invalid_volume",
                }[key]
                stats[target_key] += int(filter_stats_total.get(key, 0))
            stats["bars_rows_emitted_delta"] += sum(int(item["rows"]) for item in outputs)
            stats["assets_emitted_delta"] = max(int(stats.get("assets_emitted_delta") or 0), len(emitted_assets))
            completed_packs.append(rel_pack)
            completed_pack_set.add(rel_pack)
            stats["packs_done"] = len(completed_packs)
            atomic_write_json(
                state_path,
                {
                    "schema": "q1_daily_delta_ingest_state_v1",
                    "started_at": "",
                    "updated_at": utc_now_iso(),
                    "repo_root": str(repo_root),
                    "quant_root": str(quant_root),
                    "ingest_date": str(args.ingest_date),
                    "include_types": sorted(include_types),
                    "completed_packs": completed_packs,
                    "failed_packs": failed_packs,
                    "stats": stats,
                    "history_touch_report": history_touch_meta,
                    "resume": {
                        "enabled": bool(args.resume_completed_packs),
                        "completed_packs_total": len(completed_packs),
                        "latest_date_rebuild": resume_latest_meta,
                    },
                },
            )
            flush_every = int(args.latest_date_cache_flush_every or 0)
            if flush_every > 0 and len(completed_packs) % flush_every == 0:
                cache_payload.setdefault("schema", "q1_daily_delta_latest_date_cache_v1")
                cache_payload["generated_at"] = utc_now_iso()
                cache_payload["latest_dates"] = latest_dates
                cache_payload["files_total"] = max(int(cache_payload.get("files_total") or 0), int(stats["packs_done"]))
                atomic_write_json(latest_date_cache_path, cache_payload)
        except Exception as exc:
            failed_packs[rel_pack] = {"error": f"{type(exc).__name__}:{exc}", "at": utc_now_iso()}
            stats["packs_failed"] = len(failed_packs)
            atomic_write_json(
                state_path,
                {
                    "schema": "q1_daily_delta_ingest_state_v1",
                    "started_at": "",
                    "updated_at": utc_now_iso(),
                    "repo_root": str(repo_root),
                    "quant_root": str(quant_root),
                    "ingest_date": str(args.ingest_date),
                    "include_types": sorted(include_types),
                    "completed_packs": completed_packs,
                    "failed_packs": failed_packs,
                    "stats": stats,
                    "history_touch_report": history_touch_meta,
                    "resume": {
                        "enabled": bool(args.resume_completed_packs),
                        "completed_packs_total": len(completed_packs),
                        "latest_date_rebuild": resume_latest_meta,
                    },
                },
            )

    cache_payload.setdefault("schema", "q1_daily_delta_latest_date_cache_v1")
    cache_payload["generated_at"] = utc_now_iso()
    cache_payload["latest_dates"] = latest_dates
    cache_payload["files_total"] = max(int(cache_payload.get("files_total") or 0), int(stats["packs_done"]))
    atomic_write_json(latest_date_cache_path, cache_payload)

    rows_emitted_delta = int(stats["bars_rows_emitted_delta"])
    rows_skipped_old_or_known = int(stats["rows_skipped_old_or_known"])
    rows_skipped_duplicate_in_run = int(stats["rows_skipped_duplicate_in_run"])
    rows_invalid = int(stats["rows_invalid"])
    rows_filter_input_total = int(stats["rows_filter_input_total"])
    rows_filter_accounted_total = (
        rows_emitted_delta
        + rows_skipped_old_or_known
        + rows_skipped_duplicate_in_run
        + rows_invalid
    )
    failed_packs_total = int(stats["packs_failed"])
    selected_packs_total = int(stats["selected_packs_total"])
    failed_pack_ratio = 0.0 if selected_packs_total <= 0 else round(float(failed_packs_total) / float(selected_packs_total), 6)
    invalid_row_ratio = 0.0 if rows_filter_input_total <= 0 else round(float(rows_invalid) / float(rows_filter_input_total), 6)
    noop_no_changed_packs = rows_emitted_delta <= 0
    threshold_failures = [] if rows_emitted_delta > 0 and not failed_packs else ["DIRECT_MATERIALIZE_DELTA_INCOMPLETE"]

    manifest = {
        "schema": "q1_daily_delta_ingest_manifest_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "job_name": job_name,
        "repo_root": str(repo_root),
        "quant_root": str(quant_root),
        "ingest_date": str(args.ingest_date),
        "include_types": sorted(include_types),
        "raw_ingest_root": str(raw_ingest_root),
        "state_path": str(state_path),
        "packs_manifest_path": str(packs_manifest_path),
        "latest_date_cache_path": str(latest_date_cache_path),
        "stats": stats,
        "reconciliation": {
            "emitted_delta_keys_total": emitted_delta_keys_total,
            "duplicate_keys_in_emitted_delta_detected": False,
            "dedupe_scope": "pack_local_plus_latest_date_by_asset",
            "rows_emitted_matches_keys": rows_emitted_delta == emitted_delta_keys_total,
            "rows_filter_input_total": rows_filter_input_total,
            "rows_filter_accounted_total": rows_filter_accounted_total,
            "rows_filter_accounting_balanced": rows_filter_accounted_total == rows_filter_input_total,
            "rows_emitted_delta": rows_emitted_delta,
            "assets_emitted_delta": int(stats["assets_emitted_delta"]),
            "rows_skipped_old_or_known": rows_skipped_old_or_known,
            "rows_skipped_duplicate_in_run": rows_skipped_duplicate_in_run,
            "rows_invalid": rows_invalid,
            "rows_future_date": int(stats["rows_future_date"]),
            "rows_invalid_identity_or_date": int(stats["rows_invalid_identity_or_date"]),
            "rows_invalid_ohlc": int(stats["rows_invalid_ohlc"]),
            "rows_invalid_volume": int(stats["rows_invalid_volume"]),
            "selected_packs_total": selected_packs_total,
            "failed_packs_total": failed_packs_total,
            "noop_no_changed_packs": noop_no_changed_packs,
            "failed_pack_ratio": failed_pack_ratio,
            "invalid_row_ratio": invalid_row_ratio,
            "stats_baseline": {},
            "threshold_config": {
                "expect_nonzero_delta": False,
                "expect_min_emitted_rows": 0,
                "max_future_date_rows": 0,
                "max_invalid_rows": 0,
                "require_row_accounting_balanced": True,
                "max_failed_pack_ratio": 0.0,
                "max_invalid_row_ratio": 0.0,
            },
            "threshold_failures": threshold_failures,
        },
        "artifacts": {
            "run_status": str(run_status_path),
            "run_root": str(run_root),
        },
    }
    atomic_write_json(manifest_path, manifest)
    ok = int(stats["bars_rows_emitted_delta"]) > 0 and not failed_packs
    atomic_write_json(
        run_status_path,
        {
            "schema": "quant_q1_daily_delta_ingest_run_status_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "job_name": job_name,
            "ok": bool(ok),
            "exit_code": 0 if ok else 1,
            "reason": "ok" if ok else "direct_materialize_incomplete",
            "stage": "completed",
            "paths": {
                "state": str(state_path),
                "manifest": str(manifest_path),
                "packs_manifest": str(packs_manifest_path),
                "raw_ingest_root": str(raw_ingest_root),
            },
            "stats": stats,
            "extra": {
                "history_touch_report_path": str(history_touch_report_path),
                "history_touch_report_run_id": history_touch_report.get("run_id"),
            },
        },
    )
    latest_success_path = quant_root / "ops" / "q1_daily_delta_ingest" / "latest_success.json"
    atomic_write_json(
        latest_success_path,
        {
            "schema": "q1_daily_delta_ingest_latest_success_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "manifest_path": str(manifest_path),
            "run_status": str(run_status_path),
            "ingest_date": str(args.ingest_date),
            "stats": stats,
        },
    )
    print(json.dumps({"ok": ok, "run_id": run_id, "manifest_path": str(manifest_path), "run_status": str(run_status_path), "stats": stats}, ensure_ascii=False))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
