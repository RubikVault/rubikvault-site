#!/usr/bin/env bash
# rv-nas-watchdog.sh — RubikVault NAS Watchdog v1.0
set -uo pipefail

NAS_OPS_ROOT="/volume1/homes/neoboy/RepoOps/rubikvault-site"
NAS_REPO_ROOT="/volume1/homes/neoboy/Dev/rubikvault-site"
NAS_STATUS_FILE="$NAS_OPS_ROOT/runtime/STATUS.json"
WATCHDOG_JOURNAL="$NAS_OPS_ROOT/runtime/journal/watchdog-$(date -u +%Y-%m-%d).ndjson"
STALE_HOURS=26

RAM_MB=$(python3 -c "
with open('/proc/meminfo') as f:
  for l in f:
    if l.startswith('MemAvailable'): print(int(l.split()[1])//1024); break
" 2>/dev/null || echo 9999)

SWAP_MB=$(python3 -c "
t=f=0
with open('/proc/meminfo') as fh:
  for l in fh:
    if l.startswith('SwapTotal'): t=int(l.split()[1])
    elif l.startswith('SwapFree'):  f=int(l.split()[1])
print((t-f)//1024)
" 2>/dev/null || echo 0)

DISK_GB=$(python3 -c "
import os
s=os.statvfs('$NAS_REPO_ROOT')
print(int(s.f_bavail*s.f_frsize/1024**3))
" 2>/dev/null || echo 9999)

python3 - "$NAS_STATUS_FILE" "$STALE_HOURS" "$RAM_MB" "$SWAP_MB" "$DISK_GB" "$WATCHDOG_JOURNAL" << 'PY'
import json, os, sys
from datetime import datetime, timezone

status_path, stale_h, ram_mb, swap_mb, disk_gb, journal_path = sys.argv[1:7]
stale_hours = int(stale_h)
alerts = []
overall = "UNKNOWN"

if not os.path.exists(status_path):
    alerts.append({"level": "RED", "msg": "STATUS.json fehlt — Supervisor lief noch nie"})
else:
    with open(status_path) as fh:
        doc = json.load(fh)
    overall = doc.get("overall", "UNKNOWN")
    generated_at = doc.get("generated_at", "")
    if generated_at:
        try:
            ts = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            age_h = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
            if age_h > stale_hours:
                alerts.append({"level": "RED", "msg": f"Letzter Run {age_h:.1f}h alt (Limit: {stale_hours}h)"})
            elif age_h > 12:
                alerts.append({"level": "YELLOW", "msg": f"Letzter Run {age_h:.1f}h alt"})
        except Exception:
            pass
    if overall == "RED":
        alerts.append({"level": "RED", "msg": f"Status RED: {doc.get('explanation','')}"})
    stages = doc.get("stages", {})
    for stage_key, stage_data in stages.items():
        if isinstance(stage_data, dict) and stage_data.get("status", "").startswith("failed"):
            alerts.append({"level": "YELLOW", "msg": f"Stage {stage_key} failed: {stage_data.get('status')}"})

if int(ram_mb) < 150:
    alerts.append({"level": "RED", "msg": f"RAM kritisch: {ram_mb}MB verfügbar"})
elif int(ram_mb) < 300:
    alerts.append({"level": "YELLOW", "msg": f"RAM niedrig: {ram_mb}MB verfügbar"})
if int(swap_mb) > 2700:
    alerts.append({"level": "RED", "msg": f"Swap kritisch: {swap_mb}MB genutzt"})
if int(disk_gb) < 2:
    alerts.append({"level": "RED", "msg": f"Disk kritisch: {disk_gb}GB frei"})

event = {
    "ts": datetime.utcnow().isoformat() + "Z",
    "source": "watchdog",
    "event": "watchdog_check",
    "overall": overall,
    "ram_mb": ram_mb,
    "swap_mb": swap_mb,
    "disk_gb": disk_gb,
    "alert_count": len(alerts),
    "alerts": alerts,
}
with open(journal_path, "a") as fh:
    fh.write(json.dumps(event) + "\n")

if os.path.exists(status_path):
    with open(status_path) as fh:
        doc = json.load(fh)
    doc["alerts"] = alerts
    doc["watchdog_last_check"] = datetime.utcnow().isoformat() + "Z"
    doc["watchdog_ram_mb"] = int(ram_mb)
    doc["watchdog_swap_mb"] = int(swap_mb)
    doc["watchdog_disk_gb"] = int(disk_gb)
    with open(status_path, "w") as fh:
        json.dump(doc, fh, indent=2)
        fh.write("\n")
PY
