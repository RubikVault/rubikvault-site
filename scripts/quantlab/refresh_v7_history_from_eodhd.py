#!/usr/bin/env python3
from __future__ import annotations

import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import fcntl
import gzip
import hashlib
import json
import math
import os
import signal
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
DEFAULT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"
STOP_REQUESTED = False
FLOCK_HANDLES: dict[str, int] = {}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def request_stop(signum: int, _frame: Any) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    print(json.dumps({"warning": "stop_requested", "signal": int(signum)}), flush=True)


def local_today_iso() -> str:
    return date.today().isoformat()


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default


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


def reset_run_state(state_root: Path, job_name: str, run_id: str) -> dict[str, Any]:
    """Wipe prior status JSONs + dead worker locks so a previous failure cannot mask the new run.

    MUST be called AFTER acquire_job_lock has succeeded (PID-protected). Only removes:
      - <job>.json, <job>.report.json, <job>.fetched-assets.json
      - parallel_targeted_refresh_runs/*.lock whose recorded PID is no longer alive
    Then writes a fresh starting-state JSON.
    """
    summary: dict[str, Any] = {"removed_state_files": [], "removed_dead_locks": 0, "kept_live_locks": 0}
    for fname in (f"{job_name}.json", f"{job_name}.report.json", f"{job_name}.fetched-assets.json"):
        target = state_root / fname
        if target.exists():
            try:
                target.unlink()
                summary["removed_state_files"].append(fname)
            except Exception as exc:
                summary.setdefault("errors", []).append({"file": fname, "error": f"{type(exc).__name__}:{exc}"})
    workers_dir = state_root / "parallel_targeted_refresh_runs"
    if workers_dir.is_dir():
        for lock_file in workers_dir.glob("*.lock"):
            existing_pid = 0
            try:
                payload = json.loads(lock_file.read_text() or "{}")
                existing_pid = int(payload.get("pid") or 0)
            except Exception:
                existing_pid = 0
            if existing_pid and _pid_is_running(existing_pid):
                summary["kept_live_locks"] += 1
                continue
            try:
                lock_file.unlink()
                summary["removed_dead_locks"] += 1
            except FileNotFoundError:
                pass
            except Exception as exc:
                summary.setdefault("errors", []).append({"lock": str(lock_file), "error": f"{type(exc).__name__}:{exc}"})
    atomic_write_json(
        state_root / f"{job_name}.json",
        {
            "status": "starting",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "reset_summary": summary,
        },
    )
    return summary


def acquire_flock_lock(lock_path: Path) -> None:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o666)
    fcntl.flock(fd, fcntl.LOCK_EX)
    payload = {
        "pid": os.getpid(),
        "started_at": utc_now_iso(),
        "host": os.uname().nodename if hasattr(os, "uname") else "",
        "lock_type": "flock",
    }
    os.ftruncate(fd, 0)
    os.write(fd, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    os.fsync(fd)
    FLOCK_HANDLES[str(lock_path)] = fd


def release_flock_lock(lock_path: Path | None) -> None:
    if not lock_path:
        return
    fd = FLOCK_HANDLES.pop(str(lock_path), None)
    if fd is None:
        return
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def resolve_repo_rel(repo_root: Path, value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (repo_root / p)


def is_placeholder_secret(value: str) -> bool:
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        return True
    upper = text.upper()
    placeholders = {
        "DEIN_KEY",
        "YOUR_KEY",
        "YOUR_API_KEY",
        "API_KEY",
        "CHANGE_ME",
        "CHANGEME",
        "REPLACE_ME",
        "REPLACEME",
        "TOKEN_HERE",
    }
    return upper in placeholders


def load_env_value(env_path: Path, key_names: Iterable[str]) -> str:
    wanted = [str(key).strip() for key in key_names if str(key).strip()]
    if not wanted:
        raise RuntimeError("env_keys_missing")
    for key in wanted:
        value = str(os.environ.get(key) or "").strip().strip('"').strip("'")
        if value and not is_placeholder_secret(value):
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
        if value and not is_placeholder_secret(value):
            return value
    return ""


def normalize_symbol(value: str) -> str:
    return str(value or "").strip().upper()


def normalize_type(raw: str) -> str:
    value = str(raw or "").strip().upper()
    if value in {"STOCK", "ETF"}:
        return value
    return value or "OTHER"


def safe_pack_segment(value: str, default: str = "0") -> str:
    text = normalize_symbol(value)
    for char in text:
        if char.isalnum():
            return char.lower()
    return default


def synthesize_history_pack(canonical_id: str, exchange: str, symbol: str) -> str:
    ex = normalize_symbol(exchange) or "UNK"
    group = safe_pack_segment(symbol)
    digest = hashlib.sha1(str(canonical_id).encode("utf-8")).hexdigest()[:12]
    return f"history/{ex}/{group}/backfill_missing_{digest}.ndjson.gz"


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
    p.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    p.add_argument("--api-key-env", default="EODHD_API_KEY,EODHD_API_TOKEN")
    p.add_argument("--allowlist-path", required=True)
    p.add_argument("--registry-path", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--history-root", default="mirrors/universe-v7/history")
    p.add_argument("--reports-root", default="mirrors/universe-v7/reports")
    p.add_argument("--state-root", default="mirrors/universe-v7/state")
    p.add_argument("--from-date", required=True)
    p.add_argument("--to-date", default="")
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--concurrency", type=int, default=1)
    p.add_argument("--progress-every", type=int, default=0)
    p.add_argument("--sleep-ms", type=int, default=0)
    p.add_argument("--timeout-sec", type=float, default=25.0)
    p.add_argument("--max-retries", type=int, default=3)
    p.add_argument("--max-eodhd-calls", type=int, default=0)
    p.add_argument("--flush-every", type=int, default=1000)
    p.add_argument(
        "--write-mode",
        choices=["merge", "delta-shadow", "delta"],
        default=os.environ.get("RV_HISTORY_WRITE_MODE", "merge"),
        help="merge keeps current full-pack writes; delta-shadow writes sidecars too; delta is opt-in future cutover mode.",
    )
    p.add_argument("--bulk-last-day", action="store_true", default=os.environ.get("RV_EODHD_BULK_LAST_DAY", "0") == "1")
    p.add_argument("--bulk-exchange-cost", type=int, default=100)
    p.add_argument(
        "--exchange-checkpoint-path",
        default=os.environ.get("RV_MARKET_REFRESH_EXCHANGE_CHECKPOINT_PATH", ""),
        help="Optional JSON checkpoint for completed bulk exchanges; enables resume after partial failure.",
    )
    p.add_argument(
        "--resume-exchange-checkpoint",
        action="store_true",
        default=os.environ.get("RV_MARKET_REFRESH_RESUME_EXCHANGE_CHECKPOINT", "1") == "1",
        help="Skip completed bulk exchanges from a matching checkpoint.",
    )
    p.add_argument("--global-lock-path", default=os.environ.get("RV_EODHD_GLOBAL_LOCK_PATH", ""))
    p.add_argument(
        "--us-provider-mode",
        choices=["eodhd-first", "stooq-only"],
        default=os.environ.get("RV_US_DAILY_PROVIDER_MODE", "eodhd-first"),
    )
    p.add_argument("--job-name", default="refresh_v7_history_from_eodhd")
    p.add_argument("--report-path", default="")
    if hasattr(argparse, "BooleanOptionalAction"):
        p.add_argument(
            "--reset-state-on-start",
            action=argparse.BooleanOptionalAction,
            default=True,
            help="On start (after lock), unlink prior state JSONs and dead worker locks so a stale failure (e.g. provider_blocked) cannot mask the new run.",
        )
    else:
        reset_group = p.add_mutually_exclusive_group()
        reset_group.add_argument("--reset-state-on-start", dest="reset_state_on_start", action="store_true")
        reset_group.add_argument("--no-reset-state-on-start", dest="reset_state_on_start", action="store_false")
        p.set_defaults(reset_state_on_start=True)
    p.add_argument(
        "--bulk-min-yield-ratio",
        type=float,
        default=float(os.environ.get("RV_EODHD_BULK_MIN_YIELD_RATIO", "0.80")),
        help="In --bulk-last-day mode, abort further EODHD use if matched_rows/expected_assets falls below this. 0 disables.",
    )
    p.add_argument(
        "--bulk-min-rows-matched",
        type=int,
        default=int(os.environ.get("RV_EODHD_BULK_MIN_ROWS_MATCHED", "1000")),
        help="In --bulk-last-day mode, abort further EODHD use if absolute matched-rows count falls below this. 0 disables.",
    )
    p.add_argument(
        "--hard-daily-cap-calls",
        type=int,
        default=int(os.environ.get("RV_EODHD_HARD_DAILY_CAP", "0")),
        help="Hard kill ceiling on api_attempts_total (eodhd weighted). Distinct from soft --max-eodhd-calls. 0 disables.",
    )
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


def load_or_init_exchange_checkpoint(
    path: Path,
    *,
    job_name: str,
    from_date: str,
    to_date: str,
) -> dict[str, Any]:
    doc = load_json(path, {})
    if (
        doc.get("job_name") == job_name
        and doc.get("from_date") == from_date
        and doc.get("to_date") == to_date
        and isinstance(doc.get("completed_exchanges"), dict)
    ):
        return doc
    return {
        "schema": "rv_v7_market_refresh_exchange_checkpoint_v1",
        "created_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "job_name": job_name,
        "from_date": from_date,
        "to_date": to_date,
        "status": "running",
        "completed_exchanges": {},
        "failed_exchanges": {},
    }


def write_exchange_checkpoint(path: Path, doc: dict[str, Any]) -> None:
    doc["updated_at"] = utc_now_iso()
    atomic_write_json(path, doc)


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
            exchange = str(obj.get("exchange") or "").strip().upper()
            symbol = str(obj.get("symbol") or "").strip()
            if not rel_pack:
                rel_pack = synthesize_history_pack(canonical_id, exchange, symbol)
            out[canonical_id] = AssetMeta(
                canonical_id=canonical_id,
                symbol=symbol,
                exchange=exchange,
                currency=str(obj.get("currency") or "").strip().upper(),
                type_norm=normalize_type(obj.get("type_norm")),
                provider_symbol=str(obj.get("provider_symbol") or obj.get("symbol") or "").strip().upper(),
                country=str(obj.get("country") or "").strip().upper(),
                history_pack=rel_pack,
            )
    return out


def build_query_candidates(symbol: str, exchange: str, provider_symbol: str = "") -> list[str]:
    s = normalize_symbol(symbol)
    ex = str(exchange or "").strip().upper()
    p = normalize_symbol(provider_symbol)
    candidates: list[str] = []
    for candidate_base in [p, s]:
        if not candidate_base:
            continue
        if ex == "US":
            if "." in candidate_base:
                left, right = candidate_base.split(".", 1)
                if left and right and len(right) == 1 and left.replace("-", "").isalnum():
                    candidates.append(f"{left}-{right}.{ex}")
                    continue
            if candidate_base.endswith(".US"):
                candidates.append(candidate_base)
            elif "." not in candidate_base:
                candidates.append(f"{candidate_base}.{ex}")
            else:
                candidates.append(candidate_base)
        elif "." in candidate_base:
            candidates.append(candidate_base)
        elif ex:
            candidates.append(f"{candidate_base}.{ex}")
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


def strip_exchange_suffix(symbol: str, exchange: str) -> str:
    value = normalize_symbol(symbol)
    ex = str(exchange or "").strip().upper()
    suffix = f".{ex}" if ex else ""
    if suffix and value.endswith(suffix):
        return value[: -len(suffix)]
    return value


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


def preflight_eodhd_access(
    *,
    api_key: str,
    timeout_sec: float,
) -> dict[str, Any]:
    if not str(api_key or "").strip():
        return {
            "ok": False,
            "reason": "missing_api_key",
            "http_code": None,
            "query_symbol": "SPY.US",
        }
    query_symbol = "SPY.US"
    query = {
        "api_token": api_key,
        "fmt": "json",
        "order": "a",
        "from": local_today_iso(),
        "to": local_today_iso(),
    }
    url = f"{BASE_URL}/eod/{urllib.parse.quote(query_symbol)}?{urllib.parse.urlencode(query)}"
    try:
        fetch_json(url, timeout_sec=timeout_sec, max_retries=1)
        return {
            "ok": True,
            "reason": "ok",
            "http_code": None,
            "query_symbol": query_symbol,
        }
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "reason": f"eodhd_http_{exc.code}",
            "http_code": int(exc.code),
            "query_symbol": query_symbol,
        }
    except Exception as exc:
        return {
            "ok": False,
            "reason": f"{type(exc).__name__}:{exc}",
            "http_code": None,
            "query_symbol": query_symbol,
        }


def fetch_bulk_last_day_eodhd(
    *,
    api_key: str,
    exchange: str,
    target_date: str,
    timeout_sec: float,
    max_retries: int,
) -> dict[str, Any]:
    query = {
        "api_token": api_key,
        "fmt": "json",
        "date": target_date,
    }
    url = f"{BASE_URL}/eod-bulk-last-day/{urllib.parse.quote(exchange)}?{urllib.parse.urlencode(query)}"
    payload, attempts = fetch_json(url, timeout_sec=timeout_sec, max_retries=max_retries)
    rows: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for item in payload:
            raw_symbol = (
                item.get("code")
                or item.get("Code")
                or item.get("symbol")
                or item.get("Symbol")
                or item.get("ticker")
                or item.get("Ticker")
            )
            row = sanitize_row(
                {
                    "date": item.get("date") or item.get("Date"),
                    "open": item.get("open") if "open" in item else item.get("Open"),
                    "high": item.get("high") if "high" in item else item.get("High"),
                    "low": item.get("low") if "low" in item else item.get("Low"),
                    "close": item.get("close") if "close" in item else item.get("Close"),
                    "volume": item.get("volume") if "volume" in item else item.get("Volume"),
                    "adjusted_close": (
                        item.get("adjusted_close")
                        if "adjusted_close" in item
                        else item.get("Adjusted_close", item.get("adjustedClose", item.get("close", item.get("Close"))))
                    ),
                }
            )
            if row is None:
                continue
            symbol = normalize_symbol(raw_symbol)
            stripped = strip_exchange_suffix(symbol, exchange)
            if not stripped:
                continue
            rows.append(
                {
                    "symbol": stripped,
                    "provider_symbol": symbol or f"{stripped}.{exchange}",
                    "row": row,
                }
            )
    return {
        "attempts": int(attempts or 1),
        "rows": rows,
    }


def fetch_daily_eod(
    *,
    api_key: str,
    symbol: str,
    exchange: str,
    provider_symbol: str,
    from_date: str,
    to_date: str,
    timeout_sec: float,
    max_retries: int,
    us_provider_mode: str,
) -> dict[str, Any]:
    global EODHD_DISABLED_REASON
    eodhd_attempts_total = 0
    stooq_attempts_total = 0
    last_rows: list[dict[str, Any]] = []
    ex_norm = str(exchange or "").strip().upper()
    use_eodhd = bool(api_key and not EODHD_DISABLED_REASON)
    if ex_norm == "US" and us_provider_mode == "stooq-only":
        use_eodhd = False
    if use_eodhd:
        for query_symbol in build_query_candidates(symbol, exchange, provider_symbol):
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
                eodhd_attempts_total += attempts
            except urllib.error.HTTPError as exc:
                eodhd_attempts_total += 1
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
                    "attempts": eodhd_attempts_total + stooq_attempts_total,
                    "eodhd_attempts": eodhd_attempts_total,
                    "stooq_attempts": stooq_attempts_total,
                    "rows": rows,
                }
            last_rows = rows
    if ex_norm == "US":
        fallback = fetch_daily_stooq(
            symbol=symbol,
            exchange=exchange,
            from_date=from_date,
            to_date=to_date,
            timeout_sec=timeout_sec,
        )
        stooq_attempts_total += int(fallback.get("attempts") or 0)
        if fallback.get("rows"):
            return {
                "query_symbol": f"stooq:{fallback.get('query_symbol')}",
                "attempts": eodhd_attempts_total + stooq_attempts_total,
                "eodhd_attempts": eodhd_attempts_total,
                "stooq_attempts": stooq_attempts_total,
                "rows": list(fallback.get("rows") or []),
            }
    return {
        "query_symbol": "",
        "attempts": eodhd_attempts_total + stooq_attempts_total,
        "eodhd_attempts": eodhd_attempts_total,
        "stooq_attempts": stooq_attempts_total,
        "provider_blocked": bool(EODHD_DISABLED_REASON),
        "rows": last_rows,
    }


def read_pack_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
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


def compute_pack_update(
    *,
    pack_path: Path,
    pack_updates: dict[str, list[dict[str, Any]]],
) -> tuple[bool, list[dict[str, Any]], list[dict[str, Any]]]:
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
        return False, [], rows
    out_rows = [by_asset[key] for key in sorted(by_asset)]
    return True, changed_assets, out_rows


def update_pack(
    *,
    pack_path: Path,
    pack_updates: dict[str, list[dict[str, Any]]],
) -> tuple[bool, list[dict[str, Any]], list[dict[str, Any]]]:
    changed, changed_assets, out_rows = compute_pack_update(pack_path=pack_path, pack_updates=pack_updates)
    if not changed:
        return False, [], out_rows
    write_ndjson_gz(pack_path, out_rows)
    return True, changed_assets, out_rows


def sha256_rows(rows: list[dict[str, Any]]) -> str:
    payload = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def history_delta_path(history_root: Path, rel_pack: str, day: str) -> Path:
    rel = str(rel_pack or "").strip().replace("\\", "/").lstrip("/")
    return history_root.parent / "history-deltas" / f"{rel}.delta-{day}.ndjson.gz"


def write_delta_pack(
    *,
    history_root: Path,
    rel_pack: str,
    day: str,
    pack_updates: dict[str, list[dict[str, Any]]],
    changed_assets: list[dict[str, Any]],
) -> dict[str, Any] | None:
    changed_ids = {str(row.get("canonical_id") or "").strip() for row in changed_assets}
    rows = []
    for canonical_id in sorted(changed_ids):
        incoming = pack_updates.get(canonical_id) or []
        bars = merge_bars([], incoming)
        if bars:
            rows.append({"canonical_id": canonical_id, "bars": bars})
    if not rows:
        return None
    delta_path = history_delta_path(history_root, rel_pack, day)
    write_ndjson_gz(delta_path, rows)
    return {
        "history_pack": rel_pack,
        "delta_path": str(delta_path),
        "delta_rel_path": str(delta_path.relative_to(history_root.parent)),
        "delta_sha256": f"sha256:{sha256_file(delta_path)}",
        "delta_rows": len(rows),
        "delta_assets": len(changed_ids),
        "day": day,
    }


def fetch_asset_rows(
    *,
    index: int,
    canonical_id: str,
    meta: AssetMeta,
    api_key: str,
    from_date: str,
    to_date: str,
    timeout_sec: float,
    max_retries: int,
    us_provider_mode: str,
) -> dict[str, Any]:
    result = fetch_daily_eod(
        api_key=api_key,
        symbol=meta.symbol,
        exchange=meta.exchange,
        provider_symbol=meta.provider_symbol,
        from_date=from_date,
        to_date=to_date,
        timeout_sec=timeout_sec,
        max_retries=max_retries,
        us_provider_mode=us_provider_mode,
    )
    rows = list(result.get("rows") or [])
    return {
        "index": index,
        "canonical_id": canonical_id,
        "symbol": meta.symbol,
        "exchange": meta.exchange,
        "type_norm": meta.type_norm,
        "history_pack": meta.history_pack,
        "rows": rows,
        "query_symbol": str(result.get("query_symbol") or ""),
        "attempts": int(result.get("attempts") or 0),
        "eodhd_attempts": int(result.get("eodhd_attempts") or 0),
        "stooq_attempts": int(result.get("stooq_attempts") or 0),
        "provider_blocked": bool(result.get("provider_blocked")),
        "last_date": str(rows[-1]["date"]) if rows else "",
    }


def resolve_history_pack_path(history_root: Path, rel_pack: str) -> Path:
    rel = Path(str(rel_pack).strip())
    stripped = Path(*rel.parts[1:]) if rel.parts[:1] == ("history",) else rel
    candidates = [
        history_root.parent / rel,
        history_root / stripped,
        history_root / rel,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


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
    exchange_checkpoint_path = (
        Path(str(args.exchange_checkpoint_path)).expanduser().resolve()
        if str(args.exchange_checkpoint_path).strip()
        else state_root / f"{args.job_name}.exchange-checkpoint.json"
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
    global_lock_path = (
        Path(str(args.global_lock_path)).expanduser().resolve()
        if str(args.global_lock_path or "").strip()
        else state_root / "eodhd-global.lock"
    )

    if not allowlist_ids:
        raise RuntimeError("allowlist_empty")
    if not history_root.exists():
        raise RuntimeError(f"history_root_missing:{history_root}")
    if missing_in_registry:
        print(json.dumps({"warning": "allowlist_ids_missing_in_registry", "count": len(missing_in_registry)}))

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    acquire_job_lock(lock_path)
    try:
        acquire_flock_lock(global_lock_path)
    except Exception:
        release_job_lock(lock_path)
        raise
    try:
        state_root.mkdir(parents=True, exist_ok=True)
        if bool(getattr(args, "reset_state_on_start", True)):
            reset_summary = reset_run_state(state_root, args.job_name, run_id)
            print(json.dumps({"reset_run_state": reset_summary, "run_id": run_id}), flush=True)
        fetched_assets_by_index: dict[int, dict[str, Any]] = {}
        fetch_errors: list[dict[str, Any]] = []
        pack_updates: dict[str, dict[str, list[dict[str, Any]]]] = {}
        eodhd_attempts_total = 0
        stooq_attempts_total = 0
        fetched_with_data = 0
        skipped_due_to_stop = 0
        completed_fetches = 0
        last_successful_write = ""
        concurrency = max(1, int(args.concurrency or 1))
        progress_every = max(0, int(args.progress_every or 0))
        flush_every = max(1, int(args.flush_every or 1000))
        max_eodhd_calls = max(0, int(args.max_eodhd_calls or 0))
        hard_daily_cap = max(0, int(getattr(args, "hard_daily_cap_calls", 0) or 0))
        indexed_allowlist = list(enumerate(allowlist_ids, start=1))
        indexed_registry: list[tuple[int, str, AssetMeta]] = []
        for index, canonical_id in indexed_allowlist:
            meta = registry.get(canonical_id)
            if meta is None:
                fetch_errors.append({"canonical_id": canonical_id, "error": "missing_registry_entry"})
                continue
            indexed_registry.append((index, canonical_id, meta))

        non_us_targets = sum(1 for _, _, meta in indexed_registry if str(meta.exchange or "").strip().upper() != "US")
        eodhd_preflight = preflight_eodhd_access(
            api_key=api_key,
            timeout_sec=float(args.timeout_sec),
        ) if non_us_targets > 0 else {
            "ok": True,
            "reason": "skipped_us_only_scope",
            "http_code": None,
            "query_symbol": "",
        }
        if non_us_targets > 0 and not bool(eodhd_preflight.get("ok")):
            history_touch_report = {
                "schema": "rv_v7_history_touch_report_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "updated_ids_count": 0,
                "entries_count": 0,
                "packs_count": 0,
                "report_scope": "private_targeted_eodhd_refresh",
                "packs": [],
                "entries": [],
                "meta": {
                    "job_name": args.job_name,
                    "allowlist_path": str(allowlist_path),
                    "from_date": from_date,
                    "to_date": to_date,
                    "api_attempts_total": 0,
                    "assets_requested": len(allowlist_ids),
                    "assets_found_in_registry": len(registry),
                    "assets_fetched_with_data": 0,
                    "assets_changed": 0,
                    "packs_changed": 0,
                    "fetch_errors_total": 1,
                    "provider_preflight": eodhd_preflight,
                    "provider_blocked": True,
                },
            }
            atomic_write_json(reports_root / "history_touch_report.json", history_touch_report)
            report = {
                "status": "provider_blocked",
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
                "non_us_targets": non_us_targets,
                "assets_fetched_with_data": 0,
                "assets_changed": 0,
                "packs_changed": 0,
                "api_attempts_total": 0,
                "missing_in_registry_total": len(missing_in_registry),
                "fetch_errors_total": 1,
                "history_touch_report_path": str(reports_root / "history_touch_report.json"),
                "provider_preflight": eodhd_preflight,
                "fetch_errors": [
                    {
                        "error": f"provider_blocked:{eodhd_preflight.get('reason')}",
                        "http_code": eodhd_preflight.get("http_code"),
                        "query_symbol": eodhd_preflight.get("query_symbol"),
                    }
                ],
            }
            atomic_write_json(report_path, report)
            atomic_write_json(
                state_root / f"{args.job_name}.json",
                {
                    "status": "provider_blocked",
                    "generated_at": utc_now_iso(),
                    "run_id": run_id,
                    "report_path": str(report_path),
                    "history_touch_report_path": str(reports_root / "history_touch_report.json"),
                    "assets_requested": len(allowlist_ids),
                    "assets_changed": 0,
                    "packs_changed": 0,
                    "api_attempts_total": 0,
                    "fetch_errors_total": 1,
                    "provider_preflight": eodhd_preflight,
                },
            )
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 2

        changed_pack_map: dict[str, dict[str, Any]] = {}
        changed_entries: list[dict[str, Any]] = []
        delta_manifest_entries: list[dict[str, Any]] = []
        delta_manifest_path = history_root.parent / "history-deltas" / "history-delta-manifest.json"

        def _write_delta_manifest() -> None:
            if not delta_manifest_entries:
                return
            atomic_write_json(
                delta_manifest_path,
                {
                    "schema": "rv.history_delta_manifest.v1",
                    "generated_at": utc_now_iso(),
                    "run_id": run_id,
                    "write_mode": args.write_mode,
                    "from_date": from_date,
                    "to_date": to_date,
                    "entries_count": len(delta_manifest_entries),
                    "entries": delta_manifest_entries,
                },
            )

        def _record_fetch(item: dict[str, Any]) -> None:
            nonlocal eodhd_attempts_total, stooq_attempts_total, fetched_with_data, completed_fetches
            completed_fetches += 1
            eodhd_attempts_total += int(item.get("eodhd_attempts") or 0)
            stooq_attempts_total += int(item.get("stooq_attempts") or 0)
            rows = list(item.get("rows") or [])
            if rows:
                fetched_with_data += 1
                pack_updates.setdefault(str(item["history_pack"]), {})[str(item["canonical_id"])] = rows
            fetched_assets_by_index[int(item["index"])] = {
                "canonical_id": str(item["canonical_id"]),
                "symbol": str(item["symbol"]),
                "exchange": str(item["exchange"]),
                "type_norm": str(item["type_norm"]),
                "history_pack": str(item["history_pack"]),
                "rows_fetched": len(rows),
                "query_symbol": str(item.get("query_symbol") or ""),
                "attempts": int(item.get("attempts") or 0),
                "eodhd_attempts": int(item.get("eodhd_attempts") or 0),
                "stooq_attempts": int(item.get("stooq_attempts") or 0),
                "last_date": str(item.get("last_date") or ""),
            }

        def _hard_cap_reached() -> bool:
            return hard_daily_cap > 0 and eodhd_attempts_total >= hard_daily_cap

        def _eodhd_budget_stopped(meta: AssetMeta) -> bool:
            if STOP_REQUESTED:
                return True
            if _hard_cap_reached():
                if EODHD_DISABLED_REASON is None:
                    globals()["EODHD_DISABLED_REASON"] = "hard_daily_cap_reached"
                return not (meta.exchange == "US" and args.us_provider_mode == "stooq-only")
            if max_eodhd_calls > 0 and eodhd_attempts_total >= max_eodhd_calls:
                return not (meta.exchange == "US" and args.us_provider_mode == "stooq-only")
            if EODHD_DISABLED_REASON:
                return not (meta.exchange == "US" and args.us_provider_mode == "stooq-only")
            return False

        def _write_progress_state(status: str, note: str = "") -> None:
            atomic_write_json(
                state_root / f"{args.job_name}.json",
                {
                    "status": status,
                    "note": note or None,
                    "generated_at": utc_now_iso(),
                    "run_id": run_id,
                    "report_path": str(report_path),
                    "history_touch_report_path": str(reports_root / "history_touch_report.json"),
                    "assets_requested": len(allowlist_ids),
                    "assets_found_in_registry": len(registry),
                    "completed_fetches": completed_fetches,
                    "assets_fetched_with_data": fetched_with_data,
                    "assets_changed": len(changed_entries),
                    "packs_changed": len(changed_pack_map),
                    "api_attempts_total": eodhd_attempts_total,
                    "eodhd_attempts_total": eodhd_attempts_total,
                    "stooq_attempts_total": stooq_attempts_total,
                    "fetch_errors_total": len(fetch_errors),
                    "skipped_due_to_stop": skipped_due_to_stop,
                    "last_successful_write": last_successful_write or None,
                    "provider_preflight": eodhd_preflight,
                    "provider_blocked_reason": EODHD_DISABLED_REASON,
                },
            )

        def _flush_pack_updates(reason: str) -> None:
            nonlocal pack_updates, last_successful_write
            if not pack_updates:
                _write_progress_state("running", reason)
                return
            flush_progress_interval = max(1, int(args.flush_every or 1000))
            flush_total = len(pack_updates)
            flush_count = 0
            for rel_pack in sorted(pack_updates):
                pack_path = resolve_history_pack_path(history_root, rel_pack)
                updates_for_pack = pack_updates[rel_pack]
                if args.write_mode == "delta":
                    changed, changed_assets, out_rows = compute_pack_update(
                        pack_path=pack_path,
                        pack_updates=updates_for_pack,
                    )
                else:
                    changed, changed_assets, out_rows = update_pack(
                        pack_path=pack_path,
                        pack_updates=updates_for_pack,
                    )
                flush_count += 1
                if not changed:
                    if flush_count % flush_progress_interval == 0:
                        _write_progress_state("running", f"{reason}:packs:{flush_count}/{flush_total}")
                    continue
                last_successful_write = utc_now_iso()
                if args.write_mode == "delta":
                    pack_sha = f"sha256:{sha256_file(pack_path)}" if pack_path.exists() else ""
                    history_effective_sha = f"sha256:{sha256_rows(out_rows)}"
                else:
                    pack_sha = f"sha256:{sha256_file(pack_path)}"
                    history_effective_sha = pack_sha
                delta_entry = None
                if args.write_mode in {"delta-shadow", "delta"}:
                    delta_entry = write_delta_pack(
                        history_root=history_root,
                        rel_pack=rel_pack,
                        day=to_date,
                        pack_updates=updates_for_pack,
                        changed_assets=changed_assets,
                    )
                    if delta_entry:
                        delta_manifest_entries.append(delta_entry)
                        _write_delta_manifest()
                current = changed_pack_map.setdefault(
                    rel_pack,
                    {
                        "history_pack": rel_pack,
                        "pack_sha256": pack_sha,
                        "history_effective_sha256": history_effective_sha,
                        "touched_assets": 0,
                        "changed_assets": [],
                        "delta_files": [],
                    },
                )
                current["pack_sha256"] = pack_sha
                current["history_effective_sha256"] = history_effective_sha
                current["touched_assets"] = int(current.get("touched_assets") or 0) + len(changed_assets)
                current["changed_assets"].extend(changed_assets)
                if delta_entry:
                    current.setdefault("delta_files", []).append(delta_entry)
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
                            "history_effective_sha256": history_effective_sha,
                            "last_date_before": item["last_date_before"],
                            "last_date_after": item["last_date_after"],
                        }
                    )
                if flush_count % flush_progress_interval == 0:
                    _write_progress_state("running", f"{reason}:packs:{flush_count}/{flush_total}")
            pack_updates = {}
            _write_progress_state("running", reason)

        bulk_checkpoint_noop = False
        if args.bulk_last_day:
            bulk_exchange_cost = max(1, int(args.bulk_exchange_cost or 100))
            exchange_checkpoint = load_or_init_exchange_checkpoint(
                exchange_checkpoint_path,
                job_name=args.job_name,
                from_date=from_date,
                to_date=to_date,
            )
            exchange_checkpoint["status"] = "running"
            exchange_checkpoint["resume_enabled"] = bool(args.resume_exchange_checkpoint)
            write_exchange_checkpoint(exchange_checkpoint_path, exchange_checkpoint)
            completed_exchange_checkpoint = set((exchange_checkpoint.get("completed_exchanges") or {}).keys())
            skipped_completed_exchanges: list[str] = []
            index_by_id = {canonical_id: index for index, canonical_id, _ in indexed_registry}
            lookup: dict[tuple[str, str], AssetMeta] = {}
            for _, _, meta in indexed_registry:
                ex = str(meta.exchange or "").strip().upper()
                for candidate in {
                    normalize_symbol(meta.symbol),
                    strip_exchange_suffix(meta.provider_symbol, ex),
                    strip_exchange_suffix(meta.symbol, ex),
                }:
                    if candidate:
                        lookup.setdefault((ex, candidate), meta)
            exchanges = sorted({str(meta.exchange or "").strip().upper() for _, _, meta in indexed_registry if meta.exchange})
            bulk_rows_total = 0
            bulk_rows_matched = 0
            bulk_rows_wrong_date = 0
            bulk_exchange_errors: list[dict[str, Any]] = []
            bulk_seen_ids: set[str] = set()
            for ex in exchanges:
                if bool(args.resume_exchange_checkpoint) and ex in completed_exchange_checkpoint:
                    skipped_completed_exchanges.append(ex)
                    continue
                if STOP_REQUESTED:
                    break
                if _hard_cap_reached():
                    if EODHD_DISABLED_REASON is None:
                        globals()["EODHD_DISABLED_REASON"] = "hard_daily_cap_reached"
                    skipped_due_to_stop += sum(1 for _, _, meta in indexed_registry if meta.exchange == ex)
                    continue
                if max_eodhd_calls > 0 and eodhd_attempts_total >= max_eodhd_calls:
                    skipped_due_to_stop += sum(1 for _, _, meta in indexed_registry if meta.exchange == ex)
                    continue
                try:
                    bulk = fetch_bulk_last_day_eodhd(
                        api_key=api_key,
                        exchange=ex,
                        target_date=to_date,
                        timeout_sec=float(args.timeout_sec),
                        max_retries=int(args.max_retries),
                    )
                    eodhd_attempts_total += int(bulk.get("attempts") or 1) * bulk_exchange_cost
                except urllib.error.HTTPError as exc:
                    if exc.code in {401, 402, 403, 429}:
                        globals()["EODHD_DISABLED_REASON"] = f"eodhd_http_{exc.code}"
                    bulk_exchange_errors.append({"exchange": ex, "error": f"HTTPError:{exc.code}"})
                    fetch_errors.append({"exchange": ex, "error": f"bulk_exchange_failed:HTTPError:{exc.code}"})
                    exchange_checkpoint.setdefault("failed_exchanges", {})[ex] = {
                        "error": f"HTTPError:{exc.code}",
                        "failed_at": utc_now_iso(),
                    }
                    write_exchange_checkpoint(exchange_checkpoint_path, exchange_checkpoint)
                    if exc.code in {401, 402, 403, 429}:
                        break
                    continue
                except Exception as exc:
                    bulk_exchange_errors.append({"exchange": ex, "error": f"{type(exc).__name__}:{exc}"})
                    fetch_errors.append({"exchange": ex, "error": f"bulk_exchange_failed:{type(exc).__name__}:{exc}"})
                    exchange_checkpoint.setdefault("failed_exchanges", {})[ex] = {
                        "error": f"{type(exc).__name__}:{exc}",
                        "failed_at": utc_now_iso(),
                    }
                    write_exchange_checkpoint(exchange_checkpoint_path, exchange_checkpoint)
                    continue
                rows = list(bulk.get("rows") or [])
                bulk_rows_total += len(rows)
                for entry in rows:
                    row = dict(entry.get("row") or {})
                    if str(row.get("date") or "") != to_date:
                        bulk_rows_wrong_date += 1
                        continue
                    meta = lookup.get((ex, normalize_symbol(entry.get("symbol"))))
                    if meta is None:
                        meta = lookup.get((ex, strip_exchange_suffix(str(entry.get("provider_symbol") or ""), ex)))
                    if meta is None:
                        continue
                    bulk_rows_matched += 1
                    pack_updates.setdefault(meta.history_pack, {})[meta.canonical_id] = [row]
                    if meta.canonical_id not in bulk_seen_ids:
                        fetched_with_data += 1
                        bulk_seen_ids.add(meta.canonical_id)
                    fetched_assets_by_index[int(index_by_id.get(meta.canonical_id) or 0)] = {
                        "canonical_id": meta.canonical_id,
                        "symbol": meta.symbol,
                        "exchange": meta.exchange,
                        "type_norm": meta.type_norm,
                        "history_pack": meta.history_pack,
                        "rows_fetched": 1,
                        "query_symbol": f"bulk:{ex}",
                        "attempts": bulk_exchange_cost,
                        "eodhd_attempts": bulk_exchange_cost,
                        "stooq_attempts": 0,
                        "last_date": str(row.get("date") or ""),
                    }
                completed_fetches = len(bulk_seen_ids)
                _flush_pack_updates(f"bulk_exchange_flush:{ex}")
                exchange_checkpoint.setdefault("completed_exchanges", {})[ex] = {
                    "completed_at": utc_now_iso(),
                    "rows_total_cumulative": bulk_rows_total,
                    "rows_matched_cumulative": bulk_rows_matched,
                    "rows_wrong_date_cumulative": bulk_rows_wrong_date,
                    "assets_seen_cumulative": len(bulk_seen_ids),
                    "api_attempts_total": eodhd_attempts_total,
                    "last_successful_write": last_successful_write or None,
                }
                exchange_checkpoint.setdefault("failed_exchanges", {}).pop(ex, None)
                write_exchange_checkpoint(exchange_checkpoint_path, exchange_checkpoint)
                if progress_every > 0:
                    print(
                        json.dumps(
                            {
                                "progress": {
                                    "bulk_exchange": ex,
                                    "completed": completed_fetches,
                                    "total": len(indexed_registry),
                                    "bulk_rows_total": bulk_rows_total,
                                    "bulk_rows_matched": bulk_rows_matched,
                                    "bulk_rows_wrong_date": bulk_rows_wrong_date,
                                    "api_attempts_total": eodhd_attempts_total,
                                    "eodhd_attempts_total": eodhd_attempts_total,
                                    "assets_changed": len(changed_entries),
                                    "packs_changed": len(changed_pack_map),
                                    "fetch_errors_total": len(fetch_errors),
                                    "last_successful_write": last_successful_write,
                                }
                            }
                        ),
                        flush=True,
                    )
            exchange_checkpoint["status"] = "complete" if not STOP_REQUESTED and not EODHD_DISABLED_REASON else "partial"
            exchange_checkpoint["skipped_completed_exchanges"] = skipped_completed_exchanges
            write_exchange_checkpoint(exchange_checkpoint_path, exchange_checkpoint)
            if bulk_exchange_errors:
                fetch_errors.extend(bulk_exchange_errors[:50])
            bulk_min_yield_ratio = float(getattr(args, "bulk_min_yield_ratio", 0.0) or 0.0)
            bulk_min_rows_matched = int(getattr(args, "bulk_min_rows_matched", 0) or 0)
            bulk_expected = max(1, len(indexed_registry))
            bulk_effective_min_rows_matched = min(bulk_min_rows_matched, bulk_expected) if bulk_min_rows_matched > 0 else 0
            bulk_yield_ratio = bulk_rows_matched / bulk_expected
            bulk_checkpoint_noop = (
                bool(args.resume_exchange_checkpoint)
                and bool(exchanges)
                and len(skipped_completed_exchanges) == len(exchanges)
                and bulk_rows_total == 0
                and bulk_rows_matched == 0
                and not bulk_exchange_errors
                and not STOP_REQUESTED
            )
            if bulk_checkpoint_noop:
                print(
                    json.dumps(
                        {
                            "warning": "bulk_checkpoint_noop",
                            "reason": "all_exchanges_completed_in_checkpoint",
                            "exchanges_skipped": len(skipped_completed_exchanges),
                            "expected": bulk_expected,
                        }
                    ),
                    flush=True,
                )
            yield_below_ratio = (not bulk_checkpoint_noop) and bulk_min_yield_ratio > 0 and bulk_yield_ratio < bulk_min_yield_ratio
            yield_below_abs = (not bulk_checkpoint_noop) and bulk_effective_min_rows_matched > 0 and bulk_rows_matched < bulk_effective_min_rows_matched
            if (yield_below_ratio or yield_below_abs) and not STOP_REQUESTED:
                if EODHD_DISABLED_REASON is None:
                    globals()["EODHD_DISABLED_REASON"] = "bulk_yield_below_threshold"
                print(
                    json.dumps(
                        {
                            "warning": "bulk_yield_below_threshold",
                            "ratio": round(bulk_yield_ratio, 4),
                            "matched": bulk_rows_matched,
                            "expected": bulk_expected,
                            "rows_total": bulk_rows_total,
                            "rows_wrong_date": bulk_rows_wrong_date,
                            "min_ratio": bulk_min_yield_ratio,
                            "min_matched": bulk_min_rows_matched,
                            "effective_min_matched": bulk_effective_min_rows_matched,
                            "exchanges_failed": [e.get("exchange") for e in bulk_exchange_errors],
                        }
                    ),
                    flush=True,
                )
        elif concurrency <= 1:
            for index, canonical_id, meta in indexed_registry:
                if _eodhd_budget_stopped(meta):
                    skipped_due_to_stop += 1
                    continue
                try:
                    item = fetch_asset_rows(
                        index=index,
                        canonical_id=canonical_id,
                        meta=meta,
                        api_key=api_key,
                        from_date=from_date,
                        to_date=to_date,
                        timeout_sec=float(args.timeout_sec),
                        max_retries=int(args.max_retries),
                        us_provider_mode=str(args.us_provider_mode),
                    )
                    _record_fetch(item)
                except Exception as exc:
                    completed_fetches += 1
                    fetch_errors.append(
                        {
                            "canonical_id": canonical_id,
                            "symbol": meta.symbol,
                            "exchange": meta.exchange,
                            "history_pack": meta.history_pack,
                            "error": f"{type(exc).__name__}:{exc}",
                        }
                    )
                if completed_fetches > 0 and completed_fetches % flush_every == 0:
                    _flush_pack_updates("periodic_flush")
                if progress_every > 0 and index % progress_every == 0:
                    print(
                        json.dumps(
                            {
                                "progress": {
                                    "completed": index,
                                    "total": len(allowlist_ids),
                                    "assets_fetched_with_data": fetched_with_data,
                                    "api_attempts_total": eodhd_attempts_total,
                                    "eodhd_attempts_total": eodhd_attempts_total,
                                    "stooq_attempts_total": stooq_attempts_total,
                                    "fetch_errors_total": len(fetch_errors),
                                    "assets_changed": len(changed_entries),
                                    "packs_changed": len(changed_pack_map),
                                    "skipped_due_to_stop": skipped_due_to_stop,
                                    "last_successful_write": last_successful_write,
                                }
                            }
                        ),
                        flush=True,
                    )
                if int(args.sleep_ms) > 0 and index < len(allowlist_ids):
                    time.sleep(float(args.sleep_ms) / 1000.0)
        else:
            next_position = 0
            pending: dict[Any, tuple[int, str, AssetMeta]] = {}
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                while next_position < len(indexed_registry) or pending:
                    while next_position < len(indexed_registry) and len(pending) < concurrency:
                        index, canonical_id, meta = indexed_registry[next_position]
                        next_position += 1
                        if _eodhd_budget_stopped(meta):
                            skipped_due_to_stop += 1
                            continue
                        future = executor.submit(
                            fetch_asset_rows,
                            index=index,
                            canonical_id=canonical_id,
                            meta=meta,
                            api_key=api_key,
                            from_date=from_date,
                            to_date=to_date,
                            timeout_sec=float(args.timeout_sec),
                            max_retries=int(args.max_retries),
                            us_provider_mode=str(args.us_provider_mode),
                        )
                        pending[future] = (index, canonical_id, meta)
                    if not pending:
                        continue
                    done, _ = wait(pending.keys(), return_when=FIRST_COMPLETED)
                    for future in done:
                        index, canonical_id, meta = pending.pop(future)
                        try:
                            item = future.result()
                            _record_fetch(item)
                        except Exception as exc:
                            completed_fetches += 1
                            fetch_errors.append(
                                {
                                    "canonical_id": canonical_id,
                                    "symbol": meta.symbol,
                                    "exchange": meta.exchange,
                                    "history_pack": meta.history_pack,
                                    "error": f"{type(exc).__name__}:{exc}",
                                }
                            )
                        if completed_fetches > 0 and completed_fetches % flush_every == 0:
                            _flush_pack_updates("periodic_flush")
                        if progress_every > 0 and completed_fetches % progress_every == 0:
                            print(
                                json.dumps(
                                    {
                                        "progress": {
                                            "completed": completed_fetches,
                                            "submitted": next_position,
                                            "total": len(indexed_registry),
                                            "assets_fetched_with_data": fetched_with_data,
                                            "api_attempts_total": eodhd_attempts_total,
                                            "eodhd_attempts_total": eodhd_attempts_total,
                                            "stooq_attempts_total": stooq_attempts_total,
                                            "fetch_errors_total": len(fetch_errors),
                                            "assets_changed": len(changed_entries),
                                            "packs_changed": len(changed_pack_map),
                                            "skipped_due_to_stop": skipped_due_to_stop,
                                            "last_successful_write": last_successful_write,
                                        }
                                    }
                                ),
                                flush=True,
                            )

        _flush_pack_updates("final_flush")
        fetched_assets = [fetched_assets_by_index[key] for key in sorted(fetched_assets_by_index)]
        fetched_asset_ids = [str(row.get("canonical_id") or "") for row in fetched_assets if str(row.get("canonical_id") or "")]
        fetched_assets_path = state_root / f"{args.job_name}.fetched-assets.json"
        atomic_write_json(
            fetched_assets_path,
            {
                "schema": "rv_v7_history_refresh_fetched_assets_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "job_name": args.job_name,
                "allowlist_path": str(allowlist_path),
                "from_date": from_date,
                "to_date": to_date,
                "assets_fetched_count": len(fetched_asset_ids),
                "canonical_ids": fetched_asset_ids,
            },
        )

        changed_entries.sort(key=lambda row: (str(row["history_pack"]), str(row["canonical_id"])))
        changed_packs = [changed_pack_map[key] for key in sorted(changed_pack_map)]
        changed_packs.sort(key=lambda row: str(row["history_pack"]))
        final_status = "ok"
        exit_code = 0
        if STOP_REQUESTED:
            final_status = "interrupted"
            exit_code = 130
        elif EODHD_DISABLED_REASON:
            final_status = "provider_blocked_partial" if changed_entries else "provider_blocked"
            exit_code = 2
        elif max_eodhd_calls > 0 and eodhd_attempts_total >= max_eodhd_calls and skipped_due_to_stop > 0:
            final_status = "budget_stopped_partial" if changed_entries else "budget_stopped"
            exit_code = 2
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
                    "history_effective_sha256": row.get("history_effective_sha256") or row["pack_sha256"],
                    "touched_assets": row["touched_assets"],
                    "delta_files": row.get("delta_files") or [],
                }
                for row in changed_packs
            ],
            "entries": changed_entries,
            "meta": {
                "job_name": args.job_name,
                "allowlist_path": str(allowlist_path),
                "from_date": from_date,
                "to_date": to_date,
                "api_attempts_total": eodhd_attempts_total,
                "eodhd_attempts_total": eodhd_attempts_total,
                "stooq_attempts_total": stooq_attempts_total,
                "assets_requested": len(allowlist_ids),
                "assets_found_in_registry": len(registry),
                "completed_fetches": completed_fetches,
                "assets_fetched_with_data": fetched_with_data,
                "assets_changed": len(changed_entries),
                "packs_changed": len(changed_packs),
                "fetch_errors_total": len(fetch_errors),
                "skipped_due_to_stop": skipped_due_to_stop,
                "last_successful_write": last_successful_write or None,
                "provider_preflight": eodhd_preflight,
                "provider_blocked_reason": EODHD_DISABLED_REASON,
                "us_provider_mode": args.us_provider_mode,
                "write_mode": args.write_mode,
                "history_delta_manifest_path": str(delta_manifest_path) if delta_manifest_entries else None,
                "exchange_checkpoint_path": str(exchange_checkpoint_path),
                "exchange_checkpoint_resume_enabled": bool(args.resume_exchange_checkpoint),
                "exchange_checkpoint_skipped_completed_count": len(locals().get("skipped_completed_exchanges", [])),
                "bulk_checkpoint_noop": bool(bulk_checkpoint_noop),
            },
        }
        atomic_write_json(reports_root / "history_touch_report.json", history_touch_report)

        report = {
            "status": final_status,
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
            "api_attempts_total": eodhd_attempts_total,
            "eodhd_attempts_total": eodhd_attempts_total,
            "stooq_attempts_total": stooq_attempts_total,
            "completed_fetches": completed_fetches,
            "skipped_due_to_stop": skipped_due_to_stop,
            "last_successful_write": last_successful_write or None,
            "missing_in_registry_total": len(missing_in_registry),
            "fetch_errors_total": len(fetch_errors),
            "provider_preflight": eodhd_preflight,
            "provider_blocked_reason": EODHD_DISABLED_REASON,
            "global_lock_path": str(global_lock_path),
            "us_provider_mode": args.us_provider_mode,
            "write_mode": args.write_mode,
            "history_touch_report_path": str(reports_root / "history_touch_report.json"),
            "history_delta_manifest_path": str(delta_manifest_path) if delta_manifest_entries else None,
            "exchange_checkpoint_path": str(exchange_checkpoint_path),
            "exchange_checkpoint_resume_enabled": bool(args.resume_exchange_checkpoint),
            "exchange_checkpoint_skipped_completed_count": len(locals().get("skipped_completed_exchanges", [])),
            "bulk_checkpoint_noop": bool(bulk_checkpoint_noop),
            "fetched_assets_path": str(fetched_assets_path),
            "changed_packs": changed_packs[:50],
            "fetched_assets_sample": fetched_assets[:50],
            "fetch_errors": fetch_errors[:50],
        }
        atomic_write_json(report_path, report)
        atomic_write_json(
            state_root / f"{args.job_name}.json",
            {
                "status": final_status,
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "report_path": str(report_path),
                "history_touch_report_path": str(reports_root / "history_touch_report.json"),
                "assets_requested": len(allowlist_ids),
                "assets_changed": len(changed_entries),
                "packs_changed": len(changed_packs),
                "api_attempts_total": eodhd_attempts_total,
                "eodhd_attempts_total": eodhd_attempts_total,
                "stooq_attempts_total": stooq_attempts_total,
                "completed_fetches": completed_fetches,
                "skipped_due_to_stop": skipped_due_to_stop,
                "last_successful_write": last_successful_write or None,
                "fetch_errors_total": len(fetch_errors),
                "provider_preflight": eodhd_preflight,
                "provider_blocked_reason": EODHD_DISABLED_REASON,
                "write_mode": args.write_mode,
                "history_delta_manifest_path": str(delta_manifest_path) if delta_manifest_entries else None,
                "exchange_checkpoint_path": str(exchange_checkpoint_path),
                "exchange_checkpoint_resume_enabled": bool(args.resume_exchange_checkpoint),
                "exchange_checkpoint_skipped_completed_count": len(locals().get("skipped_completed_exchanges", [])),
                "fetched_assets_path": str(fetched_assets_path),
            },
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return exit_code
    finally:
        release_flock_lock(global_lock_path)
        release_job_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
