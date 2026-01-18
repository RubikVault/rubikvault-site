#!/usr/bin/env bash
set -euo pipefail

ALLOW="${1:-}"
if [[ "$ALLOW" == "--allow-snapshots" ]]; then
  exit 0
fi

CHANGED=$(git diff --cached --name-only || true)
if [[ -z "$CHANGED" ]]; then
  exit 0
fi

if echo "$CHANGED" | rg -q '^(public/data/snapshots/|mirrors/)'; then
  echo "Refusing commit: staged changes include snapshots or mirrors."
  echo "If this is intentional, re-run with --allow-snapshots."
  exit 1
fi
