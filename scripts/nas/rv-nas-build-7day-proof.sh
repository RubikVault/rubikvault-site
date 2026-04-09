#!/usr/bin/env bash
# rv-nas-build-7day-proof.sh — 7-day + historical shadow evidence Go/No-Go report v2
set -uo pipefail

NAS_OPS_ROOT="/volume1/homes/neoboy/RepoOps/rubikvault-site"
JOURNAL_DIR="$NAS_OPS_ROOT/runtime/journal"
BENCH_REPORT="$NAS_OPS_ROOT/runtime/reports/benchmarks/nas-shadow-benchmark-latest.json"
OUT_DIR="$NAS_OPS_ROOT/runtime/reports/supervisor"
mkdir -p "$OUT_DIR"

python3 - "$JOURNAL_DIR" "$OUT_DIR" "$BENCH_REPORT" << 'PY'
import json, os, sys, glob
from datetime import datetime, timezone, timedelta

journal_dir, out_dir, bench_report_path = sys.argv[1], sys.argv[2], sys.argv[3]
now = datetime.now(timezone.utc)
window_start = now - timedelta(days=7)
events = []
for jf in sorted(glob.glob(os.path.join(journal_dir, "*.ndjson"))):
    try:
        with open(jf) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    e = json.loads(line)
                    ts_str = e.get("ts", "")
                    if ts_str:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts >= window_start:
                            events.append(e)
                except Exception:
                    pass
    except Exception:
        pass

stages = ["stage1", "stage2", "stage3", "stage4a", "eod_fetch", "preflight"]
live_stats = {s: {"ok": 0, "failed": 0} for s in stages}
supervisor_runs = []
last_overall = "UNKNOWN"

for e in events:
    evt = e.get("event", "")
    if evt in ("stage_ok", "stage_ok_retry"):
        k = e.get("key", "")
        if k in live_stats:
            live_stats[k]["ok"] += 1
    elif evt == "stage_failed":
        k = e.get("key", "")
        if k in live_stats:
            live_stats[k]["failed"] += 1
    elif evt == "supervisor_done":
        last_overall = e.get("overall", "UNKNOWN")
        supervisor_runs.append({"ts": e.get("ts"), "overall": last_overall})

historical = {}
if os.path.exists(bench_report_path):
    try:
        doc = json.load(open(bench_report_path))
        for s in doc.get("stages", []):
            sid = s.get("stage", "")
            historical[sid] = {
                "total_runs":      s.get("total_runs", 0),
                "successful_runs": s.get("successful_runs", 0),
                "failed_runs":     s.get("failed_runs", 0),
                "avg_factor":      s.get("averages_successful", {}).get("factor_nas_vs_local_reference"),
                "latest_success":  (s.get("latest_success") or {}).get("stamp"),
            }
    except Exception:
        pass

def combined_rate(stage_key, hist_key):
    live_ok = live_stats.get(stage_key, {}).get("ok", 0)
    live_fail = live_stats.get(stage_key, {}).get("failed", 0)
    hist = historical.get(hist_key, {}) if hist_key else {}
    h_ok = hist.get("successful_runs", 0)
    h_fail = hist.get("failed_runs", 0)
    total_ok = live_ok + h_ok
    total_fail = live_fail + h_fail
    total = total_ok + total_fail
    rate = total_ok / total if total > 0 else None
    return rate, total_ok, total_fail, total

s1_rate, s1_ok, _, s1_tot = combined_rate("stage1", "stage1")
s2_rate, s2_ok, _, s2_tot = combined_rate("stage2", "stage2")
s3_rate, s3_ok, _, s3_tot = combined_rate("stage3", None)
s4_rate, s4_ok, _, s4_tot = combined_rate("stage4a", "stage4:scientific_summary")

criteria = {
    "stage1_combined_success_pct": {"value": round(s1_rate * 100, 1) if s1_rate is not None else None, "threshold": 95, "pass": s1_rate is not None and s1_rate >= 0.95, "evidence": f"{s1_ok}/{s1_tot} total (shadow+live)"},
    "stage2_combined_success_pct": {"value": round(s2_rate * 100, 1) if s2_rate is not None else None, "threshold": 95, "pass": s2_rate is not None and s2_rate >= 0.95, "evidence": f"{s2_ok}/{s2_tot} total (shadow+live)"},
    "stage3_combined_success_pct": {"value": round(s3_rate * 100, 1) if s3_rate is not None else None, "threshold": 70, "pass": s3_rate is not None and s3_rate >= 0.70, "evidence": f"{s3_ok}/{s3_tot} total (shadow+live)"},
    "stage4a_combined_success_pct": {"value": round(s4_rate * 100, 1) if s4_rate is not None else None, "threshold": 90, "pass": s4_rate is not None and s4_rate >= 0.90, "evidence": f"{s4_ok}/{s4_tot} total (shadow+live)"},
    "min_supervisor_runs_in_7d": {"value": len(supervisor_runs), "threshold": 5, "pass": len(supervisor_runs) >= 5, "evidence": f"{len(supervisor_runs)} live supervisor runs today"},
}

all_pass = all(c["pass"] for c in criteria.values())
go_nogo = "GO" if all_pass else "NO_GO"
missing = [k for k, v in criteria.items() if not v["pass"]]

report = {
    "schema": "rv.nas.7day.proof.v2",
    "generated_at": now.isoformat(),
    "window_start": window_start.isoformat(),
    "go_nogo": go_nogo,
    "go_nogo_explanation": "Alle Kriterien erfüllt — NAS kann Production-Commits machen" if all_pass else f"Noch nicht bereit: {missing}",
    "criteria": criteria,
    "live_stats_7d": live_stats,
    "historical_shadow": historical,
    "supervisor_runs_in_window": len(supervisor_runs),
    "last_overall": last_overall,
}

out_path = os.path.join(out_dir, "7day-proof-report.json")
with open(out_path, "w") as fh:
    json.dump(report, fh, indent=2)
    fh.write("\n")

print(f"go_nogo={go_nogo}")
for k, v in criteria.items():
    flag = "✅" if v["pass"] else "❌"
    print(f"  {flag} {k}: {v.get('value')} (threshold={v['threshold']}) — {v.get('evidence','')}")
PY
