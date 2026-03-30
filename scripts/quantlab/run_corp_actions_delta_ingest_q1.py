#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]

if str(REPO_ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, stable_hash_obj, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--api-base-url", default="https://eodhd.com/api")
    p.add_argument("--api-token-env", default="EODHD_API_KEY")
    p.add_argument("--api-token", default="")
    p.add_argument("--timeout-sec", type=float, default=20.0)
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--max-calls", type=int, default=0)
    p.add_argument("--max-retries", type=int, default=1)
    p.add_argument("--sleep-ms", type=int, default=0)
    p.add_argument("--from-date", default="")
    p.add_argument("--job-name", default="")
    p.add_argument("--compression", default="snappy")
    p.add_argument("--skip-if-no-token", action="store_true", default=True)
    p.add_argument("--strict-token-required", dest="skip_if_no_token", action="store_false")
    p.add_argument("--http-failure-mode", choices=["warn", "hard"], default="hard")
    p.add_argument("--force-canonical-id", action="append", default=[])
    p.add_argument("--force-refresh", action="store_true", default=False)
    return p.parse_args(list(argv))


def _http_json(url: str, timeout_sec: float) -> tuple[int, Any]:
    req = Request(url, headers={"User-Agent": "quantlab-q1-corp-actions/1.0"})
    try:
        with urlopen(req, timeout=timeout_sec) as resp:
            status = int(getattr(resp, "status", 200))
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(raw)
            except Exception:
                data = {"_raw": raw}
            return status, data
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if hasattr(exc, "read") else ""
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {"_raw": body}
        return int(exc.code), data
    except URLError as exc:
        return 599, {"error": str(exc)}


def _normalize_include_types(v: str) -> set[str]:
    return {x.strip().upper() for x in str(v or "").split(",") if x.strip()}


def _load_registry_assets(registry_path: Path, include_types: set[str], force_cids: set[str]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if not registry_path.exists():
        return rows
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            cid = str(obj.get("canonical_id") or "").strip()
            if not cid:
                continue
            tnorm = str(obj.get("type_norm") or "").strip().upper()
            if force_cids and cid not in force_cids:
                continue
            if (not force_cids) and include_types and tnorm not in include_types:
                continue
            provider_symbol = str(obj.get("provider_symbol") or "").strip()
            symbol = str(obj.get("symbol") or "").strip()
            exchange = str(obj.get("exchange") or "").strip()
            if not provider_symbol and symbol and exchange:
                provider_symbol = f"{symbol}.{exchange}"
            # EODHD endpoints for corporate actions expect exchange-qualified symbols in most cases.
            if provider_symbol and exchange and "." not in provider_symbol:
                provider_symbol = f"{provider_symbol}.{exchange}"
            if not provider_symbol:
                continue
            rows.append(
                {
                    "canonical_id": cid,
                    "asset_id": cid,
                    "provider_symbol": provider_symbol,
                    "type_norm": tnorm,
                    "exchange": exchange,
                }
            )
    rows.sort(key=lambda r: (r["canonical_id"], r["provider_symbol"]))
    return rows


def _parse_split_factor(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            f = float(value)
            return f if f > 0 else None
        except Exception:
            return None
    s = str(value).strip()
    if not s:
        return None
    if "/" in s:
        a, b = s.split("/", 1)
        try:
            num = float(a.strip())
            den = float(b.strip())
            if den <= 0:
                return None
            f = num / den
            return f if f > 0 else None
        except Exception:
            return None
    try:
        f = float(s)
        return f if f > 0 else None
    except Exception:
        return None


def _event_date(obj: dict[str, Any], keys: list[str]) -> str:
    for k in keys:
        v = obj.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if not s:
            continue
        return s[:10]
    return ""


def _iter_list_payload(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("data", "items", "results"):
            v = data.get(k)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def _fetch_with_retries(url: str, timeout_sec: float, max_retries: int, sleep_ms: int) -> tuple[int, Any, int]:
    attempts = 0
    while True:
        attempts += 1
        status, data = _http_json(url, timeout_sec=timeout_sec)
        if status < 500 and status not in (429,):
            return status, data, attempts
        if attempts > max(0, int(max_retries)):
            return status, data, attempts
        if sleep_ms > 0:
            time.sleep(float(sleep_ms) / 1000.0)


def _write_parquet(path: Path, rows: list[dict[str, Any]], compression: str) -> int:
    schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("effective_date", pa.string()),
            ("action_type", pa.string()),
            ("split_factor", pa.float64()),
            ("dividend_cash", pa.float64()),
            ("source_confidence", pa.float64()),
            ("ca_id", pa.string()),
            ("provider_symbol", pa.string()),
            ("provider", pa.string()),
            ("ingest_date", pa.string()),
            ("source_endpoint", pa.string()),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        tbl = pa.Table.from_pylist([], schema=schema)
        pq.write_table(tbl, path, compression=compression)
        return 0
    tbl = pa.Table.from_pylist(rows, schema=schema)
    pq.write_table(tbl, path, compression=compression)
    return int(tbl.num_rows)


def _count_existing_rows(root: Path) -> tuple[int, list[str]]:
    files = sorted(root.glob("*.parquet"))
    if not files:
        return 0, []
    rows_total = 0
    names: list[str] = []
    for path in files:
        try:
            rows_total += int(pq.read_metadata(path).num_rows)
            names.append(str(path))
        except Exception:
            continue
    return rows_total, names


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    repo_root = Path(args.repo_root).resolve()
    include_types = _normalize_include_types(args.include_types)
    force_cids = {str(x).strip() for x in (args.force_canonical_id or []) if str(x).strip()}
    job_name = str(args.job_name or f"q1_corp_actions_{str(args.ingest_date).replace('-', '')}")
    job_root = quant_root / "jobs" / job_name
    job_root.mkdir(parents=True, exist_ok=True)

    token = str(args.api_token or os.environ.get(str(args.api_token_env), "")).strip()
    run_id = f"q1corp_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    status_path = run_root / "q1_corp_actions_delta_ingest_status.json"
    out_root = quant_root / "data" / "raw" / "provider=EODHD" / f"ingest_date={args.ingest_date}" / "corp_actions"

    if not bool(args.force_refresh):
        existing_rows, existing_files = _count_existing_rows(out_root)
        if existing_rows > 0:
            manifest = {
                "schema": "quantlab_q1_corp_actions_delta_manifest_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "ok": True,
                "reason": "skip_existing_nonempty_ingest_partition",
                "inputs": {
                    "registry_path": str((repo_root / str(args.registry)).resolve()),
                    "include_types": sorted(include_types),
                    "ingest_date": str(args.ingest_date),
                    "force_refresh": False,
                },
                "stats": {
                    "assets_selected_total": 0,
                    "assets_processed_total": 0,
                    "calls_total": 0,
                    "corp_actions_rows_written": int(existing_rows),
                    "errors_total": 0,
                    "fatal_http_errors_total": 0,
                },
                "artifacts": {
                    "corp_actions_parquet": existing_files[0],
                    "job_root": str(job_root),
                    "reused_files": existing_files[:50],
                },
            }
            manifest_path = job_root / "manifest.json"
            atomic_write_json(manifest_path, manifest)
            status = {
                "schema": "quantlab_q1_corp_actions_delta_ingest_status_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "ok": True,
                "exit_code": 0,
                "reason": "skip_existing_nonempty_ingest_partition",
                "manifest_path": str(manifest_path),
                "stats": manifest["stats"],
                "artifact": existing_files[0],
            }
            atomic_write_json(status_path, status)
            print(f"run_id={run_id}")
            print(f"manifest={manifest_path}")
            print(f"status={status_path}")
            print(f"corp_actions_rows_written={existing_rows}")
            print("calls_total=0")
            print("ok=true")
            return 0

    if not token:
        status = {
            "schema": "quantlab_q1_corp_actions_delta_ingest_status_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "ok": bool(args.skip_if_no_token),
            "exit_code": 0 if bool(args.skip_if_no_token) else 2,
            "reason": "missing_api_token",
            "api_token_env": str(args.api_token_env),
            "job_root": str(job_root),
        }
        atomic_write_json(status_path, status)
        print(f"run_id={run_id}")
        print(f"status={status_path}")
        print(f"ok={str(bool(args.skip_if_no_token)).lower()}")
        if bool(args.skip_if_no_token):
            print("reason=missing_api_token_skipped")
            return 0
        return 2

    registry_path = (repo_root / str(args.registry)).resolve()
    assets = _load_registry_assets(registry_path, include_types=include_types, force_cids=force_cids)
    if int(args.max_assets) > 0:
        assets = assets[: int(args.max_assets)]

    calls_total = 0
    errors: list[dict[str, Any]] = []
    fatal_http_errors_total = 0
    rows_out: list[dict[str, Any]] = []
    asset_events = 0
    fatal_statuses = {401, 402, 403, 429}

    for i, asset in enumerate(assets):
        if int(args.max_calls) > 0 and calls_total >= int(args.max_calls):
            break
        provider_symbol = str(asset["provider_symbol"])
        base_params = {"api_token": token, "fmt": "json"}
        if str(args.from_date).strip():
            base_params["from"] = str(args.from_date).strip()

        div_url = f"{str(args.api_base_url).rstrip('/')}/div/{provider_symbol}?{urlencode(base_params)}"
        spl_url = f"{str(args.api_base_url).rstrip('/')}/splits/{provider_symbol}?{urlencode(base_params)}"

        for endpoint_name, url in (("div", div_url), ("splits", spl_url)):
            if int(args.max_calls) > 0 and calls_total >= int(args.max_calls):
                break
            status, data, attempts = _fetch_with_retries(
                url=url,
                timeout_sec=float(args.timeout_sec),
                max_retries=int(args.max_retries),
                sleep_ms=int(args.sleep_ms),
            )
            calls_total += int(attempts)
            if status >= 400:
                if int(status) in fatal_statuses:
                    fatal_http_errors_total += 1
                errors.append(
                    {
                        "canonical_id": asset["canonical_id"],
                        "provider_symbol": provider_symbol,
                        "endpoint": endpoint_name,
                        "status": int(status),
                    }
                )
                continue
            events = _iter_list_payload(data)
            if endpoint_name == "div":
                for ev in events:
                    d = _event_date(ev, ["date", "exDate", "ex_date", "paymentDate", "payment_date"])
                    if not d:
                        continue
                    try:
                        cash = float(ev.get("dividend", ev.get("value", ev.get("amount", 0.0))) or 0.0)
                    except Exception:
                        cash = 0.0
                    if cash == 0.0:
                        continue
                    ca_id = stable_hash_obj(
                        {
                            "asset_id": asset["asset_id"],
                            "date": d,
                            "action_type": "dividend_cash",
                            "cash": cash,
                            "provider_symbol": provider_symbol,
                        }
                    )[:24]
                    rows_out.append(
                        {
                            "asset_id": asset["asset_id"],
                            "effective_date": d,
                            "action_type": "dividend_cash",
                            "split_factor": None,
                            "dividend_cash": float(cash),
                            "source_confidence": 0.95,
                            "ca_id": ca_id,
                            "provider_symbol": provider_symbol,
                            "provider": "EODHD",
                            "ingest_date": str(args.ingest_date),
                            "source_endpoint": "div",
                        }
                    )
            else:
                for ev in events:
                    d = _event_date(ev, ["date", "splitDate", "split_date"])
                    if not d:
                        continue
                    sf = _parse_split_factor(ev.get("split", ev.get("split_factor")))
                    if sf is None:
                        continue
                    ca_id = stable_hash_obj(
                        {
                            "asset_id": asset["asset_id"],
                            "date": d,
                            "action_type": "split",
                            "split_factor": sf,
                            "provider_symbol": provider_symbol,
                        }
                    )[:24]
                    rows_out.append(
                        {
                            "asset_id": asset["asset_id"],
                            "effective_date": d,
                            "action_type": "split",
                            "split_factor": float(sf),
                            "dividend_cash": None,
                            "source_confidence": 0.97,
                            "ca_id": ca_id,
                            "provider_symbol": provider_symbol,
                            "provider": "EODHD",
                            "ingest_date": str(args.ingest_date),
                            "source_endpoint": "splits",
                        }
                    )
        if int(args.sleep_ms) > 0:
            time.sleep(float(args.sleep_ms) / 1000.0)
        asset_events += 1

    # de-dup by ca_id
    dedup: dict[str, dict[str, Any]] = {}
    for r in rows_out:
        dedup[str(r["ca_id"])] = r
    rows_out = list(dedup.values())
    rows_out.sort(key=lambda r: (str(r["effective_date"]), str(r["asset_id"]), str(r["action_type"]), str(r["ca_id"])))

    out_path = out_root / f"part_{stable_hash_obj({'run_id': run_id, 'rows': len(rows_out), 'calls': calls_total})[:16]}.parquet"
    rows_written = _write_parquet(out_path, rows_out, compression=str(args.compression))

    manifest = {
        "schema": "quantlab_q1_corp_actions_delta_manifest_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": True,
        "inputs": {
            "registry_path": str(registry_path),
            "include_types": sorted(include_types),
            "ingest_date": str(args.ingest_date),
            "api_base_url": str(args.api_base_url),
            "api_token_env": str(args.api_token_env),
            "from_date": str(args.from_date or ""),
            "max_assets": int(args.max_assets),
            "max_calls": int(args.max_calls),
            "max_retries": int(args.max_retries),
            "timeout_sec": float(args.timeout_sec),
            "sleep_ms": int(args.sleep_ms),
        },
        "stats": {
            "assets_selected_total": int(len(assets)),
            "assets_processed_total": int(asset_events),
            "calls_total": int(calls_total),
            "corp_actions_rows_written": int(rows_written),
            "errors_total": int(len(errors)),
            "fatal_http_errors_total": int(fatal_http_errors_total),
        },
        "artifacts": {
            "corp_actions_parquet": str(out_path),
            "job_root": str(job_root),
        },
        "errors_sample": errors[:50],
    }
    hard_http_fail = bool(fatal_http_errors_total > 0 and str(args.http_failure_mode).lower() == "hard")
    if hard_http_fail:
        manifest["ok"] = False
        manifest["failure_reason"] = "fatal_http_errors_detected"
    manifest_path = job_root / "manifest.json"
    atomic_write_json(manifest_path, manifest)

    status = {
        "schema": "quantlab_q1_corp_actions_delta_ingest_status_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": not hard_http_fail,
        "exit_code": 0 if not hard_http_fail else 31,
        "manifest_path": str(manifest_path),
        "stats": manifest["stats"],
        "artifact": str(out_path),
    }
    atomic_write_json(status_path, status)
    if int(fatal_http_errors_total) == 0:
        latest_ptr = quant_root / "ops" / "q1_corp_actions_delta_ingest" / "latest_success.json"
        atomic_write_json(
            latest_ptr,
            {
                "schema": "quantlab_q1_corp_actions_delta_latest_success_v1",
                "updated_at": utc_now_iso(),
                "run_id": run_id,
                "ok": True,
                "manifest_path": str(manifest_path),
                "status_path": str(status_path),
                "corp_actions_parquet": str(out_path),
                "calls_total": int(calls_total),
                "fatal_http_errors_total": int(fatal_http_errors_total),
            },
        )

    print(f"run_id={run_id}")
    print(f"manifest={manifest_path}")
    print(f"status={status_path}")
    print(f"corp_actions_rows_written={rows_written}")
    print(f"calls_total={calls_total}")
    print(f"ok={str((not hard_http_fail)).lower()}")
    return 0 if not hard_http_fail else 31


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
