#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def local_today_iso() -> str:
    return date.today().isoformat()


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--quant-root", default="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab")
    p.add_argument("--python", default=str(REPO_ROOT / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--env-file", default=str(REPO_ROOT / ".env.local"))
    p.add_argument("--registry-path", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--history-root", default="mirrors/universe-v7/history")
    p.add_argument("--reports-root", default="mirrors/universe-v7/reports")
    p.add_argument("--state-root", default="mirrors/universe-v7/state")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--allowlist-path", default="")
    p.add_argument("--from-date", default="")
    p.add_argument("--to-date", default="")
    p.add_argument("--stock-top-n", type=int, default=90000)
    p.add_argument("--etf-top-n", type=int, default=30000)
    p.add_argument("--recent-lookback-calendar-days", type=int, default=28)
    p.add_argument("--stale-grace-calendar-days", type=int, default=1)
    p.add_argument("--min-adv-dollar", type=float, default=0.0)
    p.add_argument("--require-entry-eligible", action="store_true", default=True)
    p.add_argument("--skip-require-entry-eligible", dest="require_entry_eligible", action="store_false")
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--timeout-sec", type=float, default=10.0)
    p.add_argument("--max-retries", type=int, default=2)
    p.add_argument("--sleep-ms", type=int, default=0)
    p.add_argument("--job-name", default="parallel_targeted_v7_refresh")
    return p.parse_args(list(argv))


@dataclass
class WorkerSpec:
    index: int
    allowlist_path: Path
    reports_root: Path
    state_root: Path
    report_path: Path
    canonical_ids: list[str]
    history_packs: list[str]


def resolve_repo_rel(repo_root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (repo_root / path)


def build_allowlist(args: argparse.Namespace, repo_root: Path, quant_root: Path, run_root: Path) -> tuple[list[str], dict[str, Any], Path]:
    if str(args.allowlist_path or "").strip():
        allowlist_path = Path(str(args.allowlist_path)).expanduser().resolve()
        payload = json.loads(allowlist_path.read_text())
        if not isinstance(payload, list):
            raise RuntimeError(f"allowlist_not_list:{allowlist_path}")
        return [str(v).strip() for v in payload if str(v).strip()], {}, allowlist_path

    builder = repo_root / "scripts" / "quantlab" / "build_targeted_v7_refresh_allowlist.py"
    allowlist_path = run_root / "targeted_allowlist.json"
    report_path = run_root / "targeted_allowlist.report.json"
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
        str(int(args.stock_top_n)),
        "--etf-top-n",
        str(int(args.etf_top_n)),
        "--recent-lookback-calendar-days",
        str(int(args.recent_lookback_calendar_days)),
        "--stale-grace-calendar-days",
        str(int(args.stale_grace_calendar_days)),
        "--min-adv-dollar",
        str(float(args.min_adv_dollar)),
    ]
    cmd.append("--require-entry-eligible" if bool(args.require_entry_eligible) else "--skip-require-entry-eligible")
    proc = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"allowlist_build_failed:{proc.stderr.strip() or proc.stdout.strip()}")
    payload = json.loads(allowlist_path.read_text())
    if not isinstance(payload, list):
        raise RuntimeError(f"allowlist_not_list:{allowlist_path}")
    report_obj = json.loads(report_path.read_text()) if report_path.exists() else {}
    return [str(v).strip() for v in payload if str(v).strip()], report_obj, allowlist_path


def build_history_pack_index(registry_path: Path, allowlist: set[str]) -> dict[str, str]:
    out: dict[str, str] = {}
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
            if rel_pack:
                out[canonical_id] = rel_pack
    return out


def partition_allowlist(canonical_ids: list[str], history_pack_by_id: dict[str, str], workers: int) -> list[dict[str, Any]]:
    pack_to_ids: dict[str, list[str]] = defaultdict(list)
    for canonical_id in canonical_ids:
        rel_pack = history_pack_by_id.get(canonical_id)
        if not rel_pack:
            continue
        pack_to_ids[rel_pack].append(canonical_id)

    buckets = [{"history_packs": [], "canonical_ids": [], "weight": 0} for _ in range(max(1, workers))]
    sorted_groups = sorted(pack_to_ids.items(), key=lambda item: (-len(item[1]), item[0]))
    for rel_pack, ids in sorted_groups:
        target = min(buckets, key=lambda bucket: (bucket["weight"], len(bucket["history_packs"])))
        target["history_packs"].append(rel_pack)
        target["canonical_ids"].extend(sorted(ids))
        target["weight"] += len(ids)
    return buckets


def spawn_worker(args: argparse.Namespace, repo_root: Path, run_root: Path, worker_index: int, ids: list[str], history_packs: list[str], from_date: str, to_date: str) -> WorkerSpec:
    worker_root = run_root / f"worker_{worker_index:02d}"
    worker_root.mkdir(parents=True, exist_ok=True)
    allowlist_path = worker_root / "allowlist.json"
    reports_root = worker_root / "reports"
    state_root = worker_root / "state"
    report_path = worker_root / "refresh_report.json"
    allowlist_path.write_text(json.dumps(ids, ensure_ascii=False, indent=2))
    return WorkerSpec(
        index=worker_index,
        allowlist_path=allowlist_path,
        reports_root=reports_root,
        state_root=state_root,
        report_path=report_path,
        canonical_ids=list(ids),
        history_packs=list(history_packs),
    )


def run_worker(args: argparse.Namespace, repo_root: Path, spec: WorkerSpec, from_date: str, to_date: str) -> dict[str, Any]:
    cmd = [
        args.python,
        str(repo_root / "scripts" / "quantlab" / "refresh_v7_history_from_eodhd.py"),
        "--repo-root",
        str(repo_root),
        "--env-file",
        str(Path(args.env_file).expanduser().resolve()),
        "--allowlist-path",
        str(spec.allowlist_path),
        "--registry-path",
        str(args.registry_path),
        "--history-root",
        str(args.history_root),
        "--reports-root",
        str(spec.reports_root),
        "--state-root",
        str(spec.state_root),
        "--from-date",
        str(from_date),
        "--to-date",
        str(to_date),
        "--timeout-sec",
        str(float(args.timeout_sec)),
        "--max-retries",
        str(int(args.max_retries)),
        "--sleep-ms",
        str(int(args.sleep_ms)),
        "--job-name",
        f"{args.job_name}_w{spec.index:02d}",
        "--report-path",
        str(spec.report_path),
    ]
    proc = subprocess.Popen(cmd, cwd=repo_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = proc.communicate()
    history_touch_report_path = spec.reports_root / "history_touch_report.json"
    worker_report = json.loads(spec.report_path.read_text()) if spec.report_path.exists() else {}
    history_touch = json.loads(history_touch_report_path.read_text()) if history_touch_report_path.exists() else {}
    return {
        "worker_index": spec.index,
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "cmd": cmd,
        "allowlist_path": str(spec.allowlist_path),
        "reports_root": str(spec.reports_root),
        "state_root": str(spec.state_root),
        "report_path": str(spec.report_path),
        "history_touch_report_path": str(history_touch_report_path),
        "assets_requested": len(spec.canonical_ids),
        "history_packs": len(spec.history_packs),
        "stdout_tail": stdout.splitlines()[-30:],
        "stderr_tail": stderr.splitlines()[-30:],
        "report": worker_report,
        "history_touch_report": history_touch,
    }


def merge_worker_reports(worker_results: list[dict[str, Any]], final_reports_root: Path, final_state_root: Path, run_id: str, top_report: dict[str, Any], allowlist_path: Path, from_date: str, to_date: str, workers: int) -> dict[str, Any]:
    merged_entries: list[dict[str, Any]] = []
    merged_packs: list[dict[str, Any]] = []
    fetch_errors_total = 0
    api_attempts_total = 0
    assets_requested = 0
    assets_found_in_registry = 0
    assets_fetched_with_data = 0
    assets_changed = 0
    packs_changed = 0
    worker_failures = [worker for worker in worker_results if not worker.get("ok")]

    for worker in worker_results:
        report = worker.get("report") or {}
        touch = worker.get("history_touch_report") or {}
        meta = touch.get("meta") or {}
        merged_entries.extend(list(touch.get("entries") or []))
        merged_packs.extend(list(touch.get("packs") or []))
        fetch_errors_total += int(meta.get("fetch_errors_total") or report.get("fetch_errors_total") or 0)
        api_attempts_total += int(meta.get("api_attempts_total") or report.get("api_attempts_total") or 0)
        assets_requested += int(meta.get("assets_requested") or report.get("assets_requested") or 0)
        assets_found_in_registry += int(meta.get("assets_found_in_registry") or report.get("assets_found_in_registry") or 0)
        assets_fetched_with_data += int(meta.get("assets_fetched_with_data") or report.get("assets_fetched_with_data") or 0)
        assets_changed += int(meta.get("assets_changed") or report.get("assets_changed") or 0)
        packs_changed += int(meta.get("packs_changed") or report.get("packs_changed") or 0)

    merged_entries.sort(key=lambda row: (str(row.get("history_pack") or ""), str(row.get("canonical_id") or "")))
    merged_packs.sort(key=lambda row: str(row.get("history_pack") or ""))

    final_touch = {
        "schema": "rv_v7_history_touch_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "updated_ids_count": len(merged_entries),
        "entries_count": len(merged_entries),
        "packs_count": len(merged_packs),
        "report_scope": "private_targeted_parallel_eodhd_refresh",
        "packs": merged_packs,
        "entries": merged_entries,
        "meta": {
            "job_name": "parallel_targeted_v7_refresh",
            "workers": int(workers),
            "allowlist_path": str(allowlist_path),
            "from_date": from_date,
            "to_date": to_date,
            "api_attempts_total": api_attempts_total,
            "assets_requested": assets_requested,
            "assets_found_in_registry": assets_found_in_registry,
            "assets_fetched_with_data": assets_fetched_with_data,
            "assets_changed": assets_changed,
            "packs_changed": packs_changed,
            "fetch_errors_total": fetch_errors_total,
            "worker_failures_total": len(worker_failures),
            "top_level_allowlist_report": top_report,
        },
    }
    final_reports_root.mkdir(parents=True, exist_ok=True)
    final_state_root.mkdir(parents=True, exist_ok=True)
    final_touch_path = final_reports_root / "history_touch_report.json"
    atomic_write_json(final_touch_path, final_touch)

    summary = {
        "status": "ok" if not worker_failures else "partial",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "allowlist_path": str(allowlist_path),
        "from_date": from_date,
        "to_date": to_date,
        "workers": int(workers),
        "assets_requested": assets_requested,
        "assets_fetched_with_data": assets_fetched_with_data,
        "assets_changed": assets_changed,
        "packs_changed": packs_changed,
        "api_attempts_total": api_attempts_total,
        "fetch_errors_total": fetch_errors_total,
        "history_touch_report_path": str(final_touch_path),
        "worker_failures_total": len(worker_failures),
        "worker_results": worker_results,
    }
    summary_path = final_state_root / "parallel_targeted_v7_refresh.latest.json"
    atomic_write_json(summary_path, summary)
    return {
        "history_touch_report_path": str(final_touch_path),
        "summary_path": str(summary_path),
        "summary": summary,
        "worker_failures": worker_failures,
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root = Path(args.quant_root).resolve()
    registry_path = resolve_repo_rel(repo_root, args.registry_path)
    final_reports_root = resolve_repo_rel(repo_root, args.reports_root)
    final_state_root = resolve_repo_rel(repo_root, args.state_root)
    run_id = f"parallel_targeted_v7_refresh_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = final_state_root / "parallel_targeted_refresh_runs" / run_id
    run_root.mkdir(parents=True, exist_ok=True)

    canonical_ids, allowlist_report, built_allowlist_path = build_allowlist(args, repo_root, quant_root, run_root)
    if int(args.max_assets or 0) > 0:
        canonical_ids = canonical_ids[: int(args.max_assets)]
    if not canonical_ids:
        raise RuntimeError("allowlist_empty")

    from_date = str(args.from_date or "").strip() or str(allowlist_report.get("recommended_from_date") or "").strip() or local_today_iso()
    to_date = str(args.to_date or "").strip() or local_today_iso()
    history_pack_by_id = build_history_pack_index(registry_path, set(canonical_ids))
    bucket_specs = partition_allowlist(canonical_ids, history_pack_by_id, int(args.workers))
    workers: list[WorkerSpec] = []
    for index, bucket in enumerate(bucket_specs, start=1):
        ids = list(bucket.get("canonical_ids") or [])
        if not ids:
            continue
        workers.append(
            spawn_worker(
                args,
                repo_root,
                run_root,
                index,
                ids,
                list(bucket.get("history_packs") or []),
                from_date,
                to_date,
            )
        )
    if not workers:
        raise RuntimeError("no_worker_payloads")

    procs: list[tuple[WorkerSpec, subprocess.Popen[str]]] = []
    for spec in workers:
        cmd = [
            args.python,
            str(repo_root / "scripts" / "quantlab" / "refresh_v7_history_from_eodhd.py"),
            "--repo-root",
            str(repo_root),
            "--env-file",
            str(Path(args.env_file).expanduser().resolve()),
            "--allowlist-path",
            str(spec.allowlist_path),
            "--registry-path",
            str(args.registry_path),
            "--history-root",
            str(args.history_root),
            "--reports-root",
            str(spec.reports_root),
            "--state-root",
            str(spec.state_root),
            "--from-date",
            str(from_date),
            "--to-date",
            str(to_date),
            "--timeout-sec",
            str(float(args.timeout_sec)),
            "--max-retries",
            str(int(args.max_retries)),
            "--sleep-ms",
            str(int(args.sleep_ms)),
            "--job-name",
            f"{args.job_name}_w{spec.index:02d}",
            "--report-path",
            str(spec.report_path),
        ]
        procs.append((spec, subprocess.Popen(cmd, cwd=repo_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)))

    worker_results: list[dict[str, Any]] = []
    for spec, proc in procs:
        stdout, stderr = proc.communicate()
        history_touch_report_path = spec.reports_root / "history_touch_report.json"
        worker_report = json.loads(spec.report_path.read_text()) if spec.report_path.exists() else {}
        history_touch = json.loads(history_touch_report_path.read_text()) if history_touch_report_path.exists() else {}
        worker_results.append(
            {
                "worker_index": spec.index,
                "ok": proc.returncode == 0,
                "exit_code": proc.returncode,
                "allowlist_path": str(spec.allowlist_path),
                "reports_root": str(spec.reports_root),
                "state_root": str(spec.state_root),
                "report_path": str(spec.report_path),
                "history_touch_report_path": str(history_touch_report_path),
                "assets_requested": len(spec.canonical_ids),
                "history_packs": len(spec.history_packs),
                "stdout_tail": stdout.splitlines()[-30:],
                "stderr_tail": stderr.splitlines()[-30:],
                "report": worker_report,
                "history_touch_report": history_touch,
            }
        )

    merged = merge_worker_reports(
        worker_results,
        final_reports_root=final_reports_root,
        final_state_root=final_state_root,
        run_id=run_id,
        top_report=allowlist_report,
        allowlist_path=built_allowlist_path,
        from_date=from_date,
        to_date=to_date,
        workers=len(workers),
    )
    payload = {
        "ok": not merged["worker_failures"],
        "run_id": run_id,
        "assets_requested": merged["summary"]["assets_requested"],
        "assets_changed": merged["summary"]["assets_changed"],
        "packs_changed": merged["summary"]["packs_changed"],
        "api_attempts_total": merged["summary"]["api_attempts_total"],
        "fetch_errors_total": merged["summary"]["fetch_errors_total"],
        "workers": merged["summary"]["workers"],
        "allowlist_path": str(built_allowlist_path),
        "history_touch_report_path": merged["history_touch_report_path"],
        "summary_path": merged["summary_path"],
        "worker_failures_total": merged["summary"]["worker_failures_total"],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if not merged["worker_failures"] else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
