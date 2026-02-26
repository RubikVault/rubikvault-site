#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_QUANT_ROOT = "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def stable_hash_obj(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def stable_hash_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def latest_snapshot_dir(quant_root: Path) -> Path:
    base = quant_root / "data" / "snapshots"
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not candidates:
        raise FileNotFoundError(f"no snapshots found under {base}")
    candidates.sort(key=lambda p: p.name)
    return candidates[-1]


def latest_materialized_snapshot_dir(quant_root: Path) -> Path:
    base = quant_root / "data" / "snapshots"
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not candidates:
        raise FileNotFoundError(f"no snapshots found under {base}")
    materialized: list[Path] = []
    for snap in candidates:
        try:
            manifest = json.loads((snap / "snapshot_manifest.json").read_text())
            bars_root = (((manifest.get("artifacts") or {}).get("bars_dataset_root")) or "")
            if bars_root:
                materialized.append(snap)
        except Exception:
            continue
    pool = materialized or candidates
    pool.sort(key=lambda p: (p.stat().st_mtime_ns, p.name))
    return pool[-1]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())
