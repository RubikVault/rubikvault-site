#!/usr/bin/env python3
"""Compact internal learning NDJSON ledgers into shadow Parquet datasets."""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DATE_KEYS = ("asof", "as_of", "date", "created_at", "emitted_at")


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
    parser = argparse.ArgumentParser(description="Shadow-compact mirrors/learning NDJSON to Parquet.")
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--input-root", type=Path, default=Path("mirrors/learning"))
    parser.add_argument("--output-root", type=Path, default=Path("mirrors/learning/parquet_shadow"))
    parser.add_argument(
        "--pattern",
        action="append",
        default=["*.ndjson", "*.jsonl", "*.ndjson.gz", "*.jsonl.gz"],
        help="Glob pattern under input root. Repeatable.",
    )
    parser.add_argument("--limit-records", type=int)
    parser.add_argument("--chunk-size", type=int, default=250_000)
    parser.add_argument("--compression", default="snappy")
    parser.add_argument("--dry-run", action="store_true", help="Scan/report only; no pyarrow needed.")
    return parser.parse_args()


def abs_path(repo_root: Path, value: Path) -> Path:
    return value if value.is_absolute() else repo_root / value


def safe_partition(value: Any) -> str:
    text = str(value if value not in (None, "") else "unknown").replace("/", "_")
    return re.sub(r"[^A-Za-z0-9_.=-]", "_", text)[:96] or "unknown"


def iter_files(input_root: Path, patterns: list[str], output_root: Path) -> Iterable[Path]:
    seen: set[Path] = set()
    for pattern in patterns:
        for path in sorted(input_root.rglob(pattern)):
            if path in seen or output_root in path.parents:
                continue
            seen.add(path)
            yield path


def open_text(path: Path):
    if path.name.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8")
    return path.open("r", encoding="utf-8")


def record_date(record: dict[str, Any]) -> str:
    for key in DATE_KEYS:
        value = record.get(key)
        if isinstance(value, str) and re.match(r"^\d{4}-\d{2}", value):
            return value
    lifecycle = record.get("lifecycle")
    if isinstance(lifecycle, dict):
        value = lifecycle.get("emitted_at")
        if isinstance(value, str) and re.match(r"^\d{4}-\d{2}", value):
            return value
    return "unknown"


def dataset_slug(input_root: Path, source: Path) -> str:
    rel = source.relative_to(input_root)
    name = str(rel)
    for suffix in (".ndjson.gz", ".jsonl.gz", ".ndjson", ".jsonl"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    return safe_partition(name.replace(os.sep, "__"))


def normalize_record(input_root: Path, source: Path, row_number: int, record: dict[str, Any]) -> dict[str, Any]:
    date = record_date(record)
    year = date[:4] if re.match(r"^\d{4}", date) else "unknown"
    month = date[5:7] if re.match(r"^\d{4}-\d{2}", date) else "unknown"
    symbol = record.get("symbol") or record.get("ticker")
    asset_class = record.get("asset_class")
    horizon = record.get("horizon")
    asof = record.get("asof") or record.get("as_of") or record.get("date")
    verdict = record.get("verdict")
    return {
        "dataset": dataset_slug(input_root, source),
        "source_file": str(source),
        "row_number": row_number,
        "year": year,
        "month": month,
        "symbol": None if symbol is None else str(symbol),
        "asset_class": None if asset_class is None else str(asset_class),
        "horizon": None if horizon is None else str(horizon),
        "asof": None if asof is None else str(asof),
        "verdict": None if verdict is None else str(verdict),
        "_payload_json": json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
    }


def write_partition(rows: list[dict[str, Any]], output_root: Path, compression: str, part_index: int) -> Path:
    pa, pq = load_pyarrow()
    dataset = safe_partition(rows[0]["dataset"])
    year = safe_partition(rows[0]["year"])
    month = safe_partition(rows[0]["month"])
    dest_dir = output_root / f"dataset={dataset}" / f"year={year}" / f"month={month}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"part-{part_index:05d}.parquet"
    tmp = dest_dir / f".{dest.name}.{os.getpid()}.tmp"
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, tmp, compression=compression)
    os.replace(tmp, dest)
    return dest


def flush_groups(
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]],
    output_root: Path,
    compression: str,
    part_counters: dict[tuple[str, str, str], int],
) -> list[str]:
    written: list[str] = []
    for key, rows in sorted(grouped.items()):
        if not rows:
            continue
        part_index = part_counters[key]
        part_counters[key] += 1
        written.append(str(write_partition(rows, output_root, compression, part_index)))
        rows.clear()
    return written


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    input_root = abs_path(repo_root, args.input_root)
    output_root = abs_path(repo_root, args.output_root)
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    part_counters: dict[tuple[str, str, str], int] = defaultdict(int)
    pending_rows = 0
    scanned_files = 0
    valid_records = 0
    invalid_records = 0
    written_files: list[str] = []

    if not args.dry_run:
        if output_root.exists():
            shutil.rmtree(output_root)
        output_root.mkdir(parents=True, exist_ok=True)

    for source in iter_files(input_root, args.pattern, output_root):
        scanned_files += 1
        with open_text(source) as handle:
            for row_number, line in enumerate(handle, 1):
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    record = json.loads(stripped)
                except json.JSONDecodeError:
                    invalid_records += 1
                    continue
                if not isinstance(record, dict):
                    invalid_records += 1
                    continue
                row = normalize_record(input_root, source, row_number, record)
                grouped[(row["dataset"], row["year"], row["month"])].append(row)
                valid_records += 1
                pending_rows += 1
                if pending_rows >= args.chunk_size:
                    if not args.dry_run:
                        written_files.extend(flush_groups(grouped, output_root, args.compression, part_counters))
                    grouped.clear()
                    pending_rows = 0
                if args.limit_records and valid_records >= args.limit_records:
                    break
        if args.limit_records and valid_records >= args.limit_records:
            break

    if pending_rows and not args.dry_run:
        written_files.extend(flush_groups(grouped, output_root, args.compression, part_counters))

    manifest = {
        "schema": "learning_ndjson_parquet_shadow_manifest_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(input_root),
        "output_root": str(output_root),
        "dry_run": args.dry_run,
        "scanned_files": scanned_files,
        "valid_records": valid_records,
        "invalid_records": invalid_records,
        "written_files": written_files,
        "partitioning": ["dataset", "year", "month"],
    }
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if not args.dry_run:
        (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
