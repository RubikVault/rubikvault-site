#!/usr/bin/env bash

resolve_node_bin() {
  local resolver="${REPO_ROOT:-}/scripts/ops/resolve-node20-bin.sh"
  local candidate=""

  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN:-}" ]]; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi

  if [[ -x "$resolver" ]]; then
    "$resolver"
    return $?
  fi

  candidate="$(command -v node 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  local ops_tool_node="${NAS_OPS_ROOT:-${OPS_ROOT:-$HOME/RepoOps/rubikvault-site}}/tooling/bin/node"
  for candidate in \
    /usr/local/bin/node \
    /volume1/@appstore/Node.js_v20/usr/local/bin/node \
    /var/packages/Node.js_v20/target/usr/local/bin/node \
    "$ops_tool_node"
  do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "FATAL: unable to resolve Node executable for NAS automation" >&2
  return 2
}

NODE_BIN="$(resolve_node_bin)"
export NODE_BIN

NODE_DIR="$(dirname "$NODE_BIN")"
case ":${PATH:-}:" in
  *":$NODE_DIR:"*) ;;
  *) export PATH="$NODE_DIR:${PATH:-}" ;;
esac
