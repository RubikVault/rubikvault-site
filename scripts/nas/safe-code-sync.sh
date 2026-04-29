#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# shellcheck source=scripts/nas/nas-env.sh
. "$REPO_ROOT/scripts/nas/nas-env.sh"

TARGET_BRANCH="${TARGET_BRANCH:-main}"
SYNC_ROOT="${SYNC_ROOT:-$NAS_DEV_ROOT}"

if [[ "${ALLOW_ACTIVE_NIGHT_PIPELINE_LOCK:-0}" != "1" ]]; then
  nas_assert_global_lock_clear "night-pipeline"
fi
nas_assert_global_lock_clear "open-probe"
nas_assert_global_lock_clear "native-matrix"

if [[ ! -d "$SYNC_ROOT/.git" ]]; then
  printf 'safe_code_sync_mode=rsync_mirror git_root=missing sync_root=%s\n' "$SYNC_ROOT"
  printf 'safe_code_sync_ok branch=%s head=rsync_mirror\n' "$TARGET_BRANCH"
  exit 0
fi

if [[ -n "$(git -C "$SYNC_ROOT" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
  echo "safe_code_sync_dirty_worktree=$SYNC_ROOT" >&2
  exit 1
fi

git -C "$SYNC_ROOT" fetch origin
git -C "$SYNC_ROOT" checkout "$TARGET_BRANCH" >/dev/null 2>&1 || true
git -C "$SYNC_ROOT" merge --ff-only "origin/$TARGET_BRANCH"

printf 'safe_code_sync_ok branch=%s head=%s\n' \
  "$TARGET_BRANCH" \
  "$(git -C "$SYNC_ROOT" rev-parse --short HEAD)"
