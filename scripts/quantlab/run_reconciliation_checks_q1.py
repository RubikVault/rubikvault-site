#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Any

import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--delta-manifest", default="")
    p.add_argument("--increment-snapshot-manifest", default="")
    p.add_argument("--increment-feature-manifest", default="")
    p.add_argument("--max-delta-files", type=int, default=0)
    p.add_argument("--expect-nonzero-delta", action="store_true")
    p.add_argument("--expected-min-delta-rows", type=int, default=1)
    p.add_argument("--require-contract-layers", action="store_true", default=True)
    p.add_argument("--skip-require-contract-layers", dest="require_contract_layers", action="store_false")
    p.add_argument("--require-tri-layer", action="store_true", default=True)
    p.add_argument("--skip-require-tri-layer", dest="require_tri_layer", action="store_false")
    p.add_argument("--contract-placeholder-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--require-real-corp-actions", action="store_true", default=False)
    p.add_argument("--require-real-delistings", action="store_true", default=False)
    p.add_argument("--corp-actions-derived-cap-usage-warn-ratio", type=float, default=0.80)
    p.add_argument("--corp-actions-cap-hit-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--corp-actions-raw-empty-fallback-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--require-provider-raw-corp-actions", action="store_true", default=False)
    p.add_argument("--require-provider-raw-delistings", action="store_true", default=False)
    p.add_argument("--provider-raw-requirement-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--corp-actions-raw-materialization-min-ratio", type=float, default=0.90)
    p.add_argument("--corp-actions-raw-materialization-drop-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--corp-actions-min-rows-per-1k-assets", type=float, default=5.0)
    p.add_argument("--corp-actions-coverage-failure-mode", choices=["off", "warn", "hard"], default="warn")
    return p.parse_args(list(argv))


def _resolve_latest_ptr(quant_root: Path, sub: str, key: str) -> Path:
    ptr = quant_root / "ops" / sub / "latest_success.json"
    if not ptr.exists():
        raise FileNotFoundError(f"latest pointer missing: {ptr}")
    data = read_json(ptr)
    p = data.get(key) or data.get("manifest_path")
    if not p:
        raise RuntimeError(f"{key}/manifest_path missing in {ptr}")
    return Path(str(p))


def _resolve_path(quant_root: Path, explicit: str, default_ptr_sub: str, key: str) -> Path:
    if explicit:
        p = Path(explicit)
        return p if p.is_absolute() else (quant_root / p)
    return _resolve_latest_ptr(quant_root, default_ptr_sub, key)


def _iter_delta_files(delta_manifest: dict[str, Any]) -> list[Path]:
    packs_manifest = Path(str(delta_manifest.get("packs_manifest_path") or ""))
    out: list[Path] = []
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
            if p:
                out.append(Path(str(p)))
    return out


def _scan_delta_quality(delta_files: list[Path], max_files: int = 0) -> dict[str, Any]:
    total_rows = 0
    dup_keys = 0
    future_dates = 0
    invalid_ohlcv = 0
    seen = set()
    today = date.today().isoformat()
    files_scanned = 0
    for fp in delta_files:
        if max_files and files_scanned >= max_files:
            break
        if not fp.exists():
            continue
        pf = pq.ParquetFile(fp)
        tbl = pf.read(columns=["asset_id", "date", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw"])
        d = tbl.to_pydict()
        aids = d.get("asset_id") or []
        dates = d.get("date") or []
        opens = d.get("open_raw") or []
        highs = d.get("high_raw") or []
        lows = d.get("low_raw") or []
        closes = d.get("close_raw") or []
        vols = d.get("volume_raw") or []
        files_scanned += 1
        total_rows += len(aids)
        for aid, dt, o, h, l, c, v in zip(aids, dates, opens, highs, lows, closes, vols):
            key = (aid, dt)
            if key in seen:
                dup_keys += 1
            else:
                seen.add(key)
            if dt and str(dt) > today:
                future_dates += 1
            try:
                if (
                    o is None or h is None or l is None or c is None or v is None or
                    float(c) <= 0 or float(o) <= 0 or float(h) < float(l) or float(v) < 0
                ):
                    invalid_ohlcv += 1
            except Exception:
                invalid_ohlcv += 1
    return {
        "delta_files_scanned": files_scanned,
        "delta_rows_scanned": total_rows,
        "duplicate_keys_detected": dup_keys,
        "future_dates_detected": future_dates,
        "invalid_ohlcv_rows_detected": invalid_ohlcv,
    }


def _scan_parquet_dir_rows(path: Path | None) -> dict[str, Any]:
    out = {
        "path": str(path) if path else "",
        "present": False,
        "files_total": 0,
        "rows_total": 0,
        "bytes_total": 0,
        "read_errors_total": 0,
    }
    if path is None or not path.exists() or not path.is_dir():
        return out
    out["present"] = True
    for fp in sorted(path.rglob("*.parquet")):
        try:
            meta = pq.ParquetFile(fp).metadata
            out["files_total"] += 1
            out["rows_total"] += int(meta.num_rows if meta is not None else 0)
            out["bytes_total"] += int(fp.stat().st_size)
        except Exception:
            out["read_errors_total"] += 1
    return out


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    delta_manifest_path = _resolve_path(quant_root, args.delta_manifest, "q1_daily_delta_ingest", "manifest_path")
    inc_snap_manifest_path = _resolve_path(quant_root, args.increment_snapshot_manifest, "q1_incremental_snapshot", "increment_manifest")
    inc_feat_manifest_path = _resolve_path(quant_root, args.increment_feature_manifest, "q1_incremental_feature_update", "manifest_path")

    delta_manifest = read_json(delta_manifest_path)
    inc_snap_manifest = read_json(inc_snap_manifest_path)
    inc_feat_manifest = read_json(inc_feat_manifest_path)

    snap_manifest_path_raw = str(((inc_snap_manifest.get("inputs") or {}).get("snapshot_manifest")) or "")
    snap_manifest_path = Path(snap_manifest_path_raw) if snap_manifest_path_raw else None
    snap_manifest: dict[str, Any] | None = None
    if snap_manifest_path and snap_manifest_path.exists():
        try:
            snap_manifest = read_json(snap_manifest_path)
        except Exception:
            snap_manifest = None

    run_id = f"q1recon_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_reconciliation_report.json"

    delta_files = _iter_delta_files(delta_manifest)
    quality = _scan_delta_quality(delta_files, max_files=int(args.max_delta_files or 0))

    delta_stats = (delta_manifest.get("stats") or {})
    delta_recon = (delta_manifest.get("reconciliation") or {})
    snap_counts = (inc_snap_manifest.get("counts") or {})
    snap_recon = (inc_snap_manifest.get("reconciliation") or {})
    feat_counts = (inc_feat_manifest.get("counts") or {})
    feat_recon = (inc_feat_manifest.get("reconciliation") or {})

    delta_rows_emitted = int(delta_stats.get("bars_rows_emitted_delta") or 0)
    delta_assets_emitted = int(delta_stats.get("assets_emitted_delta") or 0)
    delta_rows_scanned_manifest = int(delta_stats.get("bars_rows_scanned_in_selected_packs") or 0)
    delta_rows_skipped_old_or_known = int(delta_stats.get("rows_skipped_old_or_known") or 0)
    delta_rows_skipped_duplicate_in_run = int(delta_stats.get("rows_skipped_duplicate_in_run") or 0)
    delta_scan_accounting_sum = delta_rows_emitted + delta_rows_skipped_old_or_known + delta_rows_skipped_duplicate_in_run
    noop_no_changed_packs = bool(delta_recon.get("noop_no_changed_packs")) or int(delta_stats.get("selected_packs_total") or 0) <= 0

    expect_nonzero = bool(args.expect_nonzero_delta)
    expected_min_rows = int(args.expected_min_delta_rows or 1)
    effective_expect_nonzero = expect_nonzero and not noop_no_changed_packs

    checks = {
        "delta_rows_emitted_matches_keys": bool(delta_recon.get("rows_emitted_matches_keys", False)),
        "snapshot_rows_declared_matches_scanned": bool(snap_recon.get("rows_declared_matches_scanned", False)),
        "delta_rows_scanned_consistent": int(quality.get("delta_rows_scanned", 0)) == int(snap_counts.get("delta_rows_scanned_total", 0)),
        "no_duplicate_keys_in_delta": int(quality.get("duplicate_keys_detected", 0)) == 0,
        "no_future_dates_in_delta": int(quality.get("future_dates_detected", 0)) == 0,
        "no_invalid_ohlcv_in_delta": int(quality.get("invalid_ohlcv_rows_detected", 0)) == 0,
        "feature_changed_assets_not_exceed_snapshot_changed": int(feat_counts.get("changed_assets_total", 0)) <= int(snap_counts.get("changed_assets_total", 0)),
        "feature_reconciliation_ok": bool(feat_recon.get("ok", False)),
        "delta_scan_accounting_consistent": (
            delta_rows_scanned_manifest == 0 or delta_scan_accounting_sum == delta_rows_scanned_manifest
        ),
        "delta_rows_emitted_nonzero_when_expected": (delta_rows_emitted >= expected_min_rows) if effective_expect_nonzero else True,
        "delta_assets_emitted_nonzero_when_expected": (delta_assets_emitted > 0) if effective_expect_nonzero else True,
    }
    warnings: list[str] = []

    data_truth: dict[str, Any] = {
        "snapshot_manifest_path": str(snap_manifest_path) if snap_manifest_path else "",
        "snapshot_manifest_present": bool(snap_manifest_path and snap_manifest_path.exists()),
        "snapshot_manifest_readable": bool(snap_manifest is not None),
        "snapshot_id": str((snap_manifest or {}).get("snapshot_id") or ""),
        "snapshot_asof_date": str((snap_manifest or {}).get("asof_date") or ""),
    }
    artifacts = (snap_manifest or {}).get("artifacts") or {}
    hashes = (snap_manifest or {}).get("hashes") or {}
    snap_include_asset_classes = [str(x) for x in ((snap_manifest or {}).get("include_asset_classes") or [])]
    snap_universe_by_class = {
        str(k): int(v or 0)
        for k, v in (((snap_manifest or {}).get("counts") or {}).get("universe_rows_by_asset_class") or {}).items()
    }

    contract_manifest_path_raw = str(artifacts.get("contract_layers_manifest") or "")
    corp_actions_path_raw = str(artifacts.get("corp_actions_parquet") or "")
    delistings_path_raw = str(artifacts.get("delistings_parquet") or "")
    tri_manifest_path_raw = str(artifacts.get("tri_layers_manifest") or "")
    tri_parquet_path_raw = str(artifacts.get("tri_parquet") or "")

    contract_manifest_path = Path(contract_manifest_path_raw) if contract_manifest_path_raw else None
    corp_actions_path = Path(corp_actions_path_raw) if corp_actions_path_raw else None
    delistings_path = Path(delistings_path_raw) if delistings_path_raw else None
    tri_manifest_path = Path(tri_manifest_path_raw) if tri_manifest_path_raw else None
    tri_parquet_path = Path(tri_parquet_path_raw) if tri_parquet_path_raw else None

    checks["snapshot_manifest_present"] = bool(snap_manifest_path and snap_manifest_path.exists())
    checks["snapshot_manifest_readable"] = bool(snap_manifest is not None)
    checks["contract_layers_manifest_present"] = bool(contract_manifest_path and contract_manifest_path.exists())
    checks["corp_actions_parquet_present"] = bool(corp_actions_path and corp_actions_path.exists())
    checks["delistings_parquet_present"] = bool(delistings_path and delistings_path.exists())
    checks["tri_layers_manifest_present"] = bool(tri_manifest_path and tri_manifest_path.exists())
    checks["tri_parquet_present"] = bool(tri_parquet_path and tri_parquet_path.exists())
    checks["snapshot_has_contract_hashes"] = bool(hashes.get("corp_actions_hash") and hashes.get("delistings_hash"))
    checks["snapshot_has_tri_hashes"] = bool(hashes.get("tri_layers_manifest_hash") and hashes.get("tri_parquet_hash"))

    tri_manifest_obj: dict[str, Any] | None = None
    if checks["tri_layers_manifest_present"]:
        try:
            tri_manifest_obj = read_json(tri_manifest_path)  # type: ignore[arg-type]
            tri_rows_total = int(((tri_manifest_obj.get("counts") or {}).get("tri_rows_total")) or 0)
            checks["tri_rows_nonzero"] = tri_rows_total > 0
            data_truth["tri_rows_total"] = tri_rows_total
            data_truth["tri_snapshot_id"] = str(tri_manifest_obj.get("snapshot_id") or "")
            data_truth["tri_asof_date"] = str(tri_manifest_obj.get("asof_date") or "")
            data_truth["tri_asset_classes"] = list((tri_manifest_obj.get("config") or {}).get("asset_classes") or [])
            data_truth["tri_selected_assets_total"] = int(((tri_manifest_obj.get("counts") or {}).get("selected_assets_total")) or 0)
        except Exception:
            checks["tri_layers_manifest_readable"] = False
    if "tri_layers_manifest_readable" not in checks:
        checks["tri_layers_manifest_readable"] = checks["tri_layers_manifest_present"]
    checks.setdefault("tri_rows_nonzero", False)

    contract_manifest_obj: dict[str, Any] | None = None
    if checks["contract_layers_manifest_present"]:
        try:
            contract_manifest_obj = read_json(contract_manifest_path)  # type: ignore[arg-type]
            data_truth["corp_actions_rows"] = int((((contract_manifest_obj.get("corp_actions") or {}).get("rows")) or 0))
            data_truth["delistings_rows"] = int((((contract_manifest_obj.get("delistings") or {}).get("rows")) or 0))
            data_truth["corp_actions_source_mode"] = str((((contract_manifest_obj.get("corp_actions") or {}).get("source_mode")) or ""))
            data_truth["delistings_source_mode"] = str((((contract_manifest_obj.get("delistings") or {}).get("source_mode")) or ""))
            raw_sources = (contract_manifest_obj.get("raw_sources") or {})
            data_truth["contract_snapshot_asset_ids_total"] = int(raw_sources.get("snapshot_asset_ids_total") or 0)
            data_truth["contract_raw_corp_actions_dir"] = str(raw_sources.get("corp_actions_dir") or "")
            data_truth["contract_raw_delistings_dir"] = str(raw_sources.get("delistings_dir") or "")
            policy = (contract_manifest_obj.get("policy") or {})
            data_truth["contract_policy_max_derived_corp_events"] = int(policy.get("max_derived_corp_events") or 0)
        except Exception:
            checks["contract_layers_manifest_readable"] = False
    if "contract_layers_manifest_readable" not in checks:
        checks["contract_layers_manifest_readable"] = checks["contract_layers_manifest_present"]

    corp_source_mode = str(data_truth.get("corp_actions_source_mode") or "")
    delist_source_mode = str(data_truth.get("delistings_source_mode") or "")
    corp_rows = int(data_truth.get("corp_actions_rows") or 0)
    delist_rows = int(data_truth.get("delistings_rows") or 0)
    raw_corp_dir = Path(str(data_truth.get("contract_raw_corp_actions_dir") or "")) if data_truth.get("contract_raw_corp_actions_dir") else None
    raw_delist_dir = Path(str(data_truth.get("contract_raw_delistings_dir") or "")) if data_truth.get("contract_raw_delistings_dir") else None
    raw_corp_stats = _scan_parquet_dir_rows(raw_corp_dir)
    raw_delist_stats = _scan_parquet_dir_rows(raw_delist_dir)
    data_truth["raw_corp_actions"] = raw_corp_stats
    data_truth["raw_delistings"] = raw_delist_stats
    snapshot_asset_ids_total = int(data_truth.get("contract_snapshot_asset_ids_total") or 0)
    raw_corp_rows_total = int(raw_corp_stats.get("rows_total") or 0)
    raw_delist_rows_total = int(raw_delist_stats.get("rows_total") or 0)
    data_truth["corp_actions_rows_per_1k_assets"] = float(
        0.0 if snapshot_asset_ids_total <= 0 else round((float(corp_rows) * 1000.0) / float(snapshot_asset_ids_total), 6)
    )
    data_truth["raw_corp_actions_rows_per_1k_assets"] = float(
        0.0 if snapshot_asset_ids_total <= 0 else round((float(raw_corp_rows_total) * 1000.0) / float(snapshot_asset_ids_total), 6)
    )
    data_truth["corp_actions_raw_to_materialized_ratio"] = float(
        0.0 if corp_rows <= 0 else round(float(raw_corp_rows_total) / float(corp_rows), 6)
    )
    data_truth["corp_actions_materialized_to_raw_ratio"] = float(
        0.0 if raw_corp_rows_total <= 0 else round(float(corp_rows) / float(raw_corp_rows_total), 6)
    )
    data_truth["delistings_rows_per_1k_assets"] = float(
        0.0 if snapshot_asset_ids_total <= 0 else round((float(delist_rows) * 1000.0) / float(snapshot_asset_ids_total), 6)
    )
    data_truth["delistings_materialized_to_raw_ratio"] = float(
        0.0 if raw_delist_rows_total <= 0 else round(float(delist_rows) / float(raw_delist_rows_total), 6)
    )
    corp_is_placeholder = bool(corp_rows <= 0 or "placeholder" in corp_source_mode or corp_source_mode.startswith("derived_empty"))
    delist_is_placeholder = bool(delist_rows <= 0 or "placeholder" in delist_source_mode)
    # Observed realism is reported in stats; gate checks below decide whether this
    # run must fail based on explicit requirement flags.
    checks["contract_corp_actions_real_required_ok"] = (not bool(args.require_real_corp_actions)) or (not corp_is_placeholder)
    checks["contract_delistings_real_required_ok"] = (not bool(args.require_real_delistings)) or (not delist_is_placeholder)

    placeholder_mode = str(args.contract_placeholder_failure_mode)
    checks["contract_placeholder_policy_ok"] = True
    if placeholder_mode in {"warn", "hard"}:
        if bool(args.require_real_corp_actions) and corp_is_placeholder:
            msg = f"CONTRACT_PLACEHOLDER_CORP_ACTIONS:{corp_source_mode or 'unknown'}"
            if placeholder_mode == "hard":
                checks["contract_placeholder_policy_ok"] = False
            else:
                warnings.append(msg)
        if bool(args.require_real_delistings) and delist_is_placeholder:
            msg = f"CONTRACT_PLACEHOLDER_DELISTINGS:{delist_source_mode or 'unknown'}"
            if placeholder_mode == "hard":
                checks["contract_placeholder_policy_ok"] = False
            else:
                warnings.append(msg)

    checks["contract_raw_source_dirs_present"] = bool(raw_corp_stats.get("present")) and bool(raw_delist_stats.get("present"))
    checks["contract_snapshot_asset_ids_consistent"] = int(data_truth.get("contract_snapshot_asset_ids_total") or 0) == int(((snap_manifest or {}).get("counts") or {}).get("eligible_exit") or 0)
    checks["contract_corp_actions_raw_materialization_consistent"] = (
        corp_source_mode != "provider_raw_corp_actions"
        or (
            raw_corp_rows_total > 0
            and corp_rows > 0
            and corp_rows <= raw_corp_rows_total
        )
    )
    provider_raw_req_mode = str(args.provider_raw_requirement_failure_mode).lower()
    corp_raw_source_required_miss = bool(
        bool(args.require_provider_raw_corp_actions)
        and corp_source_mode != "provider_raw_corp_actions"
    )
    checks["contract_corp_actions_provider_raw_required_ok"] = (
        (not corp_raw_source_required_miss)
        or provider_raw_req_mode in {"off", "warn"}
    )
    if corp_raw_source_required_miss:
        msg = f"CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW:source_mode={corp_source_mode or 'unknown'}"
        if provider_raw_req_mode == "hard":
            checks["contract_corp_actions_provider_raw_required_ok"] = False
        else:
            warnings.append(msg)
    corp_raw_materialization_ratio_min = max(0.0, float(args.corp_actions_raw_materialization_min_ratio))
    corp_raw_materialization_drop_mode = str(args.corp_actions_raw_materialization_drop_failure_mode).lower()
    corp_raw_materialization_drop_high = bool(
        corp_source_mode == "provider_raw_corp_actions"
        and raw_corp_rows_total > 0
        and corp_rows > 0
        and (float(corp_rows) / float(raw_corp_rows_total)) < corp_raw_materialization_ratio_min
    )
    checks["contract_corp_actions_raw_materialization_ratio_ok"] = (
        (not corp_raw_materialization_drop_high)
        or corp_raw_materialization_drop_mode in {"off", "warn"}
    )
    if corp_raw_materialization_drop_high:
        msg = (
            "CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH:"
            f"materialized_rows={corp_rows};raw_rows={raw_corp_rows_total};"
            f"ratio={float(corp_rows) / float(raw_corp_rows_total):.6f};"
            f"min_ratio={corp_raw_materialization_ratio_min:.6f}"
        )
        if corp_raw_materialization_drop_mode == "hard":
            checks["contract_corp_actions_raw_materialization_ratio_ok"] = False
        else:
            warnings.append(msg)
    checks["contract_delistings_raw_materialization_consistent"] = (
        delist_source_mode != "provider_raw_delistings"
        or (
            raw_delist_rows_total > 0
            and delist_rows > 0
            and delist_rows <= raw_delist_rows_total
        )
    )
    delist_raw_source_required_miss = bool(
        bool(args.require_provider_raw_delistings)
        and delist_source_mode != "provider_raw_delistings"
    )
    checks["contract_delistings_provider_raw_required_ok"] = (
        (not delist_raw_source_required_miss)
        or provider_raw_req_mode in {"off", "warn"}
    )
    if delist_raw_source_required_miss:
        msg = f"CONTRACT_DELISTINGS_NOT_PROVIDER_RAW:source_mode={delist_source_mode or 'unknown'}"
        if provider_raw_req_mode == "hard":
            checks["contract_delistings_provider_raw_required_ok"] = False
        else:
            warnings.append(msg)
    checks["tri_asof_matches_snapshot_asof"] = str(data_truth.get("tri_asof_date") or "") == str(data_truth.get("snapshot_asof_date") or "")
    checks["tri_snapshot_id_matches_snapshot_id"] = str(data_truth.get("tri_snapshot_id") or "") == str(data_truth.get("snapshot_id") or "")
    checks["tri_asset_classes_nonempty"] = len(list(data_truth.get("tri_asset_classes") or [])) > 0
    checks["tri_asset_classes_subset_of_snapshot"] = set(str(x) for x in (data_truth.get("tri_asset_classes") or [])) <= set(snap_include_asset_classes)
    expected_tri_assets_total = sum(int(snap_universe_by_class.get(str(k), 0)) for k in (data_truth.get("tri_asset_classes") or []))
    data_truth["tri_expected_assets_total"] = int(expected_tri_assets_total)
    checks["tri_selected_assets_consistent"] = int(data_truth.get("tri_selected_assets_total") or 0) == int(expected_tri_assets_total)
    checks["tri_rows_not_exceed_bars_rows"] = int(data_truth.get("tri_rows_total") or 0) <= int(((snap_manifest or {}).get("counts") or {}).get("bars_materialized_rows_total") or 0)

    max_derived_corp_events = int(data_truth.get("contract_policy_max_derived_corp_events") or 0)
    corp_cap_usage_ratio = float(
        0.0 if max_derived_corp_events <= 0 else round(float(corp_rows) / float(max_derived_corp_events), 6)
    )
    corp_rows_per_1k_assets = float(data_truth.get("corp_actions_rows_per_1k_assets") or 0.0)
    data_truth["corp_actions_cap_usage_ratio"] = corp_cap_usage_ratio
    corp_cap_hit = bool(
        max_derived_corp_events > 0
        and corp_rows >= max_derived_corp_events
        and corp_source_mode in {"derived_from_adjusted_close_factor", "preserved_existing_snapshot_layer"}
    )
    data_truth["corp_actions_cap_hit"] = corp_cap_hit
    cap_hit_mode = str(args.corp_actions_cap_hit_failure_mode).lower()
    checks["contract_corp_actions_cap_not_hit_or_allowed"] = (not corp_cap_hit) or cap_hit_mode in {"off", "warn"}
    if corp_cap_hit:
        msg = (
            f"CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT:rows={corp_rows};"
            f"max={max_derived_corp_events};source_mode={corp_source_mode or 'unknown'}"
        )
        if cap_hit_mode == "hard":
            checks["contract_corp_actions_cap_not_hit_or_allowed"] = False
        else:
            warnings.append(msg)
    if (
        corp_source_mode in {"derived_from_adjusted_close_factor", "preserved_existing_snapshot_layer"}
        and max_derived_corp_events > 0
        and corp_cap_usage_ratio >= float(args.corp_actions_derived_cap_usage_warn_ratio)
        and not corp_cap_hit
    ):
        warnings.append(
            f"CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT:usage_ratio={corp_cap_usage_ratio:.3f};rows={corp_rows};max={max_derived_corp_events}"
        )
    raw_empty_fallback = bool(raw_corp_stats.get("present")) and int(raw_corp_stats.get("rows_total") or 0) <= 0 and corp_source_mode != "provider_raw_corp_actions"
    raw_empty_fallback_mode = str(args.corp_actions_raw_empty_fallback_failure_mode).lower()
    checks["contract_corp_actions_raw_empty_fallback_allowed"] = (not raw_empty_fallback) or raw_empty_fallback_mode in {"off", "warn"}
    if raw_empty_fallback:
        msg = f"CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK:raw_rows=0;source_mode={corp_source_mode or 'unknown'}"
        if raw_empty_fallback_mode == "hard":
            checks["contract_corp_actions_raw_empty_fallback_allowed"] = False
        else:
            warnings.append(msg)
    corp_cov_mode = str(args.corp_actions_coverage_failure_mode).lower()
    corp_cov_min = float(args.corp_actions_min_rows_per_1k_assets)
    # Coverage floor is meaningful only for derived/preserved contract modes.
    # Provider-raw materialization can be intentionally scoped by ingest budget,
    # so quality is validated via raw/materialized consistency checks instead.
    corp_cov_scope_applied = bool(
        snapshot_asset_ids_total > 0
        and corp_source_mode in {"derived_from_adjusted_close_factor", "preserved_existing_snapshot_layer"}
        and (not corp_is_placeholder)
    )
    corp_cov_observed_low = bool(
        corp_cov_scope_applied
        and corp_rows_per_1k_assets < corp_cov_min
    )
    checks["contract_corp_actions_coverage_min_ok"] = (not corp_cov_observed_low) or corp_cov_mode in {"off", "warn"}
    if corp_cov_observed_low:
        msg = (
            "CONTRACT_CORP_ACTIONS_COVERAGE_LOW:"
            f"rows_per_1k_assets={corp_rows_per_1k_assets:.3f};min={corp_cov_min:.3f};"
            f"source_mode={corp_source_mode or 'unknown'}"
        )
        if corp_cov_mode == "hard":
            checks["contract_corp_actions_coverage_min_ok"] = False
        else:
            warnings.append(msg)
    data_truth["corp_actions_coverage_policy"] = {
        "mode": corp_cov_mode,
        "scope": "derived_or_preserved_source_modes",
        "scope_applied": bool(corp_cov_scope_applied),
        "min_rows_per_1k_assets": float(corp_cov_min),
        "observed_rows_per_1k_assets": float(corp_rows_per_1k_assets),
        "is_low": bool(corp_cov_observed_low),
        "cap_hit_failure_mode": cap_hit_mode,
        "raw_empty_fallback_failure_mode": raw_empty_fallback_mode,
        "raw_materialization_min_ratio": float(corp_raw_materialization_ratio_min),
        "raw_materialization_drop_failure_mode": str(corp_raw_materialization_drop_mode),
        "require_provider_raw_corp_actions": bool(args.require_provider_raw_corp_actions),
        "require_provider_raw_delistings": bool(args.require_provider_raw_delistings),
        "provider_raw_requirement_failure_mode": str(provider_raw_req_mode),
    }
    if raw_corp_rows_total > 0 and corp_source_mode != "provider_raw_corp_actions":
        warnings.append(
            f"CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED:raw_rows={raw_corp_rows_total};source_mode={corp_source_mode or 'unknown'}"
        )
    if bool(raw_delist_stats.get("present")) and delist_source_mode == "provider_raw_delistings" and int(raw_delist_stats.get("rows_total") or 0) <= 0:
        warnings.append("CONTRACT_DELISTINGS_PROVIDER_RAW_EMPTY:raw_rows=0")
    if (
        delist_source_mode == "provider_raw_delistings"
        and raw_delist_rows_total > 0
        and delist_rows > 0
        and (float(delist_rows) / float(raw_delist_rows_total)) < 0.90
    ):
        warnings.append(
            f"CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH:materialized_rows={delist_rows};raw_rows={raw_delist_rows_total}"
        )

    if bool(args.require_contract_layers):
        checks["contract_layers_required_ok"] = all(
            [
                checks["snapshot_manifest_present"],
                checks["snapshot_manifest_readable"],
                checks["contract_layers_manifest_present"],
                checks["contract_layers_manifest_readable"],
                checks["corp_actions_parquet_present"],
                checks["delistings_parquet_present"],
                checks["snapshot_has_contract_hashes"],
                checks["contract_raw_source_dirs_present"],
                checks["contract_snapshot_asset_ids_consistent"],
                checks["contract_corp_actions_raw_materialization_consistent"],
                checks["contract_corp_actions_raw_materialization_ratio_ok"],
                checks["contract_delistings_raw_materialization_consistent"],
            ]
        )
    else:
        checks["contract_layers_required_ok"] = True

    if bool(args.require_tri_layer):
        checks["tri_layer_required_ok"] = all(
            [
                checks["snapshot_manifest_present"],
                checks["snapshot_manifest_readable"],
                checks["tri_layers_manifest_present"],
                checks["tri_layers_manifest_readable"],
                checks["tri_parquet_present"],
                checks["tri_rows_nonzero"],
                checks["snapshot_has_tri_hashes"],
                checks["tri_asof_matches_snapshot_asof"],
                checks["tri_snapshot_id_matches_snapshot_id"],
                checks["tri_asset_classes_nonempty"],
                checks["tri_asset_classes_subset_of_snapshot"],
                checks["tri_selected_assets_consistent"],
                checks["tri_rows_not_exceed_bars_rows"],
            ]
        )
    else:
        checks["tri_layer_required_ok"] = True

    data_truth["paths"] = {
        "contract_layers_manifest": str(contract_manifest_path) if contract_manifest_path else "",
        "corp_actions_parquet": str(corp_actions_path) if corp_actions_path else "",
        "delistings_parquet": str(delistings_path) if delistings_path else "",
        "tri_layers_manifest": str(tri_manifest_path) if tri_manifest_path else "",
        "tri_parquet": str(tri_parquet_path) if tri_parquet_path else "",
    }
    data_truth["required"] = {
        "contract_layers": bool(args.require_contract_layers),
        "tri_layer": bool(args.require_tri_layer),
        "real_corp_actions": bool(args.require_real_corp_actions),
        "real_delistings": bool(args.require_real_delistings),
        "contract_placeholder_failure_mode": placeholder_mode,
        "corp_actions_cap_hit_failure_mode": str(args.corp_actions_cap_hit_failure_mode),
        "corp_actions_raw_empty_fallback_failure_mode": str(args.corp_actions_raw_empty_fallback_failure_mode),
        "corp_actions_raw_materialization_min_ratio": float(args.corp_actions_raw_materialization_min_ratio),
        "corp_actions_raw_materialization_drop_failure_mode": str(args.corp_actions_raw_materialization_drop_failure_mode),
        "corp_actions_min_rows_per_1k_assets": float(args.corp_actions_min_rows_per_1k_assets),
        "corp_actions_coverage_failure_mode": str(args.corp_actions_coverage_failure_mode),
    }
    data_truth["observed"] = {
        "contract_corp_actions_real": bool(not corp_is_placeholder),
        "contract_delistings_real": bool(not delist_is_placeholder),
    }
    all_ok = all(checks.values())

    report = {
        "schema": "quantlab_q1_reconciliation_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": all_ok,
        "inputs": {
            "delta_manifest": str(delta_manifest_path),
            "increment_snapshot_manifest": str(inc_snap_manifest_path),
            "increment_feature_manifest": str(inc_feat_manifest_path),
        },
        "checks": checks,
        "stats": {
            "delta_manifest_stats": {
                "selected_packs_total": delta_stats.get("selected_packs_total"),
                "packs_done": delta_stats.get("packs_done"),
                "bars_rows_emitted_delta": delta_stats.get("bars_rows_emitted_delta"),
                "assets_emitted_delta": delta_stats.get("assets_emitted_delta"),
                "rows_skipped_old_or_known": delta_stats.get("rows_skipped_old_or_known"),
                "rows_skipped_duplicate_in_run": delta_stats.get("rows_skipped_duplicate_in_run"),
                "bars_rows_scanned_in_selected_packs": delta_stats.get("bars_rows_scanned_in_selected_packs"),
                "noop_no_changed_packs": noop_no_changed_packs,
            },
            "delta_quality_scan": quality,
            "increment_snapshot_counts": snap_counts,
            "increment_feature_counts": feat_counts,
            "data_truth": data_truth,
            "delta_scan_accounting": {
                "rows_emitted": delta_rows_emitted,
                "rows_skipped_old_or_known": delta_rows_skipped_old_or_known,
                "rows_skipped_duplicate_in_run": delta_rows_skipped_duplicate_in_run,
                "sum_emitted_plus_skipped": delta_scan_accounting_sum,
                "rows_scanned_manifest": delta_rows_scanned_manifest,
            },
        },
        "expectations": {
            "expect_nonzero_delta": expect_nonzero,
            "effective_expect_nonzero": effective_expect_nonzero,
            "expected_min_delta_rows": expected_min_rows if expect_nonzero else None,
        },
        "warnings": warnings,
        "hashes": {
            "delta_manifest_hash": stable_hash_file(delta_manifest_path),
            "increment_snapshot_manifest_hash": stable_hash_file(inc_snap_manifest_path),
            "increment_feature_manifest_hash": stable_hash_file(inc_feat_manifest_path),
            "snapshot_manifest_hash": stable_hash_file(snap_manifest_path) if snap_manifest_path and snap_manifest_path.exists() else "",
        },
    }
    atomic_write_json(report_path, report)
    latest_ptr = quant_root / "ops" / "q1_reconciliation" / "latest_success.json"
    atomic_write_json(latest_ptr, {"schema": "quantlab_q1_reconciliation_latest_success_v1", "updated_at": utc_now_iso(), "run_id": run_id, "report_path": str(report_path), "ok": all_ok, "checks": checks})

    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={all_ok}")
    if not all_ok:
        failed = [k for k,v in checks.items() if not v]
        print(f"failed_checks={','.join(failed)}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
