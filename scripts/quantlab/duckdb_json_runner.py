#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from typing import Iterable

import duckdb


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-json", action="store_true", dest="json_mode")
    parser.add_argument("-c", dest="sql", required=True)
    args = parser.parse_args(list(argv) if argv is not None else None)

    con = duckdb.connect(database=":memory:")
    try:
        rows = con.execute(args.sql).fetchall()
        cols = [desc[0] for desc in con.description or []]
    finally:
        con.close()

    payload = [dict(zip(cols, row)) for row in rows]
    print(json.dumps(payload, separators=(",", ":"), default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
