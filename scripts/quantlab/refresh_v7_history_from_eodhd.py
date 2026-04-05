#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


BASE_URL = "https://eodhd.com/api"
EODHD_DISABLED_REASON: str | None = None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def local_today_iso() -> str:
    return date.today().isoformat()


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def write_ndjson_gz(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            fh.write("\n")
    tmp.replace(path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(str(value).strip()[:10])


def _pid_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False


def acquire_job_lock(lock_path: Path) -> None:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getpid(),
        "started_at": utc_now_iso(),
        "host": os.uname().nodename if hasattr(os, "uname") else "",
    }
    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(json.dumps(payload, ensure_ascii=False))
            return
        except FileExistsError:
            try:
                existing = json.loads(lock_path.read_text())
                existing_pid = int(existing.get("pid") or 0)
            except Exception:
                existing_pid = 0
            if existing_pid and _pid_is_running(existing_pid):
                raise RuntimeError(f"job_lock_active pid={existing_pid} lock={lock_path}")
            try:
                lock_path.unlink()
            except FileNotFoundError:
                pass


def release_job_lock(lock_path: Path | None) -> None:
    if not lock_path:
        return
    try:
        lock_path.unlink()
    except FileNotFoundError:
        pass


def resolve_repo_rel(repo_root: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (repo_root / p)


def load_env_value(env_path: Path, key_names: Iterable[str]) -> str:
    wanted = [str(key).strip() for key in key_names if str(key).strip()]
    if not wanted:
        raise RuntimeError("env_keys_missing")
    for key in wanted:
        value = str(os.environ.get(key) or "").strip().strip('"').strip("'")
        if value:
            return value
    if not env_path.exists():
        return ""
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, value = line.split("=", 1)
        if current_key.strip() not in wanted:
            continue
        value = value.strip().strip('"').strip("'")
        if value:
            return value
    return ""


def normalize_symbol(value: str) -> str:
    return str(value or "").strip().upper()


def normalize_type(raw: str) -> str:
    value = str(raw or "").strip().upper()
    if value in {"STOCK", "ETF"}:
        return value
    return value or "OTHER"


def sanitize_row(row: dict[str, Any]) -> dict[str, Any] | None:
    out: dict[str, Any] = {"date": str(row.get("date") or "").strip()[:10]}
    if not out["date"]:
        return None
    for src_key, dst_key in (
        ("open", "open"),
        ("high", "high"),
        ("low", "low"),
        ("close", "close"),
        ("volume", "volume"),
        ("adjusted_close", "adjusted_close"),
    ):
        value = row.get(src_key)
        if value is None:
            out[dst_key] = None
            continue
        try:
            num = float(value)
        except Exception:
            out[dst_key] = None
            continue
        if not math.isfinite(num):
            out[dst_key] = None
            continue
        out[dst_key] = num
    if out["close"] is None:
        return None
    return out


@dataclass
class AssetMeta:
    canonical_id: str
    symbol: str
    exchange: str
    currency: str
    type_norm: str
    provider_symbol: str
    country: str
    history_pack: str


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=os.getcwd())
    p.add_argument("--env-file", default="/Users/michaelpuchowezki/Desktop/EODHD.env")
    p.add_argument("--api-key-env", default="EODHD_API_KEY,EODHD_API_TOKEN")
    p.add_argument("--allowlist-path", required=True)
    p.add_argument("--registry-path", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--history-root", default="mirrors/universe-v7/history")
    p.add_argument("--reports-root", default="mirrors/universe-v7/reports")
    p.add_argument("--state-root", default="mirrors/universe-v7/state")
    p.add_argument("--from-date", required=True)
    p.add_argument("--to-date", default="")
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--sleep-ms", type=int, default=0)
    p.add_argument("--timeout-sec", type=float, default=25.0)
    p.add_argument("--max-retries", type=int, default=3)
    p.add_argument("--job-name", default="refresh_v7_history_from_eodhd")
    p.add_argument("--report-path", default="")
    return p.parse_args(list(argv))


def load_allowlist(path: Path, max_assets: int) -> list[str]:
    payload = json.loads(path.read_text())
    if isinstance(payload, dict):
        if isinstance(payload.get("canonical_ids"), list):
            payload = payload.get("canonical_ids")
        elif isinstance(payload.get("ids"), list):
            payload = payload.get("ids")
    if not isinstance(payload, list):
        raise RuntimeError(f"allowlist_not_json_list_or_canonical_ids:{path}")
    ids = [str(v).strip() for v in payload if str(v).strip()]
    if max_assets > 0:
        ids = ids[: max_assets]
    return ids


def build_registry_index(registry_path: Path, allowlist: set[str]) -> dict[str, AssetMeta]:
    out: dict[str, AssetMeta] = {}
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            canonical_id = str(obj.get("canonical_id") or "").strip()
            if canonical_id not in allowlist:
                continue
            rel_pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
            if not rel_pack:
                continue
            out[canonical_id] = AssetMeta(
                canonical_id=canonical_id,
                symbol=str(obj.get("symbol") or "").strip(),
                exchange=str(obj.get("exchange") or "").strip().upper(),
                currency=str(obj.get("currency") or "").strip().upper(),
                type_norm=normalize_type(obj.get("type_norm")),
                provider_symbol=str(obj.get("provider_symbol") or obj.get("symbol") or "").strip().upper(),
                country=str(obj.get("country") or "").strip().upper(),
                history_pack=rel_pack,
            )
    return out


def build_query_candidates(symbol: str, exchange: str) -> list[str]:
    s = normalize_symbol(symbol)
    ex = str(exchange or "").strip().upper()
    candidates: list[str] = []
    if ex == "US":
        if "." in s:
            left, right = s.split(".", 1)
            if left and right and len(right) == 1 and left.replace("-", "").isalnum():
                candidates.append(f"{left}-{right}.{ex}")
    if s and ex:
        candidates.append(f"{s}.{ex}")
    if ex == "KQ" and s:
        candidates.append(f"{s}.KO")
    deduped: list[str] = []
    seen: set[str] = set()
    for value in candidates:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


def build_stooq_symbol(symbol: str, exchange: str) -> str:
    s = normalize_symbol(symbol)
    ex = str(exchange or "").strip().upper()
    if ex != "US" or not s:
        return ""
    return f"{s.replace('-', '.').lower()}.us"


def fetch_daily_stooq(
    *,
    symbol: str,
    exchange: str,
    from_date: str,
    to_date: str,
    timeout_sec: float,
) -> dict[str, Any]:
    query_symbol = build_stooq_symbol(symbol, exchange)
    if not query_symbol:
        return {"query_symbol": "", "attempts": 0, "rows": []}
    url = f"https://stooq.com/q/d/l/?s={urllib.parse.quote(query_symbol)}&i=d"
    req = urllib.request.Request(
        url,
        headers={
            "accept": "text/csv",
            "user-agent": "RubikVault-v7-refresh/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=float(timeout_sec)) as resp:
        payload = resp.read().decode("utf-8")
    rows: list[dict[str, Any]] = []
    from_iso = parse_iso_date(from_date).isoformat()
    to_iso = parse_iso_date(to_date).isoformat()
    for line in payload.splitlines()[1:]:
        raw = line.strip()
        if not raw:
            continue
        parts = [part.strip() for part in raw.split(",")]
        if len(parts) != 6:
            continue
        trading_date, open_v, high_v, low_v, close_v, volume_v = parts
        if trading_date < from_iso or trading_date > to_iso:
            continue
        row = sanitize_row(
            {
                "date": trading_date,
                "open": open_v,
                "high": high_v,
                "low": low_v,
                "close": close_v,
                "volume": volume_v,
                "adjusted_close": close_v,
            }
        )
        if row is not None:
            rows.append(row)
    return {
        "query_symbol": query_symbol,
        "attempts": 1,
        "rows": rows,
    }


def fetch_json(url: str, *, timeout_sec: float, max_retries: int) -> tuple[Any, int]:
    last_error: Exception | None = None
    for attempt in range(1, max(1, int(max_retries)) + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "accept": "application/json",
                    "user-agent": "RubikVault-v7-refresh/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=float(timeout_sec)) as resp:
                payload = resp.read().decode("utf-8")
            return json.loads(payload), attempt
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 402, 403, 429}:
                raise
            last_error = exc
        except Exception as exc:
            last_error = exc
        if attempt < max(1, int(max_retries)):
            time.sleep(0.3 * attempt)
    if last_error:
        raise last_error
    raise RuntimeError("fetch_failed")


def fetch_daily_eod(
    *,
    api_key: str,
    symbol: str,
    exchange: str,
    from_date: str,
    to_date: str,
    timeout_sec: float,
    max_retries: int,
) -> dict[str, Any]:
    global EODHD_DISABLED_REASON
    attempts_total = 0
    last_rows: list[dict[str, Any]] = []
    if api_key and not EODHD_DISABLED_REASON:
        for query_symbol in build_query_candidates(symbol, exchange):
            query = {
                "api_token": api_key,
                "fmt": "json",
                "order": "a",
                "from": from_date,
            }
            if to_date:
                query["to"] = to_date
            url = f"{BASE_URL}/eod/{urllib.parse.quote(query_symbol)}?{urllib.parse.urlencode(query)}"
            try:
                payload, attempts = fetch_json(url, timeout_sec=timeout_sec, max_retries=max_retries)
                attempts_total += attempts
            except urllib.error.HTTPError as exc:
                attempts_total += 1
                if exc.code == 404:
                    continue
                if exc.code in {401, 402, 403, 429}:
                    EODHD_DISABLED_REASON = f"eodhd_http_{exc.code}"
                    break
                raise
            rows = []
            if isinstance(payload, list):
                for item in payload:
                    row = sanitize_row(
                        {
                            "date": item.get("date"),
                            "open": item.get("open"),
                            "high": item.get("high"),
                            "low": item.get("low"),
                            "close": item.get("close"),
                            "volume": item.get("volume"),
                            "adjusted_close": item.get("adjusted_close", item.get("adj_close", item.get("close"))),
                        }
                    )
                    if row is not None:
                        rows.append(row)
            if rows:
                return {
                    "query_symbol": query_symbol,
                    "attempts": max(1, attempts_total),
                    "rows": rows,
                }
            last_rows = rows
    if str(exchange or "").strip().upper() == "US":
        fallback = fetch_daily_stooq(
            symbol=symbol,
            exchange=exchange,
            from_date=from_date,
            to_date=to_date,
            timeout_sec=timeout_sec,
        )
        attempts_total += int(fallback.get("attempts") or 0)
        if fallback.get("rows"):
            return {
                "query_symbol": f"stooq:{fallback.get('query_symbol')}",
                "attempts": max(1, attempts_total),
                "rows": list(fallback.get("rows") or []),
            }
    return {
        "query_symbol": "",
        "attempts": max(1, attempts_total),
        "rows": last_rows,
    }


def read_pack_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            raw = line.strip()
            if not raw:
                continue
            rows.append(json.loads(raw))
    return rows


def merge_bars(existing: list[dict[str, Any]], incoming: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_date: dict[str, dict[str, Any]] = {}
    for row in existing:
        clean = sanitize_row(row)
        if clean is None:
            continue
        by_date[str(clean["date"])] = clean
    for row in incoming:
        clean = sanitize_row(row)
        if clean is None:
            continue
        by_date[str(clean["date"])] = clean
    return [by_date[key] for key in sorted(by_date)]


def update_pack(
    *,
    pack_path: Path,
    pack_updates: dict[str, list[dict[str, Any]]],
) -> tuple[bool, list[dict[str, Any]]]:
    rows = read_pack_rows(pack_path)
    by_asset = {str(row.get("canonical_id") or "").strip(): row for row in rows}
    changed_assets: list[dict[str, Any]] = []
    for canonical_id, incoming_rows in pack_updates.items():
        existing = by_asset.get(canonical_id)
        existing_bars = list(existing.get("bars") or []) if existing else []
        merged = merge_bars(existing_bars, incoming_rows)
        if merged == existing_bars:
            continue
        if existing is None:
            by_asset[canonical_id] = {"canonical_id": canonical_id, "bars": merged}
        else:
            existing["bars"] = merged
        changed_assets.append(
            {
                "canonical_id": canonical_id,
                "bars_before": len(existing_bars),
                "bars_after": len(merged),
                "last_date_before": str(existing_bars[-1].get("date") if existing_bars else ""),
                "last_date_after": str(merged[-1].get("date") if merged else ""),
            }
        )
    if not changed_assets:
        return False, []
    out_rows = [by_asset[key] for key in sorted(by_asset)]
    write_ndjson_gz(pack_path, out_rows)
    return True, changed_assets


def resolve_history_pack_path(history_root: Path, rel_pack: str) -> Path:
    primary = history_root / rel_pack
    if primary.exists():
        return primary
    secondary = history_root.parent / rel_pack
    if secondary.exists():
        return secondary
    return primary


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    env_file = Path(args.env_file).expanduser().resolve()
    allowlist_path = Path(args.allowlist_path).expanduser().resolve()
    registry_path = resolve_repo_rel(repo_root, args.registry_path)
    history_root = resolve_repo_rel(repo_root, args.history_root)
    reports_root = resolve_repo_rel(repo_root, args.reports_root)
    state_root = resolve_repo_rel(repo_root, args.state_root)
    report_path = (
        Path(str(args.report_path)).expanduser().resolve()
        if str(args.report_path).strip()
        else state_root / f"{args.job_name}.report.json"
    )
    from_date = parse_iso_date(args.from_date).isoformat()
    to_date = parse_iso_date(args.to_date).isoformat() if str(args.to_date).strip() else local_today_iso()
    api_key = load_env_value(env_file, str(args.api_key_env).split(","))
    allowlist_ids = load_allowlist(allowlist_path, int(args.max_assets or 0))
    allowlist_set = set(allowlist_ids)
    registry = build_registry_index(registry_path, allowlist_set)
    missing_in_registry = sorted(allowlist_set - set(registry.keys()))
    run_id = f"v7histrefresh_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    lock_path = state_root / f"{args.job_name}.lock"

    if not allowlist_ids:
        raise RuntimeError("allowlist_empty")
    if not history_root.exists():
        raise RuntimeError(f"history_root_missing:{history_root}")
    if missing_in_registry:
        print(json.dumps({"warning": "allowlist_ids_missing_in_registry", "count": len(missing_in_registry)}))

    acquire_job_lock(lock_path)
    try:
        state_root.mkdir(parents=True, exist_ok=True)
        fetched_assets: list[dict[str, Any]] = []
        fetch_errors: list[dict[str, Any]] = []
        pack_updates: dict[str, dict[str, list[dict[str, Any]]]] = {}
        api_attempts_total = 0
        fetched_with_data = 0

        for index, canonical_id in enumerate(allowlist_ids, start=1):
            meta = registry.get(canonical_id)
            if meta is None:
                fetch_errors.append({"canonical_id": canonical_id, "error": "missing_registry_entry"})
                continue
            try:
                result = fetch_daily_eod(
                    api_key=api_key,
                    symbol=meta.symbol,
                    exchange=meta.exchange,
                    from_date=from_date,
                    to_date=to_date,
                    timeout_sec=float(args.timeout_sec),
                    max_retries=int(args.max_retries),
                )
                api_attempts_total += int(result.get("attempts") or 0)
                rows = list(result.get("rows") or [])
                if rows:
                    fetched_with_data += 1
                    pack_updates.setdefault(meta.history_pack, {})[canonical_id] = rows
                fetched_assets.append(
                    {
                        "canonical_id": canonical_id,
                        "symbol": meta.symbol,
                        "exchange": meta.exchange,
                        "type_norm": meta.type_norm,
                        "history_pack": meta.history_pack,
                        "rows_fetched": len(rows),
                        "query_symbol": str(result.get("query_symbol") or ""),
                        "attempts": int(result.get("attempts") or 0),
                        "last_date": str(rows[-1]["date"]) if rows else "",
                    }
                )
            except Exception as exc:
                fetch_errors.append(
                    {
                        "canonical_id": canonical_id,
                        "symbol": meta.symbol,
                        "exchange": meta.exchange,
                        "history_pack": meta.history_pack,
                        "error": f"{type(exc).__name__}:{exc}",
                    }
                )
            if int(args.sleep_ms) > 0 and index < len(allowlist_ids):
                time.sleep(float(args.sleep_ms) / 1000.0)

        changed_packs: list[dict[str, Any]] = []
        changed_entries: list[dict[str, Any]] = []
        for rel_pack in sorted(pack_updates):
            pack_path = resolve_history_pack_path(history_root, rel_pack)
            if not pack_path.exists():
                fetch_errors.append({"history_pack": rel_pack, "error": "pack_missing"})
                continue
            changed, changed_assets = update_pack(
                pack_path=pack_path,
                pack_updates=pack_updates[rel_pack],
            )
            if not changed:
                continue
            pack_sha = f"sha256:{sha256_file(pack_path)}"
            changed_packs.append(
                {
                    "history_pack": rel_pack,
                    "pack_sha256": pack_sha,
                    "touched_assets": len(changed_assets),
                    "changed_assets": changed_assets,
                }
            )
            for item in changed_assets:
                meta = registry[item["canonical_id"]]
                changed_entries.append(
                    {
                        "canonical_id": meta.canonical_id,
                        "symbol": meta.symbol,
                        "exchange": meta.exchange,
                        "currency": meta.currency,
                        "type_norm": meta.type_norm,
                        "provider_symbol": meta.provider_symbol,
                        "country": meta.country,
                        "history_pack": rel_pack,
                        "pack_sha256": pack_sha,
                        "last_date_before": item["last_date_before"],
                        "last_date_after": item["last_date_after"],
                    }
                )

        changed_entries.sort(key=lambda row: (str(row["history_pack"]), str(row["canonical_id"])))
        changed_packs.sort(key=lambda row: str(row["history_pack"]))
        history_touch_report = {
            "schema": "rv_v7_history_touch_report_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "updated_ids_count": len(changed_entries),
            "entries_count": len(changed_entries),
            "packs_count": len(changed_packs),
            "report_scope": "private_targeted_eodhd_refresh",
            "packs": [
                {
                    "history_pack": row["history_pack"],
                    "pack_sha256": row["pack_sha256"],
                    "touched_assets": row["touched_assets"],
                }
                for row in changed_packs
            ],
            "entries": changed_entries,
            "meta": {
                "job_name": args.job_name,
                "allowlist_path": str(allowlist_path),
                "from_date": from_date,
                "to_date": to_date,
                "api_attempts_total": api_attempts_total,
                "assets_requested": len(allowlist_ids),
                "assets_found_in_registry": len(registry),
                "assets_fetched_with_data": fetched_with_data,
                "assets_changed": len(changed_entries),
                "packs_changed": len(changed_packs),
                "fetch_errors_total": len(fetch_errors),
            },
        }
        atomic_write_json(reports_root / "history_touch_report.json", history_touch_report)

        report = {
            "status": "ok",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "repo_root": str(repo_root),
            "history_root": str(history_root),
            "reports_root": str(reports_root),
            "allowlist_path": str(allowlist_path),
            "from_date": from_date,
            "to_date": to_date,
            "assets_requested": len(allowlist_ids),
            "assets_found_in_registry": len(registry),
            "assets_fetched_with_data": fetched_with_data,
            "assets_changed": len(changed_entries),
            "packs_changed": len(changed_packs),
            "api_attempts_total": api_attempts_total,
            "missing_in_registry_total": len(missing_in_registry),
            "fetch_errors_total": len(fetch_errors),
            "history_touch_report_path": str(reports_root / "history_touch_report.json"),
            "changed_packs": changed_packs[:50],
            "fetched_assets_sample": fetched_assets[:50],
            "fetch_errors": fetch_errors[:50],
        }
        atomic_write_json(report_path, report)
        atomic_write_json(
            state_root / f"{args.job_name}.json",
            {
                "status": "ok",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "report_path": str(report_path),
                "history_touch_report_path": str(reports_root / "history_touch_report.json"),
                "assets_requested": len(allowlist_ids),
                "assets_changed": len(changed_entries),
                "packs_changed": len(changed_packs),
                "api_attempts_total": api_attempts_total,
                "fetch_errors_total": len(fetch_errors),
            },
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    finally:
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
