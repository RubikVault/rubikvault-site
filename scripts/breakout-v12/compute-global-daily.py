#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import resource
import time
import uuid
from pathlib import Path
from typing import Iterable, Any

import duckdb
import polars as pl


SCORE_VERSION = "breakout_scoring_v12_incremental_v1"


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Breakout V12 global date-local DuckDB pass.")
    p.add_argument("--as-of", required=True)
    p.add_argument("--candidate-root", required=True)
    p.add_argument("--metadata-parquet", default="")
    p.add_argument("--duckdb-temp-dir", default="")
    p.add_argument("--duckdb-memory-limit", default=os.environ.get("RV_BREAKOUT_DUCKDB_MEMORY_LIMIT", "2GB"))
    p.add_argument("--duckdb-threads", type=int, default=int(os.environ.get("DUCKDB_THREADS", "2") or "2"))
    p.add_argument("--max-top", type=int, default=500)
    p.add_argument("--max-shard", type=int, default=750)
    return p.parse_args(list(argv) if argv is not None else None)


def utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rss_mb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if value > 10_000_000:
        return round(value / 1024 / 1024, 3)
    return round(value / 1024, 3)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def append_ndjson(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, sort_keys=True) + "\n")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def stable_event_id(asset_id: str, as_of: str, score_version: str) -> str:
    return hashlib.sha256(f"{asset_id}|{as_of}|{score_version}".encode("utf-8")).hexdigest()[:32]


def clean_float(value: Any) -> float | None:
    try:
        number = float(value)
    except Exception:
        return None
    return number if math.isfinite(number) else None


def json_value(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return value


def infer_region_expr() -> str:
    return """
      CASE
        WHEN prefix = 'US' THEN 'US'
        WHEN prefix IN ('AS','BR','CO','F','HE','LSE','MC','MI','PA','ST','SW','VI','XETRA') THEN 'EU'
        WHEN prefix IN ('AU','HK','JK','KO','KQ','SHG','SHE','TSE','TO','TW','TWO') THEN 'ASIA'
        ELSE 'OTHER'
      END
    """


def sql_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def run_duckdb(args: argparse.Namespace, local_glob: str, scores_path: Path) -> dict[str, Any]:
    con = duckdb.connect()
    con.execute(f"PRAGMA threads={int(args.duckdb_threads)}")
    con.execute(f"PRAGMA memory_limit='{str(args.duckdb_memory_limit)}'")
    if args.duckdb_temp_dir:
        Path(args.duckdb_temp_dir).mkdir(parents=True, exist_ok=True)
        con.execute(f"PRAGMA temp_directory='{str(Path(args.duckdb_temp_dir).resolve())}'")

    metadata_path = Path(args.metadata_parquet).resolve() if args.metadata_parquet else None
    has_meta = bool(metadata_path and metadata_path.exists())
    meta_join = ""
    meta_select = """
      regexp_replace(l.asset_id, '^.*:', '') AS symbol,
      l.asset_id AS name,
      split_part(l.asset_id, ':', 1) AS prefix,
      'unknown' AS sector_raw,
      l.asset_class AS asset_class_meta
    """
    if has_meta:
        con.execute("CREATE TEMP VIEW meta AS SELECT * FROM read_parquet(?)", [str(metadata_path)])
        meta_join = "LEFT JOIN meta m ON l.asset_id = m.asset_id"
        meta_select = """
          COALESCE(CAST(m.symbol AS VARCHAR), regexp_replace(l.asset_id, '^.*:', '')) AS symbol,
          COALESCE(CAST(m.name AS VARCHAR), l.asset_id) AS name,
          COALESCE(CAST(m.exchange AS VARCHAR), split_part(l.asset_id, ':', 1)) AS prefix,
          COALESCE(CAST(m.sector AS VARCHAR), 'unknown') AS sector_raw,
          COALESCE(CAST(m.asset_class AS VARCHAR), l.asset_class) AS asset_class_meta
        """

    con.execute(f"CREATE TEMP VIEW local AS SELECT * FROM read_parquet({sql_quote(local_glob)})")
    sql = f"""
    CREATE TEMP VIEW enriched AS
      SELECT
        l.*,
        {meta_select}
      FROM local l
      {meta_join};

    CREATE TEMP VIEW ranked AS
      SELECT
        *,
        {infer_region_expr()} AS region,
        COALESCE(NULLIF(sector_raw, ''), 'unknown') AS sector,
        COALESCE(CUME_DIST() OVER (PARTITION BY COALESCE(NULLIF(sector_raw, ''), 'unknown') ORDER BY rvol20), 0.5) AS rvol_percentile_sector_252d,
        COALESCE(CUME_DIST() OVER (PARTITION BY COALESCE(NULLIF(sector_raw, ''), 'unknown') ORDER BY ret_63d), 0.5) AS sector_relative_strength_63d,
        COALESCE(CUME_DIST() OVER (ORDER BY ln(GREATEST(COALESCE(adv20_dollar, 0), 0) + 1)), 0.5) AS liquidity_score
      FROM enriched;

    CREATE TEMP VIEW regime AS
      SELECT
        COALESCE(AVG(CASE WHEN close_raw > sma_200 THEN 1.0 ELSE 0.0 END), 0.5) * 0.7
        + COALESCE(AVG(CASE WHEN ret_20d > 0 THEN 1.0 ELSE 0.0 END), 0.5) * 0.3 AS market_regime_score
      FROM ranked
      WHERE close_raw IS NOT NULL;

    CREATE TEMP VIEW breadth AS
      SELECT
        sector,
        COALESCE(AVG(CASE WHEN close_raw > sma_50 THEN 1.0 ELSE 0.0 END), 0.5) AS sector_breadth_score
      FROM ranked
      GROUP BY sector;

    CREATE TEMP VIEW scored AS
      SELECT
        sha256(r.asset_id || '|' || CAST(r.as_of AS VARCHAR) || '|{SCORE_VERSION}') AS event_hash,
        r.asset_id,
        r.symbol,
        r.name,
        LOWER(COALESCE(CAST(r.asset_class_meta AS VARCHAR), r.asset_class)) AS asset_class,
        r.region,
        r.sector,
        r.date,
        r.as_of,
        r.bucket,
        r.open_raw,
        r.high_raw,
        r.low_raw,
        r.close_raw,
        r.volume_raw,
        r.ret_20d,
        r.ret_63d,
        r.sma_50,
        r.sma_200,
        r.atr_14,
        r.atr_pct_14,
        r.adv20_dollar,
        r.rvol20,
        r.resistance_level,
        r.distance_to_resistance_atr,
        r.price_position_20d_range,
        r.rvol_percentile_asset_252d,
        r.atr_compression_percentile_252d,
        r.recent_signal_count_20d,
        r.rvol_percentile_sector_252d,
        r.sector_relative_strength_63d,
        r.liquidity_score,
        regime.market_regime_score,
        b.sector_breadth_score,
        LEAST(1.15, GREATEST(0.70, 0.75 + regime.market_regime_score * 0.45)) AS regime_multiplier,
        LEAST(1.0, GREATEST(0.0, 0.5 * COALESCE(1.0 - (r.distance_to_resistance_atr / 2.0), 0.0) + 0.5 * COALESCE(r.price_position_20d_range, 0.0))) AS structure_score,
        LEAST(1.0, GREATEST(0.0, COALESCE(r.rvol_percentile_sector_252d, r.rvol_percentile_asset_252d, 0.0))) AS volume_score,
        LEAST(1.0, GREATEST(0.0, 1.0 - COALESCE(r.atr_compression_percentile_252d, 0.5))) AS compression_score,
        LEAST(1.0, GREATEST(0.0, COALESCE(r.sector_relative_strength_63d, 0.5))) AS relative_strength_score
      FROM ranked r
      CROSS JOIN regime
      LEFT JOIN breadth b ON r.sector = b.sector;
    """
    con.execute(sql)
    scores_path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""
        COPY (
          SELECT
            *,
            LEAST(1.0, GREATEST(0.0,
              (
                0.30 * structure_score
                + 0.25 * volume_score
                + 0.15 * compression_score
                + 0.15 * relative_strength_score
                + 0.10 * liquidity_score
                + 0.05 * market_regime_score
              ) * regime_multiplier
            )) AS final_signal_score
          FROM scored
          ORDER BY final_signal_score DESC, asset_id
        ) TO '{str(scores_path)}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    counts = con.execute("SELECT count(*) AS rows, count(DISTINCT asset_id) AS assets FROM scored").fetchone()
    con.close()
    return {"rows": int(counts[0] or 0), "assets": int(counts[1] or 0), "metadata_joined": has_meta}


def build_item(row: dict[str, Any], rank: int, total: int) -> dict[str, Any]:
    asset_id = str(row.get("asset_id") or "")
    as_of = str(row.get("as_of") or "")[:10]
    final_score = float(clean_float(row.get("final_signal_score")) or 0.0)
    return {
        "event_id": stable_event_id(asset_id, as_of, SCORE_VERSION),
        "asset_id": asset_id,
        "symbol": row.get("symbol") or asset_id,
        "name": row.get("name") or asset_id,
        "asset_class": str(row.get("asset_class") or "").lower(),
        "region": str(row.get("region") or "OTHER").upper(),
        "sector": row.get("sector") or "unknown",
        "as_of": as_of,
        "feature_date": json_value(row.get("date")),
        "score_version": SCORE_VERSION,
        "scores": {
            "structure_score": clean_float(row.get("structure_score")),
            "volume_score": clean_float(row.get("volume_score")),
            "compression_score": clean_float(row.get("compression_score")),
            "relative_strength_score": clean_float(row.get("relative_strength_score")),
            "liquidity_score": clean_float(row.get("liquidity_score")),
            "regime_multiplier": clean_float(row.get("regime_multiplier")),
            "final_signal_score": final_score,
        },
        "features": {
            "distance_to_resistance_atr": clean_float(row.get("distance_to_resistance_atr")),
            "rvol_percentile_asset_252d": clean_float(row.get("rvol_percentile_asset_252d")),
            "rvol_percentile_sector_252d": clean_float(row.get("rvol_percentile_sector_252d")),
            "atr_compression_percentile_252d": clean_float(row.get("atr_compression_percentile_252d")),
            "sector_relative_strength_63d": clean_float(row.get("sector_relative_strength_63d")),
            "price_position_20d_range": clean_float(row.get("price_position_20d_range")),
            "liquidity_score": clean_float(row.get("liquidity_score")),
            "recent_signal_count_20d": clean_float(row.get("recent_signal_count_20d")),
            "market_regime_score": clean_float(row.get("market_regime_score")),
            "sector_breadth_score": clean_float(row.get("sector_breadth_score")),
        },
        "risk": {
            "close": clean_float(row.get("close_raw")),
            "atr14": clean_float(row.get("atr_14")),
            "resistance_level": clean_float(row.get("resistance_level")),
            "adv20_dollar": clean_float(row.get("adv20_dollar")),
        },
        "ui": {
            "label": "breakout_candidate" if final_score >= 0.55 else "breakout_watchlist",
            "rank": rank,
            "rank_percentile": round(1.0 - ((rank - 1) / max(1, total)), 6),
        },
        "reasons": [],
        "warnings": [],
    }


def write_public_json(args: argparse.Namespace, scores_path: Path, counts: dict[str, Any]) -> None:
    candidate_root = Path(args.candidate_root).resolve()
    public_root = candidate_root / "public"
    public_root.mkdir(parents=True, exist_ok=True)
    df = pl.read_parquet(scores_path)
    rows = df.head(max(int(args.max_top), int(args.max_shard))).to_dicts() if not df.is_empty() else []
    total = int(df.height)
    items = [build_item(row, idx + 1, total) for idx, row in enumerate(rows)]
    top_items = items[: int(args.max_top)]
    top_payload = {
        "schema_version": "breakout_top_scores_v1",
        "as_of": str(args.as_of)[:10],
        "generated_at": utc_now_iso(),
        "score_version": SCORE_VERSION,
        "count": len(top_items),
        "items": top_items,
    }
    atomic_write_json(public_root / "top500.json", top_payload)
    for region in sorted({str(item["region"] or "OTHER").upper() for item in items} | {"US", "EU", "ASIA", "OTHER"}):
        shard_items = [item for item in items if str(item["region"] or "OTHER").upper() == region][: int(args.max_shard)]
        shard_dir = public_root / "shards" / f"region={region}"
        atomic_write_json(
            shard_dir / "shard_000.json",
            {
                "schema_version": "breakout_top_scores_v1",
                "as_of": str(args.as_of)[:10],
                "generated_at": utc_now_iso(),
                "score_version": SCORE_VERSION,
                "count": len(shard_items),
                "items": shard_items,
            },
        )
        (shard_dir / "shard_000._SUCCESS").write_text("ok\n", encoding="utf-8")
    coverage = {
        "schema_version": "breakout_v12_coverage_v1",
        "run_id": candidate_root.name,
        "as_of": str(args.as_of)[:10],
        "ok": True,
        "counts": {
            "local_rows": int(counts["rows"]),
            "assets": int(counts["assets"]),
            "scores_computed": total,
            "top_signals": len(top_items),
        },
    }
    atomic_write_json(public_root / "coverage.json", coverage)
    atomic_write_json(public_root / "errors.json", {"schema_version": "breakout_errors_v1", "as_of": str(args.as_of)[:10], "errors": []})
    atomic_write_json(public_root / "health.json", {"schema_version": "breakout_health_v1", "as_of": str(args.as_of)[:10], "generated_at": utc_now_iso(), "status": "ok", "hard_fail": False, "alert": False})


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    started = time.time()
    candidate_root = Path(args.candidate_root).resolve()
    local_glob = str(candidate_root / "local" / f"date={str(args.as_of)[:10]}" / "bucket=*.parquet")
    local_files = sorted((candidate_root / "local" / f"date={str(args.as_of)[:10]}").glob("bucket=*.parquet"))
    if not local_files:
        raise SystemExit(f"FATAL: no local bucket files: {local_glob}")
    scores_path = candidate_root / "global" / f"date={str(args.as_of)[:10]}" / "scores.parquet"
    counts = run_duckdb(args, local_glob, scores_path)
    write_public_json(args, scores_path, counts)
    metadata = {
        "schema_version": "breakout_v12_global_metadata_v1",
        "generated_at": utc_now_iso(),
        "as_of": str(args.as_of)[:10],
        "score_version": SCORE_VERSION,
        "local_glob": local_glob,
        "scores_path": str(scores_path),
        "scores_sha256": file_sha256(scores_path),
        "counts": counts,
        "wall_sec": round(time.time() - started, 3),
        "peak_rss_mb": rss_mb(),
    }
    atomic_write_json(candidate_root / "global" / f"date={str(args.as_of)[:10]}" / "global_metadata.json", metadata)
    append_ndjson(candidate_root / "resources.ndjson", {"step": "global", "status": "ok", "wall_sec": metadata["wall_sec"], "peak_rss_mb": metadata["peak_rss_mb"], "rows_in": counts["rows"], "rows_out": counts["rows"], "asset_count": counts["assets"]})
    print(json.dumps({"ok": True, "metadata": str(candidate_root / "global" / f"date={str(args.as_of)[:10]}" / "global_metadata.json"), "counts": counts}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
