#!/usr/bin/env bash
# assert-mac-no-packs.sh — fail if Mac local repo holds history packs.
# History packs live ONLY on NAS. Mac is a read-lens, not a data source.
# No-op on non-Darwin (NAS legitimately holds packs).
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

if [[ -d /volume1/homes/neoboy ]]; then
  exit 0
fi

repo_root="${RUBIK_REPO_ROOT:-/Users/michaelpuchowezki/Dev/rubikvault-site}"
quanthot_packs="${RUBIK_QUANTHOT_PACKS:-/Users/michaelpuchowezki/QuantLabHot/storage/universe-v7-history}"

violations=()

if [[ -e "$repo_root/mirrors/universe-v7/history" ]]; then
  violations+=("$repo_root/mirrors/universe-v7/history exists (must be deleted; NAS-only)")
fi

if [[ -e "$repo_root/public/data/eod/history/packs" ]]; then
  if [[ -L "$repo_root/public/data/eod/history/packs" ]]; then
    target="$(readlink "$repo_root/public/data/eod/history/packs")"
    violations+=("public/data/eod/history/packs is a symlink (target=$target); must be deleted")
  else
    violations+=("public/data/eod/history/packs exists; must be deleted")
  fi
fi

if [[ -d "$quanthot_packs" ]]; then
  violations+=("$quanthot_packs exists (~9 GB cache; must be quarantined/removed)")
fi

if (( ${#violations[@]} > 0 )); then
  printf '[assert-mac-no-packs] POLICY VIOLATION:\n' >&2
  for v in "${violations[@]}"; do
    printf '  - %s\n' "$v" >&2
  done
  printf 'History packs are NAS-only. Mac must hold no local copies.\n' >&2
  exit 2
fi

echo "[assert-mac-no-packs] ok — Mac holds no history packs"
exit 0
