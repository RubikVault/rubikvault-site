#!/bin/bash
# Run on NAS to pull latest code from origin/main
# Usage: bash scripts/ops/nas-sync.sh

set -e
REPO_DIR="/volume1/homes/neoboy/Dev/rubikvault-site"
cd "$REPO_DIR"
git fetch origin
git reset --hard origin/main
echo "[nas-sync] Done: $(git rev-parse --short HEAD) $(date -Iseconds)"
