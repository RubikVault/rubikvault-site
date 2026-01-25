#!/usr/bin/env bash
set -euo pipefail

rv_dev_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

rv_dev_dir() {
  local root
  root="$(rv_dev_root)"
  echo "$root/.tmp/rv-dev"
}

rv_dev_pidfile() {
  echo "$(rv_dev_dir)/wrangler.pid"
}

rv_dev_logfile() {
  echo "$(rv_dev_dir)/wrangler.log"
}

rv_dev_is_running() {
  local pidfile pid
  pidfile="$(rv_dev_pidfile)"
  [[ -f "$pidfile" ]] || return 1
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

rv_dev_stop() {
  local pidfile pid
  pidfile="$(rv_dev_pidfile)"

  if [[ -f "$pidfile" ]]; then
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile" 2>/dev/null || true
  fi

  pkill -SIGTERM -f "wrangler pages dev public" >/dev/null 2>&1 || true
  pkill -SIGTERM -f "wrangler pages dev" >/dev/null 2>&1 || true
  pkill -SIGTERM -f "workerd" >/dev/null 2>&1 || true
}

rv_dev_start() {
  local root dir log pidfile
  root="$(rv_dev_root)"
  dir="$(rv_dev_dir)"
  log="$(rv_dev_logfile)"
  pidfile="$(rv_dev_pidfile)"

  mkdir -p "$dir"

  rv_dev_stop

  (
    cd "$root"
    HOME="/tmp/rv_home" \
    NODE_OPTIONS="" \
    nohup npm run dev:pages:std >"$log" 2>&1 < /dev/null &
    echo $! >"$pidfile"
  )

  echo "started pid=$(cat "$pidfile") log=$log"
}
