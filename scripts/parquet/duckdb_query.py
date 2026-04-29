#!/usr/bin/env python3
"""Local DuckDB query helper for internal Parquet hot-zone reads."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


def load_duckdb():
    try:
        import duckdb  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "duckdb Python package missing. Install/use existing QuantLab runtime before Parquet queries."
        ) from exc
    return duckdb


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local DuckDB SQL against Parquet/JSON working-set files."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--sql", help="SQL string to execute.")
    source.add_argument("--sql-file", type=Path, help="File containing SQL to execute.")
    parser.add_argument("--database", default=":memory:", help="DuckDB database path. Default: :memory:.")
    parser.add_argument(
        "--format",
        choices=("json", "jsonl", "csv"),
        default="json",
        help="Output format. Default: json.",
    )
    parser.add_argument("--output", type=Path, help="Optional output file. Default: stdout.")
    parser.add_argument("--threads", type=int, help="Optional DuckDB PRAGMA threads value.")
    return parser.parse_args()


def rows_as_dicts(cursor) -> list[dict]:
    columns = [item[0] for item in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def write_output(rows: list[dict], fmt: str, target: Path | None) -> None:
    handle = target.open("w", encoding="utf-8", newline="") if target else sys.stdout
    close_handle = target is not None
    try:
        if fmt == "json":
            json.dump(rows, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            return
        if fmt == "jsonl":
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            return
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        writer.writerows(rows)
    finally:
        if close_handle:
            handle.close()


def main() -> int:
    args = parse_args()
    sql = args.sql_file.read_text(encoding="utf-8") if args.sql_file else args.sql
    duckdb = load_duckdb()
    con = duckdb.connect(args.database)
    try:
        if args.threads:
            con.execute(f"PRAGMA threads={int(args.threads)}")
        cursor = con.execute(sql)
        rows = rows_as_dicts(cursor)
        write_output(rows, args.format, args.output)
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
