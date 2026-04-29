#!/usr/bin/env python3
"""Audit duplicate Parquet snapshot candidates in QuantLabHot without deleting files."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_ROOT = Path.home() / "QuantLabHot" / "rubikvault-quantlab"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Find duplicate Parquet snapshot candidates before adding new hot-zone stores."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--pattern", default="*.parquet")
    parser.add_argument("--max-files", type=int)
    parser.add_argument("--hash", action="store_true", help="Hash file contents, slower but exact.")
    parser.add_argument("--output", type=Path, help="Optional JSON report path.")
    return parser.parse_args()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scan(root: Path, pattern: str, max_files: int | None, exact_hash: bool) -> dict:
    candidates: dict[tuple, list[dict]] = defaultdict(list)
    total_files = 0
    total_bytes = 0
    for path in sorted(root.rglob(pattern)):
        if not path.is_file():
            continue
        stat = path.stat()
        total_files += 1
        total_bytes += stat.st_size
        if exact_hash:
            key = ("sha256", file_hash(path))
        else:
            key = ("name_size", path.name, stat.st_size)
        candidates[key].append(
            {
                "path": str(path),
                "size_bytes": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        )
        if max_files and total_files >= max_files:
            break

    groups = []
    reclaimable = 0
    for key, files in candidates.items():
        if len(files) < 2:
            continue
        keep = max(files, key=lambda item: item["mtime"])
        duplicates = [item for item in files if item["path"] != keep["path"]]
        reclaimable += sum(int(item["size_bytes"]) for item in duplicates)
        groups.append(
            {
                "key": list(key),
                "count": len(files),
                "keep_newest": keep,
                "duplicate_candidates": duplicates,
                "reclaimable_bytes": sum(int(item["size_bytes"]) for item in duplicates),
            }
        )

    groups.sort(key=lambda item: item["reclaimable_bytes"], reverse=True)
    return {
        "schema": "quantlab_parquet_duplicate_audit_v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "pattern": pattern,
        "mode": "sha256" if exact_hash else "name_size_candidate",
        "scanned_files": total_files,
        "scanned_bytes": total_bytes,
        "duplicate_groups": len(groups),
        "reclaimable_bytes": reclaimable,
        "groups": groups,
        "note": "Audit only. No files deleted or moved.",
    }


def main() -> int:
    args = parse_args()
    report = scan(args.root, args.pattern, args.max_files, args.hash)
    text = json.dumps(report, indent=2, sort_keys=True) + "\n"
    print(text, end="")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
