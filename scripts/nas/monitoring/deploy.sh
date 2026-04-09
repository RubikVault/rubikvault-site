#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

REMOTE_MONITORING_ROOT="${REMOTE_MONITORING_ROOT:-/volume1/monitoring}"
REMOTE_WEB_ROOT="${REMOTE_WEB_ROOT:-/volume1/web/monitoring}"
REMOTE_STAGING_ROOT="${REMOTE_STAGING_ROOT:-/volume1/homes/neoboy/monitoring-staging}"
REMOTE_SCRIPT_ROOT="${REMOTE_SCRIPT_ROOT:-$REMOTE_MONITORING_ROOT/scripts}"
REMOTE_TASK_DIR="${REMOTE_TASK_DIR:-/usr/syno/etc/synoschedule.d/root}"
REMOTE_TASK_STORAGE="${REMOTE_TASK_STORAGE:-/volume1/homes/neoboy/monitoring-task-backup/scheduler}"
LOCAL_MONITORING_ROOT="$ROOT/scripts/nas/monitoring"
LOCAL_ENV_EXAMPLE="$ROOT/config/nas-monitoring.env.example"
LOCAL_RUNBOOK="$ROOT/docs/ops/nas-monitoring-runbook.md"
LOCAL_TMP_TASK_DIR="$ROOT/tmp/nas-monitoring-tasks"

ensure_local_dirs
nas_ssh_preflight

mkdir -p "$LOCAL_TMP_TASK_DIR"
rm -f "$LOCAL_TMP_TASK_DIR"/*.task

remote_shell "mkdir -p '$REMOTE_STAGING_ROOT/scripts' '$REMOTE_STAGING_ROOT/scripts/dashboard' '$REMOTE_STAGING_ROOT/config' '$REMOTE_STAGING_ROOT/docs' '$REMOTE_TASK_STORAGE'"

"$RSYNC_BIN" -a \
  --protect-args \
  --rsync-path=/usr/bin/rsync \
  -e "$RSYNC_SHELL" \
  --include='*/' \
  --include='*.sh' \
  --include='*.mjs' \
  --exclude='*' \
  "$LOCAL_MONITORING_ROOT/" "$NAS_HOST:$REMOTE_STAGING_ROOT/scripts/" </dev/null

"$RSYNC_BIN" -a \
  --protect-args \
  --rsync-path=/usr/bin/rsync \
  -e "$RSYNC_SHELL" \
  "$LOCAL_MONITORING_ROOT/dashboard/" "$NAS_HOST:$REMOTE_STAGING_ROOT/scripts/dashboard/" </dev/null

rsync_to_remote "$LOCAL_ENV_EXAMPLE" "$REMOTE_STAGING_ROOT/config" >/dev/null
rsync_to_remote "$LOCAL_RUNBOOK" "$REMOTE_STAGING_ROOT/docs" >/dev/null

remote_shell "chmod 755 '$REMOTE_STAGING_ROOT/scripts/'*.sh '$REMOTE_STAGING_ROOT/scripts/'*.mjs 2>/dev/null || true"

write_task() {
  local id="$1"
  local name="$2"
  local type="$3"
  local run_hour="$4"
  local run_min="$5"
  local repeat_min="$6"
  local command="$7"
  local task_path="$LOCAL_TMP_TASK_DIR/${id}.task"
  local cmd_b64
  local json_command
  cmd_b64="$(printf '%s\n' "$command" | base64 | tr -d '\n')"
  json_command="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1] + "\n"))' "$command")"
  cat > "$task_path" <<EOF
id=${id}
last work hour=0
can edit owner=1
can delete from ui=1
edit dialog=SYNO.SDS.TaskScheduler.EditDialog
type=${type}
action=#common:run#: ${command}
systemd slice=
monthly week=0
can edit from ui=1
week=1111111
app name=#common:command_line#
name=${name}
can run app same time=1
owner=0
repeat min store config=[1,5,10,15,20,30]
repeat hour store config=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]
simple edit form=1
repeat hour=0
listable=1
app args={"notify_enable":false,"notify_if_error":false,"notify_mail":"","script":${json_command}}
state=enabled
can run task same time=0
start day=0
cmd=${cmd_b64}
run hour=${run_hour}
edit form=SYNO.SDS.TaskScheduler.Script.FormPanel
app=SYNO.SDS.TaskScheduler.Script
run min=${run_min}
start month=0
can edit name=1
start year=0
can run from ui=1
repeat min=${repeat_min}
cmdArgv=
EOF
}

ROOT_ENV_PREFIX="export MONITORING_ROOT='$REMOTE_MONITORING_ROOT' WEB_ROOT='$REMOTE_WEB_ROOT' HTTP_ENDPOINT_HOST='192.168.188.21';"
write_task 89 "RV_Monitor_Bootstrap" "daily" 4 45 0 "mkdir -p '$REMOTE_MONITORING_ROOT/scripts' '$REMOTE_MONITORING_ROOT/config' '$REMOTE_MONITORING_ROOT/docs' && cp -R '$REMOTE_STAGING_ROOT/scripts/.' '$REMOTE_MONITORING_ROOT/scripts/' && cp '$REMOTE_STAGING_ROOT/config/$(basename "$LOCAL_ENV_EXAMPLE")' '$REMOTE_MONITORING_ROOT/config/$(basename "$LOCAL_ENV_EXAMPLE")' && cp '$REMOTE_STAGING_ROOT/docs/$(basename "$LOCAL_RUNBOOK")' '$REMOTE_MONITORING_ROOT/docs/$(basename "$LOCAL_RUNBOOK")' && ${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/health_watch.sh' && ${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/report_supervisor.sh'"
write_task 90 "RV_Monitor_Watch" "daily" 0 0 5 "${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/health_watch.sh'"
write_task 91 "RV_Monitor_Daily_0900" "daily" 9 0 0 "${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/daily_health.sh'"
write_task 92 "RV_Monitor_Weekly_0800" "daily" 8 0 0 "if [ \"\$(date '+%u')\" = \"7\" ]; then ${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/weekly_report.sh'; fi"
write_task 93 "RV_Monitor_Supervisor_0915" "daily" 9 15 0 "${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/report_supervisor.sh'"
write_task 94 "RV_Monitor_Supervisor_1315" "daily" 13 15 0 "${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/report_supervisor.sh'"
write_task 95 "RV_Monitor_Supervisor_1815" "daily" 18 15 0 "${ROOT_ENV_PREFIX} /bin/bash '$REMOTE_MONITORING_ROOT/scripts/report_supervisor.sh'"

for task_file in "$LOCAL_TMP_TASK_DIR"/*.task; do
  rsync_to_remote "$task_file" "$REMOTE_TASK_STORAGE" >/dev/null
done

remote_shell "
  for id in 89 90 91 92 93 94 95; do
    rm -f '$REMOTE_TASK_DIR'/\${id}.task
    ln -s '$REMOTE_TASK_STORAGE'/\${id}.task '$REMOTE_TASK_DIR'/\${id}.task
  done
  synoschedtask --sync >/dev/null 2>&1 || true
  synoschedtask --run id=89 check_time=0 check_status=0 >/dev/null 2>&1 || true
  synoschedtask --run id=90 check_time=0 check_status=0 >/dev/null 2>&1 || true
  synoschedtask --run id=91 check_time=0 check_status=0 >/dev/null 2>&1 || true
  synoschedtask --run id=93 check_time=0 check_status=0 >/dev/null 2>&1 || true
"

printf 'remote_root=%s\n' "$REMOTE_MONITORING_ROOT"
printf 'web_root=%s\n' "$REMOTE_WEB_ROOT"
printf 'browser_link=%s\n' "http://192.168.188.21/monitoring/"
printf 'remote_scripts=%s\n' "$REMOTE_SCRIPT_ROOT"
printf 'tasks=%s\n' "89,90,91,92,93,94,95"
