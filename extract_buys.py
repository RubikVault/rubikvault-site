#!/usr/bin/env python3
"""Export canonical Decision-Core BUY rows for dashboard_v7."""

from __future__ import annotations

import argparse
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_CORE_ROOT = ROOT / "public/data/decision-core/core"
DEFAULT_OUTPUT = ROOT / "public/data/ui/buy-signals-live.json"
REGISTRY_PATH = ROOT / "public/data/universe/v7/registry/registry.ndjson.gz"

EU_EXCHANGES = {
    "LSE", "XETRA", "F", "STU", "PA", "BR", "AS", "SW", "MI", "MC", "LS", "HE",
    "OL", "CO", "ST", "VI", "IR", "WA", "IS", "PR", "AT", "LU", "DU", "MU", "HM",
}
ASIA_EXCHANGES = {
    "TSE", "JPX", "TO", "HK", "SHE", "SHG", "SZSE", "SSE", "KS", "KQ", "TW", "TWO",
    "BK", "SET", "KLSE", "SG", "AU", "AX", "NSE", "BSE", "JK", "KAR",
}
US_EXCHANGES = {"US", "NYSE", "NASDAQ", "NYSEARCA", "AMEX", "BATS", "OTC"}


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def infer_region(asset_id: str) -> str:
    prefix = (asset_id.split(":", 1)[0] if ":" in asset_id else "US").upper()
    if prefix in EU_EXCHANGES:
        return "EU"
    if prefix in ASIA_EXCHANGES:
        return "ASIA"
    if prefix in US_EXCHANGES:
        return "US"
    return "OTHER"


def load_registry_meta() -> dict[str, dict]:
    meta: dict[str, dict] = {}
    if not REGISTRY_PATH.exists():
        return meta
    with gzip.open(REGISTRY_PATH, "rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            asset_id = str(row.get("canonical_id") or "").upper()
            if not asset_id:
                continue
            region = str(row.get("region") or row.get("region_norm") or "").upper()
            if region not in {"US", "EU", "ASIA"}:
                region = infer_region(asset_id)
            meta[asset_id] = {
                "symbol": row.get("symbol") or asset_id.split(":")[-1],
                "region": region,
                "type": str(row.get("type_norm") or row.get("asset_class") or "").upper(),
            }
    return meta


def iter_core_rows(core_root: Path):
    parts_dir = core_root / "parts"
    if not parts_dir.exists():
        return
    for part in sorted(parts_dir.glob("*.ndjson.gz")):
        with gzip.open(part, "rt", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                yield json.loads(line)


def signal_from_row(row: dict, registry: dict[str, dict]) -> dict | None:
    decision = row.get("decision") or {}
    if decision.get("primary_action") != "BUY":
        return None
    meta = row.get("meta") or {}
    evidence = row.get("evidence_summary") or {}
    horizons = row.get("horizons") or {}
    asset_id = str(meta.get("asset_id") or "").upper()
    reg = registry.get(asset_id, {})
    asset_type = str(meta.get("asset_type") or reg.get("type") or "").upper()
    region = reg.get("region") or infer_region(asset_id)
    if asset_type not in {"STOCK", "ETF"}:
        return None
    return {
        "id": asset_id,
        "symbol": reg.get("symbol") or asset_id.split(":")[-1],
        "type": asset_type,
        "region": region,
        "setup": decision.get("primary_setup") or "none",
        "bias": decision.get("bias") or "NEUTRAL",
        "reliability": decision.get("analysis_reliability") or "LOW",
        "ev_n": evidence.get("evidence_effective_n") or evidence.get("evidence_raw_n") or 0,
        "ev_bucket": evidence.get("ev_proxy_bucket") or "unavailable",
        "tail": evidence.get("tail_risk_bucket") or "UNKNOWN",
        "sh": (horizons.get("short_term") or {}).get("horizon_action") or "UNAVAILABLE",
        "md": (horizons.get("mid_term") or {}).get("horizon_action") or "UNAVAILABLE",
        "lg": (horizons.get("long_term") or {}).get("horizon_action") or "UNAVAILABLE",
        "sh_s": (horizons.get("short_term") or {}).get("horizon_setup") or "none",
        "md_s": (horizons.get("mid_term") or {}).get("horizon_setup") or "none",
        "lg_s": (horizons.get("long_term") or {}).get("horizon_setup") or "none",
        "max_entry_price": (row.get("trade_guard") or {}).get("max_entry_price"),
        "invalidation_level": (row.get("trade_guard") or {}).get("invalidation_level"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_CORE_ROOT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    core_root = Path(args.root).resolve()
    output = Path(args.output).resolve()
    manifest = read_json(core_root / "manifest.json")
    registry = load_registry_meta()
    signals = [s for row in iter_core_rows(core_root) if (s := signal_from_row(row, registry))]
    signals.sort(key=lambda item: (
        {"US": 0, "EU": 1, "ASIA": 2}.get(item["region"], 9),
        item["type"],
        item["id"],
    ))
    doc = {
        "schema": "rv.dashboard_buy_signals_live.v1",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "target_market_date": manifest.get("target_market_date"),
        "source": "decision_core",
        "total_buy": len(signals),
        "signals": signals,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(doc, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(json.dumps({k: doc[k] for k in ["schema", "target_market_date", "source", "total_buy"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
