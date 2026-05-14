# Runbook — NAS Supervisor Watchdog

`scripts/ops/watchdog-check.mjs` polls the supervisor heartbeat and emits
`public/data/ops/watchdog-alert-latest.json` so dashboards / monitoring can
surface a stuck step early — without waiting for the 45-minute
`run-pipeline-deadman-guard.mjs` crash-seal trigger.

## When to run

- **Cadence:** every 10 minutes (DSM Task Scheduler on Synology NAS).
- **Cost:** one synchronous JSON read + one atomic write; <50ms typical.
- **Side effects:** writes the alert artifact. Does **not** kill the
  supervisor by default. Always exits 0 — alerts are observational.

## Thresholds

| Env var | Default | Behavior |
|--------|---------|----------|
| `RV_WATCHDOG_STALE_MIN` | `20` | When `heartbeat.last_seen` is older than this many minutes **and** `heartbeat.state === 'running'`, the classification is `stuck`. |
| `RV_WATCHDOG_KILL_AFTER_MIN` | `0` (off) | When `> 0`, the watchdog will `SIGTERM` the supervisor PID after the heartbeat exceeds this age. Leave `0` for alert-only behavior. |

## Classifications (`classification.status`)

| Status | Severity | Meaning |
|--------|----------|---------|
| `healthy` | `info` | Heartbeat fresh, supervisor running |
| `idle` | `info` | Heartbeat exists, state ≠ running/starting (e.g. completed, failed) |
| `no_heartbeat` | `warn` | Heartbeat file missing entirely |
| `stuck` | `warn` or `critical` | Heartbeat stale + state running. `critical` when pipeline-state also reports running. |

## DSM Task setup (Synology)

1. DSM → **Aufgabenplaner** (Control Panel → Task Scheduler).
2. Create → **Geplante Aufgabe** → **Benutzerdefiniertes Script**.
3. **Allgemein:** Name `rubikvault-watchdog-check`, User `neoboy`, enabled.
4. **Zeitplan:** Run **täglich**, **alle 10 Minuten**, von 03:00 bis 23:50.
5. **Aufgabeneinstellungen → Benutzerdefiniertes Script:**

```bash
cd /volume1/homes/neoboy/Dev/rubikvault-site
. scripts/nas/node-env.sh >/dev/null 2>&1
node scripts/ops/watchdog-check.mjs >> logs/watchdog-check.log 2>&1
```

6. **(Optional)** to enable auto-kill, prepend `RV_WATCHDOG_KILL_AFTER_MIN=60`
   (or other threshold) to the command. Recommended only after a few weeks
   of alert-only observation.

## Verifying it ran

```bash
ssh -p 2222 neonas 'cat /volume1/homes/neoboy/Dev/rubikvault-site/public/data/ops/watchdog-alert-latest.json'
```

`generated_at` should advance every 10 minutes during the supervised
window. `classification.status` should be `healthy` while the pipeline
is running, `idle` between runs.

## Dashboard wiring (future)

The alert artifact is published under `public/data/ops/` so it is
automatically picked up by `build-system-status-aggregator.mjs`
(`public/data/ops/system-status-aggregator-latest.json`) and any UI
dashboard that polls these.

## Relationship to existing guards

- `run-pipeline-deadman-guard.mjs` — heavier, 45-minute threshold, writes
  a `crash_seal_v1` and re-runs `final-integrity-seal.mjs` with
  `--allow-unready` when triggered. Continue to run nightly.
- This watchdog — earlier (20-minute) signal, no fail-stop, no crash
  seal. Use both: watchdog raises early visibility, deadman fails the
  release if the heartbeat is fully dead.
