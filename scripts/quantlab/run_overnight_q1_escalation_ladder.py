#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Attempt to import polars (used by main pipeline)
try:
    import polars as pl
except ImportError:
    print("FATAL: polars not found. Please run within the correct virtual environment.")
    sys.exit(1)

DEFAULT_QUANT_ROOT = "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def harvest_dates(quant_root: Path, version: str, count: int) -> tuple[list[str], str]:
    """Finds available asof dates and snapshot_id by reading the feature panel manifest."""
    manifest_path = quant_root / "features" / "store" / f"feature_store_version={version}" / "feature_panel_manifest.json"
    if not manifest_path.exists():
         raise FileNotFoundError(f"Manifest not found: {manifest_path}")
         
    manifest = read_json(manifest_path)
    snapshot_id = manifest.get("snapshot_id", "")
    if not snapshot_id:
         raise ValueError(f"snapshot_id missing in manifest: {manifest_path}")

    version_dir = manifest_path.parent
    all_parts = sorted(version_dir.rglob("*.parquet"))
    if not all_parts:
         raise FileNotFoundError(f"No parquet files found in {version_dir}")
    
    print(f"[HARVESTER] Scanning {len(all_parts)} parquet files for dates...")
    lf = pl.scan_parquet([str(p) for p in all_parts])
    df = lf.select(pl.col("asof_date")).unique().sort("asof_date").collect()
    vals = [str(v) for v in df.get_column("asof_date").to_list()]
    
    if not vals:
        raise FileNotFoundError("No asof_date values found in parquet")
        
    dates = vals[-count:] if len(vals) >= count else vals
    return dates, snapshot_id


def resolve_run_status(status_path: Path) -> dict:
    """Reads execution nodes status frame buffer frames."""
    if not status_path.exists():
        return {"ok": False, "rc": 999, "reason": "status_file_missing"}
    return read_json(status_path)


def run_pipeline_task(cmd: list[str]) -> tuple[int, dict]:
    """Executes daily wrapper script synchronously, tracking sub-run frame loops."""
    print(f"  -> Executing: {' '.join(cmd)}")
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        elapsed = time.time() - t0
        print(f"     Subprocess finished with rc={proc.returncode} in {elapsed:.1f}s")
        
        # Try to parse run_id and status_path from stdout
        stdout = proc.stdout or ""
        status_path = ""
        for line in stdout.splitlines():
             if line.startswith("status="):
                  status_path = line.split("=", 1)[1].strip()
                  
        status_data = {}
        if status_path:
             status_data = resolve_run_status(Path(status_path))
             
        return proc.returncode, status_data
    except Exception as e:
        print(f"     Subprocess crash: {e}")
        return 999, {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    parser.add_argument("--feature-store-version", default="v4_q1panel_fullchunk_daily")
    parser.add_argument("--dates-count", type=int, default=48)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    quant_root = Path(args.quant_root).resolve()
    py_bin = str(REPO_ROOT / 'quantlab' / '.venv' / 'bin' / 'python')
    daily_script = str(REPO_ROOT / 'scripts/quantlab/run_q1_panel_stage_a_daily_local.py')
    fixed_universe = str(REPO_ROOT / 'public/data/universe/v7/perfect_universe_v1.json')

    # 1. Harvest Dates
    try:
        asof_dates, snapshot_id = harvest_dates(quant_root, args.feature_store_version, args.dates_count)
    except Exception as e:
         print(f"FATAL: {e}")
         sys.exit(1)
         
    print(f"\n[ORCHESTRATOR] Found {len(asof_dates)} dates for Escalation Ladder sweep.")
    print(f"[ORCHESTRATOR] Dates: {', '.join(asof_dates)}\n")

    summary_report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dates_processed": []
    }

    # 2. Iterate Dates
    for date in reversed(asof_dates):
        print(f"=== Date: {date} ===")
        date_record = {"date": date, "cascade_stages": []}
        summary_report["dates_processed"].append(date_record)

        # 5-Stage Escalation Matrix
        stages = [
            # P1: U1 Core, strict, hard, survivors_a
            {
                "pass": "P1",
                "args": [
                    "--fixed-universe-path", fixed_universe,
                    "--stageb-pass-mode", "strict",
                    "--stageb-strict-gate-profile", "hard",
                    "--stageb-input-scope", "survivors_a"
                ]
            },
            # P2: U1 Core, proxy_augmented, hard, survivors_a
            {
                "pass": "P2",
                "args": [
                    "--fixed-universe-path", fixed_universe,
                    "--stageb-pass-mode", "proxy_augmented",
                    "--stageb-strict-gate-profile", "hard",
                    "--stageb-input-scope", "survivors_a"
                ]
            },
            # P3: U1 Core, proxy_augmented, broad, survivors_a
            {
                "pass": "P3",
                "args": [
                    "--fixed-universe-path", fixed_universe,
                    "--stageb-pass-mode", "proxy_augmented",
                    "--stageb-strict-gate-profile", "broad",
                    "--stageb-input-scope", "survivors_a"
                ]
            },
            # P4: Extended (No Whitelist), proxy_augmented, broad, survivors_a
            {
                "pass": "P4",
                "args": [
                    "--fixed-universe-path", "",  # Explicitly clear
                    "--stageb-pass-mode", "proxy_augmented",
                    "--stageb-strict-gate-profile", "broad",
                    "--stageb-input-scope", "survivors_a"
                ]
            },
            # P5: Extended (No Whitelist), proxy_augmented, broad, all_candidates
            {
                "pass": "P5",
                "args": [
                    "--fixed-universe-path", "",
                    "--stageb-pass-mode", "proxy_augmented",
                    "--stageb-strict-gate-profile", "broad",
                    "--stageb-input-scope", "all_candidates"
                ]
            }
        ]

        stop_escalating = False

        for stage_config in stages:
            pass_name = stage_config["pass"]
            # Exclude cleared fixed-universe if empty to prevent error forwarding
            pass_args = [a for a in stage_config["args"] if a]
            
            print(f"  [Stage {pass_name}] Triggering cascade step...")

            cmd = [
                py_bin, daily_script,
                "--quant-root", str(quant_root),
                "--feature-store-version", args.feature_store_version,
                "--snapshot-id", snapshot_id,
                "--asof-end-date", date,
                "--run-stageb-q1"
            ] + stage_config["args"]

            if args.dry_run:
                print(f"  [DRY-RUN] Would execute: {' '.join(cmd)}")
                date_record["cascade_stages"].append({"pass": pass_name, "status": "dry_run"})
                continue

            rc, status_data = run_pipeline_task(cmd)

            survivors = 0
            # Pull survivors count from status report if available
            cheap_counts = (status_data.get("references") or {}).get("cheap_gate_counts") or {}
            if "survivors_A_total" in cheap_counts:
                 print(f"     A-Survivors: {cheap_counts.get('survivors_A_total')}")
                 
            # Stage B survivors check (since run_stageb_q1 may write its local counters)
            stageb_sum = (status_data.get("references") or {}).get("cheap_gate_counts") or {} # actually look up report_out
            # To be thoroughly safe, we look at `ok=True`.
            # If `ok` == true in daily runner report, it means Survivors > 0 passed Stage B!
            ok = status_data.get("ok", False)

            print(f"     Ok report frame: {ok}")

            stage_entry = {
                 "pass": pass_name,
                 "rc": rc,
                 "ok": ok,
                 "reason": status_data.get("state", "unknown")
            }
            date_record["cascade_stages"].append(stage_entry)

            if ok:
                print(f"  [SUCCESS] Date {date} FOUND SURVIVORS on pass {pass_name}. Skipping cascade escalation.")
                stop_escalating = True
                break
            else:
                 print(f"  [NEXT] Date {date} yielded 0 survivors on pass {pass_name} (rc={rc}). Escalating to next stage.")

        if args.dry_run:
             print("[DRY-RUN] Finished single-date sweep test block.")
             break

    summary_path = quant_root / "runs" / f"escalation_summary_{int(time.time())}.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_report, indent=2))
    print(f"\n[ORCHESTRATOR] Sweep finished. Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
