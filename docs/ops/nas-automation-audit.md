# NAS Automation Audit

## Purpose

This document defines the audit gate for NAS automation. It exists to prevent split-brain status claims, premature `GO` decisions, and unsafe scheduler changes while the Synology system partition state is still unknown.

## Canonical Source Of Truth

Only these repo-local surfaces may be used to decide whether NAS automation is healthy enough for further rollout:

- `docs/ops/nas-runbook.md`
- `docs/ops/nas-migration-journal.md`
- `scripts/nas/*`
- `tmp/nas-benchmarks/*`
- `tmp/nas-campaigns/*`
- `tmp/nas-supervisors/*`
- `tmp/nas-system-audit/*`

Claims from NAS-only files that are not mirrored into this repo are not authoritative until they are imported and checked against the repo-local state.

## Required Reports

Build the local truth-consolidation report:

```sh
npm run nas:audit:reality
```

Attempt the read-only system partition audit:

```sh
npm run nas:audit:system-partition
```

Outputs:

- `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`
- `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`
- `tmp/nas-system-audit/<STAMP>/summary.json`
- `tmp/nas-system-audit/<STAMP>/summary.md`

## Scheduler Guardrail

Do not create or modify DSM Task Scheduler jobs until all of the following are true:

1. `nas-automation-reality-check-latest.json` says `production_go_supported=true`
2. the latest `tmp/nas-system-audit/<STAMP>/summary.json` has `status=ok`
3. the latest system audit says `scheduler_safe_to_modify=true`
4. Synology Photos, QuickConnect/DSM, `nginx`, and `smbd` validate as healthy
5. there is no fresh chain of failed campaigns

Local `launchd` automation on the Mac is not a substitute for DSM scheduler approval. It is only an operational helper while the NAS remains shadow-only.

## Conservative System Partition Cleanup Policy

Allowed cleanup classes after a successful read-only audit:

- archived old logs under `/var/log`
- archived temp or update cache files under `/tmp`, `/var/tmp`, or DSM update cache locations
- archived crash/core files

Never touch as part of cleanup:

- `/usr/syno`
- `/etc.defaults`
- active package directories
- Synology Photos databases or indexes
- QuickConnect components
- user media data

Cleanup must stay copy-first and reversible. Archive to `/volume1` before removing anything from the root filesystem.

## Current Decision Rule

`GO` is blocked until repo-local evidence, supervisor state, campaign state, feasibility reports, and system-partition audit all agree. Benchmark success counts alone are not sufficient.
