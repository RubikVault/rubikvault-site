#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

refresh_benchmark_reports
echo "$REMOTE_BENCHMARK_REPORTS"
