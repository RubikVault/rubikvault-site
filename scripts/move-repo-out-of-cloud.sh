#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="rubikvault-site"
SRC="$HOME/<cloud-synced-folder>/$REPO_NAME"
DEST="$HOME/Dev/$REPO_NAME"

cat <<EOM
# Recommended: move repo out of cloud-synced location to reduce watcher issues
mkdir -p "$HOME/Dev"
rsync -a --delete "$SRC/" "$DEST/"
cd "$DEST"
# Verify git is writable
python3 - <<'PY'
from pathlib import Path
p = Path('.git/locktest')
p.write_text('ok')
p.unlink()
print('GIT_WRITE_OK')
PY
# Start dev server
bash scripts/dev-local.sh
EOM
