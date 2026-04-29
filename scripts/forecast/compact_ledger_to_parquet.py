#!/usr/bin/env python3
"""Compact forecast NDJSON.GZ ledger files into internal partitioned Parquet."""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import shutil
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


STRING_FIELDS = (
    "schema",
    "schema_version",
    "record_status",
    "forecast_id",
    "outcome_id",
    "ticker",
    "horizon",
    "trading_date",
    "forecast_trading_date",
    "outcome_trading_date",
    "as_of",
    "provenance",
    "run_id",
    "champion_id",
    "champion_spec_hash",
    "policy_hash",
    "code_hash",
    "feature_snapshot_hash",
    "event_bucket",
)
FLOAT_FIELDS = ("p_up", "conf")
INT_FIELDS = ("y",)
BOOL_FIELDS = ("neutral_flag",)


def load_pyarrow():
    try:
        import pyarrow as pa  # type: ignore
        import pyarrow.parquet as pq  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "pyarrow missing. Use QuantLab Python runtime or install pyarrow before writing Parquet."
        ) from exc
    return pa, pq


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Shadow-compact mirrors/forecast/ledger NDJSON.GZ files to Parquet."
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--ledger-root", type=Path, default=Path("mirrors/forecast/ledger"))
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("mirrors/forecast/ops/parquet-ledger"),
        help="Internal output root. Default stays under ignored forecast ops mirror.",
    )
    parser.add_argument(
        "--ledger-type",
        action="append",
        choices=("forecasts", "outcomes"),
        help="Ledger type to compact. Repeatable. Default: both.",
    )
    parser.add_argument("--start-month", help="Inclusive YYYY-MM source month.")
    parser.add_argument("--end-month", help="Inclusive YYYY-MM source month.")
    parser.add_argument("--limit-records", type=int, help="Stop after N valid records across all files.")
    parser.add_argument("--chunk-size", type=int, default=250_000, help="Rows to buffer before flushing parts.")
    parser.add_argument("--compression", default="snappy", help="Parquet compression. Default: snappy.")
    parser.add_argument("--dry-run", action="store_true", help="Scan/report only; no pyarrow needed.")
    return parser.parse_args()


def abs_path(repo_root: Path, value: Path) -> Path:
    return value if value.is_absolute() else repo_root / value


def month_key(path: Path) -> str | None:
    if not path.name.endswith(".ndjson.gz"):
        return None
    month = path.name[: -len(".ndjson.gz")]
    year = path.parent.name
    if re.fullmatch(r"\d{4}", year) and re.fullmatch(r"\d{2}", month):
        return f"{year}-{month}"
    return None


def iter_ledger_files(
    ledger_root: Path,
    ledger_types: Iterable[str],
    start_month: str | None,
    end_month: str | None,
) -> Iterable[tuple[str, str, str, Path]]:
    for ledger_type in ledger_types:
        type_root = ledger_root / ledger_type
        if not type_root.exists():
            continue
        for path in sorted(type_root.glob("*/*.ndjson.gz")):
            key = month_key(path)
            if not key:
                continue
            if start_month and key < start_month:
                continue
            if end_month and key > end_month:
                continue
            yield ledger_type, key[:4], key[5:7], path


def safe_partition(value: Any) -> str:
    text = str(value if value not in (None, "") else "unknown")
    text = text.replace("/", "_")
    return re.sub(r"[^A-Za-z0-9_.=-]", "_", text)[:96] or "unknown"


def as_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def as_int(value: Any) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None


def normalize_record(record: dict[str, Any], ledger_type: str, year: str, month: str, source: Path) -> dict[str, Any]:
    row: dict[str, Any] = {
        "ledger_type": ledger_type,
        "year": year,
        "month": month,
        "source_file": str(source),
        "_payload_json": json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
    }
    for field in STRING_FIELDS:
        value = record.get(field)
        row[field] = None if value is None else str(value)
    for field in FLOAT_FIELDS:
        row[field] = as_float(record.get(field))
    for field in INT_FIELDS:
        row[field] = as_int(record.get(field))
    for field in BOOL_FIELDS:
        value = record.get(field)
        row[field] = value if isinstance(value, bool) else None
    row["horizon"] = row.get("horizon") or "none"
    return row


def iter_records(path: Path) -> Iterable[tuple[int, dict[str, Any] | None, str | None]]:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError as exc:
                yield line_no, None, str(exc)
                continue
            if not isinstance(value, dict):
                yield line_no, None, "record_not_object"
                continue
            yield line_no, value, None


def write_partition(
    rows: list[dict[str, Any]],
    output_root: Path,
    ledger_type: str,
    compression: str,
    part_index: int,
) -> Path:
    pa, pq = load_pyarrow()
    year = safe_partition(rows[0]["year"])
    month = safe_partition(rows[0]["month"])
    horizon = safe_partition(rows[0].get("horizon"))
    dest_dir = output_root / ledger_type / f"year={year}" / f"month={month}" / f"horizon={horizon}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"part-{part_index:05d}.parquet"
    tmp = dest_dir / f".{dest.name}.{os.getpid()}.tmp"
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, tmp, compression=compression)
    os.replace(tmp, dest)
    return dest


def clear_month_partition(output_root: Path, ledger_type: str, year: str, month: str) -> None:
    month_dir = output_root / ledger_type / f"year={safe_partition(year)}" / f"month={safe_partition(month)}"
    if month_dir.exists():
        shutil.rmtree(month_dir)


def flush_groups(
    grouped: dict[str, list[dict[str, Any]]],
    output_root: Path,
    ledger_type: str,
    compression: str,
    part_counters: dict[str, int],
) -> list[str]:
    written: list[str] = []
    for horizon, rows in sorted(grouped.items()):
        if not rows:
            continue
        part_index = part_counters[horizon]
        part_counters[horizon] += 1
        written.append(str(write_partition(rows, output_root, ledger_type, compression, part_index)))
        rows.clear()
    return written


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    ledger_root = abs_path(repo_root, args.ledger_root)
    output_root = abs_path(repo_root, args.output_root)
    ledger_types = args.ledger_type or ["forecasts", "outcomes"]
    scanned_files = 0
    valid_records = 0
    invalid_records = 0
    written_files: list[str] = []

    for ledger_type, year, month, path in iter_ledger_files(
        ledger_root, ledger_types, args.start_month, args.end_month
    ):
        scanned_files += 1
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        part_counters: dict[str, int] = defaultdict(int)
        pending_rows = 0
        if not args.dry_run:
            output_root.mkdir(parents=True, exist_ok=True)
            clear_month_partition(output_root, ledger_type, year, month)
        for _, record, error in iter_records(path):
            if error:
                invalid_records += 1
                continue
            assert record is not None
            row = normalize_record(record, ledger_type, year, month, path)
            grouped[safe_partition(row["horizon"])].append(row)
            valid_records += 1
            pending_rows += 1
            if pending_rows >= args.chunk_size:
                if not args.dry_run:
                    written_files.extend(
                        flush_groups(grouped, output_root, ledger_type, args.compression, part_counters)
                    )
                grouped.clear()
                pending_rows = 0
            if args.limit_records and valid_records >= args.limit_records:
                break
        if pending_rows and not args.dry_run:
            written_files.extend(flush_groups(grouped, output_root, ledger_type, args.compression, part_counters))
        if args.limit_records and valid_records >= args.limit_records:
            break

    manifest = {
        "schema": "forecast_ledger_parquet_compaction_manifest_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(ledger_root),
        "output_root": str(output_root),
        "dry_run": args.dry_run,
        "scanned_files": scanned_files,
        "valid_records": valid_records,
        "invalid_records": invalid_records,
        "written_files": written_files,
        "partitioning": ["ledger_type", "year", "month", "horizon"],
    }
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if not args.dry_run:
        (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
