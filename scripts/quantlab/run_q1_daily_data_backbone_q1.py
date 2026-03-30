#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from statistics import median
from pathlib import Path
from typing import Iterable, Any

import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    build_raw_bars_freshness_summary,
    local_today_iso,
    read_json,
    stable_hash_file,
    utc_now_iso,
)

DEFAULT_V7_REFRESH_ENV_FILE = "/Users/michaelpuchowezki/Desktop/EODHD.env"


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--ingest-date", default="")
    p.add_argument("--delta-job-name", default="")
    p.add_argument("--delta-limit-packs", type=int, default=0)
    p.add_argument("--delta-full-scan-packs", action="store_true")
    p.add_argument("--delta-max-emitted-rows", type=int, default=0)
    p.add_argument("--delta-max-future-date-rows", type=int, default=-1)
    p.add_argument("--delta-max-invalid-rows", type=int, default=-1)
    p.add_argument("--delta-max-failed-pack-ratio", type=float, default=-1.0)
    p.add_argument("--delta-max-invalid-row-ratio", type=float, default=-1.0)
    p.add_argument("--delta-require-row-accounting-balanced", action="store_true", default=True)
    p.add_argument("--delta-skip-require-row-accounting-balanced", dest="delta_require_row_accounting_balanced", action="store_false")
    p.add_argument("--feature-store-version", default="v4_q1inc")
    p.add_argument("--feature-output-tag", default="")
    p.add_argument("--real-delta-test-mode", action="store_true", help="Require non-zero delta rows and tighten reconciliation checks")
    p.add_argument("--real-delta-min-emitted-rows", type=int, default=1)
    p.add_argument("--real-delta-limit-packs", type=int, default=2)
    p.add_argument("--real-delta-max-emitted-rows", type=int, default=100000)
    p.add_argument("--warn-min-delta-rows", type=int, default=0)
    p.add_argument("--warn-max-delta-rows", type=int, default=0)
    p.add_argument("--fail-min-delta-rows", type=int, default=0)
    p.add_argument("--fail-max-delta-rows", type=int, default=0)
    p.add_argument("--auto-thresholds-from-ledger", action="store_true")
    p.add_argument("--auto-thresholds-path", default="")
    p.add_argument("--auto-thresholds-min-history", type=int, default=10)
    p.add_argument("--ops-ledger-disabled", action="store_true")
    p.add_argument("--ops-ledger-path", default="")
    p.add_argument("--production-mode", action="store_true", help="Harden Phase-A for regular daily production runs")
    p.add_argument("--run-corp-actions-ingest", action="store_true", default=False)
    p.add_argument("--skip-run-corp-actions-ingest", dest="run_corp_actions_ingest", action="store_false")
    p.add_argument("--corp-actions-include-types", default="STOCK,ETF")
    p.add_argument("--corp-actions-max-assets", type=int, default=0)
    p.add_argument("--corp-actions-max-calls", type=int, default=0)
    p.add_argument("--corp-actions-max-retries", type=int, default=1)
    p.add_argument("--corp-actions-timeout-sec", type=float, default=20.0)
    p.add_argument("--corp-actions-sleep-ms", type=int, default=0)
    p.add_argument("--corp-actions-http-failure-mode", choices=["warn", "hard"], default="hard")
    p.add_argument("--corp-actions-from-date", default="")
    p.add_argument("--corp-actions-api-token-env", default="EODHD_API_KEY")
    p.add_argument("--corp-actions-api-token", default="")
    p.add_argument("--corp-actions-coverage-topup-enabled", action="store_true", default=True)
    p.add_argument("--skip-corp-actions-coverage-topup", dest="corp_actions_coverage_topup_enabled", action="store_false")
    p.add_argument("--corp-actions-coverage-topup-attempts", type=int, default=2)
    p.add_argument("--corp-actions-coverage-topup-assets-step", type=int, default=1000)
    p.add_argument("--corp-actions-coverage-topup-calls-step", type=int, default=1000)
    p.add_argument("--run-registry-delistings-ingest", action="store_true", default=True)
    p.add_argument("--skip-run-registry-delistings-ingest", dest="run_registry_delistings_ingest", action="store_false")
    p.add_argument("--delistings-include-types", default="STOCK,ETF")
    p.add_argument("--delistings-max-assets", type=int, default=0)
    p.add_argument("--delistings-min-staleness-bd", type=int, default=20)
    p.add_argument("--delistings-return-used", type=float, default=-0.90)
    p.add_argument("--run-data-truth-layers", action="store_true", default=True)
    p.add_argument("--skip-run-data-truth-layers", dest="run_data_truth_layers", action="store_false")
    p.add_argument("--contract-source-policy", choices=["preserve_existing", "derive_if_empty", "force_derive"], default="derive_if_empty")
    p.add_argument(
        "--contract-raw-ingest-date-mode",
        choices=["latest_available", "match_backbone_ingest"],
        default="latest_available",
        help="How contract-layer materialization selects raw corp-actions/delistings ingest_date.",
    )
    p.add_argument("--contract-derive-from-adjusted-close", action="store_true", default=True)
    p.add_argument("--skip-contract-derive-from-adjusted-close", dest="contract_derive_from_adjusted_close", action="store_false")
    p.add_argument("--contract-derivation-min-rel-change", type=float, default=0.001)
    p.add_argument("--contract-derivation-split-threshold", type=float, default=0.10)
    p.add_argument("--contract-max-derived-corp-events", type=int, default=250000)
    p.add_argument("--contract-require-real-corp-actions", action="store_true", default=False)
    p.add_argument("--contract-require-real-delistings", action="store_true", default=False)
    p.add_argument("--contract-placeholder-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--run-invalidation-scan", action="store_true", default=True)
    p.add_argument("--skip-run-invalidation-scan", dest="run_invalidation_scan", action="store_false")
    p.add_argument("--run-redflags-q1", action="store_true", default=True)
    p.add_argument("--skip-run-redflags-q1", dest="run_redflags_q1", action="store_false")
    p.add_argument("--redflags-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--recon-contract-placeholder-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--corp-actions-cap-hit-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--corp-actions-raw-empty-fallback-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--recon-require-real-corp-actions", action="store_true", default=False)
    p.add_argument("--recon-require-real-delistings", action="store_true", default=False)
    p.add_argument("--recon-require-provider-raw-corp-actions", action="store_true", default=False)
    p.add_argument("--recon-require-provider-raw-delistings", action="store_true", default=False)
    p.add_argument("--recon-provider-raw-requirement-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--v4-final-profile", action="store_true", default=False)
    p.add_argument("--pre-refresh-v7-on-stale-raw-bars", dest="pre_refresh_v7_on_stale_raw_bars", action="store_true", default=None)
    p.add_argument("--skip-pre-refresh-v7-on-stale-raw-bars", dest="pre_refresh_v7_on_stale_raw_bars", action="store_false")
    p.add_argument("--v7-refresh-env-file", default=DEFAULT_V7_REFRESH_ENV_FILE)
    p.add_argument("--v7-refresh-buckets", default="stocks,etfs")
    p.add_argument("--v7-refresh-max-runs-per-bucket", type=int, default=2)
    p.add_argument("--v7-refresh-max-no-progress-runs", type=int, default=1)
    p.add_argument("--v7-refresh-max-throttle-stops", type=int, default=1)
    p.add_argument("--v7-refresh-throttle-cooldown-ms", type=int, default=120000)
    p.add_argument("--v7-refresh-backfill-max", type=int, default=1500)
    p.add_argument("--v7-refresh-sleep-ms", type=int, default=1000)
    p.add_argument("--v7-refresh-targeted-stock-top-n", type=int, default=90000)
    p.add_argument("--v7-refresh-targeted-etf-top-n", type=int, default=30000)
    p.add_argument("--v7-refresh-targeted-recent-lookback-calendar-days", type=int, default=28)
    p.add_argument("--v7-refresh-targeted-stale-grace-calendar-days", type=int, default=1)
    p.add_argument("--v7-refresh-targeted-min-adv-dollar", type=float, default=0.0)
    p.add_argument("--v7-refresh-targeted-require-entry-eligible", action="store_true", default=True)
    p.add_argument(
        "--skip-v7-refresh-targeted-require-entry-eligible",
        dest="v7_refresh_targeted_require_entry_eligible",
        action="store_false",
    )
    p.add_argument("--v7-refresh-from-date", default="")
    p.add_argument("--raw-bars-stale-failure-mode", choices=["warn", "hard"], default="warn")
    p.add_argument("--tri-asset-classes", default="stock,etf")
    return p.parse_args(list(argv))


def _run(cmd: list[str], *, env: dict[str, str] | None = None) -> tuple[int, float, str, str]:
    t0 = time.time()
    proc_env = dict(os.environ)
    if env:
        proc_env.update({str(k): str(v) for k, v in env.items()})
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, env=proc_env)
    return proc.returncode, round(time.time() - t0, 3), proc.stdout or "", proc.stderr or ""


def _parse_kv(stdout: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in stdout.splitlines():
        if "=" in line and not line.startswith("["):
            k, v = line.split("=", 1)
            if k and v:
                out[k.strip()] = v.strip()
    return out


def _append_jsonl(path: Path, rec: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def _replace_cmd_value(cmd: list[str], flag: str, value: str) -> list[str]:
    out = list(cmd)
    try:
        idx = out.index(flag)
    except ValueError:
        out.extend([flag, str(value)])
        return out
    if idx + 1 < len(out):
        out[idx + 1] = str(value)
    else:
        out.append(str(value))
    return out


def _has_corp_actions_coverage_low(report_obj: dict[str, Any] | None) -> tuple[bool, str]:
    if not report_obj:
        return False, ""
    for w in (report_obj.get("warnings") or []):
        ws = str(w)
        if ws.startswith("CONTRACT_CORP_ACTIONS_COVERAGE_LOW:"):
            return True, ws
    return False, ""


def _read_json_if_exists(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        p = Path(value)
        if p.exists() and p.is_file():
            return read_json(p)
    except Exception:
        return None
    return None


def _parse_last_json_line(*parts: str) -> dict[str, Any] | None:
    merged = "\n".join(str(part or "") for part in parts if str(part or "").strip())
    for line in reversed(merged.splitlines()):
        raw = line.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def _latest_nonempty_raw_partition(quant_root: Path, layer_name: str) -> dict[str, Any]:
    base = quant_root / "data" / "raw" / "provider=EODHD"
    best: dict[str, Any] = {
        "rows_total": 0,
        "ingest_date": "",
        "files_total": 0,
        "path": "",
    }
    if not base.exists():
        return best
    for ingest_dir in sorted(base.glob("ingest_date=*")):
        layer_dir = ingest_dir / layer_name
        if not layer_dir.exists():
            continue
        rows_total = 0
        files_total = 0
        for part in sorted(layer_dir.glob("*.parquet")):
            try:
                rows_total += int(pq.read_metadata(part).num_rows)
                files_total += 1
            except Exception:
                continue
        if rows_total <= 0:
            continue
        best = {
            "rows_total": rows_total,
            "ingest_date": ingest_dir.name.split("=", 1)[1],
            "files_total": files_total,
            "path": str(layer_dir),
        }
    return best


def _tail_jsonl(path: Path, limit: int = 200) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue
    except Exception:
        return []
    if limit > 0 and len(rows) > limit:
        rows = rows[-limit:]
    return rows


def _resolve_effective_backbone_ingest_date(args: argparse.Namespace, quant_root: Path) -> dict[str, Any]:
    requested = str(args.ingest_date or "").strip()
    today = local_today_iso()
    include_types = [part.strip() for part in str(args.include_types or "").split(",") if part.strip()]
    freshness = build_raw_bars_freshness_summary(
        quant_root,
        asset_types=include_types,
        reference_date=requested or today,
        stale_after_calendar_days=3 if bool(args.production_mode) else 7,
    )
    latest_required = str(freshness.get("latest_required_ingest_date") or "").strip()
    effective = requested or today
    clamped = False
    reason = ""
    if requested and requested > today:
        effective = today
        clamped = True
        reason = "REQUESTED_INGEST_DATE_GT_LOCAL_TODAY"
    elif not requested:
        reason = "LOCAL_TODAY_FALLBACK"
    return {
        "requested_ingest_date": requested,
        "effective_ingest_date": effective,
        "ingest_date_was_clamped": bool(clamped),
        "ingest_date_clamp_reason": reason,
        "raw_bars_freshness": freshness,
    }


def _read_public_v7_publish_state() -> dict[str, Any]:
    public_reports_dir = REPO_ROOT / "public" / "data" / "universe" / "v7" / "reports"
    private_reports_dir = REPO_ROOT / "mirrors" / "universe-v7" / "reports"
    run_status_path = public_reports_dir / "run_status.json"
    history_touch_report_path = private_reports_dir / "history_touch_report.json"
    run_status = _read_json_if_exists(str(run_status_path)) or {}
    exit_code = run_status.get("exit_code")
    try:
        exit_code = int(exit_code) if exit_code is not None else None
    except Exception:
        exit_code = None
    return {
        "public_reports_dir": str(public_reports_dir),
        "private_reports_dir": str(private_reports_dir),
        "run_status_path": str(run_status_path),
        "run_status_exists": bool(run_status_path.exists()),
        "run_status_exit_code": exit_code,
        "run_status_reason": str(run_status.get("reason") or ""),
        "history_touch_report_path": str(history_touch_report_path),
        "history_touch_report_exists": bool(history_touch_report_path.exists()),
    }


def _build_targeted_v7_refresh_allowlist(
    args: argparse.Namespace,
    quant_root: Path,
    run_root: Path,
) -> dict[str, Any]:
    builder = REPO_ROOT / "scripts" / "quantlab" / "build_targeted_v7_refresh_allowlist.py"
    allowlist_path = run_root / "state" / "v7_targeted_refresh_allowlist.json"
    report_path = run_root / "state" / "v7_targeted_refresh_allowlist_report.json"
    cmd = [
        args.python,
        str(builder),
        "--quant-root",
        str(quant_root),
        "--output-path",
        str(allowlist_path),
        "--report-path",
        str(report_path),
        "--stock-top-n",
        str(int(args.v7_refresh_targeted_stock_top_n)),
        "--etf-top-n",
        str(int(args.v7_refresh_targeted_etf_top_n)),
        "--recent-lookback-calendar-days",
        str(int(args.v7_refresh_targeted_recent_lookback_calendar_days)),
        "--stale-grace-calendar-days",
        str(int(args.v7_refresh_targeted_stale_grace_calendar_days)),
        "--min-adv-dollar",
        str(float(args.v7_refresh_targeted_min_adv_dollar)),
    ]
    if bool(args.v7_refresh_targeted_require_entry_eligible):
        cmd.append("--require-entry-eligible")
    else:
        cmd.append("--skip-require-entry-eligible")
    if str(args.v7_refresh_from_date or "").strip():
        cmd.extend(["--from-date-floor", str(args.v7_refresh_from_date).strip()])
    rc, elapsed, out, err = _run(cmd)
    parsed = _parse_last_json_line(out, err) or {}
    return {
        "name": "build_targeted_v7_refresh_allowlist",
        "ok": rc == 0,
        "exit_code": rc,
        "elapsed_sec": elapsed,
        "cmd": cmd,
        "stdout_tail": out.splitlines()[-30:],
        "stderr_tail": err.splitlines()[-30:],
        "parsed": parsed,
        "allowlist_path": str(allowlist_path),
        "report_path": str(report_path),
    }


def _should_attempt_local_v7_refresh(
    raw_bars_freshness: dict[str, Any],
    public_v7_state: dict[str, Any],
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if not bool(raw_bars_freshness.get("required_asset_types_fresh")):
        reasons.append("raw_bars_stale")
    if not bool(public_v7_state.get("history_touch_report_exists")):
        reasons.append("history_touch_report_missing")
    if bool(public_v7_state.get("run_status_exists")) and int(public_v7_state.get("run_status_exit_code") or 0) != 0:
        reasons.append(
            "public_run_status_failed:"
            f"exit_code={int(public_v7_state.get('run_status_exit_code') or 0)}:"
            f"reason={public_v7_state.get('run_status_reason') or 'unknown'}"
        )
    return bool(reasons), reasons


def _resolve_v7_refresh_env_path(args: argparse.Namespace) -> tuple[Path | None, str]:
    requested_raw = str(args.v7_refresh_env_file or "").strip()
    requested = Path(requested_raw).expanduser() if requested_raw else None
    fallback = REPO_ROOT / ".env.local"
    for candidate, source in (
        (requested, "requested"),
        (fallback, "repo_env_local"),
    ):
        if candidate is not None and candidate.exists() and candidate.is_file():
            return candidate, source
    token = str(os.environ.get("EODHD_API_KEY") or os.environ.get("EODHD_API_TOKEN") or "").strip()
    if token and token != "DEIN_KEY":
        return None, "process_env"
    return requested, "missing"


def _run_local_v7_refresh(
    args: argparse.Namespace,
    reasons: list[str],
    *,
    quant_root: Path,
    run_root: Path,
) -> dict[str, Any]:
    bucket_types: list[str] = []
    for token in str(args.v7_refresh_buckets or "").split(","):
        t = token.strip().lower()
        if t == "stocks":
            bucket_types.append("STOCK")
        elif t == "etfs":
            bucket_types.append("ETF")
        elif t == "rest":
            bucket_types.extend(["FUND", "INDEX", "FOREX", "CRYPTO", "BOND", "OTHER"])
    if not bucket_types:
        bucket_types = ["STOCK", "ETF"]
    env_file, env_source = _resolve_v7_refresh_env_path(args)
    cmd = [
        "node",
        "scripts/universe-v7/run-v7.mjs",
        "--publish",
        "--backfill-max",
        str(int(args.v7_refresh_backfill_max)),
        "--skip-archeology",
    ]
    if env_file is not None and env_file.exists():
        cmd.extend(["--env-file", str(env_file)])
    if env_source == "missing":
        return {
            "name": "local_v7_refresh_preflight",
            "ok": False,
            "exit_code": 97,
            "elapsed_sec": 0.0,
            "cmd": cmd,
            "stdout_tail": [],
            "stderr_tail": [f"V7_REFRESH_ENV_FILE_MISSING {env_file}"],
            "parsed": {
                "reason": "V7_REFRESH_ENV_FILE_MISSING",
                "env_file": str(env_file or ""),
                "env_source": env_source,
                "refresh_reasons": list(reasons),
            },
        }
    extra_env = {
        "RV_V7_BACKFILL_FAST_MODE": "true",
        "RV_V7_BACKFILL_TYPE_ALLOWLIST": ",".join(bucket_types),
        "RV_V7_PIPELINE_NODE_OPTIONS": os.environ.get("RV_V7_PIPELINE_NODE_OPTIONS", "--max-old-space-size=8192"),
    }
    target_step = _build_targeted_v7_refresh_allowlist(args, quant_root, run_root)
    target_meta = dict(target_step.get("parsed") or {})
    allowlist_path = str(target_step.get("allowlist_path") or "").strip()
    selected_total = int(target_meta.get("selected_total") or 0)
    if target_step.get("ok") and selected_total > 0 and allowlist_path:
        extra_env["RV_V7_BACKFILL_CANONICAL_ALLOWLIST"] = f"@{allowlist_path}"
        target_from_date = str(args.v7_refresh_from_date or "").strip() or str(target_meta.get("recommended_from_date") or "").strip()
        if target_from_date:
            extra_env["RV_V7_BACKFILL_FROM_DATE"] = target_from_date
    elif target_step.get("ok") and selected_total <= 0:
        target_meta["reason"] = "NO_STALE_TARGETS_SELECTED"
    elif not target_step.get("ok"):
        return {
            "name": "local_v7_refresh_preflight",
            "ok": False,
            "exit_code": int(target_step.get("exit_code") or 98),
            "elapsed_sec": float(target_step.get("elapsed_sec") or 0.0),
            "cmd": cmd,
            "env": extra_env,
            "stdout_tail": list(target_step.get("stdout_tail") or []),
            "stderr_tail": list(target_step.get("stderr_tail") or []),
            "parsed": {
                "reason": "TARGETED_ALLOWLIST_BUILD_FAILED",
                "target_step": target_meta,
                "env_file": str(env_file or ""),
                "env_source": env_source,
                "bucket_types": list(bucket_types),
                "refresh_reasons": list(reasons),
            },
        }
    rc, elapsed, out, err = _run(cmd, env=extra_env)
    parsed = _parse_last_json_line(out, err) or {}
    return {
        "name": "local_v7_refresh_preflight",
        "ok": rc == 0,
        "exit_code": rc,
        "elapsed_sec": elapsed,
        "cmd": cmd,
        "env": extra_env,
        "stdout_tail": out.splitlines()[-30:],
        "stderr_tail": err.splitlines()[-30:],
        "parsed": {
            **parsed,
            "env_file": str(env_file or ""),
            "env_source": env_source,
            "bucket_types": list(bucket_types),
            "targeted_allowlist": target_meta,
            "refresh_reasons": list(reasons),
        },
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    v4_final_profile = bool(args.v4_final_profile)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    scripts = {
        "delta": REPO_ROOT / "scripts/quantlab/run_daily_delta_ingest_q1.py",
        "corp_actions_delta": REPO_ROOT / "scripts/quantlab/run_corp_actions_delta_ingest_q1.py",
        "registry_delistings": REPO_ROOT / "scripts/quantlab/run_registry_delistings_ingest_q1.py",
        "snap_inc": REPO_ROOT / "scripts/quantlab/run_incremental_snapshot_update_q1.py",
        "contract_layers": REPO_ROOT / "scripts/quantlab/materialize_snapshot_contract_layers_q1.py",
        "tri_layers": REPO_ROOT / "scripts/quantlab/materialize_snapshot_tri_layers_q1.py",
        "invalidation": REPO_ROOT / "scripts/quantlab/run_invalidation_scan_q1.py",
        "feat_inc": REPO_ROOT / "scripts/quantlab/run_incremental_feature_update_q1.py",
        "recon": REPO_ROOT / "scripts/quantlab/run_reconciliation_checks_q1.py",
        "redflags": REPO_ROOT / "scripts/quantlab/run_redflag_invariants_q1.py",
    }
    run_id = f"q1backbone_{time.time_ns()}_{os.getpid()}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_daily_data_backbone_run_report.json"

    steps: list[dict[str, Any]] = []
    refs: dict[str, Any] = {}
    hashes: dict[str, str] = {}
    warnings_list: list[str] = []
    threshold_failures: list[str] = []

    effective_run_corp_actions_ingest = bool(args.run_corp_actions_ingest or v4_final_profile)
    effective_run_registry_delistings_ingest = bool(args.run_registry_delistings_ingest or v4_final_profile)
    effective_contract_source_policy = str(args.contract_source_policy)
    effective_contract_raw_ingest_date_mode = (
        "match_backbone_ingest" if v4_final_profile else str(args.contract_raw_ingest_date_mode)
    )
    effective_contract_require_real_corp_actions = bool(args.contract_require_real_corp_actions or v4_final_profile)
    effective_contract_require_real_delistings = bool(args.contract_require_real_delistings or v4_final_profile)
    effective_contract_placeholder_failure_mode = "hard" if v4_final_profile else str(args.contract_placeholder_failure_mode)
    effective_recon_contract_placeholder_failure_mode = (
        "hard" if v4_final_profile else str(args.recon_contract_placeholder_failure_mode)
    )
    effective_corp_actions_http_failure_mode = "hard" if v4_final_profile else str(args.corp_actions_http_failure_mode)
    effective_corp_actions_cap_hit_failure_mode = (
        "hard" if v4_final_profile else str(args.corp_actions_cap_hit_failure_mode)
    )
    effective_corp_actions_raw_empty_fallback_failure_mode = (
        "hard" if v4_final_profile else str(args.corp_actions_raw_empty_fallback_failure_mode)
    )
    effective_recon_require_real_corp_actions = bool(args.recon_require_real_corp_actions or v4_final_profile)
    effective_recon_require_real_delistings = bool(args.recon_require_real_delistings or v4_final_profile)
    effective_recon_require_provider_raw_corp_actions = bool(
        args.recon_require_provider_raw_corp_actions or v4_final_profile
    )
    effective_recon_require_provider_raw_delistings = bool(
        args.recon_require_provider_raw_delistings or v4_final_profile
    )
    effective_recon_provider_raw_requirement_failure_mode = (
        "hard" if v4_final_profile else str(args.recon_provider_raw_requirement_failure_mode)
    )
    effective_pre_refresh_v7_on_stale_raw_bars = (
        bool(args.production_mode or v4_final_profile)
        if args.pre_refresh_v7_on_stale_raw_bars is None
        else bool(args.pre_refresh_v7_on_stale_raw_bars)
    )
    effective_raw_bars_stale_failure_mode = (
        "hard" if bool(args.production_mode or v4_final_profile) else str(args.raw_bars_stale_failure_mode)
    )
    ingest_resolution = _resolve_effective_backbone_ingest_date(args, quant_root)
    effective_ingest_date = str(ingest_resolution.get("effective_ingest_date") or "").strip()
    raw_bars_freshness = dict(ingest_resolution.get("raw_bars_freshness") or {})
    public_v7_state = _read_public_v7_publish_state()
    if bool(ingest_resolution.get("ingest_date_was_clamped")):
        warnings_list.append(
            "INGEST_DATE_CLAMPED_TO_LOCAL_TODAY:"
            f"requested={ingest_resolution.get('requested_ingest_date') or 'none'}:"
            f"effective={effective_ingest_date or 'unknown'}"
        )
    should_attempt_v7_refresh, refresh_reasons = _should_attempt_local_v7_refresh(raw_bars_freshness, public_v7_state)
    pre_steps_failed = False
    if effective_pre_refresh_v7_on_stale_raw_bars and should_attempt_v7_refresh:
        refresh_step = _run_local_v7_refresh(args, refresh_reasons, quant_root=quant_root, run_root=run_root)
        steps.append(refresh_step)
        refs["local_v7_refresh.backfill_bucket_progress"] = str(
            REPO_ROOT / "public" / "data" / "universe" / "v7" / "reports" / "backfill_bucket_progress.json"
        )
        refs["local_v7_refresh.run_status"] = str(REPO_ROOT / "public" / "data" / "universe" / "v7" / "reports" / "run_status.json")
        target_allowlist_path = str(refresh_step.get("parsed", {}).get("targeted_allowlist", {}).get("output_path") or "")
        target_report_path = str(refresh_step.get("parsed", {}).get("targeted_allowlist", {}).get("report_path") or "")
        if target_allowlist_path:
            refs["local_v7_refresh.allowlist"] = target_allowlist_path
        if target_report_path:
            refs["local_v7_refresh.allowlist_report"] = target_report_path
        for key in ("local_v7_refresh.backfill_bucket_progress", "local_v7_refresh.run_status"):
            p = Path(str(refs.get(key) or ""))
            if p.exists() and p.is_file():
                hashes[f"{key}_hash"] = stable_hash_file(p)
        if refresh_step.get("ok"):
            warnings_list.append("LOCAL_V7_REFRESH_APPLIED:" + ",".join(refresh_reasons))
            ingest_resolution = _resolve_effective_backbone_ingest_date(args, quant_root)
            effective_ingest_date = str(ingest_resolution.get("effective_ingest_date") or "").strip()
            raw_bars_freshness = dict(ingest_resolution.get("raw_bars_freshness") or {})
            public_v7_state = _read_public_v7_publish_state()
        elif effective_raw_bars_stale_failure_mode == "hard":
            threshold_failures.append(
                "FAIL_LOCAL_V7_REFRESH_PRECHECK:"
                f"reasons={','.join(refresh_reasons) or 'unknown'}:"
                f"exit_code={int(refresh_step.get('exit_code') or 1)}"
            )
            pre_steps_failed = True

    source_truth_gate_failures: list[str] = []
    if not bool(raw_bars_freshness.get("required_asset_types_fresh")):
        source_truth_gate_failures.append(
            "RAW_BARS_REQUIRED_TYPES_STALE:"
            f"latest_required_ingest_date={raw_bars_freshness.get('latest_required_ingest_date') or 'unknown'}:"
            f"age_days={raw_bars_freshness.get('latest_required_age_calendar_days') if raw_bars_freshness.get('latest_required_age_calendar_days') is not None else 'unknown'}"
        )
    if not bool(public_v7_state.get("history_touch_report_exists")):
        source_truth_gate_failures.append("PRIVATE_V7_HISTORY_TOUCH_REPORT_MISSING")
    if bool(public_v7_state.get("run_status_exists")) and int(public_v7_state.get("run_status_exit_code") or 0) != 0:
        warnings_list.append(
            "PUBLIC_V7_RUN_STATUS_FAILED:"
            f"exit_code={int(public_v7_state.get('run_status_exit_code') or 0)}:"
            f"reason={public_v7_state.get('run_status_reason') or 'unknown'}"
        )
    if source_truth_gate_failures and effective_raw_bars_stale_failure_mode == "hard":
        threshold_failures.extend(f"FAIL_{item}" for item in source_truth_gate_failures)
        steps.append(
            {
                "name": "source_truth_gate",
                "ok": False,
                "exit_code": 96,
                "elapsed_sec": 0.0,
                "cmd": [],
                "stdout_tail": [],
                "stderr_tail": list(source_truth_gate_failures),
                "parsed": {
                    "failure_mode": str(effective_raw_bars_stale_failure_mode),
                    "raw_bars_freshness": raw_bars_freshness,
                    "public_v7_state": public_v7_state,
                },
            }
        )
        pre_steps_failed = True
    elif source_truth_gate_failures:
        warnings_list.extend(source_truth_gate_failures)

    latest_nonempty_raw_corp_actions = _latest_nonempty_raw_partition(quant_root, "corp_actions")
    if (
        str(effective_contract_raw_ingest_date_mode) == "match_backbone_ingest"
        and str(effective_ingest_date or "") < local_today_iso()
        and int(latest_nonempty_raw_corp_actions.get("rows_total") or 0) > 0
        and str(latest_nonempty_raw_corp_actions.get("ingest_date") or "") > str(effective_ingest_date or "")
    ):
        effective_contract_raw_ingest_date_mode = "latest_available"
        warnings_list.append(
            "CONTRACT_RAW_INGEST_MODE_OVERRIDDEN_TO_LATEST_AVAILABLE:"
            f"backbone_ingest={effective_ingest_date or 'unknown'};"
            f"latest_nonempty_raw_corp_actions={latest_nonempty_raw_corp_actions.get('ingest_date')}"
        )
    if (
        effective_run_corp_actions_ingest
        and str(effective_contract_raw_ingest_date_mode) == "latest_available"
        and int(latest_nonempty_raw_corp_actions.get("rows_total") or 0) > 0
    ):
        effective_run_corp_actions_ingest = False
        refs["corp_actions_delta_ingest.reused_raw_layer"] = str(latest_nonempty_raw_corp_actions.get("path") or "")
        warnings_list.append(
            "CORP_ACTIONS_INGEST_SKIPPED_REUSE_LATEST_RAW:"
            f"ingest_date={latest_nonempty_raw_corp_actions.get('ingest_date')};"
            f"rows={int(latest_nonempty_raw_corp_actions.get('rows_total') or 0)}"
        )

    delta_cmd = [py, str(scripts["delta"]), "--quant-root", str(quant_root), "--include-types", args.include_types]
    if effective_ingest_date:
        delta_cmd += ["--ingest-date", effective_ingest_date]
    if args.delta_job_name:
        delta_cmd += ["--job-name", args.delta_job_name]
    if args.delta_limit_packs and args.delta_limit_packs > 0:
        delta_cmd += ["--limit-packs", str(args.delta_limit_packs)]
    if args.delta_full_scan_packs:
        delta_cmd += ["--full-scan-packs"]
    if args.delta_max_emitted_rows and args.delta_max_emitted_rows > 0:
        delta_cmd += ["--max-emitted-rows", str(args.delta_max_emitted_rows)]
    if int(args.delta_max_future_date_rows) >= 0:
        delta_cmd += ["--max-future-date-rows", str(int(args.delta_max_future_date_rows))]
    if int(args.delta_max_invalid_rows) >= 0:
        delta_cmd += ["--max-invalid-rows", str(int(args.delta_max_invalid_rows))]
    if float(args.delta_max_failed_pack_ratio) >= 0.0:
        delta_cmd += ["--max-failed-pack-ratio", str(float(args.delta_max_failed_pack_ratio))]
    if float(args.delta_max_invalid_row_ratio) >= 0.0:
        delta_cmd += ["--max-invalid-row-ratio", str(float(args.delta_max_invalid_row_ratio))]
    if not bool(args.delta_require_row_accounting_balanced):
        delta_cmd += ["--skip-require-row-accounting-balanced"]
    if args.real_delta_test_mode:
        delta_cmd += [
            "--expect-nonzero-delta",
            "--expect-min-emitted-rows",
            str(max(1, int(args.real_delta_min_emitted_rows))),
        ]
        if not args.delta_full_scan_packs:
            delta_cmd += ["--full-scan-packs"]
        if not (args.delta_limit_packs and args.delta_limit_packs > 0):
            delta_cmd += ["--limit-packs", str(max(1, int(args.real_delta_limit_packs)))]
        if not (args.delta_max_emitted_rows and args.delta_max_emitted_rows > 0):
            delta_cmd += ["--max-emitted-rows", str(max(1, int(args.real_delta_max_emitted_rows)))]
        if int(args.delta_max_future_date_rows) < 0:
            delta_cmd += ["--max-future-date-rows", "0"]
        if int(args.delta_max_invalid_rows) < 0:
            delta_cmd += ["--max-invalid-rows", "0"]
        if float(args.delta_max_failed_pack_ratio) < 0.0:
            delta_cmd += ["--max-failed-pack-ratio", "0.10"]
        if float(args.delta_max_invalid_row_ratio) < 0.0:
            delta_cmd += ["--max-invalid-row-ratio", "0.00"]
        if not args.delta_job_name:
            delta_cmd += ["--job-name", f"q1_daily_delta_realtest_{time.time_ns()}_{os.getpid()}"]
    elif args.production_mode:
        prod_min_rows = int(args.fail_min_delta_rows) if int(args.fail_min_delta_rows) > 0 else 1
        delta_cmd += ["--expect-nonzero-delta", "--expect-min-emitted-rows", str(max(1, prod_min_rows))]
        if int(args.delta_max_future_date_rows) < 0:
            delta_cmd += ["--max-future-date-rows", "0"]
        if int(args.delta_max_invalid_rows) < 0:
            delta_cmd += ["--max-invalid-rows", "0"]
        if float(args.delta_max_failed_pack_ratio) < 0.0:
            delta_cmd += ["--max-failed-pack-ratio", "0.25"]
        if float(args.delta_max_invalid_row_ratio) < 0.0:
            delta_cmd += ["--max-invalid-row-ratio", "0.00"]
        if not args.delta_job_name:
            delta_cmd += ["--job-name", f"q1_daily_delta_prod_{time.time_ns()}_{os.getpid()}"]

    corp_cmd_template: list[str] | None = None
    contract_cmd_template: list[str] | None = None
    tri_cmd_template: list[str] | None = None
    recon_cmd_template: list[str] | None = None
    step_specs: list[tuple[str, list[str]]] = [("daily_delta_ingest", delta_cmd)]
    if effective_run_corp_actions_ingest:
        corp_cmd = [
            py,
            str(scripts["corp_actions_delta"]),
            "--quant-root",
            str(quant_root),
            "--repo-root",
            str(REPO_ROOT),
            "--include-types",
            str(args.corp_actions_include_types),
            "--max-assets",
            str(int(args.corp_actions_max_assets)),
            "--max-calls",
            str(int(args.corp_actions_max_calls)),
            "--max-retries",
            str(int(args.corp_actions_max_retries)),
            "--timeout-sec",
            str(float(args.corp_actions_timeout_sec)),
            "--sleep-ms",
            str(int(args.corp_actions_sleep_ms)),
            "--http-failure-mode",
            str(effective_corp_actions_http_failure_mode),
            "--api-token-env",
            str(args.corp_actions_api_token_env),
        ]
        if effective_ingest_date:
            corp_cmd += ["--ingest-date", effective_ingest_date]
        if str(args.corp_actions_from_date).strip():
            corp_cmd += ["--from-date", str(args.corp_actions_from_date).strip()]
        if str(args.corp_actions_api_token).strip():
            corp_cmd += ["--api-token", str(args.corp_actions_api_token).strip()]
        corp_cmd_template = list(corp_cmd)
        step_specs.append(("corp_actions_delta_ingest", corp_cmd))
    if effective_run_registry_delistings_ingest:
        delist_cmd = [
            py,
            str(scripts["registry_delistings"]),
            "--quant-root",
            str(quant_root),
            "--repo-root",
            str(REPO_ROOT),
            "--include-types",
            str(args.delistings_include_types),
            "--max-assets",
            str(int(args.delistings_max_assets)),
            "--min-staleness-bd",
            str(int(args.delistings_min_staleness_bd)),
            "--delist-return-used",
            str(float(args.delistings_return_used)),
        ]
        if effective_ingest_date:
            delist_cmd += ["--ingest-date", effective_ingest_date]
        step_specs.append(("registry_delistings_ingest", delist_cmd))
    step_specs.append(("incremental_snapshot_update", [py, str(scripts["snap_inc"]), "--quant-root", str(quant_root)]))
    if args.run_data_truth_layers:
        contract_cmd = [
            py,
            str(scripts["contract_layers"]),
            "--quant-root",
            str(quant_root),
            "--source-policy",
            str(effective_contract_source_policy),
            "--raw-provider",
            "EODHD",
            "--derivation-min-rel-change",
            str(float(args.contract_derivation_min_rel_change)),
            "--derivation-split-threshold",
            str(float(args.contract_derivation_split_threshold)),
            "--max-derived-corp-events",
            str(int(args.contract_max_derived_corp_events)),
            "--placeholder-failure-mode",
            str(effective_contract_placeholder_failure_mode),
        ]
        if str(effective_contract_raw_ingest_date_mode) == "match_backbone_ingest" and effective_ingest_date:
            contract_cmd += ["--raw-ingest-date", effective_ingest_date]
        # Contract-layer materialization should consume the best available raw
        # source, independent of whether today's ingest step ran.
        contract_cmd += ["--use-raw-corp-actions", "--use-raw-delistings"]
        if bool(args.contract_derive_from_adjusted_close):
            contract_cmd += ["--derive-from-adjusted-close"]
        else:
            contract_cmd += ["--skip-derive-from-adjusted-close"]
        if bool(effective_contract_require_real_corp_actions):
            contract_cmd += ["--require-real-corp-actions"]
        if bool(effective_contract_require_real_delistings):
            contract_cmd += ["--require-real-delistings"]

        contract_cmd_template = list(contract_cmd)
        tri_cmd_template = [
            py,
            str(scripts["tri_layers"]),
            "--quant-root",
            str(quant_root),
            "--asset-classes",
            str(args.tri_asset_classes),
        ]
        step_specs.extend(
            [
                ("materialize_contract_layers", contract_cmd),
                ("materialize_tri_layers", tri_cmd_template),
            ]
        )
    if args.run_invalidation_scan:
        step_specs.append(("invalidation_scan", [py, str(scripts["invalidation"]), "--quant-root", str(quant_root)]))
    feat_cmd = [
        py,
        str(scripts["feat_inc"]),
        "--quant-root",
        str(quant_root),
        "--feature-store-version",
        args.feature_store_version,
    ] + (["--output-tag", args.feature_output_tag] if args.feature_output_tag else [])
    recon_cmd = [
        py,
        str(scripts["recon"]),
        "--quant-root",
        str(quant_root),
        "--contract-placeholder-failure-mode",
        str(effective_recon_contract_placeholder_failure_mode),
        "--corp-actions-cap-hit-failure-mode",
        str(effective_corp_actions_cap_hit_failure_mode),
        "--corp-actions-raw-empty-fallback-failure-mode",
        str(effective_corp_actions_raw_empty_fallback_failure_mode),
        "--provider-raw-requirement-failure-mode",
        str(effective_recon_provider_raw_requirement_failure_mode),
    ] + (
        ["--expect-nonzero-delta", "--expected-min-delta-rows", str(max(1, int(args.real_delta_min_emitted_rows)))]
        if args.real_delta_test_mode or args.production_mode
        else []
    )
    if bool(effective_recon_require_real_corp_actions):
        recon_cmd += ["--require-real-corp-actions"]
    if bool(effective_recon_require_real_delistings):
        recon_cmd += ["--require-real-delistings"]
    if bool(effective_recon_require_provider_raw_corp_actions):
        recon_cmd += ["--require-provider-raw-corp-actions"]
    if bool(effective_recon_require_provider_raw_delistings):
        recon_cmd += ["--require-provider-raw-delistings"]
    recon_cmd_template = list(recon_cmd)
    if not args.run_data_truth_layers:
        # Explicitly keep both steps aligned when Data Truth layer materialization is intentionally skipped.
        feat_cmd += ["--skip-require-contract-layers", "--skip-require-tri-layer"]
        recon_cmd += ["--skip-require-contract-layers", "--skip-require-tri-layer"]

    step_specs.extend(
        [
            ("incremental_feature_update", feat_cmd),
            ("reconciliation_checks", recon_cmd),
        ]
    )

    if not pre_steps_failed:
        for step_name, cmd in step_specs:
            rc, elapsed, out, err = _run(cmd)
            kv = _parse_kv(out)
            step = {
                "name": step_name,
                "ok": rc == 0,
                "exit_code": rc,
                "elapsed_sec": elapsed,
                "cmd": cmd,
                "stdout_tail": out.splitlines()[-30:],
                "stderr_tail": err.splitlines()[-30:],
                "parsed": kv,
            }
            steps.append(step)
            # collect known refs
            for key in ("manifest", "increment_manifest", "report", "status", "run_id"):
                if key in kv:
                    refs[f"{step_name}.{key}"] = kv[key]
            for key in ("manifest", "increment_manifest", "report", "status"):
                p = kv.get(key)
                if p:
                    pp = Path(p)
                    if pp.exists() and pp.is_file():
                        hashes[f"{step_name}.{key}_hash"] = stable_hash_file(pp)
            if step_name == "daily_delta_ingest" and rc == 0 and args.real_delta_test_mode:
                dm_path = kv.get("manifest")
                if dm_path:
                    try:
                        dm = read_json(Path(dm_path))
                        emitted = int(((dm.get("stats") or {}).get("bars_rows_emitted_delta")) or 0)
                        step["real_delta_test"] = {
                            "expected_min_rows": int(max(1, args.real_delta_min_emitted_rows)),
                            "bars_rows_emitted_delta": emitted,
                            "ok": emitted >= int(max(1, args.real_delta_min_emitted_rows)),
                        }
                        if emitted < int(max(1, args.real_delta_min_emitted_rows)):
                            step["ok"] = False
                            step["exit_code"] = 91
                            step["stderr_tail"] = (step.get("stderr_tail") or []) + [
                                f"REAL_DELTA_TEST_FAILED emitted={emitted} expected_min={int(max(1, args.real_delta_min_emitted_rows))}"
                            ]
                            rc = 91
                    except Exception as exc:
                        step["ok"] = False
                        step["exit_code"] = 92
                        step["stderr_tail"] = (step.get("stderr_tail") or []) + [f"REAL_DELTA_TEST_READ_MANIFEST_FAILED {exc}"]
                        rc = 92
            if rc != 0:
                break

    coverage_topup_attempts_run = 0
    coverage_topup_resolved = False
    coverage_topup_last_warning = ""
    if (
        all(s.get("ok") for s in steps)
        and bool(args.run_data_truth_layers)
        and bool(effective_run_corp_actions_ingest)
        and bool(args.corp_actions_coverage_topup_enabled)
        and int(args.corp_actions_coverage_topup_attempts) > 0
        and corp_cmd_template
        and contract_cmd_template
        and tri_cmd_template
        and recon_cmd_template
    ):
        recon_report_obj = _read_json_if_exists(refs.get("reconciliation_checks.report"))
        coverage_low, coverage_msg = _has_corp_actions_coverage_low(recon_report_obj)
        coverage_topup_last_warning = coverage_msg
        if coverage_low:
            base_assets = int(args.corp_actions_max_assets)
            base_calls = int(args.corp_actions_max_calls)
            max_attempts = max(1, int(args.corp_actions_coverage_topup_attempts))
            assets_step = max(0, int(args.corp_actions_coverage_topup_assets_step))
            calls_step = max(0, int(args.corp_actions_coverage_topup_calls_step))
            for attempt in range(1, max_attempts + 1):
                coverage_topup_attempts_run += 1
                topup_assets = base_assets
                if topup_assets > 0 and assets_step > 0:
                    topup_assets = topup_assets + (attempt * assets_step)
                topup_calls = base_calls
                if topup_calls > 0 and calls_step > 0:
                    topup_calls = topup_calls + (attempt * calls_step)

                topup_corp_cmd = _replace_cmd_value(corp_cmd_template, "--max-assets", str(int(topup_assets)))
                topup_corp_cmd = _replace_cmd_value(topup_corp_cmd, "--max-calls", str(int(topup_calls)))
                if "--job-name" in topup_corp_cmd:
                    topup_corp_cmd = _replace_cmd_value(topup_corp_cmd, "--job-name", f"{run_id}_corp_topup_{attempt}")
                else:
                    topup_corp_cmd += ["--job-name", f"{run_id}_corp_topup_{attempt}"]

                topup_specs: list[tuple[str, list[str]]] = [
                    (f"corp_actions_delta_ingest_topup_attempt_{attempt}", topup_corp_cmd),
                    (f"materialize_contract_layers_topup_attempt_{attempt}", list(contract_cmd_template)),
                    (f"materialize_tri_layers_topup_attempt_{attempt}", list(tri_cmd_template)),
                    (f"reconciliation_checks_topup_attempt_{attempt}", list(recon_cmd_template)),
                ]
                topup_failed = False
                topup_recon_report_path = ""
                for topup_step_name, topup_cmd in topup_specs:
                    trc, telapsed, tout, terr = _run(topup_cmd)
                    tkv = _parse_kv(tout)
                    step = {
                        "name": topup_step_name,
                        "ok": trc == 0,
                        "exit_code": trc,
                        "elapsed_sec": telapsed,
                        "cmd": topup_cmd,
                        "stdout_tail": tout.splitlines()[-30:],
                        "stderr_tail": terr.splitlines()[-30:],
                        "parsed": tkv,
                    }
                    steps.append(step)
                    for key in ("manifest", "increment_manifest", "report", "status", "run_id"):
                        if key in tkv:
                            refs[f"{topup_step_name}.{key}"] = tkv[key]
                    for key in ("manifest", "increment_manifest", "report", "status"):
                        p = tkv.get(key)
                        if p:
                            pp = Path(p)
                            if pp.exists() and pp.is_file():
                                hashes[f"{topup_step_name}.{key}_hash"] = stable_hash_file(pp)
                    if topup_step_name.startswith("reconciliation_checks"):
                        topup_recon_report_path = str(tkv.get("report") or "")
                        if topup_recon_report_path:
                            refs["reconciliation_checks.report"] = topup_recon_report_path
                    if trc != 0:
                        topup_failed = True
                        break

                if topup_failed:
                    break

                recon_after_topup = _read_json_if_exists(topup_recon_report_path or refs.get("reconciliation_checks.report"))
                prev_coverage_msg = coverage_topup_last_warning
                coverage_low, coverage_msg = _has_corp_actions_coverage_low(recon_after_topup)
                coverage_topup_last_warning = coverage_msg
                if not coverage_low:
                    coverage_topup_resolved = True
                    warnings_list.append(
                        f"CORP_ACTIONS_COVERAGE_TOPUP_RESOLVED:attempt={attempt};prior={prev_coverage_msg or 'unknown'}"
                    )
                    break
            if not coverage_topup_resolved:
                warnings_list.append(
                    "CORP_ACTIONS_COVERAGE_TOPUP_EXHAUSTED:"
                    f"attempts={coverage_topup_attempts_run};last={coverage_topup_last_warning or 'unknown'}"
                )
                if bool(v4_final_profile):
                    threshold_failures.append(
                        "FAIL_CONTRACT_CORP_ACTIONS_COVERAGE_LOW_UNRESOLVED:"
                        f"attempts={coverage_topup_attempts_run};last={coverage_topup_last_warning or 'unknown'}"
                    )

    ok = all(s["ok"] for s in steps)
    # Extract metrics from step artifacts for drift/failure tracking.
    delta_manifest = _read_json_if_exists(refs.get("daily_delta_ingest.manifest"))
    recon_report = _read_json_if_exists(refs.get("reconciliation_checks.report"))
    snap_inc_manifest = _read_json_if_exists(refs.get("incremental_snapshot_update.increment_manifest"))
    feat_inc_manifest = _read_json_if_exists(refs.get("incremental_feature_update.manifest"))

    delta_stats = ((delta_manifest or {}).get("stats") or {})
    delta_recon = ((delta_manifest or {}).get("reconciliation") or {})
    recon_checks = ((recon_report or {}).get("checks") or {})
    recon_stats = ((recon_report or {}).get("stats") or {})
    bars_rows_emitted_delta = int(delta_stats.get("bars_rows_emitted_delta") or 0)
    assets_emitted_delta = int(delta_stats.get("assets_emitted_delta") or 0)
    packs_done = int(delta_stats.get("packs_done") or 0)
    packs_failed = int(delta_stats.get("packs_failed") or 0)
    selected_packs_total = int(delta_stats.get("selected_packs_total") or 0)
    noop_no_changed_packs = bool(delta_recon.get("noop_no_changed_packs")) or selected_packs_total <= 0

    ops_ledger_path = Path(args.ops_ledger_path).resolve() if args.ops_ledger_path else (quant_root / "ops" / "daily_backbone_metrics.ndjson")

    effective_warn_min = int(args.warn_min_delta_rows)
    effective_warn_max = int(args.warn_max_delta_rows)
    effective_fail_min = int(args.fail_min_delta_rows)
    effective_fail_max = int(args.fail_max_delta_rows)
    threshold_source = "cli_or_defaults"
    threshold_auto_details: dict[str, Any] = {}
    auto_thresholds_on = bool(args.auto_thresholds_from_ledger or args.production_mode)
    if auto_thresholds_on:
        auto_path = Path(args.auto_thresholds_path).resolve() if args.auto_thresholds_path else (quant_root / "ops" / "q1_daily_delta_thresholds_recommended.json")
        auto_obj = _read_json_if_exists(str(auto_path))
        rec = (auto_obj or {}).get("recommended") or {}
        history_count = int((auto_obj or {}).get("history", {}).get("runs_total") or 0)
        threshold_auto_details = {
            "auto_thresholds_path": str(auto_path),
            "auto_thresholds_found": bool(auto_obj),
            "auto_thresholds_history_runs": history_count,
            "auto_thresholds_min_history_required": int(args.auto_thresholds_min_history),
        }
        if auto_obj and history_count >= int(args.auto_thresholds_min_history):
            if effective_warn_min <= 0:
                effective_warn_min = int(rec.get("warn_min_delta_rows") or 0)
            if effective_warn_max <= 0:
                effective_warn_max = int(rec.get("warn_max_delta_rows") or 0)
            if effective_fail_min <= 0:
                effective_fail_min = int(rec.get("fail_min_delta_rows") or 0)
            if effective_fail_max <= 0:
                effective_fail_max = int(rec.get("fail_max_delta_rows") or 0)
            threshold_source = "auto_thresholds_recommended"
        else:
            threshold_source = "auto_thresholds_missing_or_insufficient_history"

    def _thresh_warn(name: str, cond: bool, detail: str) -> None:
        if cond:
            warnings_list.append(f"{name}:{detail}")

    def _thresh_fail(name: str, cond: bool, detail: str) -> None:
        if cond:
            threshold_failures.append(f"{name}:{detail}")

    if effective_warn_min > 0:
        _thresh_warn("WARN_MIN_DELTA_ROWS", bars_rows_emitted_delta < int(effective_warn_min), f"{bars_rows_emitted_delta}<{int(effective_warn_min)}")
    if effective_warn_max > 0:
        _thresh_warn("WARN_MAX_DELTA_ROWS", bars_rows_emitted_delta > int(effective_warn_max), f"{bars_rows_emitted_delta}>{int(effective_warn_max)}")
    if effective_fail_min > 0:
        _thresh_fail("FAIL_MIN_DELTA_ROWS", bars_rows_emitted_delta < int(effective_fail_min), f"{bars_rows_emitted_delta}<{int(effective_fail_min)}")
    if effective_fail_max > 0:
        _thresh_fail("FAIL_MAX_DELTA_ROWS", bars_rows_emitted_delta > int(effective_fail_max), f"{bars_rows_emitted_delta}>{int(effective_fail_max)}")
    if packs_failed > 0:
        _thresh_fail("PACKS_FAILED_NONZERO", True, str(packs_failed))

    # Drift checks against prior observed run distribution (warning-only by default).
    prev_rows = _tail_jsonl(ops_ledger_path, limit=120) if ops_ledger_path.exists() else []
    prev_delta_vals: list[int] = []
    prev_assets_vals: list[int] = []
    for rec in prev_rows:
        d = (rec.get("delta") or {})
        try:
            prev_delta_vals.append(int(d.get("bars_rows_emitted_delta") or 0))
            prev_assets_vals.append(int(d.get("assets_emitted_delta") or 0))
        except Exception:
            continue
    drift_info = {
        "history_runs_considered": int(len(prev_rows)),
        "history_delta_points": int(len(prev_delta_vals)),
        "history_assets_points": int(len(prev_assets_vals)),
    }
    if prev_delta_vals:
        delta_median = float(median(prev_delta_vals))
        drift_info["delta_rows_median"] = delta_median
        ratio = (float(bars_rows_emitted_delta) / delta_median) if delta_median > 0 else None
        drift_info["delta_rows_ratio_vs_median"] = ratio
        if ratio is not None and ratio < 0.25:
            _thresh_warn("DRIFT_DELTA_ROWS_TOO_LOW", True, f"ratio={ratio:.3f}<0.25")
        if ratio is not None and ratio > 4.0:
            _thresh_warn("DRIFT_DELTA_ROWS_TOO_HIGH", True, f"ratio={ratio:.3f}>4.0")
    if prev_assets_vals:
        assets_median = float(median(prev_assets_vals))
        drift_info["assets_median"] = assets_median
        aratio = (float(assets_emitted_delta) / assets_median) if assets_median > 0 else None
        drift_info["assets_ratio_vs_median"] = aratio
        if aratio is not None and aratio < 0.25:
            _thresh_warn("DRIFT_ASSETS_TOO_LOW", True, f"ratio={aratio:.3f}<0.25")
        if aratio is not None and aratio > 4.0:
            _thresh_warn("DRIFT_ASSETS_TOO_HIGH", True, f"ratio={aratio:.3f}>4.0")

    missing_required_asset_types = list(raw_bars_freshness.get("missing_required_asset_types") or [])
    latest_required_ingest_date = str(raw_bars_freshness.get("latest_required_ingest_date") or "")
    latest_required_age_days = raw_bars_freshness.get("latest_required_age_calendar_days")
    if missing_required_asset_types:
        warnings_list.append(
            "RAW_BARS_REQUIRED_TYPES_MISSING:" + ",".join(sorted(str(v) for v in missing_required_asset_types))
        )
    if not bool(raw_bars_freshness.get("required_asset_types_fresh")):
        warnings_list.append(
            "RAW_BARS_REQUIRED_TYPES_STALE:"
            f"latest_required_ingest_date={latest_required_ingest_date or 'unknown'}:"
            f"age_days={latest_required_age_days if latest_required_age_days is not None else 'unknown'}"
        )

    if args.production_mode and effective_fail_min <= 0 and bars_rows_emitted_delta <= 0:
        if noop_no_changed_packs:
            if bool(raw_bars_freshness.get("required_asset_types_fresh")):
                warnings_list.append("PRODUCTION_DELTA_NOOP_BUT_RAW_ALREADY_CURRENT")
            else:
                threshold_failures.append("FAIL_PRODUCTION_DELTA_NOOP_NO_CHANGED_PACKS")
        else:
            threshold_failures.append("FAIL_PRODUCTION_NONZERO_DELTA_REQUIRED:0")
    if ok and threshold_failures:
        ok = False

    ops_metrics_entry = {
        "schema": "quantlab_q1_daily_backbone_metrics_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": bool(ok),
        "threshold_failures": list(threshold_failures),
        "warnings": list(warnings_list),
        "thresholds": {
            "source": threshold_source,
            "auto_thresholds_enabled": auto_thresholds_on,
            "warn_min_delta_rows": int(effective_warn_min),
            "warn_max_delta_rows": int(effective_warn_max),
            "fail_min_delta_rows": int(effective_fail_min),
            "fail_max_delta_rows": int(effective_fail_max),
            "auto_details": threshold_auto_details,
        },
        "delta": {
            "bars_rows_emitted_delta": bars_rows_emitted_delta,
            "assets_emitted_delta": assets_emitted_delta,
            "packs_done": packs_done,
            "packs_failed": packs_failed,
            "candidate_packs_total": int(delta_stats.get("candidate_packs_total") or 0),
            "selected_packs_total": selected_packs_total,
            "noop_no_changed_packs": noop_no_changed_packs,
            "rows_scanned": int(delta_stats.get("bars_rows_scanned_in_selected_packs") or 0),
            "rows_skipped_old_or_known": int(delta_stats.get("rows_skipped_old_or_known") or 0),
            "rows_skipped_duplicate_in_run": int(delta_stats.get("rows_skipped_duplicate_in_run") or 0),
        },
        "delta_reconciliation": {
            "rows_before": int(delta_recon.get("raw_rows_before") or 0),
            "rows_after": int(delta_recon.get("raw_rows_after") or 0),
            "rows_delta_observed": int(delta_recon.get("raw_rows_delta_observed") or 0),
            "rows_delta_expected": int(delta_recon.get("raw_rows_delta_expected") or 0),
            "noop_no_changed_packs": noop_no_changed_packs,
        },
        "snapshot_increment": {
            "changed_assets_total": int(((snap_inc_manifest or {}).get("counts") or {}).get("changed_assets_total") or 0),
            "rows_materialized_total": int(((snap_inc_manifest or {}).get("counts") or {}).get("rows_materialized_total") or 0),
        },
        "feature_increment": {
            "changed_assets_total": int(((feat_inc_manifest or {}).get("counts") or {}).get("changed_assets_total") or 0),
            "feature_rows_total": int(((feat_inc_manifest or {}).get("counts") or {}).get("feature_rows_total") or 0),
        },
        "reconciliation": {
            "checks_failed_total": int(sum(1 for v in recon_checks.values() if v is False)),
            "checks_total": int(len(recon_checks)),
            "checks": recon_checks,
            "delta_quality_scan": (recon_stats.get("delta_quality_scan") or {}),
            "delta_scan_accounting": (recon_stats.get("delta_scan_accounting") or {}),
            "corp_actions_coverage_topup": {
                "enabled": bool(args.corp_actions_coverage_topup_enabled),
                "attempts_run": int(coverage_topup_attempts_run),
                "resolved": bool(coverage_topup_resolved),
                "last_warning": str(coverage_topup_last_warning or ""),
            },
        },
        "drift": drift_info,
        "source_freshness": {
            "raw_bars": raw_bars_freshness,
        },
        "refs": refs,
    }
    if not args.ops_ledger_disabled:
        _append_jsonl(ops_ledger_path, ops_metrics_entry)
        refs["ops.daily_backbone_metrics_ledger"] = str(ops_ledger_path)
    report = {
        "schema": "quantlab_q1_daily_data_backbone_run_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": ok,
        "exit_code": 0 if ok else int(next((s["exit_code"] for s in steps if not s["ok"]), 95 if threshold_failures else 1)),
        "steps": steps,
        "references": refs,
        "hashes": hashes,
        "thresholds": {
            "source": threshold_source,
            "warn_min_delta_rows": int(effective_warn_min),
            "warn_max_delta_rows": int(effective_warn_max),
            "fail_min_delta_rows": int(effective_fail_min),
            "fail_max_delta_rows": int(effective_fail_max),
            "auto_details": threshold_auto_details,
        },
        "warnings": warnings_list,
        "threshold_failures": threshold_failures,
        "metrics_summary": {
            "bars_rows_emitted_delta": bars_rows_emitted_delta,
            "assets_emitted_delta": assets_emitted_delta,
            "packs_done": packs_done,
            "packs_failed": packs_failed,
            "reconciliation_checks_failed_total": int(sum(1 for v in recon_checks.values() if v is False)),
            "corp_actions_coverage_topup_attempts_run": int(coverage_topup_attempts_run),
            "corp_actions_coverage_topup_resolved": bool(coverage_topup_resolved),
            "drift": drift_info,
            "source_freshness": {
                "raw_bars": raw_bars_freshness,
            },
        },
        "source_freshness": {
            "raw_bars": raw_bars_freshness,
        },
        "notes": [
            "Phase A daily data backbone orchestrator (Q1): delta ingest -> incremental snapshot -> incremental feature -> reconciliation.",
            "Designed for local/private operation on Stocks+ETFs first.",
            "real-delta-test-mode enforces non-zero delta rows and tighter reconciliation expectations.",
            "Writes append-only ops daily backbone metrics ledger unless disabled.",
        ],
        "config": {
            "ingest_date_requested": str(ingest_resolution.get("requested_ingest_date") or ""),
            "ingest_date_effective": effective_ingest_date,
            "ingest_date_was_clamped": bool(ingest_resolution.get("ingest_date_was_clamped")),
            "ingest_date_clamp_reason": str(ingest_resolution.get("ingest_date_clamp_reason") or ""),
            "v4_final_profile": bool(v4_final_profile),
            "real_delta_test_mode": bool(args.real_delta_test_mode),
            "real_delta_min_emitted_rows": int(args.real_delta_min_emitted_rows),
            "redflags_failure_mode": str(args.redflags_failure_mode),
            "run_corp_actions_ingest": bool(effective_run_corp_actions_ingest),
            "corp_actions_coverage_topup_enabled": bool(args.corp_actions_coverage_topup_enabled),
            "corp_actions_coverage_topup_attempts": int(args.corp_actions_coverage_topup_attempts),
            "corp_actions_coverage_topup_assets_step": int(args.corp_actions_coverage_topup_assets_step),
            "corp_actions_coverage_topup_calls_step": int(args.corp_actions_coverage_topup_calls_step),
            "run_registry_delistings_ingest": bool(effective_run_registry_delistings_ingest),
            "corp_actions_http_failure_mode": str(effective_corp_actions_http_failure_mode),
            "contract_source_policy": str(effective_contract_source_policy),
            "contract_raw_ingest_date_mode": str(effective_contract_raw_ingest_date_mode),
            "contract_require_real_corp_actions": bool(effective_contract_require_real_corp_actions),
            "contract_require_real_delistings": bool(effective_contract_require_real_delistings),
            "contract_placeholder_failure_mode": str(effective_contract_placeholder_failure_mode),
            "recon_contract_placeholder_failure_mode": str(effective_recon_contract_placeholder_failure_mode),
            "corp_actions_cap_hit_failure_mode": str(effective_corp_actions_cap_hit_failure_mode),
            "corp_actions_raw_empty_fallback_failure_mode": str(effective_corp_actions_raw_empty_fallback_failure_mode),
            "recon_require_real_corp_actions": bool(effective_recon_require_real_corp_actions),
            "recon_require_real_delistings": bool(effective_recon_require_real_delistings),
            "recon_require_provider_raw_corp_actions": bool(effective_recon_require_provider_raw_corp_actions),
            "recon_require_provider_raw_delistings": bool(effective_recon_require_provider_raw_delistings),
            "recon_provider_raw_requirement_failure_mode": str(effective_recon_provider_raw_requirement_failure_mode),
            "pre_refresh_v7_on_stale_raw_bars": bool(effective_pre_refresh_v7_on_stale_raw_bars),
            "v7_refresh_env_file": str(args.v7_refresh_env_file),
            "v7_refresh_buckets": str(args.v7_refresh_buckets),
            "v7_refresh_max_runs_per_bucket": int(args.v7_refresh_max_runs_per_bucket),
            "v7_refresh_max_no_progress_runs": int(args.v7_refresh_max_no_progress_runs),
            "v7_refresh_max_throttle_stops": int(args.v7_refresh_max_throttle_stops),
            "v7_refresh_throttle_cooldown_ms": int(args.v7_refresh_throttle_cooldown_ms),
            "v7_refresh_backfill_max": int(args.v7_refresh_backfill_max),
            "v7_refresh_sleep_ms": int(args.v7_refresh_sleep_ms),
            "raw_bars_stale_failure_mode": str(effective_raw_bars_stale_failure_mode),
            "public_v7_state": public_v7_state,
        },
    }
    if refs.get("ops.daily_backbone_metrics_ledger"):
        try:
            hashes["ops.daily_backbone_metrics_ledger_hash"] = stable_hash_file(Path(str(refs["ops.daily_backbone_metrics_ledger"])))
        except Exception:
            pass
    atomic_write_json(report_path, report)

    if args.run_redflags_q1:
        red_cmd = [
            py,
            str(scripts["redflags"]),
            "--quant-root",
            str(quant_root),
            "--phasea-report",
            str(report_path),
        ]
        rc, elapsed, out, err = _run(red_cmd)
        kv = _parse_kv(out)
        red_step = {
            "name": "run_redflag_invariants_q1",
            "ok": rc == 0,
            "exit_code": rc,
            "elapsed_sec": elapsed,
            "cmd": red_cmd,
            "stdout_tail": out.splitlines()[-30:],
            "stderr_tail": err.splitlines()[-30:],
            "parsed": kv,
        }
        report.setdefault("steps", []).append(red_step)
        red_report = kv.get("report")
        if red_report:
            refs["redflags.report"] = red_report
            rp = Path(red_report)
            if rp.exists() and rp.is_file():
                hashes["redflags.report_hash"] = stable_hash_file(rp)
        if rc != 0:
            if str(args.redflags_failure_mode).lower() == "warn":
                report.setdefault("warnings", []).append("REDFLAG_KILL_SWITCH_WARN_ONLY")
                report.setdefault("warnings", []).append("Red-flag kill-switch is active (warn-only mode).")
            else:
                report["ok"] = False
                report["exit_code"] = int(rc if rc > 0 else report.get("exit_code") or 1)
                report.setdefault("threshold_failures", []).append("REDFLAG_KILL_SWITCH_ACTIVE")
                report.setdefault("warnings", []).append("Red-flag kill-switch is active.")
        report["references"] = refs
        report["hashes"] = hashes
        atomic_write_json(report_path, report)

    final_ok = bool(report.get("ok"))
    final_exit = int(report.get("exit_code") or 0)
    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={final_ok}")
    return 0 if final_ok else final_exit


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
