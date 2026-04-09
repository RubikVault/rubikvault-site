#!/usr/bin/env bash
set -euo pipefail

OPS_ROOT="${OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
STAMP="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUT_DIR="$OPS_ROOT/runtime/native-matrix/service-census/$STAMP"
OUT_JSON="$OUT_DIR/service-census.json"
TMP_PS="$OUT_DIR/ps.txt"

mkdir -p "$OUT_DIR"
ps -eo pid,rss,pcpu,pmem,args --sort=-rss > "$TMP_PS"

python3 - "$TMP_PS" "$OUT_JSON" <<'PY'
import json
import re
import sys
from pathlib import Path

ps_path = Path(sys.argv[1])
out_path = Path(sys.argv[2])
patterns = {
    "required_synorelayd": re.compile(r"\bsynorelayd\b"),
    "required_synology_photos": re.compile(r"\bsynofoto[-\w]*\b|SynologyPhotos|synofoto"),
    "required_nginx": re.compile(r"\bnginx: master\b|\bnginx\b"),
    "required_smb": re.compile(r"\bsmbd -F --no-process-group\b|\bsmbd\b"),
    "candidate_plex": re.compile(r"Plex Media Server|Plex Tuner Service|Plex Plug-in"),
    "candidate_dockerd": re.compile(r"\bdockerd\b"),
    "candidate_synology_drive": re.compile(r"SynologyDrive|synodrive|syncd|cloud-workerd"),
    "candidate_synofinder": re.compile(r"synofinder|UniversalSearch"),
    "candidate_support": re.compile(r"SupportService|ActiveInsight"),
}

lines = ps_path.read_text(encoding="utf-8").splitlines()[1:]
groups = {name: {"rss_kb": 0, "pcpu": 0.0, "matches": 0} for name in patterns}

for raw in lines:
    line = raw.strip()
    if not line:
        continue
    parts = line.split(None, 4)
    if len(parts) < 5:
        continue
    _, rss, pcpu, _, args = parts
    try:
        rss_kb = int(rss)
    except ValueError:
        rss_kb = 0
    try:
        pcpu_val = float(pcpu)
    except ValueError:
        pcpu_val = 0.0
    for name, pattern in patterns.items():
        if pattern.search(args):
            groups[name]["rss_kb"] += rss_kb
            groups[name]["pcpu"] += pcpu_val
            groups[name]["matches"] += 1

required_health = {
    "synorelayd": groups["required_synorelayd"]["matches"] > 0,
    "synology_photos": groups["required_synology_photos"]["matches"] > 0,
    "nginx": groups["required_nginx"]["matches"] > 0,
    "smb": groups["required_smb"]["matches"] > 0,
}

doc = {
    "schema_version": "nas.service-census.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "required_health": required_health,
    "groups": groups,
}
out_path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
PY

printf '%s\n' "$OUT_JSON"
