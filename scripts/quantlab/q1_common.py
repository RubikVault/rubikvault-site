#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pyarrow.parquet as pq


DEFAULT_QUANT_ROOT = os.environ.get(
    "QUANT_ROOT",
    "/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab" if Path("/volume1/homes/neoboy").exists()
    else "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def local_today_iso() -> str:
    return date.today().isoformat()


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def stable_hash_obj(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def stable_hash_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def extract_iso_date(value: Any) -> str:
    m = re.search(r"(\d{4}-\d{2}-\d{2})", str(value or ""))
    return m.group(1) if m else ""


def latest_snapshot_dir(quant_root: Path) -> Path:
    base = quant_root / "data" / "snapshots"
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not candidates:
        raise FileNotFoundError(f"no snapshots found under {base}")
    candidates.sort(key=lambda p: p.name)
    return candidates[-1]


def latest_materialized_snapshot_dir(quant_root: Path) -> Path:
    base = quant_root / "data" / "snapshots"
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not candidates:
        raise FileNotFoundError(f"no snapshots found under {base}")
    materialized: list[Path] = []
    for snap in candidates:
        try:
            manifest = json.loads((snap / "snapshot_manifest.json").read_text())
            bars_root = (((manifest.get("artifacts") or {}).get("bars_dataset_root")) or "")
            if bars_root:
                materialized.append(snap)
        except Exception:
            continue
    pool = materialized or candidates
    pool.sort(key=lambda p: (p.stat().st_mtime_ns, p.name))
    return pool[-1]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def normalize_run_token(value: Any, *, max_len: int = 48, default: str = "na") -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        return str(default)
    trimmed = text[: max(1, int(max_len))].rstrip("_")
    return trimmed or str(default)


def infer_panel_output_tag_from_part_glob(part_glob: Any) -> str:
    text = str(part_glob or "").strip()
    if not text:
        return ""
    if text.startswith("part-"):
        text = text[len("part-") :]
    if text.endswith(".parquet"):
        text = text[: -len(".parquet")]
    return text.strip()


def build_stagea_artifact_suffix(
    *,
    panel_output_tag: Any,
    top_liquid_n: int,
    fold_count: int,
    profile_payload: dict[str, Any],
    hash_len: int = 10,
) -> str:
    panel_token = normalize_run_token(panel_output_tag, max_len=40, default="panel")
    profile_hash = stable_hash_obj(profile_payload)[: max(4, int(hash_len))]
    return f"{panel_token}__top{int(top_liquid_n)}__f{int(fold_count)}__{profile_hash}"


def build_stagea_time_splits_run_id(asof_end_date: Any, *, run_suffix: str = "") -> str:
    asof = extract_iso_date(asof_end_date) or normalize_run_token(asof_end_date, max_len=20, default="unknown_asof")
    suffix = str(run_suffix or "").strip().strip("_")
    base = f"cheapgateA_tsplits_{asof}"
    return f"{base}__{suffix}" if suffix else base


def build_q1_panel_stagea_pipeline_run_id(asof_end_date: Any, *, run_suffix: str = "") -> str:
    asof = extract_iso_date(asof_end_date) or normalize_run_token(asof_end_date, max_len=20, default="unknown_asof")
    suffix = str(run_suffix or "").strip().strip("_")
    base = f"q1panel_stageA_{asof}"
    return f"{base}__{suffix}" if suffix else base


def build_isolated_registry_root(quant_root: Path, *, stage_b_run_id: Any) -> Path:
    token = normalize_run_token(stage_b_run_id, max_len=120, default="latest_stageb")
    return quant_root / "registry_eval" / f"stage_b_run_id={token}"


def stageb_report_metadata(report: dict[str, Any], report_path: Path | None = None) -> dict[str, Any]:
    refs = report.get("references") or {}
    method = report.get("method") or {}
    path = Path(report_path).resolve() if report_path else None
    run_id = str(report.get("run_id") or "")
    if not run_id and path is not None:
        run_id = path.parent.name.split("=", 1)[-1]
    stage_a_run_id = str(report.get("stage_a_run_id") or "")
    asof_date = (
        extract_iso_date(report.get("asof_date"))
        or extract_iso_date(refs.get("effective_asof_end_date"))
        or extract_iso_date(refs.get("requested_asof_end_date"))
        or extract_iso_date(stage_a_run_id)
        or extract_iso_date(run_id)
        or extract_iso_date(str(path or ""))
    )
    report_mtime_ns = 0
    if path is not None:
        try:
            report_mtime_ns = int(path.stat().st_mtime_ns)
        except Exception:
            report_mtime_ns = 0
    return {
        "report_path": str(path) if path is not None else "",
        "report_mtime_ns": report_mtime_ns,
        "run_id": run_id,
        "generated_at": str(report.get("generated_at") or ""),
        "stage_a_run_id": stage_a_run_id,
        "asof_date": asof_date,
        "ok": bool(report.get("ok")),
        "exit_code": int(report.get("exit_code") or 0),
        "v4_final_profile": bool(method.get("v4_final_profile")),
        "feature_store_version": str(refs.get("feature_store_version") or ""),
        "panel_output_tag": str(refs.get("panel_output_tag") or ""),
        "requested_asof_end_date": str(refs.get("requested_asof_end_date") or ""),
        "effective_asof_end_date": str(refs.get("effective_asof_end_date") or ""),
        "stage_a_pipeline_run_id": str(refs.get("stage_a_pipeline_run_id") or ""),
    }


def _stageb_selection_key(meta: dict[str, Any], *, profile_mode: str) -> tuple[Any, ...] | None:
    mode = str(profile_mode or "v4_final_preferred").strip().lower()
    is_v4_final = bool(meta.get("v4_final_profile"))
    if mode == "v4_final_only" and not is_v4_final:
        return None
    profile_pref = 1 if mode == "v4_final_preferred" and is_v4_final else 0
    return (
        profile_pref,
        str(meta.get("generated_at") or ""),
        int(meta.get("report_mtime_ns") or 0),
        str(meta.get("run_id") or ""),
    )


def select_canonical_stageb_reports(
    quant_root: Path,
    *,
    lookback_runs: int = 30,
    profile_mode: str = "v4_final_preferred",
) -> dict[str, dict[str, Any]]:
    runs_root = quant_root / "runs"
    candidates = sorted(
        runs_root.glob("run_id=q1stageb_*/stage_b_q1_run_report.json"),
        key=lambda p: p.stat().st_mtime_ns,
    )
    if int(lookback_runs) > 0:
        candidates = candidates[-int(lookback_runs) :]

    selected: dict[str, dict[str, Any]] = {}
    for report_path in candidates:
        try:
            report = read_json(report_path)
        except Exception:
            continue
        meta = stageb_report_metadata(report, report_path)
        asof_date = str(meta.get("asof_date") or "")
        if not asof_date:
            continue
        selection_key = _stageb_selection_key(meta, profile_mode=profile_mode)
        if selection_key is None:
            continue
        row = {
            **meta,
            "report": report,
            "report_path_obj": report_path,
            "_selection_key": selection_key,
        }
        prev = selected.get(asof_date)
        if prev is None or selection_key > tuple(prev.get("_selection_key") or ()):
            selected[asof_date] = row
    return selected


def safe_panel_lookback_calendar_days(
    min_bars: int,
    panel_days: int,
    *,
    forward_horizon_days: int = 20,
    trading_to_calendar_factor: float = 1.5,
    minimum: int = 420,
) -> int:
    trading_span = max(0, int(min_bars)) + max(0, int(panel_days)) + max(0, int(forward_horizon_days))
    estimated = int(math.ceil(float(trading_span) * float(trading_to_calendar_factor)))
    return max(int(minimum), estimated)


def resolve_panel_asof_end_date(
    requested_asof_end_date: str,
    panel_max_asof_date: str,
) -> dict[str, Any]:
    requested = str(requested_asof_end_date or "").strip()
    panel_max = str(panel_max_asof_date or "").strip()
    effective = requested or panel_max
    clamped = False
    reason = ""
    if requested and panel_max and requested > panel_max:
        effective = panel_max
        clamped = True
        reason = "REQUESTED_ASOF_GT_PANEL_MAX"
    return {
        "requested_asof_end_date": requested,
        "panel_max_asof_date": panel_max,
        "effective_asof_end_date": effective,
        "asof_end_was_clamped_to_panel_max": bool(clamped),
        "asof_end_clamp_reason": reason,
    }


def _normalize_asset_type(value: str) -> str:
    return str(value or "").strip().lower()


def _normalize_iso_date_like(value: Any) -> str:
    text = str(value or "").strip()[:10]
    return text if re.match(r"^\d{4}-\d{2}-\d{2}$", text) else ""


def _parquet_max_date(path: Path, *, column_name: str = "date") -> str:
    try:
        parquet = pq.ParquetFile(path)
        names = list(parquet.schema_arrow.names)
        if column_name not in names:
            return ""
        column_idx = names.index(column_name)
        best = ""
        for row_group_idx in range(parquet.num_row_groups):
            try:
                stats = parquet.metadata.row_group(row_group_idx).column(column_idx).statistics
            except Exception:
                stats = None
            if stats is None:
                continue
            current = _normalize_iso_date_like(getattr(stats, "max", ""))
            if current and current > best:
                best = current
        if best:
            return best
        table = parquet.read(columns=[column_name])
        if table.num_rows <= 0 or table.num_columns <= 0:
            return ""
        for raw in table.column(0).to_pylist():
            current = _normalize_iso_date_like(raw)
            if current and current > best:
                best = current
        return best
    except Exception:
        return ""


def scan_raw_bars_truth(
    quant_root: Path,
    asset_types: Iterable[str],
    *,
    provider: str = "EODHD",
) -> dict[str, Any]:
    provider_root = quant_root / "data" / "raw" / f"provider={provider}"
    normalized = [_normalize_asset_type(v) for v in asset_types if _normalize_asset_type(v)]
    latest_canonical_partition_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    latest_any_partition_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    latest_bridge_partition_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    latest_canonical_data_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    latest_any_data_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    latest_bridge_data_by_type: dict[str, str] = {asset_type: "" for asset_type in normalized}
    coverage_by_type: dict[str, dict[str, list[str]]] = {
        asset_type: {
            "canonical_part_dates": [],
            "any_parquet_dates": [],
            "bridge_only_dates": [],
            "canonical_part_data_dates": [],
            "any_parquet_data_dates": [],
            "bridge_only_data_dates": [],
        }
        for asset_type in normalized
    }
    if not provider_root.exists():
        return {
            "provider": str(provider),
            "asset_types_required": list(normalized),
            "latest_canonical_partition_by_asset_type": latest_canonical_partition_by_type,
            "latest_any_partition_by_asset_type": latest_any_partition_by_type,
            "latest_bridge_partition_by_asset_type": latest_bridge_partition_by_type,
            "latest_canonical_data_by_asset_type": latest_canonical_data_by_type,
            "latest_any_data_by_asset_type": latest_any_data_by_type,
            "latest_bridge_data_by_asset_type": latest_bridge_data_by_type,
            "coverage_by_asset_type": coverage_by_type,
        }
    for ingest_dir in sorted(provider_root.glob("ingest_date=*")):
        if not ingest_dir.is_dir():
            continue
        ingest_date = _normalize_iso_date_like(ingest_dir.name.split("ingest_date=", 1)[-1])
        if not ingest_date:
            continue
        for asset_type in normalized:
            asset_class_dir = ingest_dir / f"asset_class={asset_type}"
            asset_type_dir = ingest_dir / f"asset_type={asset_type}"
            target_dir = asset_class_dir if asset_class_dir.exists() else asset_type_dir if asset_type_dir.exists() else None
            if target_dir is None:
                continue
            parquet_files = sorted(p for p in target_dir.glob("*.parquet") if p.is_file())
            if not parquet_files:
                continue
            canonical_files = [
                p for p in parquet_files
                if p.name.lower() == "asset_bars.parquet" or re.match(r"^part_.*\.parquet$", p.name, re.IGNORECASE)
            ]
            bridge_files = [p for p in parquet_files if p.name.lower() == "manual_bridge.parquet"]
            any_max_date = max((_parquet_max_date(p) for p in parquet_files), default="")
            canonical_max_date = max((_parquet_max_date(p) for p in canonical_files), default="")
            bridge_max_date = max((_parquet_max_date(p) for p in bridge_files), default="")
            latest_any_partition_by_type[asset_type] = ingest_date
            if any_max_date:
                if any_max_date > str(latest_any_data_by_type.get(asset_type) or ""):
                    latest_any_data_by_type[asset_type] = any_max_date
                coverage_by_type[asset_type]["any_parquet_dates"].append(ingest_date)
                coverage_by_type[asset_type]["any_parquet_data_dates"].append(any_max_date)
            if canonical_files:
                latest_canonical_partition_by_type[asset_type] = ingest_date
                if canonical_max_date:
                    if canonical_max_date > str(latest_canonical_data_by_type.get(asset_type) or ""):
                        latest_canonical_data_by_type[asset_type] = canonical_max_date
                    coverage_by_type[asset_type]["canonical_part_dates"].append(ingest_date)
                    coverage_by_type[asset_type]["canonical_part_data_dates"].append(canonical_max_date)
            if bridge_files:
                latest_bridge_partition_by_type[asset_type] = ingest_date
                if bridge_max_date:
                    if bridge_max_date > str(latest_bridge_data_by_type.get(asset_type) or ""):
                        latest_bridge_data_by_type[asset_type] = bridge_max_date
                    coverage_by_type[asset_type]["bridge_only_dates"].append(ingest_date)
                    coverage_by_type[asset_type]["bridge_only_data_dates"].append(bridge_max_date)
    return {
        "provider": str(provider),
        "asset_types_required": list(normalized),
        "latest_canonical_partition_by_asset_type": latest_canonical_partition_by_type,
        "latest_any_partition_by_asset_type": latest_any_partition_by_type,
        "latest_bridge_partition_by_asset_type": latest_bridge_partition_by_type,
        "latest_canonical_data_by_asset_type": latest_canonical_data_by_type,
        "latest_any_data_by_asset_type": latest_any_data_by_type,
        "latest_bridge_data_by_asset_type": latest_bridge_data_by_type,
        "coverage_by_asset_type": coverage_by_type,
    }


def latest_raw_asset_bars_ingest_dates(
    quant_root: Path,
    asset_types: Iterable[str],
    *,
    provider: str = "EODHD",
) -> dict[str, str]:
    truth = scan_raw_bars_truth(quant_root, asset_types, provider=provider)
    return dict(truth.get("latest_any_data_by_asset_type") or {})


def build_raw_bars_freshness_summary(
    quant_root: Path,
    *,
    asset_types: Iterable[str],
    reference_date: str = "",
    provider: str = "EODHD",
    stale_after_calendar_days: int = 3,
) -> dict[str, Any]:
    normalized = [_normalize_asset_type(v) for v in asset_types if _normalize_asset_type(v)]
    truth = scan_raw_bars_truth(quant_root, normalized, provider=provider)
    latest_by_type = dict(truth.get("latest_any_data_by_asset_type") or {})
    latest_partition_by_type = dict(truth.get("latest_any_partition_by_asset_type") or {})
    available_required = [asset_type for asset_type in normalized if latest_by_type.get(asset_type)]
    missing_required = [asset_type for asset_type in normalized if not latest_by_type.get(asset_type)]
    available_dates = [v for v in latest_by_type.values() if v]
    latest_any = max(available_dates) if available_dates else ""
    latest_required = min((latest_by_type[t] for t in normalized if latest_by_type.get(t)), default="") if available_required else ""
    latest_any_partition = max((v for v in latest_partition_by_type.values() if v), default="")
    latest_required_partition = min(
        (latest_partition_by_type[t] for t in normalized if latest_partition_by_type.get(t)),
        default="",
    ) if available_required else ""
    ref_raw = str(reference_date or "").strip()
    if not ref_raw:
        ref_raw = local_today_iso()
    ref_date = parse_iso_date(ref_raw)
    latest_required_age_days: int | None = None
    if latest_required:
        try:
            latest_required_age_days = max(0, (ref_date - parse_iso_date(latest_required)).days)
        except Exception:
            latest_required_age_days = None
    required_fresh = (
        not missing_required
        and latest_required_age_days is not None
        and latest_required_age_days <= int(stale_after_calendar_days)
    )
    reason_codes: list[str] = []
    if missing_required:
        reason_codes.append(
            "RAW_BARS_MISSING_REQUIRED_TYPES:" + ",".join(sorted(missing_required))
        )
    if latest_required_age_days is None:
        reason_codes.append("RAW_BARS_REQUIRED_INGEST_DATE_UNKNOWN")
    elif latest_required_age_days > int(stale_after_calendar_days):
        reason_codes.append(
            f"RAW_BARS_REQUIRED_TYPES_STALE:latest_required_ingest_date={latest_required}:age_days={latest_required_age_days}"
        )
    return {
        "provider": str(provider),
        "asset_types_required": list(normalized),
        "latest_ingest_by_asset_type": latest_by_type,
        "latest_partition_by_asset_type": latest_partition_by_type,
        "latest_data_date_by_asset_type": latest_by_type,
        "latest_canonical_data_by_asset_type": dict(truth.get("latest_canonical_data_by_asset_type") or {}),
        "latest_bridge_data_by_asset_type": dict(truth.get("latest_bridge_data_by_asset_type") or {}),
        "available_required_asset_types": available_required,
        "missing_required_asset_types": missing_required,
        "latest_any_ingest_date": latest_any,
        "latest_any_partition_date": latest_any_partition,
        "latest_any_data_date": latest_any,
        "latest_required_ingest_date": latest_required,
        "latest_required_partition_date": latest_required_partition,
        "latest_required_data_date": latest_required,
        "reference_date": ref_raw,
        "stale_after_calendar_days": int(stale_after_calendar_days),
        "latest_required_age_calendar_days": latest_required_age_days,
        "required_asset_types_fresh": bool(required_fresh),
        "coverage_by_asset_type": dict(truth.get("coverage_by_asset_type") or {}),
        "reason_codes": reason_codes,
    }
