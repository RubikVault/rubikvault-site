#!/usr/bin/env bash
set -euo pipefail

# Forbid KV writes in request path
# Allowlist: none by default. If you *must* allow something, add explicit patterns below.

hits="$(rg -n "(\.put\(|KV\.put\(|kv\.put\()" functions/api -g '!functions/api/_shared/*' || true)"

if [ -n "${hits}" ]; then
  echo "ERROR: KV writes detected in request path (functions/api). Not allowed."
  echo "${hits}"
  exit 1
fi

echo "OK: no KV writes in functions/api"
