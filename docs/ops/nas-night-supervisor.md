# NAS Night Supervisor

## Purpose

This supervisor watches the active NAS native-matrix evidence flow overnight, refreshes local mirror reports, automatically adopts the newest healthy running native campaign, and conservatively restarts evidence collection if it stops early before the configured end time.

## Safety

- No deletes.
- Mac stays productive primary.
- NAS stays shadow-only.
- Supervisor never writes into productive repo outputs.
- Synology Photos, QuickConnect, DSM, and SMB remain mandatory health checks.

## Inputs

- Active remote native-matrix supervisor and campaign status on NAS
- Remote production `runtime/STATUS.json`
- Remote native-matrix reports in `runtime/reports/native-matrix/`
- Remote system-partition audit summaries in `runtime/reports/system-partition/`
- Current local mirror outputs in `tmp/nas-native-matrix/` and `tmp/nas-system-audit/`

## Behavior

- Ensures exactly one remote native-matrix supervisor is running
- Checks the NAS every `30` minutes by default
- Runs remote `rv-nas-watchdog.sh` on every cycle
- Syncs remote native-matrix and system-audit artifacts back to the local mirror
- Rebuilds local reality-check and night-watch reports after each sync
- If the watched campaign is gone or unhealthy before the configured end time, the remote native-matrix supervisor restarts the campaign
- Does not use the legacy overnight shadow chain

## Runtime

```sh
bash scripts/nas/run-night-watch-supervisor.sh
```

Key environment variables:

- `CHECK_INTERVAL_SEC`
- `STALE_THRESHOLD_SEC`
- `END_LOCAL_HOUR`
- `END_LOCAL_MINUTE`
- `AUTO_DEPLOY`
- `RUN_REMOTE_WATCHDOG`

Example overnight watch until 08:00 with 30-minute checks:

```sh
CHECK_INTERVAL_SEC=1800 END_LOCAL_HOUR=8 END_LOCAL_MINUTE=0 bash scripts/nas/run-night-watch-supervisor.sh
```

Persistent LaunchAgent install for the same night-watch behavior:

```sh
npm run nas:night:install
```

LaunchAgent outputs:

- `tmp/nas-launchd/night-watch.stdout.log`
- `tmp/nas-launchd/night-watch.stderr.log`

## Artifacts

- `tmp/nas-night-watch/<stamp>/status.json`
- `tmp/nas-night-watch/<stamp>/supervisor.log`
- `tmp/nas-benchmarks/nas-night-watch-latest.json`
- `tmp/nas-benchmarks/nas-night-watch-latest.md`
