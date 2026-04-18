#!/usr/bin/env bash
set -euo pipefail

major_version() {
  local bin="$1"
  "$bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true
}

print_if_node20() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 1
  [[ -x "$candidate" ]] || return 1
  local major
  major="$(major_version "$candidate")"
  [[ "$major" == "20" ]] || return 1
  printf '%s\n' "$candidate"
  return 0
}

if print_if_node20 "${NODE_BIN:-}"; then
  exit 0
fi

if command -v node >/dev/null 2>&1; then
  NODE_CANDIDATE="$(command -v node)"
  if print_if_node20 "$NODE_CANDIDATE"; then
    exit 0
  fi
fi

if command -v npx >/dev/null 2>&1; then
  RESOLVED="$(npx -y node@20 -p 'process.execPath' 2>/dev/null || true)"
  if print_if_node20 "$RESOLVED"; then
    exit 0
  fi
fi

echo "FATAL: unable to resolve a Node 20 executable" >&2
exit 2
