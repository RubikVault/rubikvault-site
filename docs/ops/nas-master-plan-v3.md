# RubikVault NAS MasterPlan v3

## Goal

- The NAS remains a fully isolated proving ground until it earns production responsibility with reports.
- No NAS failure may affect the Mac repo, GitHub, Cloudflare, or the live website.
- The target state is a report-backed hybrid runtime, not an ideology-driven NAS-only switch.

## Runtime Roots

- NAS code runtime: `/volume1/homes/neoboy/Dev/rubikvault-site`
- NAS ops/runtime evidence: `/volume1/homes/neoboy/RepoOps/rubikvault-site`
- NAS QuantLab mirror: `/volume1/homes/neoboy/QuantLabHot`

## Current Hard Facts

- `/dev/md0` is still full and remains a risk gate.
- The fixed system-partition audit now confirms that the dominant consumers are `/usr` and `/var`, not inode exhaustion.
- Conservative cleanup can archive candidates under the NAS SSH user, but deleting root-owned root-fs files still requires higher privilege; md0 relief is therefore not yet proven.
- Required services stay healthy: Synology Photos, QuickConnect relay, nginx, SMB.
- Native matrix currently shows `stage1`, `stage2`, `stage3`, and `scientific_summary` as real NAS candidates under specific variants.
- The production `STATUS.json` and native matrix report must agree before any `GREEN/GO` claim is treated as real.
- NAS-only changes must always be brought back into the main repo to avoid split-brain.
- The native supervisor/campaign status path is now PID-backed and singleton-safe.

## Canonical NAS Variants

- `stage1`: `node512`
- `stage2`: `baseline_serial`
- `stage3`: `node512`
- `stage4:scientific_summary`: `baseline_serial`

Guarded variants remain evidence-only unless they prove stable without repeated guard blocks.

## Mac-Only For Now

- `best_setups_v4`
- `daily_audit_report`
- `cutover_readiness_report`
- `etf_diagnostic`
- `learning_cycle`
- `universe_audit`
- `q1_delta_ingest`
- `hist_probs` until the robust resume/coverage refactor is complete

## Implementation Rules

- Exactly one native supervisor may run at a time.
- The old overnight shadow chain is now legacy evidence, not the primary orchestrator.
- Output drift against frozen Mac baselines is evidence and must be reported explicitly.
- Auth- and time-dependent sections such as `remote_workflows` may be ignored in semantic compare, but ignored sections must be visible in the compare report.
- No root-fs cleanup may use blanket recursive deletes in `/tmp` or `/var/tmp`.
- QuantLab may be mirrored and used for read-only simulation on NAS, but hot ingest and training remain Mac-first until separately proven.

## Hist Probs Requirements

- Resume support is allowed only with validated existing files.
- Per-ticker outputs must be written atomically.
- Completion requires:
  - `tickers_remaining === 0`
  - `tickers_errors === 0`
  - full universe scope
  - correct `asset_classes`
- NAS hist-probs starts conservatively:
  - `HIST_PROBS_WORKERS=1`
  - then `2`
  - only after evidence, never by assumption

## Gates Before Any Promotion

- `/dev/md0` is no longer in the emergency state.
- Exactly one native supervisor is active.
- Native matrix report and production status are not contradictory.
- QuantLab mirror is verified complete.
- EOD fetch succeeds repeatedly on NAS.
- Canonical NAS stage variants stay green across repeated runs.

## Daily Deliverables

- Native matrix report
- Production status
- System-partition audit
- Journaled migration notes
- Updated stage manifest with primary evidence source clearly stated
