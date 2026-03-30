#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Iterable

import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    read_json,
    stable_hash_file,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--force-empty", action="store_true", default=False)
    p.add_argument(
        "--source-policy",
        choices=["preserve_existing", "derive_if_empty", "force_derive"],
        default="derive_if_empty",
    )
    p.add_argument("--derive-from-adjusted-close", action="store_true", default=True)
    p.add_argument("--skip-derive-from-adjusted-close", dest="derive_from_adjusted_close", action="store_false")
    p.add_argument("--derivation-min-rel-change", type=float, default=0.001)
    p.add_argument("--derivation-split-threshold", type=float, default=0.10)
    p.add_argument("--max-derived-corp-events", type=int, default=250000)
    p.add_argument("--raw-provider", default="EODHD")
    p.add_argument("--raw-ingest-date", default="", help="Optional ingest_date override for raw corp/delistings source")
    p.add_argument("--use-raw-corp-actions", action="store_true", default=True)
    p.add_argument("--skip-use-raw-corp-actions", dest="use_raw_corp_actions", action="store_false")
    p.add_argument("--use-raw-delistings", action="store_true", default=True)
    p.add_argument("--skip-use-raw-delistings", dest="use_raw_delistings", action="store_false")
    p.add_argument("--require-real-corp-actions", action="store_true", default=False)
    p.add_argument("--require-real-delistings", action="store_true", default=False)
    p.add_argument("--placeholder-failure-mode", choices=["off", "warn", "hard"], default="warn")
    return p.parse_args(list(argv))


def _write_empty_parquet(path: Path, schema: pa.Schema) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tbl = pa.Table.from_pylist([], schema=schema)
    pq.write_table(tbl, path, compression="snappy")


def _parquet_rows(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        pf = pq.ParquetFile(path)
        return int(pf.metadata.num_rows or 0)
    except Exception:
        return 0


def _bars_root_from_manifest(manifest: dict[str, Any], snap_dir: Path) -> Path:
    artifacts = manifest.get("artifacts") or {}
    raw = str(artifacts.get("bars_dataset_root") or "")
    if raw:
        p = Path(raw)
        return p if p.is_absolute() else (snap_dir / p)
    return snap_dir / "bars"


def _derive_corp_actions_from_adjusted_close(
    *,
    bars_root: Path,
    min_rel_change: float,
    split_threshold: float,
    max_events: int,
) -> tuple[pl.DataFrame | None, dict[str, Any]]:
    diagnostics: dict[str, Any] = {
        "bars_root": str(bars_root),
        "bars_files_total": 0,
        "derivation_min_rel_change": float(min_rel_change),
        "derivation_split_threshold": float(split_threshold),
        "max_events": int(max_events),
    }
    if not bars_root.exists():
        diagnostics["status"] = "bars_root_missing"
        return None, diagnostics

    files = sorted(bars_root.rglob("*.parquet"))
    diagnostics["bars_files_total"] = len(files)
    if not files:
        diagnostics["status"] = "bars_files_missing"
        return None, diagnostics

    required_cols = {"asset_id", "date", "close_raw", "adjusted_close_raw"}
    try:
        schema_cols = set(pq.ParquetFile(files[0]).schema.names)
    except Exception as exc:
        diagnostics["status"] = "bars_schema_unreadable"
        diagnostics["error"] = str(exc)
        return None, diagnostics
    if not required_cols.issubset(schema_cols):
        diagnostics["status"] = "required_columns_missing"
        diagnostics["required_cols"] = sorted(required_cols)
        diagnostics["available_cols"] = sorted(schema_cols)
        return None, diagnostics

    glob_pattern = str(bars_root / "**" / "*.parquet")
    lf = (
        pl.scan_parquet(glob_pattern, hive_partitioning=True)
        .select(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("close_raw").cast(pl.Float64),
                pl.col("adjusted_close_raw").cast(pl.Float64),
            ]
        )
        .filter(pl.col("asset_id").is_not_null() & pl.col("date").is_not_null())
        .filter(pl.col("close_raw") > 0)
        .filter(pl.col("adjusted_close_raw") > 0)
        .sort(["asset_id", "date"])
        .with_columns((pl.col("adjusted_close_raw") / pl.col("close_raw")).alias("_adj_factor"))
        .with_columns(pl.col("_adj_factor").shift(1).over("asset_id").alias("_prev_adj_factor"))
        .with_columns(
            (pl.col("_adj_factor") / pl.when(pl.col("_prev_adj_factor") > 0).then(pl.col("_prev_adj_factor")).otherwise(None)).alias("_factor_change")
        )
        .with_columns((pl.col("_factor_change") - 1.0).abs().alias("_rel_change"))
        .filter(pl.col("_prev_adj_factor").is_not_null())
        .filter(pl.col("_rel_change") >= float(min_rel_change))
        .with_columns(
            [
                pl.when(pl.col("_rel_change") >= float(split_threshold)).then(pl.lit("split")).otherwise(pl.lit("dividend_cash")).alias("action_type"),
                pl.when(pl.col("_rel_change") >= float(split_threshold)).then(pl.col("_factor_change")).otherwise(None).alias("split_factor"),
                pl.when(pl.col("_rel_change") < float(split_threshold))
                .then((pl.col("close_raw") * (1.0 - pl.col("_factor_change"))).abs())
                .otherwise(None)
                .alias("dividend_cash"),
                pl.when(pl.col("_rel_change") >= float(split_threshold)).then(pl.lit(0.35)).otherwise(pl.lit(0.25)).alias("source_confidence"),
            ]
        )
        .with_columns(pl.concat_str([pl.col("asset_id"), pl.col("date").cast(pl.Utf8), pl.col("action_type")], separator="|").alias("ca_id"))
        .select(
            [
                pl.col("asset_id"),
                pl.col("date").alias("effective_date"),
                pl.col("action_type"),
                pl.col("split_factor"),
                pl.col("dividend_cash"),
                pl.col("source_confidence"),
                pl.col("ca_id"),
            ]
        )
    )
    if max_events > 0:
        lf = lf.limit(int(max_events))
    df = lf.collect(engine="streaming")
    diagnostics["status"] = "ok"
    diagnostics["derived_rows_total"] = int(df.height)
    return df, diagnostics


def _find_latest_raw_subdir(
    *,
    quant_root: Path,
    provider: str,
    subdir: str,
    ingest_date_override: str = "",
) -> Path | None:
    def _dir_rows_total(p: Path) -> int:
        if not p.exists() or not p.is_dir():
            return 0
        total = 0
        for fp in sorted(p.glob("*.parquet")):
            try:
                total += int(pq.ParquetFile(fp).metadata.num_rows or 0)
            except Exception:
                continue
        return int(total)

    root = quant_root / "data" / "raw" / f"provider={provider}"
    if not root.exists():
        return None
    if ingest_date_override:
        p = root / f"ingest_date={ingest_date_override}" / subdir
        if p.exists() and _dir_rows_total(p) > 0:
            return p
        # If the override directory is present but empty (for example due auth/API
        # failures), fall back to the newest non-empty ingest date.
    candidates = sorted(root.glob("ingest_date=*"), key=lambda p: p.name)
    for ingest_dir in reversed(candidates):
        p = ingest_dir / subdir
        if p.exists() and _dir_rows_total(p) > 0:
            return p
    return None


def _snapshot_asset_ids(bars_root: Path) -> set[str]:
    if not bars_root.exists():
        return set()
    files = sorted(bars_root.rglob("*.parquet"))
    if not files:
        return set()
    lf = pl.scan_parquet(str(bars_root / "**" / "*.parquet"), hive_partitioning=True).select(pl.col("asset_id").cast(pl.Utf8))
    df = lf.unique().collect(engine="streaming")
    return {str(x) for x in (df.get_column("asset_id").to_list() if "asset_id" in df.columns else []) if str(x)}


def _materialize_raw_contract_source(
    *,
    raw_dir: Path | None,
    out_path: Path,
    contract_kind: str,
    asset_ids: set[str],
) -> tuple[int, str]:
    if raw_dir is None or not raw_dir.exists():
        return 0, "raw_source_missing"
    parquet_files = sorted(raw_dir.glob("*.parquet"))
    if not parquet_files:
        return 0, "raw_source_empty"

    glob_pattern = str(raw_dir / "*.parquet")
    if contract_kind == "corp_actions":
        lf = pl.scan_parquet(glob_pattern).select(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("effective_date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("action_type").cast(pl.Utf8),
                pl.col("split_factor").cast(pl.Float64),
                pl.col("dividend_cash").cast(pl.Float64),
                pl.col("source_confidence").cast(pl.Float64),
                pl.col("ca_id").cast(pl.Utf8),
            ]
        )
        if asset_ids:
            lf = lf.filter(pl.col("asset_id").is_in(list(asset_ids)))
        lf = lf.filter(pl.col("asset_id").is_not_null() & pl.col("effective_date").is_not_null())
        df = lf.collect(engine="streaming")
        if df.is_empty():
            return 0, "raw_source_no_matching_rows"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(out_path)
        return int(df.height), "provider_raw_corp_actions"

    if contract_kind == "delistings":
        lf = pl.scan_parquet(glob_pattern).select(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("delist_date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("delist_code").cast(pl.Utf8),
                pl.col("delist_return_raw").cast(pl.Float64),
                pl.col("delist_haircut_applied").cast(pl.Boolean),
                pl.col("delist_return_used").cast(pl.Float64),
                pl.col("delist_severity").cast(pl.Utf8),
            ]
        )
        if asset_ids:
            lf = lf.filter(pl.col("asset_id").is_in(list(asset_ids)))
        lf = lf.filter(pl.col("asset_id").is_not_null() & pl.col("delist_date").is_not_null())
        df = lf.collect(engine="streaming")
        if df.is_empty():
            return 0, "raw_source_no_matching_rows"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(out_path)
        return int(df.height), "provider_raw_delistings"

    return 0, "raw_source_invalid_kind"


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_materialized_snapshot_dir(quant_root)
    manifest_path = snap_dir / "snapshot_manifest.json"
    manifest = read_json(manifest_path)

    corp_schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("effective_date", pa.date32()),
            ("action_type", pa.string()),
            ("split_factor", pa.float64()),
            ("dividend_cash", pa.float64()),
            ("source_confidence", pa.float64()),
            ("ca_id", pa.string()),
        ]
    )
    delist_schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("delist_date", pa.date32()),
            ("delist_code", pa.string()),
            ("delist_return_raw", pa.float64()),
            ("delist_haircut_applied", pa.bool_()),
            ("delist_return_used", pa.float64()),
            ("delist_severity", pa.string()),
        ]
    )

    corp_path = snap_dir / "corp_actions.parquet"
    delist_path = snap_dir / "delistings.parquet"
    corp_rows = 0
    delist_rows = 0
    corp_mode = "empty_contracted_placeholder"
    delist_mode = "empty_contracted_placeholder"
    warnings: list[str] = []
    gate_failures: list[str] = []
    derivation_diagnostics: dict[str, Any] = {}

    existing_corp_rows = _parquet_rows(corp_path)
    existing_delist_rows = _parquet_rows(delist_path)
    bars_root = _bars_root_from_manifest(manifest, snap_dir)
    asset_ids = _snapshot_asset_ids(bars_root)
    raw_corp_dir = _find_latest_raw_subdir(
        quant_root=quant_root,
        provider=str(args.raw_provider),
        subdir="corp_actions",
        ingest_date_override=str(args.raw_ingest_date or ""),
    )
    raw_delist_dir = _find_latest_raw_subdir(
        quant_root=quant_root,
        provider=str(args.raw_provider),
        subdir="delistings",
        ingest_date_override=str(args.raw_ingest_date or ""),
    )

    if args.force_empty:
        _write_empty_parquet(corp_path, corp_schema)
        _write_empty_parquet(delist_path, delist_schema)
        corp_mode = "forced_empty_placeholder"
        delist_mode = "forced_empty_placeholder"
        corp_rows = 0
        delist_rows = 0
    else:
        source_policy = str(args.source_policy)

        wrote_corp = False
        # 1) Prefer provider raw corp-actions if configured and available.
        if bool(args.use_raw_corp_actions):
            raw_rows, raw_mode = _materialize_raw_contract_source(
                raw_dir=raw_corp_dir,
                out_path=corp_path,
                contract_kind="corp_actions",
                asset_ids=asset_ids,
            )
            if raw_rows > 0:
                corp_rows = int(raw_rows)
                corp_mode = raw_mode
                wrote_corp = True
            else:
                derivation_diagnostics["raw_corp_actions_status"] = raw_mode

        # 2) Keep existing snapshot layer if policy allows and still no corp rows.
        if (not wrote_corp) and source_policy in {"preserve_existing", "derive_if_empty"} and existing_corp_rows > 0:
            corp_rows = int(existing_corp_rows)
            corp_mode = "preserved_existing_snapshot_layer"
            wrote_corp = True

        # 3) Fallback derive from adjusted-close factor if configured.
        if (not wrote_corp) and bool(args.derive_from_adjusted_close) and source_policy in {"derive_if_empty", "force_derive"}:
            derived_df, derivation_diagnostics = _derive_corp_actions_from_adjusted_close(
                bars_root=bars_root,
                min_rel_change=float(args.derivation_min_rel_change),
                split_threshold=float(args.derivation_split_threshold),
                max_events=int(args.max_derived_corp_events),
            )
            if derived_df is not None and derived_df.height > 0:
                corp_path.parent.mkdir(parents=True, exist_ok=True)
                derived_df.write_parquet(corp_path)
                corp_rows = int(derived_df.height)
                corp_mode = "derived_from_adjusted_close_factor"
                wrote_corp = True
            elif derived_df is not None and derived_df.height == 0:
                corp_mode = "derived_empty_no_adjustment_signals"

        if not wrote_corp:
            _write_empty_parquet(corp_path, corp_schema)
            corp_rows = 0
            if corp_mode != "derived_empty_no_adjustment_signals":
                corp_mode = "empty_contracted_placeholder"

        wrote_delist = False
        # 1) Prefer provider/registry raw delistings if configured and available.
        if bool(args.use_raw_delistings):
            raw_rows, raw_mode = _materialize_raw_contract_source(
                raw_dir=raw_delist_dir,
                out_path=delist_path,
                contract_kind="delistings",
                asset_ids=asset_ids,
            )
            if raw_rows > 0:
                delist_rows = int(raw_rows)
                delist_mode = raw_mode
                wrote_delist = True
            else:
                derivation_diagnostics["raw_delistings_status"] = raw_mode

        # 2) Preserve existing if policy allows.
        if (not wrote_delist) and source_policy in {"preserve_existing", "derive_if_empty"} and existing_delist_rows > 0:
            delist_rows = int(existing_delist_rows)
            delist_mode = "preserved_existing_snapshot_layer"
            wrote_delist = True

        if not wrote_delist:
            _write_empty_parquet(delist_path, delist_schema)
            delist_rows = 0
            delist_mode = "empty_contracted_placeholder"

    corp_is_placeholder = bool(corp_rows <= 0 or "placeholder" in str(corp_mode) or str(corp_mode).startswith("derived_empty"))
    delist_is_placeholder = bool(delist_rows <= 0 or "placeholder" in str(delist_mode))

    if bool(args.require_real_corp_actions) and corp_is_placeholder:
        gate_failures.append("REQUIRE_REAL_CORP_ACTIONS_NOT_MET")
    if bool(args.require_real_delistings) and delist_is_placeholder:
        gate_failures.append("REQUIRE_REAL_DELISTINGS_NOT_MET")

    if gate_failures and str(args.placeholder_failure_mode) == "warn":
        warnings.extend(gate_failures)

    contract_info = {
        "schema": "quantlab_contract_layers_q1_v2",
        "generated_at": utc_now_iso(),
        "snapshot_id": manifest.get("snapshot_id"),
        "force_empty": bool(args.force_empty),
        "policy": {
            "source_policy": str(args.source_policy),
            "raw_provider": str(args.raw_provider),
            "raw_ingest_date": str(args.raw_ingest_date or ""),
            "use_raw_corp_actions": bool(args.use_raw_corp_actions),
            "use_raw_delistings": bool(args.use_raw_delistings),
            "derive_from_adjusted_close": bool(args.derive_from_adjusted_close),
            "derivation_min_rel_change": float(args.derivation_min_rel_change),
            "derivation_split_threshold": float(args.derivation_split_threshold),
            "max_derived_corp_events": int(args.max_derived_corp_events),
            "require_real_corp_actions": bool(args.require_real_corp_actions),
            "require_real_delistings": bool(args.require_real_delistings),
            "placeholder_failure_mode": str(args.placeholder_failure_mode),
        },
        "gates": {
            "corp_is_placeholder": bool(corp_is_placeholder),
            "delist_is_placeholder": bool(delist_is_placeholder),
            "gate_failures": gate_failures,
            "warnings": warnings,
        },
        "derivation": derivation_diagnostics,
        "raw_sources": {
            "corp_actions_dir": str(raw_corp_dir) if raw_corp_dir else "",
            "delistings_dir": str(raw_delist_dir) if raw_delist_dir else "",
            "snapshot_asset_ids_total": int(len(asset_ids)),
        },
        "corp_actions": {
            "path": str(corp_path),
            "rows": int(corp_rows),
            "schema": [{"name": f.name, "type": str(f.type)} for f in corp_schema],
            "source_mode": corp_mode,
            "reason": (
                "Preserved existing snapshot contract layer."
                if corp_mode == "preserved_existing_snapshot_layer"
                else (
                    "Loaded from provider raw corp-actions feed."
                    if corp_mode == "provider_raw_corp_actions"
                    else (
                        "Derived from adjusted/close factor-change signals."
                        if corp_mode == "derived_from_adjusted_close_factor"
                        else "Q1 contract layer remains placeholder."
                    )
                )
            ),
        },
        "delistings": {
            "path": str(delist_path),
            "rows": int(delist_rows),
            "schema": [{"name": f.name, "type": str(f.type)} for f in delist_schema],
            "source_mode": delist_mode,
            "reason": (
                "Preserved existing snapshot contract layer."
                if delist_mode == "preserved_existing_snapshot_layer"
                else (
                    "Loaded from provider/registry raw delistings feed."
                    if delist_mode == "provider_raw_delistings"
                    else "Delisting feed integration deferred; contract established in Q1"
                )
            ),
        },
    }
    contract_path = snap_dir / "contract_layers_manifest.json"
    atomic_write_json(contract_path, contract_info)

    manifest.setdefault("artifacts", {})
    manifest["artifacts"].update(
        {
            "corp_actions_parquet": str(corp_path),
            "delistings_parquet": str(delist_path),
            "contract_layers_manifest": str(contract_path),
        }
    )
    manifest.setdefault("counts", {})
    manifest["counts"]["corp_actions_rows_total"] = int(corp_rows)
    manifest["counts"]["delistings_rows_total"] = int(delist_rows)
    manifest.setdefault("hashes", {})
    manifest["hashes"]["contract_layers_manifest_hash"] = stable_hash_file(contract_path)
    manifest["hashes"]["corp_actions_hash"] = stable_hash_file(corp_path)
    manifest["hashes"]["delistings_hash"] = stable_hash_file(delist_path)
    atomic_write_json(manifest_path, manifest)

    print(f"snapshot_id={manifest.get('snapshot_id')}")
    print(f"corp_actions_rows={corp_rows} mode={corp_mode} path={corp_path}")
    print(f"delistings_rows={delist_rows} mode={delist_mode} path={delist_path}")
    print(f"gate_failures={len(gate_failures)}")
    print(f"warnings={len(warnings)}")
    if gate_failures and str(args.placeholder_failure_mode) == "hard":
        return 42
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
