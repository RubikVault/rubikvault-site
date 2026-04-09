#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_remote_dirs

"${SSH_CMD[@]}" "$NAS_HOST" "
  . '$NAS_ROOT/tooling/env.sh'
  echo 'TOOLS'
  echo \"node=\$(node -v)\"
  echo \"npm=\$(npm -v)\"
  echo \"python=\$(python3 --version 2>&1)\"
  echo \"uv=\$(uv --version)\"
  echo '---'
  echo 'SERVICES'
  ps -ef | egrep 'synorelayd|synofoto|nginx: master|smbd -F --no-process-group' | grep -v egrep || true
  echo '---'
  echo 'SNAPSHOT'
  '$NAS_ROOT/tooling/bin/rv-nas-snapshot'
"
