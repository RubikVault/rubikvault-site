#!/usr/bin/env bash
# ONE-TIME root setup: raise FD limit for neoboy so workerd/wrangler can run.
# Run as: sudo bash scripts/ops/nas-setup-fd-limit.sh
set -euo pipefail

UNIT_DIR=/etc/systemd/system
SERVICE_FILE=$UNIT_DIR/rubikvault-pipeline.service
REPO_ROOT=/volume1/homes/neoboy/Dev/rubikvault-site
USER=neoboy

if [[ "$(id -u)" != "0" ]]; then
  echo "ERROR: must run as root: sudo bash $0" >&2
  exit 1
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=RubikVault Pipeline Master Supervisor
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_ROOT
ExecStart=/bin/bash $REPO_ROOT/scripts/ops/run-pipeline-master-supervisor-node20.sh
Restart=on-failure
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable rubikvault-pipeline.service
systemctl restart rubikvault-pipeline.service

echo "Done. Verifying FD limit..."
sleep 3
PID=$(systemctl show -p MainPID --value rubikvault-pipeline.service)
if [[ -n "$PID" && "$PID" != "0" ]]; then
  grep "open files" /proc/$PID/limits
  echo "Service PID=$PID running OK"
else
  echo "WARNING: service not yet started, check: systemctl status rubikvault-pipeline"
fi
