#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_QUANT_ROOT = "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"
DEFAULT_HISTORY_ROOT = "/Users/michaelpuchowezki/QuantLabHot/storage/universe-v7-history"
DEFAULT_DESKTOP_ARCHIVE_ROOT = ""

RUN_REPORT_PRIORITY: list[tuple[str, str]] = [
    ("q1_daily_data_backbone_run_report.json", "daily_backbone"),
    ("q1_reconciliation_report.json", "reconciliation"),
    ("stage_b_q1_run_report.json", "stage_b"),
    ("q1_registry_update_report.json", "registry"),
    ("q1_portfolio_risk_execution_report.json", "portfolio"),
    ("q1_v4_final_gate_matrix_report.json", "v4_gates"),
    ("q1_panel_stagea_daily_run_status.json", "panel_stagea_daily"),
    ("q1_panel_stagea_run_report.json", "panel_stagea"),
    ("q1_daily_delta_ingest_run_status.json", "daily_delta"),
    ("q1_invalidation_scan_report.json", "invalidation"),
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(text)
    tmp.replace(path)


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2))


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--history-root", default=DEFAULT_HISTORY_ROOT)
    p.add_argument("--desktop-archive-root", default=DEFAULT_DESKTOP_ARCHIVE_ROOT)
    p.add_argument("--output-json", default="")
    p.add_argument("--output-md", default="")
    return p.parse_args(list(argv))


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def count_entries(path: Path, glob_pattern: str) -> int:
    if not path.exists():
        return 0
    return sum(1 for _ in path.glob(glob_pattern))


def latest_raw_inventory(quant_root: Path) -> dict[str, Any]:
    provider_root = quant_root / "data" / "raw" / "provider=EODHD"
    inventory: dict[str, dict[str, Any]] = {}
    if not provider_root.exists():
        return {"provider_root": str(provider_root), "asset_classes": inventory}
    for ingest_dir in sorted(provider_root.glob("ingest_date=*")):
        ingest_date = ingest_dir.name.split("=", 1)[-1]
        for class_dir in sorted(ingest_dir.glob("asset_class=*")):
            asset_class = class_dir.name.split("=", 1)[-1]
            record = inventory.setdefault(asset_class, {"latest_ingest_date": "", "parquet_files": 0})
            files_total = sum(1 for _ in class_dir.glob("*.parquet"))
            if files_total <= 0:
                continue
            if ingest_date >= str(record["latest_ingest_date"]):
                record["latest_ingest_date"] = ingest_date
                record["parquet_files"] = files_total
    return {"provider_root": str(provider_root), "asset_classes": inventory}


def snapshot_inventory(quant_root: Path) -> dict[str, Any]:
    root = quant_root / "data" / "snapshots"
    snapshots: list[dict[str, Any]] = []
    if not root.exists():
        return {"root": str(root), "total": 0, "latest": None, "snapshots": snapshots}
    for snap_dir in sorted(root.glob("snapshot_id=*")):
        manifest_path = snap_dir / "snapshot_manifest.json"
        manifest = read_json(manifest_path) if manifest_path.exists() else {}
        snapshots.append(
            {
                "snapshot_id": snap_dir.name.split("snapshot_id=", 1)[-1],
                "path": str(snap_dir),
                "manifest_path": str(manifest_path) if manifest_path.exists() else "",
                "bars_dataset_root": str(((manifest.get("artifacts") or {}).get("bars_dataset_root")) or ""),
                "counts": (manifest.get("counts") or {}),
                "mtime": int(snap_dir.stat().st_mtime),
            }
        )
    latest = max(snapshots, key=lambda row: (int(row["mtime"]), str(row["snapshot_id"])), default=None)
    return {"root": str(root), "total": len(snapshots), "latest": latest, "snapshots": snapshots}


def find_run_report(run_dir: Path) -> tuple[str, Path] | tuple[None, None]:
    for filename, family in RUN_REPORT_PRIORITY:
        candidate = run_dir / filename
        if candidate.exists():
            return family, candidate
    return None, None


def scan_runs(quant_root: Path) -> dict[str, Any]:
    runs_root = quant_root / "runs"
    records: list[dict[str, Any]] = []
    family_summary: dict[str, dict[str, Any]] = {}
    if not runs_root.exists():
        return {"root": str(runs_root), "total": 0, "families": family_summary, "records": records}

    for run_dir in sorted(runs_root.glob("run_id=*")):
        family, report_path = find_run_report(run_dir)
        if report_path is None or family is None:
            continue
        payload = read_json(report_path)
        record = {
            "run_id": run_dir.name.split("run_id=", 1)[-1],
            "family": family,
            "path": str(run_dir),
            "report_path": str(report_path),
            "ok": payload.get("ok"),
            "exit_code": payload.get("exit_code"),
            "generated_at": payload.get("generated_at"),
            "mtime": int(run_dir.stat().st_mtime),
        }
        records.append(record)

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[str(record["family"])].append(record)
    for family, items in grouped.items():
        items_sorted = sorted(items, key=lambda row: (int(row["mtime"]), str(row["generated_at"] or ""), str(row["run_id"])))
        ok_items = [row for row in items_sorted if row.get("ok") is True or int(row.get("exit_code") or 1) == 0]
        family_summary[family] = {
            "total": len(items_sorted),
            "ok_total": len(ok_items),
            "failed_total": len(items_sorted) - len(ok_items),
            "latest": items_sorted[-1] if items_sorted else None,
            "latest_ok": ok_items[-1] if ok_items else None,
        }
    return {"root": str(runs_root), "total": len(records), "families": family_summary, "records": records}


def scan_jobs(quant_root: Path) -> dict[str, Any]:
    jobs_root = quant_root / "jobs"
    records: list[dict[str, Any]] = []
    family_summary: dict[str, dict[str, Any]] = {}
    if not jobs_root.exists():
        return {"root": str(jobs_root), "total": 0, "families": family_summary, "records": records}
    for job_dir in sorted(p for p in jobs_root.iterdir() if p.is_dir() and not p.name.startswith("_")):
        state_path = job_dir / "state.json"
        payload = read_json(state_path) if state_path.exists() else {}
        summary = payload.get("summary") or {}
        family = job_dir.name.split("_20", 1)[0]
        record = {
            "job_name": job_dir.name,
            "family": family,
            "path": str(job_dir),
            "state_path": str(state_path) if state_path.exists() else "",
            "updated_at": payload.get("updated_at") or payload.get("generated_at"),
            "done": int(summary.get("done") or 0),
            "failed": int(summary.get("failed") or 0),
            "pending": int(summary.get("pending") or 0),
            "running": int(summary.get("running") or 0),
            "mtime": int(job_dir.stat().st_mtime),
        }
        records.append(record)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[str(record["family"])].append(record)
    for family, items in grouped.items():
        items_sorted = sorted(items, key=lambda row: (int(row["mtime"]), str(row["job_name"])))
        family_summary[family] = {
            "total": len(items_sorted),
            "latest": items_sorted[-1] if items_sorted else None,
            "failed_jobs_total": sum(1 for row in items_sorted if int(row["failed"]) > 0),
            "completed_jobs_total": sum(1 for row in items_sorted if int(row["done"]) > 0 and int(row["pending"]) == 0 and int(row["running"]) == 0),
        }
    return {"root": str(jobs_root), "total": len(records), "families": family_summary, "records": records}


def scan_latest_success(quant_root: Path) -> dict[str, Any]:
    ops_root = quant_root / "ops"
    pointers: dict[str, Any] = {}
    if not ops_root.exists():
        return {"root": str(ops_root), "pointers": pointers}
    for latest_path in sorted(ops_root.glob("*/latest_success.json")):
        key = latest_path.parent.name
        try:
            pointers[key] = read_json(latest_path)
        except Exception:
            pointers[key] = {"path": str(latest_path), "status": "read_failed"}
    return {"root": str(ops_root), "pointers": pointers}


def desktop_archive_inventory(archive_root: Path | None) -> dict[str, Any]:
    children = []
    if archive_root is None:
        return {"root": "", "entries": children}
    if archive_root.exists():
        for child in sorted(archive_root.iterdir()):
            children.append(
                {
                    "name": child.name,
                    "path": str(child),
                    "kind": "dir" if child.is_dir() else "file",
                    "mtime": int(child.stat().st_mtime),
                }
            )
    return {"root": str(archive_root), "entries": children}


def build_layout_recommendation(quant_root: Path, history_root: Path, desktop_archive_root: Path | None) -> dict[str, Any]:
    return {
        "runtime_root": str(quant_root),
        "roles": {
            "active_raw_training": str(quant_root / "data" / "raw" / "provider=EODHD"),
            "active_snapshots": str(quant_root / "data" / "snapshots"),
            "immutable_pipeline_runs": str(quant_root / "runs"),
            "operational_jobs": str(quant_root / "jobs"),
            "ops_catalog_and_pointers": str(quant_root / "ops"),
            "source_truth_history": str(history_root),
            "desktop_archive_only": str(desktop_archive_root) if desktop_archive_root is not None else "",
            "quarantine_for_orphans": str(history_root / "_quarantine"),
        },
        "principles": [
            "Offline archive or NAS remains archive/import source, not runtime truth.",
            "QuantLabHot/rubikvault-quantlab is the only active runtime root for training and daily operations.",
            "storage/universe-v7-history is the central source-truth history store for delta and freshness paths.",
            "runs stay immutable; new summaries and pointers live under ops/catalog instead of moving old runs around.",
        ],
    }


def build_markdown(catalog: dict[str, Any]) -> str:
    runs = catalog["runs"]
    jobs = catalog["jobs"]
    latest_success = catalog["latest_success"]["pointers"]
    raw_inventory = catalog["raw_inventory"]["asset_classes"]
    lines = [
        "# QuantLab Run Catalog",
        "",
        f"- Generated at: `{catalog['generated_at']}`",
        f"- Quant root: `{catalog['quant_root']}`",
        f"- Total indexed run reports: `{runs['total']}`",
        f"- Total indexed jobs: `{jobs['total']}`",
        "",
        "## Runtime Layout",
        "",
    ]
    for key, value in catalog["layout"]["roles"].items():
        lines.append(f"- {key}: `{value}`")
    lines += [
        "",
        "## Latest Raw Coverage",
        "",
    ]
    for asset_class, row in sorted(raw_inventory.items()):
        lines.append(
            f"- {asset_class}: latest_ingest_date=`{row.get('latest_ingest_date') or ''}`, parquet_files=`{row.get('parquet_files') or 0}`"
        )
    lines += [
        "",
        "## Run Families",
        "",
    ]
    for family, row in sorted(runs["families"].items()):
        latest_ok = row.get("latest_ok") or {}
        latest = row.get("latest") or {}
        lines.append(
            f"- {family}: total=`{row['total']}`, ok=`{row['ok_total']}`, failed=`{row['failed_total']}`, latest=`{latest.get('run_id') or ''}`, latest_ok=`{latest_ok.get('run_id') or ''}`"
        )
    lines += [
        "",
        "## Job Families",
        "",
    ]
    for family, row in sorted(jobs["families"].items()):
        latest = row.get("latest") or {}
        lines.append(
            f"- {family}: total=`{row['total']}`, completed=`{row['completed_jobs_total']}`, failed_jobs=`{row['failed_jobs_total']}`, latest=`{latest.get('job_name') or ''}`"
        )
    lines += [
        "",
        "## Latest Success Pointers",
        "",
    ]
    for key, value in sorted(latest_success.items()):
        lines.append(
            f"- {key}: run_id=`{value.get('run_id') or ''}`, path=`{value.get('report_path') or value.get('manifest_path') or value.get('run_status') or ''}`"
        )
    lines.append("")
    return "\n".join(lines)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    history_root = Path(args.history_root).resolve()
    desktop_archive_root = (
        Path(str(args.desktop_archive_root)).expanduser().resolve()
        if str(args.desktop_archive_root).strip()
        else None
    )
    output_json = (
        Path(str(args.output_json)).expanduser().resolve()
        if str(args.output_json).strip()
        else quant_root / "ops" / "catalog" / "quantlab_run_catalog.json"
    )
    output_md = (
        Path(str(args.output_md)).expanduser().resolve()
        if str(args.output_md).strip()
        else quant_root / "ops" / "catalog" / "quantlab_run_catalog.md"
    )

    catalog = {
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "history_root": str(history_root),
        "desktop_archive_root": str(desktop_archive_root) if desktop_archive_root is not None else "",
        "counts": {
            "run_dirs_total": count_entries(quant_root / "runs", "run_id=*"),
            "job_dirs_total": count_entries(quant_root / "jobs", "*"),
        },
        "raw_inventory": latest_raw_inventory(quant_root),
        "snapshots": snapshot_inventory(quant_root),
        "runs": scan_runs(quant_root),
        "jobs": scan_jobs(quant_root),
        "latest_success": scan_latest_success(quant_root),
        "desktop_archive": desktop_archive_inventory(desktop_archive_root),
        "layout": build_layout_recommendation(quant_root, history_root, desktop_archive_root),
    }
    atomic_write_json(output_json, catalog)
    atomic_write_text(output_md, build_markdown(catalog))
    print(json.dumps({"ok": True, "output_json": str(output_json), "output_md": str(output_md), "run_reports_indexed": catalog["runs"]["total"], "jobs_indexed": catalog["jobs"]["total"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
