#!/usr/bin/env python3
"""Build a SQLite shadow store from public EOD history shards.

Shadow only. Does not change runtime readers or primary JSON/shard artifacts.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SHARDS_DIR = ROOT / "public/data/eod/history/shards"
DEFAULT_OUTPUT = ROOT / "var/private/sqlite-shadow/history-shadow.sqlite"
DEFAULT_REPORT = ROOT / "var/private/ops/sqlite-shadow-history-latest.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def iter_shards(shards_dir: Path):
    for path in sorted(shards_dir.glob("*.json")) + sorted(shards_dir.glob("*.json.gz")):
        if path.is_file():
            yield path


def atomic_replace(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    os.replace(src, dst)


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS bars_raw (
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          source_shard TEXT NOT NULL,
          PRIMARY KEY(symbol, date)
        );
        CREATE TABLE IF NOT EXISTS bars_adjusted (
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          adj_close REAL,
          volume REAL,
          adjustment_factor REAL,
          source_shard TEXT NOT NULL,
          PRIMARY KEY(symbol, date)
        );
        CREATE INDEX IF NOT EXISTS idx_bars_raw_date ON bars_raw(date);
        CREATE INDEX IF NOT EXISTS idx_bars_adjusted_date ON bars_adjusted(date);
        """
    )


def to_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def insert_symbol(conn: sqlite3.Connection, symbol: str, rows: list, source_shard: str) -> tuple[int, str | None]:
    raw_rows = []
    adjusted_rows = []
    latest_date = None
    for row in rows:
        if not isinstance(row, list) or len(row) < 7:
            continue
        date = str(row[0])[:10]
        open_, high, low, close, adj_close, volume = [to_float(v) for v in row[1:7]]
        if not date:
            continue
        latest_date = max(latest_date or date, date)
        factor = (adj_close / close) if close not in (None, 0) and adj_close is not None else 1.0
        raw_rows.append((symbol, date, open_, high, low, close, volume, source_shard))
        adjusted_rows.append((
            symbol,
            date,
            open_ * factor if open_ is not None else None,
            high * factor if high is not None else None,
            low * factor if low is not None else None,
            adj_close,
            adj_close,
            volume,
            factor,
            source_shard,
        ))
    if raw_rows:
        conn.executemany(
            "INSERT OR REPLACE INTO bars_raw(symbol,date,open,high,low,close,volume,source_shard) VALUES(?,?,?,?,?,?,?,?)",
            raw_rows,
        )
        conn.executemany(
            "INSERT OR REPLACE INTO bars_adjusted(symbol,date,open,high,low,close,adj_close,volume,adjustment_factor,source_shard) VALUES(?,?,?,?,?,?,?,?,?,?)",
            adjusted_rows,
        )
    return len(raw_rows), latest_date


def scalar(conn: sqlite3.Connection, sql: str):
    return conn.execute(sql).fetchone()[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shards-dir", default=str(DEFAULT_SHARDS_DIR))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--report", default=str(DEFAULT_REPORT))
    parser.add_argument("--target-market-date", default=os.environ.get("TARGET_MARKET_DATE") or os.environ.get("RV_TARGET_MARKET_DATE"))
    parser.add_argument("--max-symbols", type=int, default=0)
    args = parser.parse_args()

    shards_dir = Path(args.shards_dir).resolve()
    output = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    if not shards_dir.exists():
      raise SystemExit(f"SHARDS_DIR_MISSING:{shards_dir}")

    output.parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix="rv-sqlite-shadow-", dir=str(output.parent)))
    tmp_db = tmp_dir / "history-shadow.sqlite"
    conn = sqlite3.connect(tmp_db)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    create_schema(conn)

    symbols_seen = 0
    rows_written = 0
    latest_date = None
    shard_count = 0
    for shard in iter_shards(shards_dir):
        shard_count += 1
        payload = read_json(shard)
        if not isinstance(payload, dict):
            continue
        for symbol, bars in sorted(payload.items()):
            if args.max_symbols and symbols_seen >= args.max_symbols:
                break
            if not isinstance(bars, list):
                continue
            written, symbol_latest = insert_symbol(conn, str(symbol).upper(), bars, shard.name)
            if written:
                symbols_seen += 1
                rows_written += written
                latest_date = max(latest_date or symbol_latest, symbol_latest or latest_date)
        if args.max_symbols and symbols_seen >= args.max_symbols:
            break

    conn.executemany(
        "INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)",
        [
            ("schema", "rv.sqlite_shadow_history.v1"),
            ("generated_at", utc_now()),
            ("target_market_date", str(args.target_market_date or "")),
            ("source_shards_dir", str(shards_dir)),
            ("price_basis", "raw_and_adjusted"),
        ],
    )
    conn.commit()
    integrity = scalar(conn, "PRAGMA integrity_check")
    raw_count = scalar(conn, "SELECT COUNT(*) FROM bars_raw")
    adjusted_count = scalar(conn, "SELECT COUNT(*) FROM bars_adjusted")
    latest_raw = scalar(conn, "SELECT MAX(date) FROM bars_raw")
    conn.close()

    atomic_replace(tmp_db, output)
    for suffix in ("-wal", "-shm"):
        sidecar = tmp_db.with_name(tmp_db.name + suffix)
        if sidecar.exists():
            atomic_replace(sidecar, output.with_name(output.name + suffix))

    report = {
        "schema": "rv.sqlite_shadow_history_report.v1",
        "generated_at": utc_now(),
        "ok": integrity == "ok" and raw_count == adjusted_count and raw_count > 0,
        "mode": "shadow_only",
        "output": str(output),
        "source_shards_dir": str(shards_dir),
        "target_market_date": args.target_market_date,
        "shard_count": shard_count,
        "symbols_written": symbols_seen,
        "rows_written": rows_written,
        "raw_rows": raw_count,
        "adjusted_rows": adjusted_count,
        "latest_date": latest_raw,
        "integrity_check": integrity,
        "cutover_allowed": False,
        "primary_runtime_changed": False,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_report = report_path.with_suffix(report_path.suffix + f".{os.getpid()}.tmp")
    tmp_report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    atomic_replace(tmp_report, report_path)
    print(json.dumps({"ok": report["ok"], "report": str(report_path), "rows": rows_written, "symbols": symbols_seen}, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
