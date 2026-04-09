#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
RUN_DIR="$LOCAL_BENCHMARKS/setup-$STAMP"
REPORT="$RUN_DIR/setup-report.txt"

ensure_local_dirs
ensure_remote_dirs
mkdir -p "$RUN_DIR"

{
  echo "setup_stamp=$STAMP"
  echo "local_shadow_root=$LOCAL_SHADOW"
  echo "local_benchmark_root=$LOCAL_BENCHMARKS"
  echo "local_dataset_mirrors=$LOCAL_DATASET_MIRRORS"
  echo "local_retention_root=$LOCAL_RETENTION"
  echo "remote_runtime=$REMOTE_RUNTIME"
  echo "remote_reports=$REMOTE_REPORTS"
  echo "remote_benchmark_reports=$REMOTE_BENCHMARK_REPORTS"
  echo "remote_tests=$REMOTE_TESTS"
  echo "remote_shadow_runs=$REMOTE_SHADOW_RUNS"
  echo "remote_archive_shadow=$REMOTE_ARCHIVE_SHADOW"
  echo "remote_datasets=$REMOTE_DATASETS"
} > "$REPORT"

remote_shell "mkdir -p \
  '$REMOTE_RUNTIME/tests' \
  '$REMOTE_RUNTIME/tests/batches' \
  '$REMOTE_RUNTIME/tests/manifests' \
  '$REMOTE_RUNTIME/tests/metrics' \
  '$REMOTE_RUNTIME/reports/benchmarks' \
  '$REMOTE_RUNTIME/reports/datasets' \
  '$REMOTE_ARCHIVES/shadow-runs' \
  '$REMOTE_ARCHIVES/datasets' \
  '$REMOTE_DATASETS/mac-mirror' \
  '$REMOTE_DATASETS/samsung' \
  '$REMOTE_DATASETS/config' \
  '$REMOTE_STAGING/reference-runs'"

rsync_to_remote "$REPORT" "$REMOTE_REPORTS" >/dev/null
echo "$REPORT"
