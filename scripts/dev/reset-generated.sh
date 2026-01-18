#!/usr/bin/env bash
set -euo pipefail

git restore --staged --worktree \
  public/data/snapshots \
  mirrors \
  public/data/bundle.json \
  public/data/render-plan.json \
  public/data/provider-state.json \
  public/data/error-summary.json \
  public/data/system-health.json \
  public/data/usage-report.json \
  public/data/run-report.json \
  public/data/seed-manifest.json \
  public/data/health.json \
  public/data/health_history.json \
  public/data/blocks || true

echo "Reset generated data paths."
