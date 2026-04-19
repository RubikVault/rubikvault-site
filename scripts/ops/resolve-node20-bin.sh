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

EXPLICIT_CANDIDATES=(
  "${NODE_BIN:-}"
  "/usr/local/bin/node"
  "/volume1/@appstore/Node.js_v20/usr/local/bin/node"
)

for candidate in "${EXPLICIT_CANDIDATES[@]}"; do
  if print_if_node20 "$candidate"; then
    exit 0
  fi
done

if command -v node >/dev/null 2>&1; then
  if print_if_node20 "$(command -v node)"; then
    exit 0
  fi
fi

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # Synology task shells often start with /bin/sh and a minimal PATH.
  # Sourcing nvm recovers the interactive Node.js toolchain when present.
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  if command -v node >/dev/null 2>&1; then
    if print_if_node20 "$(command -v node)"; then
      exit 0
    fi
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
