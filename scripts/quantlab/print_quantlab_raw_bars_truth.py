#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    local_today_iso,
    parse_iso_date,
    scan_raw_bars_truth,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--asset-types", default="stock,etf")
    p.add_argument("--reference-date", default="")
    p.add_argument("--provider", default="EODHD")
    p.add_argument("--stale-after-calendar-days", type=int, default=3)
    return p.parse_args(list(argv))


def _lag_days(older: str, newer: str) -> int | None:
    if not older or not newer:
        return None
    try:
        return max(0, (parse_iso_date(newer) - parse_iso_date(older)).days)
    except Exception:
        return None


def _age_days(value: str, reference: str) -> int | None:
    if not value or not reference:
        return None
    try:
        return max(0, (parse_iso_date(reference) - parse_iso_date(value)).days)
    except Exception:
        return None


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    asset_types = [part.strip().lower() for part in str(args.asset_types or "").split(",") if part.strip()]
    reference_date = str(args.reference_date or "").strip() or local_today_iso()
    truth = scan_raw_bars_truth(
        Path(args.quant_root).resolve(),
        asset_types,
        provider=str(args.provider or "EODHD"),
    )
    latest_canonical_by_type = dict(truth.get("latest_canonical_data_by_asset_type") or {})
    latest_any_by_type = dict(truth.get("latest_any_data_by_asset_type") or {})
    latest_bridge_by_type = dict(truth.get("latest_bridge_data_by_asset_type") or {})
    canonical_available = [asset_type for asset_type in asset_types if latest_canonical_by_type.get(asset_type)]
    canonical_missing = [asset_type for asset_type in asset_types if not latest_canonical_by_type.get(asset_type)]
    any_available = [asset_type for asset_type in asset_types if latest_any_by_type.get(asset_type)]
    canonical_dates = sorted(v for v in latest_canonical_by_type.values() if v)
    any_dates = sorted(v for v in latest_any_by_type.values() if v)
    latest_canonical_any = canonical_dates[-1] if canonical_dates else ""
    latest_any = any_dates[-1] if any_dates else ""
    latest_required_canonical = min((latest_canonical_by_type[t] for t in canonical_available), default="") if canonical_available else ""
    latest_required_any = min((latest_any_by_type[t] for t in any_available), default="") if any_available else ""
    latest_required_canonical_age = _age_days(latest_required_canonical, reference_date)
    latest_required_any_age = _age_days(latest_required_any, reference_date)
    bridge_only_advance = _lag_days(latest_required_canonical, latest_required_any)
    required_fresh = (
        not canonical_missing
        and latest_required_canonical_age is not None
        and latest_required_canonical_age <= int(args.stale_after_calendar_days)
    )
    reason_codes: list[str] = []
    if canonical_missing:
        reason_codes.append("RAW_BARS_MISSING_REQUIRED_TYPES:" + ",".join(sorted(canonical_missing)))
    if latest_required_canonical_age is None:
        reason_codes.append("RAW_BARS_REQUIRED_INGEST_DATE_UNKNOWN")
    elif latest_required_canonical_age > int(args.stale_after_calendar_days):
        reason_codes.append(
            f"RAW_BARS_REQUIRED_TYPES_STALE:latest_required_ingest_date={latest_required_canonical}:age_days={latest_required_canonical_age}"
        )
    if bridge_only_advance is not None and bridge_only_advance > 0:
        reason_codes.append(
            f"RAW_BARS_ONLY_BRIDGE_ADVANCED:latest_required_ingest_date={latest_required_canonical}:"
            f"latest_required_any_ingest_date={latest_required_any}:lag_days={bridge_only_advance}"
        )
    payload: dict[str, Any] = {
        "provider": str(args.provider or "EODHD"),
        "asset_types_required": list(asset_types),
        "latest_ingest_by_asset_type": latest_canonical_by_type,
        "latest_any_ingest_by_asset_type": latest_any_by_type,
        "latest_bridge_ingest_by_asset_type": latest_bridge_by_type,
        "latest_canonical_partition_by_asset_type": dict(truth.get("latest_canonical_partition_by_asset_type") or {}),
        "latest_any_partition_by_asset_type": dict(truth.get("latest_any_partition_by_asset_type") or {}),
        "latest_bridge_partition_by_asset_type": dict(truth.get("latest_bridge_partition_by_asset_type") or {}),
        "latest_canonical_data_by_asset_type": latest_canonical_by_type,
        "latest_any_data_by_asset_type": latest_any_by_type,
        "latest_bridge_data_by_asset_type": latest_bridge_by_type,
        "available_required_asset_types": canonical_available,
        "available_required_asset_types_any": any_available,
        "missing_required_asset_types": canonical_missing,
        "latest_canonical_any_ingest_date": latest_canonical_any,
        "latest_any_ingest_date": latest_any,
        "latest_any_data_date": latest_any,
        "latest_required_ingest_date": latest_required_canonical,
        "latest_required_data_date": latest_required_canonical,
        "latest_required_any_ingest_date": latest_required_any,
        "latest_required_any_data_date": latest_required_any,
        "reference_date": reference_date,
        "stale_after_calendar_days": int(args.stale_after_calendar_days),
        "latest_required_age_calendar_days": latest_required_canonical_age,
        "latest_required_any_age_calendar_days": latest_required_any_age,
        "bridge_only_advance_calendar_days": bridge_only_advance,
        "required_asset_types_fresh": bool(required_fresh),
        "canonical_part_required_asset_types_fresh": bool(required_fresh),
        "coverage_by_asset_type": dict(truth.get("coverage_by_asset_type") or {}),
        "reason_codes": reason_codes,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
