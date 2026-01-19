#!/bin/bash
#
# Rolling Window Cleanup Script
# 
# Purpose: Clean up old daily snapshots to prevent unlimited repo growth
# Policy: Keep last N=7 days of daily snapshots
# Safety: NEVER delete latest.json
#
# Usage:
#   ./scripts/cleanup-daily-snapshots.sh [days_to_keep]
#
# Example:
#   ./scripts/cleanup-daily-snapshots.sh 7

set -euo pipefail

# Configuration
DAYS_TO_KEEP=${1:-7}
DRY_RUN=${DRY_RUN:-false}
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SNAPSHOTS_DIR="$BASE_DIR/public/data/snapshots"

echo "═══════════════════════════════════════════════════════════"
echo "           ROLLING WINDOW CLEANUP SCRIPT"
echo "═══════════════════════════════════════════════════════════"
echo "Base directory:    $BASE_DIR"
echo "Snapshots directory: $SNAPSHOTS_DIR"
echo "Days to keep:      $DAYS_TO_KEEP"
echo "Dry run:           $DRY_RUN"
echo ""

# Check if snapshots directory exists
if [ ! -d "$SNAPSHOTS_DIR" ]; then
  echo "⚠️  Snapshots directory not found: $SNAPSHOTS_DIR"
  echo "Nothing to clean up."
  exit 0
fi

# Calculate cutoff date (N days ago)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  CUTOFF_DATE=$(date -v-${DAYS_TO_KEEP}d +%Y-%m-%d)
else
  # Linux
  CUTOFF_DATE=$(date -d "-${DAYS_TO_KEEP} days" +%Y-%m-%d)
fi

echo "Cutoff date:       $CUTOFF_DATE"
echo "Files older than this will be deleted."
echo ""

# Safety checks
TOTAL_FILES=0
OLD_FILES=0
BYTES_SAVED=0

# Scan for old daily snapshots
for module_dir in "$SNAPSHOTS_DIR"/*/; do
  if [ ! -d "$module_dir" ]; then
    continue
  fi
  
  MODULE_NAME=$(basename "$module_dir")
  DAILY_DIR="$module_dir/daily"
  
  if [ ! -d "$DAILY_DIR" ]; then
    continue
  fi
  
  echo "Checking module: $MODULE_NAME"
  
  # Find old daily snapshots
  for daily_file in "$DAILY_DIR"/*.json; do
    if [ ! -f "$daily_file" ]; then
      continue
    fi
    
    TOTAL_FILES=$((TOTAL_FILES + 1))
    
    # Extract date from filename (YYYY-MM-DD.json)
    FILENAME=$(basename "$daily_file")
    FILE_DATE="${FILENAME%.json}"
    
    # Skip if not a date format
    if ! [[ "$FILE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      echo "  ⚠️  Skipping (not date format): $FILENAME"
      continue
    fi
    
    # Compare dates
    if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
      OLD_FILES=$((OLD_FILES + 1))
      FILE_SIZE=$(stat -f%z "$daily_file" 2>/dev/null || stat -c%s "$daily_file" 2>/dev/null || echo 0)
      BYTES_SAVED=$((BYTES_SAVED + FILE_SIZE))
      
      echo "  🗑️  OLD: $FILENAME (${FILE_SIZE} bytes)"
      
      if [ "$DRY_RUN" != "true" ]; then
        rm "$daily_file"
        echo "     ✅ Deleted"
      else
        echo "     (dry run, not deleted)"
      fi
    fi
  done
done

# Safety: Verify no latest.json was deleted
LATEST_JSON_COUNT=$(find "$SNAPSHOTS_DIR" -name "latest.json" | wc -l)
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                    CLEANUP SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "Total daily files:  $TOTAL_FILES"
echo "Old files:          $OLD_FILES"
echo "Bytes saved:        $((BYTES_SAVED / 1024)) KB"
echo "latest.json count:  $LATEST_JSON_COUNT (should be > 0)"
echo ""

if [ $OLD_FILES -eq 0 ]; then
  echo "✅ No old files to clean up. All files are within retention window."
elif [ "$DRY_RUN" = "true" ]; then
  echo "🔍 DRY RUN: Would have deleted $OLD_FILES files ($((BYTES_SAVED / 1024)) KB)"
  echo ""
  echo "To actually delete, run:"
  echo "  DRY_RUN=false ./scripts/cleanup-daily-snapshots.sh $DAYS_TO_KEEP"
else
  echo "✅ Cleanup complete! Deleted $OLD_FILES files, saved $((BYTES_SAVED / 1024)) KB"
fi

echo "═══════════════════════════════════════════════════════════"

# Verify latest.json still exists
if [ $LATEST_JSON_COUNT -eq 0 ]; then
  echo ""
  echo "🚨 CRITICAL ERROR: No latest.json files found!"
  echo "   This should NEVER happen. Cleanup may have deleted critical files."
  echo "   RESTORE FROM BACKUP IMMEDIATELY!"
  exit 1
fi

exit 0
