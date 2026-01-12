from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple


def _load_symbol_records(path: Path) -> List[dict]:
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    records: List[dict] = []
    for entry in raw:
        if isinstance(entry, str):
            symbol = entry.strip().upper()
            if symbol:
                records.append({"symbol": symbol, "name": None})
            continue
        if isinstance(entry, dict):
            symbol = (
                entry.get("s")
                or entry.get("symbol")
                or entry.get("ticker")
                or entry.get("id")
            )
            if not symbol:
                continue
            records.append(
                {
                    "symbol": str(symbol).strip().upper(),
                    "name": entry.get("n") or entry.get("name"),
                }
            )
    return records


def _merge_records(*record_lists: List[dict]) -> Tuple[List[str], Dict[str, str]]:
    names: Dict[str, str] = {}
    symbols: List[str] = []
    seen = set()
    for records in record_lists:
        for record in records:
            symbol = record.get("symbol")
            if not symbol:
                continue
            if symbol not in seen:
                symbols.append(symbol)
                seen.add(symbol)
            name = record.get("name")
            if name and symbol not in names:
                names[symbol] = name
    return symbols, names


def build_universe(root_dir: Path, tier_b_limit: int = 500) -> dict:
    root = Path(root_dir)
    sources = {
        "sp500": root / "data" / "symbols" / "sp500.json",
        "nasdaq100": root / "data" / "symbols" / "nasdaq.json",
        "dow30": root / "data" / "symbols" / "dow.json",
        "russell2000": root / "data" / "symbols" / "russell.json",
    }

    sp500 = _load_symbol_records(sources["sp500"])
    nasdaq = _load_symbol_records(sources["nasdaq100"])
    dow = _load_symbol_records(sources["dow30"])
    tier_a_symbols, tier_a_names = _merge_records(sp500, nasdaq, dow)

    russell = _load_symbol_records(sources["russell2000"])
    tier_b_symbols, tier_b_names = _merge_records(russell)

    tier_b_sampled = False
    if tier_b_limit and len(tier_b_symbols) > tier_b_limit:
        tier_b_sampled = True
        tier_b_symbols = sorted(tier_b_symbols)[:tier_b_limit]

    tier_a_symbols = sorted(set(tier_a_symbols))
    tier_b_symbols = sorted(set(tier_b_symbols))
    names = {**tier_a_names, **tier_b_names}

    return {
        "tiers": {"A": tier_a_symbols, "B": tier_b_symbols},
        "names": names,
        "sources": {
            "A": ["data/symbols/sp500.json", "data/symbols/nasdaq.json", "data/symbols/dow.json"],
            "B": ["data/symbols/russell.json"],
        },
        "bias": {"survivorship": "present"},
        "tierBSampled": tier_b_sampled,
    }
