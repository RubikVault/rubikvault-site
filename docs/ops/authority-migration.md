# Authority Migration

This document tracks the RubikVault authority migration and the removal of legacy control-plane paths.

## Rules
- Only the authority layer may write authoritative latest artifacts.
- Legacy writers may only emit shadow evidence until removed.
- Each legacy removal must record the replacement path and the PR that removed it.

## Removal Log

| Date | Legacy component | Replacement | Reason | PR |
| --- | --- | --- | --- | --- |
| 2026-04-12 | `run-night-supervisor.mjs` public release-state writes | authority runtime `legacy_shadow/` only | Prevent legacy SSOT drift during cutover | pending |
| 2026-04-12 | `release-gate-check.mjs` legacy release-phase gating | `final-integrity-seal.release_ready` | Deploy gating must depend on seal-only release truth | pending |
