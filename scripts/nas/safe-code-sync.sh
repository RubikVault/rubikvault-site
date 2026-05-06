#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"

TARGET_BRANCH="${TARGET_BRANCH:-main}"
SYNC_ROOT="${SYNC_ROOT:-$NAS_DEV_ROOT}"

# Tarball-pull config (used when no .git directory exists in SYNC_ROOT, e.g.
# Synology NAS without git installed). Keeps Mac off the critical path.
TARBALL_REPO="${RV_TARBALL_REPO:-RubikVault/rubikvault-site}"
TARBALL_BRANCH="${RV_TARBALL_BRANCH:-$TARGET_BRANCH}"
CODE_SYNC_META_PATH="${CODE_SYNC_META_PATH:-$SYNC_ROOT/var/private/ops/code-sync-latest.json}"

PUBLIC_DATA_CODE_ALLOWLIST=(
  public/data/universe/all.json
  public/data/universe/dowjones.json
  public/data/universe/nasdaq100.json
  public/data/universe/russell2000.json
  public/data/universe/sp500.json
  public/data/universe/v7/config/evaluation_policy.json
  public/data/universe/v7/config/global_trading_cost_model.json
  public/data/universe/v7/config/license_publish_whitelist.json
  public/data/universe/v7/config/us_holidays_2020_2030.json
  public/data/universe/v7/config/v7.config.json
  public/data/universe/v7/index-memberships/dowjones.json
  public/data/universe/v7/index-memberships/manifest.json
  public/data/universe/v7/index-memberships/nasdaq100.json
  public/data/universe/v7/index-memberships/russell2000.json
  public/data/universe/v7/index-memberships/sp500.json
)

if [[ "${ALLOW_ACTIVE_NIGHT_PIPELINE_LOCK:-0}" != "1" ]]; then
  nas_assert_global_lock_clear "night-pipeline"
fi
nas_assert_global_lock_clear "open-probe"
nas_assert_global_lock_clear "native-matrix"

resolve_node_bin() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  for candidate in \
    /var/packages/Node.js_v20/target/usr/local/bin/node \
    /var/packages/Node.js_v18/target/usr/local/bin/node \
    /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

run_manifest_guard() {
  local node_bin
  node_bin="$(resolve_node_bin)" || {
    echo "safe_code_sync_manifest_guard_skipped reason=node_not_found" >&2
    return 0
  }
  local manifest="$SYNC_ROOT/scripts/nas/release-truth-chain.manifest.json"
  if [[ ! -f "$manifest" ]]; then
    echo "safe_code_sync_manifest_guard_skipped reason=manifest_missing path=$manifest" >&2
    return 0
  fi
  "$node_bin" "$SYNC_ROOT/scripts/nas/verify-code-manifest.mjs"
}

resolve_tarball_head_sha() {
  local url sha
  url="https://api.github.com/repos/${TARBALL_REPO}/commits/${TARBALL_BRANCH}"
  sha="$(curl -fsSL --retry 2 --retry-delay 2 --max-time 15 "$url" 2>/dev/null \
    | python3 -c 'import json,sys; print((json.load(sys.stdin).get("sha") or "").strip())' 2>/dev/null || true)"
  if [[ "$sha" =~ ^[a-fA-F0-9]{40}$ ]]; then
    printf '%s\n' "$sha"
  fi
}

write_code_sync_meta() {
  local mode="$1"
  local head_sha="$2"
  mkdir -p "$(dirname "$CODE_SYNC_META_PATH")"
  python3 - "$CODE_SYNC_META_PATH" "$mode" "$TARGET_BRANCH" "$TARBALL_REPO" "$TARBALL_BRANCH" "$head_sha" <<'PY'
import json, sys
from datetime import datetime, timezone

path, mode, target_branch, repo, tarball_branch, head_sha = sys.argv[1:7]
payload = {
    "schema": "rv_code_sync_meta_v1",
    "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "mode": mode,
    "target_branch": target_branch,
    "repo": repo,
    "tarball_branch": tarball_branch,
    "head_sha": head_sha if len(head_sha) == 40 else None,
}
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
PY
}

sync_public_data_code_allowlist() {
  local src_root="$1"
  local copied=0
  local rel
  for rel in "${PUBLIC_DATA_CODE_ALLOWLIST[@]}"; do
    if [[ -f "$src_root/$rel" ]]; then
      mkdir -p "$SYNC_ROOT/$(dirname "$rel")"
      rsync -a "$src_root/$rel" "$SYNC_ROOT/$rel"
      copied=$((copied + 1))
    fi
  done
  printf 'safe_code_sync_public_data_code_allowlist copied=%s\n' "$copied"
}

tarball_sync() {
  local tmp head_sha head_short
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  local url="https://github.com/${TARBALL_REPO}/tarball/${TARBALL_BRANCH}"
  head_sha="$(resolve_tarball_head_sha || true)"
  printf 'safe_code_sync_mode=tarball repo=%s branch=%s url=%s\n' \
    "$TARBALL_REPO" "$TARBALL_BRANCH" "$url"

  if ! curl -fsSL --retry 3 --retry-delay 5 -o "$tmp/repo.tar.gz" "$url"; then
    echo "safe_code_sync_tarball_fetch_failed url=$url" >&2
    return 1
  fi

  mkdir -p "$tmp/extract"
  if ! tar -xzf "$tmp/repo.tar.gz" -C "$tmp/extract" --strip-components=1; then
    echo "safe_code_sync_tarball_extract_failed tarball=$tmp/repo.tar.gz" >&2
    return 1
  fi

  # Code-only sync. Excludes protect NAS runtime data + build artifacts that
  # must never be overwritten by the tarball (Authority: NAS owns runtime data).
  rsync -a \
    --exclude="public/data/" \
    --exclude="tmp/" \
    --exclude="node_modules/" \
    --exclude=".wrangler/" \
    --exclude="archives/" \
    --exclude="mirrors/" \
    --exclude="output/" \
    --exclude="var/" \
    --exclude="logs/" \
    --exclude="runtime/" \
    --exclude="Report/" \
    --exclude="datasets/" \
    --exclude="models/" \
    --exclude="registry/" \
    --exclude="reports/" \
    --exclude="dist/" \
    --exclude=".git/" \
    --exclude="wrangler.log" \
    --exclude="ops_*.log" \
    --exclude="ops_*.txt" \
    --exclude="*.pid" \
    "$tmp/extract/" "$SYNC_ROOT/"

  sync_public_data_code_allowlist "$tmp/extract"

  # AppleDouble (._*) leak prevention — clean the code tree but never enter
  # public/data/ (NAS runtime data may legitimately contain dotfiles).
  find "$SYNC_ROOT" \
    \( -path "$SYNC_ROOT/public/data" -o -path "$SYNC_ROOT/node_modules" \) -prune \
    -o -name "._*" -type f -print -delete >/dev/null 2>&1 || true

  head_short="${head_sha:0:12}"
  if [[ -z "$head_short" ]]; then
    head_short="$(head -c 12 "$tmp/extract/.git_head_sha" 2>/dev/null || true)"
  fi
  if [[ -z "$head_short" ]]; then
    head_short="tarball"
  fi

  write_code_sync_meta "tarball" "$head_sha"

  printf 'safe_code_sync_ok branch=%s head=%s mode=tarball\n' \
    "$TARBALL_BRANCH" "$head_short"

  run_manifest_guard
}

git_sync() {
  local head_sha
  if [[ -n "$(git -C "$SYNC_ROOT" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    echo "safe_code_sync_dirty_worktree=$SYNC_ROOT" >&2
    exit 1
  fi

  git -C "$SYNC_ROOT" fetch origin
  git -C "$SYNC_ROOT" checkout "$TARGET_BRANCH" >/dev/null 2>&1 || true
  git -C "$SYNC_ROOT" merge --ff-only "origin/$TARGET_BRANCH"
  head_sha="$(git -C "$SYNC_ROOT" rev-parse HEAD)"
  write_code_sync_meta "git" "$head_sha"

  printf 'safe_code_sync_ok branch=%s head=%s mode=git\n' \
    "$TARGET_BRANCH" \
    "${head_sha:0:12}"

  run_manifest_guard
}

if [[ -d "$SYNC_ROOT/.git" ]] && command -v git >/dev/null 2>&1; then
  git_sync
else
  tarball_sync
fi
