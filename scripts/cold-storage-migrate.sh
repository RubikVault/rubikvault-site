#!/usr/bin/env bash
set -euo pipefail

COLD="/Volumes/CONFIG/RubikVault"
REPO="/Users/michaelpuchowezki/Dev/rubikvault-site"
QUANT="/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"
LOG="$REPO/scripts/cold-storage-migrate.log"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { printf '[%s] %s\n' "$(ts)" "$*" | tee -a "$LOG"; }
die() { log "FATAL: $*"; exit 1; }

[[ -d "/Volumes/CONFIG" ]] || die "CONFIG drive not mounted"
mkdir -p "$COLD"

RSYNC="rsync -rlptD --progress --partial --human-readable"

safe_move() {
  local src="$1" dst="$2" label="$3"
  [[ -e "$src" ]] || { log "SKIP $label (not found: $src)"; return 0; }
  mkdir -p "$dst"
  log "START $label: $src -> $dst"
  $RSYNC "$src/" "$dst/" 2>&1 | tail -1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  if [[ "$rc" -ne 0 ]]; then
    log "RSYNC FAILED $label (rc=$rc) – source kept intact, re-run to resume"
    return 1
  fi
  log "VERIFY $label"
  local src_count dst_count
  src_count=$(find "$src" -type f ! -name '._*' ! -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' ')
  dst_count=$(find "$dst" -type f ! -name '._*' ! -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$src_count" != "$dst_count" ]]; then
    log "MISMATCH $label: src=$src_count dst=$dst_count – source kept, re-run to resume"
    return 1
  fi
  log "VERIFIED $label ($dst_count files). Removing source..."
  rm -rf "$src"
  log "DONE $label"
}

safe_delete() {
  local src="$1" label="$2"
  [[ -e "$src" ]] || { log "SKIP $label (not found: $src)"; return 0; }
  log "DELETE $label: $src"
  rm -rf "$src"
  log "DONE $label"
}

log "============================================"
log "Cold Storage Migration START"
log "Target: $COLD"
log "============================================"

# --- PUNKT 1: Alte Snapshots (behalte nur die 2 neuesten) ---
SNAP_DIR="$QUANT/data/snapshots"
COLD_SNAP="$COLD/quantlab-snapshots"
mkdir -p "$COLD_SNAP"

KEEP_STEP2=""
KEEP_STEP1=""
for d in $(ls -1d "$SNAP_DIR"/snapshot_id=* 2>/dev/null | sort -r); do
  name="$(basename "$d")"
  if [[ -z "$KEEP_STEP2" && "$name" == *_q1step2bars_* ]]; then
    KEEP_STEP2="$name"
    log "KEEP (latest step2bars): $name"
    continue
  fi
  if [[ -z "$KEEP_STEP1" && "$name" == *_q1step1_* ]]; then
    KEEP_STEP1="$name"
    log "KEEP (latest step1): $name"
    continue
  fi
done

for d in "$SNAP_DIR"/snapshot_id=*; do
  [[ -d "$d" ]] || continue
  name="$(basename "$d")"
  [[ "$name" == "$KEEP_STEP2" ]] && continue
  [[ "$name" == "$KEEP_STEP1" ]] && continue
  safe_move "$d" "$COLD_SNAP/$name" "snapshot:$name"
done

# --- PUNKT 2: universe-v7-history ---
safe_move \
  "/Users/michaelpuchowezki/QuantLabHot/storage/universe-v7-history" \
  "$COLD/universe-v7-history" \
  "universe-v7-history"

# --- PUNKT 3: Veraltete Feature Stores ---
FS_DIR="$QUANT/features/store"
COLD_FS="$COLD/feature-stores"

safe_move "$FS_DIR/feature_store_version=v2020_2026"                          "$COLD_FS/feature_store_version=v2020_2026"                          "fs:v2020_2026"
safe_move "$FS_DIR/feature_store_version=v4_q1panel"                          "$COLD_FS/feature_store_version=v4_q1panel"                          "fs:v4_q1panel"
safe_move "$FS_DIR/feature_store_version=v4_q1inc"                            "$COLD_FS/feature_store_version=v4_q1inc"                            "fs:v4_q1inc"
safe_move "$FS_DIR/feature_store_version=v4_q1panel_overnight_top2500fresh"   "$COLD_FS/feature_store_version=v4_q1panel_overnight_top2500fresh"   "fs:top2500fresh"
safe_move "$FS_DIR/feature_store_version=v4_q1panel_overnight_top3500fresh_olduv" "$COLD_FS/feature_store_version=v4_q1panel_overnight_top3500fresh_olduv" "fs:olduv"

# --- PUNKT 3b: Scratch ---
safe_move \
  "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab-scratch-realtest" \
  "$COLD/quantlab-scratch-realtest" \
  "scratch-realtest"

# --- PUNKT 4: Audit-Artefakte ---
COLD_AUDIT="$COLD/repo-audit-artifacts"
safe_move "$REPO/evidence"          "$COLD_AUDIT/evidence"          "audit:evidence"
safe_move "$REPO/audit-evidence"    "$COLD_AUDIT/audit-evidence"    "audit:audit-evidence"
safe_move "$REPO/audit-run-v8"      "$COLD_AUDIT/audit-run-v8"      "audit:v8"
safe_move "$REPO/audit-run-v9"      "$COLD_AUDIT/audit-run-v9"      "audit:v9"
safe_move "$REPO/audit-run-v10"     "$COLD_AUDIT/audit-run-v10"     "audit:v10"
safe_move "$REPO/.rv_audit"         "$COLD_AUDIT/.rv_audit"         "audit:.rv_audit"
safe_move "$REPO/.rv_bench"         "$COLD_AUDIT/.rv_bench"         "audit:.rv_bench"
safe_move "$REPO/.audit_temp"       "$COLD_AUDIT/.audit_temp"       "audit:.audit_temp"
safe_move "$REPO/Report"            "$COLD_AUDIT/Report"            "audit:Report"
safe_move "$REPO/_local_trash"      "$COLD_AUDIT/_local_trash"      "audit:_local_trash"
safe_move "$REPO/artifacts"         "$COLD_AUDIT/artifacts"         "audit:artifacts"
safe_move "$REPO/docs/audit"        "$COLD_AUDIT/docs-audit"        "audit:docs/audit"
safe_move "$REPO/output/playwright" "$COLD_AUDIT/output-playwright" "audit:playwright"

# --- PUNKT 5: Regenerierbare Temp-Daten (einfach löschen) ---
safe_delete "$REPO/tmp"             "tmp"
safe_delete "$REPO/.wrangler/tmp"   ".wrangler/tmp"

log "============================================"
log "Cold Storage Migration COMPLETE"
log "============================================"
