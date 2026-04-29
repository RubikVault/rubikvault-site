#!/usr/bin/env python3
"""Export hist-probs JSON profiles to an internal shadow Parquet store."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


METRIC_FIELDS = (
    "n",
    "avg_return",
    "median_return",
    "std_return",
    "win_rate",
    "max_drawdown",
    "mae",
    "mfe",
)


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
        description="Build internal hist-probs Parquet shadow from public JSON profiles."
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--input-root", type=Path, default=Path("public/data/hist-probs"))
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("mirrors/learning/hist_probs_parquet_shadow"),
        help="Internal output root. Default is ignored via mirrors/learning.",
    )
    parser.add_argument("--tickers", help="Comma-separated ticker allowlist.")
    parser.add_argument("--max-profiles", type=int, help="Limit parsed profiles for shadow tests.")
    parser.add_argument("--compression", default="snappy")
    parser.add_argument("--dry-run", action="store_true", help="Scan/report only; no pyarrow needed.")
    return parser.parse_args()


def abs_path(repo_root: Path, value: Path) -> Path:
    return value if value.is_absolute() else repo_root / value


def normalize_ticker(value: Any) -> str:
    return str(value or "").strip().upper()


def shard_prefix(ticker: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9]", "", ticker)
    return (cleaned[:2] or cleaned[:1] or "__").ljust(2, "_")


def safe_partition(value: Any) -> str:
    text = str(value if value not in (None, "") else "unknown")
    text = text.replace("/", "_")
    return re.sub(r"[^A-Za-z0-9_.=-]", "_", text)[:96] or "unknown"


def parse_year(profile: dict[str, Any]) -> str:
    for key in ("latest_date", "computed_at"):
        value = str(profile.get(key) or "")
        if re.match(r"^\d{4}", value):
            return value[:4]
    return "unknown"


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


def load_profile(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict):
        return None
    ticker = normalize_ticker(value.get("ticker"))
    if not ticker or not isinstance(value.get("events"), dict):
        return None
    return value


def pick_profile_paths(input_root: Path, allowlist: set[str] | None, max_profiles: int | None) -> dict[str, Path]:
    selected: dict[str, tuple[tuple[int, int], Path]] = {}
    for path in sorted(input_root.rglob("*.json")):
        profile = load_profile(path)
        if not profile:
            continue
        ticker = normalize_ticker(profile.get("ticker"))
        if allowlist and ticker not in allowlist:
            continue
        is_sharded = int(path.parent != input_root)
        try:
            mtime_ns = path.stat().st_mtime_ns
        except OSError:
            mtime_ns = 0
        rank = (is_sharded, mtime_ns)
        current = selected.get(ticker)
        if current is None or rank > current[0]:
            selected[ticker] = (rank, path)
        if max_profiles and len(selected) >= max_profiles and not allowlist:
            break
    return {ticker: path for ticker, (_, path) in selected.items()}


def profile_rows(path: Path, profile: dict[str, Any]) -> list[dict[str, Any]]:
    ticker = normalize_ticker(profile.get("ticker"))
    year = parse_year(profile)
    rows: list[dict[str, Any]] = []
    for event_key, horizons in sorted((profile.get("events") or {}).items()):
        if not isinstance(horizons, dict):
            continue
        for horizon_key, metrics in sorted(horizons.items()):
            if not isinstance(metrics, dict):
                continue
            horizon_text = str(horizon_key)
            horizon = horizon_text[1:] if horizon_text.startswith("h") else horizon_text
            row: dict[str, Any] = {
                "ticker": ticker,
                "symbol_prefix": shard_prefix(ticker),
                "symbol_partition": safe_partition(ticker),
                "year": year,
                "latest_date": profile.get("latest_date"),
                "computed_at": profile.get("computed_at"),
                "bars_count": as_int(profile.get("bars_count")),
                "event_key": str(event_key),
                "horizon": horizon,
                "source_path": str(path),
            }
            for field in METRIC_FIELDS:
                value = metrics.get(field)
                row[field] = as_int(value) if field == "n" else as_float(value)
            rows.append(row)
    return rows


def write_symbol_year(rows: list[dict[str, Any]], output_root: Path, compression: str) -> Path:
    pa, pq = load_pyarrow()
    prefix = safe_partition(rows[0]["symbol_prefix"])
    symbol = safe_partition(rows[0]["symbol_partition"])
    year = safe_partition(rows[0]["year"])
    dest_dir = output_root / f"symbol_prefix={prefix}" / f"symbol={symbol}" / f"year={year}"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "data.parquet"
    tmp = dest_dir / f".data.{os.getpid()}.tmp.parquet"
    table = pa.Table.from_pylist(rows)
    pq.write_table(table, tmp, compression=compression)
    os.replace(tmp, dest)
    return dest


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    input_root = abs_path(repo_root, args.input_root)
    output_root = abs_path(repo_root, args.output_root)
    allowlist = {normalize_ticker(item) for item in args.tickers.split(",") if item.strip()} if args.tickers else None
    profile_paths = pick_profile_paths(input_root, allowlist, args.max_profiles)
    total_rows = 0
    written_files: list[str] = []
    empty_profiles = 0

    for ticker, path in sorted(profile_paths.items()):
        profile = load_profile(path)
        if not profile:
            empty_profiles += 1
            continue
        rows = profile_rows(path, profile)
        if not rows:
            empty_profiles += 1
            continue
        total_rows += len(rows)
        if not args.dry_run:
            output_root.mkdir(parents=True, exist_ok=True)
            written_files.append(str(write_symbol_year(rows, output_root, args.compression)))

    manifest = {
        "schema": "hist_probs_parquet_shadow_manifest_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(input_root),
        "output_root": str(output_root),
        "dry_run": args.dry_run,
        "profiles": len(profile_paths),
        "empty_profiles": empty_profiles,
        "rows": total_rows,
        "written_files": written_files,
        "partitioning": ["symbol_prefix", "symbol", "year"],
        "json_boundary": "public/data/hist-probs remains JSON; this store is internal shadow only.",
    }
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if not args.dry_run:
        (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
