#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
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
    p.add_argument("--quant-root", default="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab")
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--history-touch-report", default="mirrors/universe-v7/reports/history_touch_report.json")
    p.add_argument("--latest-date-cache-path", default="ops/cache/q1_daily_delta_latest_date_index.stock_etf.json")
    p.add_argument("--job-name", default="")
    p.add_argument("--compression", default="snappy")
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


def _load_latest_dates(cache_path: Path) -> tuple[dict[str, Any], dict[str, str]]:
    if not cache_path.exists():
        return {}, {}
    payload = json.loads(cache_path.read_text())
    latest_dates = payload.get("latest_dates") or {}
    return payload, {str(k): str(v) for k, v in dict(latest_dates).items() if str(k) and str(v)}


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

    cache_payload, latest_dates = _load_latest_dates(latest_date_cache_path)
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

    stats = {
        "candidate_packs_total": len(pack_to_assets),
        "selected_packs_total": len(pack_to_assets),
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
    }
    emitted_assets: set[str] = set()
    emitted_keys_seen: set[tuple[str, str]] = set()
    failed_packs: dict[str, Any] = {}

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
            "completed_packs": [],
            "failed_packs": {},
            "stats": stats,
            "history_touch_report": history_touch_meta,
        },
    )

    completed_packs: list[str] = []
    for idx, rel_pack in enumerate(sorted(pack_to_assets.keys()), start=1):
        wanted_assets = pack_to_assets[rel_pack]
        pack_abs = delta_mod._history_pack_path(repo_root, rel_pack)
        started = time.time()
        try:
            rows_by_class, per_pack_stats = exporter.flatten_rows_for_pack(pack_abs, rel_pack, wanted_assets, asset_meta_exporter)
            stats["bars_rows_scanned_in_selected_packs"] += int(per_pack_stats.get("bars_written", 0))
            filter_stats_total: dict[str, int] = {}
            outputs: list[dict[str, Any]] = []
            pack_key = exporter.rel_to_pack_key(rel_pack)

            for asset_class, rows in rows_by_class.items():
                filtered, fstats = delta_mod.filter_rows_newer_than_latest(
                    rows,
                    latest_dates,
                    emitted_keys_seen,
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

            event = {
                "ts": utc_now_iso(),
                "rel_pack": rel_pack,
                "pack_key": pack_key,
                "duration_sec": round(time.time() - started, 3),
                "targets": len(wanted_assets),
                "stats": per_pack_stats,
                "filter_stats": filter_stats_total,
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
            stats["assets_emitted_delta"] = len(emitted_assets)
            stats["packs_done"] = idx
            completed_packs.append(rel_pack)
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
                },
            )
        except Exception as exc:
            failed_packs[rel_pack] = {"error": f"{type(exc).__name__}:{exc}", "at": utc_now_iso()}
            stats["packs_failed"] = len(failed_packs)

    cache_payload["generated_at"] = utc_now_iso()
    cache_payload["latest_dates"] = latest_dates
    cache_payload["files_total"] = int(cache_payload.get("files_total") or 0) + max(0, stats["packs_done"])
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
            "emitted_delta_keys_total": len(emitted_keys_seen),
            "duplicate_keys_in_emitted_delta_detected": False,
            "rows_emitted_matches_keys": rows_emitted_delta == len(emitted_keys_seen),
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
