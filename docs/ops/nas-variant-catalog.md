# NAS Variant Catalog

## Purpose

This document is the catalog of NAS-side solution variants and experiment paths.
It keeps the full option space in one place so day/night supervisors, probe runs, and later refactors can be tracked against explicit problem IDs.

Status labels used here:

- `live_probe`: already wired into the active day/night NAS probe path
- `covered_by_report`: not a direct probe, but already evidenced by existing reports
- `queued_design`: accepted into the NAS experiment backlog, not yet implemented as a runnable variant
- `manual_or_external`: requires admin, external worker, or non-NAS infrastructure

## P01 API Fetch / Market Data

- `1A Deterministic Fetch Layer / Input-Freezing` — `queued_design`
- `1B Bronze Layer / Raw Lake` — `queued_design`
- `1C Immutable Fetch Archive + Replay` — `queued_design`
- `1D Isolated Fetcher Service` — `covered_by_report`
- `1E Circuit Breaker with persistent provider state` — `queued_design`
- `1F Fetch Receipt Pattern` — `queued_design`
- `1G Fetch Quality Score` — `queued_design`
- `1H Dual-Fetch Validation` — `queued_design`
- `1I 3-Provider / Majority Vote` — `queued_design`
- `1J Provider Prioritization Engine` — `queued_design`
- `1K Contract-first Fetch with Pydantic / JSON-Schema` — `queued_design`
- `1L Central Fetch Orchestrator` — `queued_design`
- `1M Externer Fetch-Dienst` — `manual_or_external`

Current live evidence:

- `refresh_history_sample`

## P02 History Refresh

- `2A Windowed Refresh` — `queued_design`
- `2B Gap Scanner / Pre-flight Gap Detection` — `queued_design`
- `2C Range Validation` — `queued_design`
- `2D Immutable History Store` — `queued_design`
- `2E Append-only Delta Files / Event Sourcing` — `queued_design`
- `2F Idempotenter Upsert + Conflict Log` — `queued_design`
- `2G Incremental Refresh mit Metadaten-Manifest` — `queued_design`
- `2H Append-only Parquet / partitioniert` — `queued_design`
- `2I Shadow Refresh in temporäres Verzeichnis` — `queued_design`
- `2J Refresh Integrity Index` — `queued_design`
- `2K Virtualized History Loader` — `queued_design`

Current live evidence:

- `refresh_history_sample`

## P03 Fundamentals

- `3A Schema Normalizer Layer` — `queued_design`
- `3B Provider Contract Files` — `queued_design`
- `3C Core vs Enrichment Split` — `queued_design`
- `3D Partial Acceptance Mode` — `queued_design`
- `3E Quality Score je Datensatz` — `queued_design`
- `3F TTL Cache` — `queued_design`
- `3G Smart Refresh nur bei Triggern` — `queued_design`
- `3H Last-known-good Fallback` — `queued_design`
- `3I Multi-Provider-Aggregator` — `covered_by_report`
- `3J Asynchroner Fundamentals Master Build` — `queued_design`
- `3K Schema Evolution Handler` — `queued_design`
- `3L Pydantic / Avro / Protobuf Contract Enforcement` — `queued_design`

Current live evidence:

- `fundamentals_sample`

## P04 Q1 Delta Ingest

- `4A Dependency Container Layer` — `queued_design`
- `4B venv / isolierte Runtime` — `queued_design`
- `4C Precompiled Binary Bundle` — `queued_design`
- `4D Portable Runtime Package / Zip Runtime` — `queued_design`
- `4E Ingest als Remote Service` — `manual_or_external`
- `4F Hot Folder / Inbox-Outbox Modell` — `manual_or_external`
- `4G Event-getriebener Ingest` — `queued_design`
- `4H Nix / Guix / reproduzierbare Runtime` — `queued_design`
- `4I Statisches Binary in Go/Rust` — `queued_design`
- `4J Preflight Validation CLI` — `live_probe`

Current live evidence:

- `q1_delta_ingest_smoke`
- `q1_delta_preflight`

## P05 QuantLab Integration

- `5A Strict Contract Mode` — `queued_design`
- `5B REST / gRPC API Boundary` — `queued_design`
- `5C Snapshot Mode` — `queued_design`
- `5D Async Queue Execution` — `queued_design`
- `5E Pre-baked Result Bundle` — `queued_design`
- `5F Blackbox Wrapper` — `queued_design`
- `5G Compatibility Snapshot` — `queued_design`
- `5H Job Sandbox per UUID` — `queued_design`
- `5I Boundary Audit` — `live_probe`
- `5J Worker Pattern` — `queued_design`

Current live evidence:

- `quantlab_v4_daily_report`
- `quantlab_boundary_audit`

## P06 Learning Cycle

- `6A Offline Learning Mode` — `queued_design`
- `6B Out-of-band Batch Processing` — `covered_by_report`
- `6C Lightweight Metrics Only` — `queued_design`
- `6D Learning Snapshot` — `queued_design`
- `6E Last-known-good Runtime Control` — `live_probe`
- `6F Adaptive Learning Scheduler` — `queued_design`
- `6G Persistent Learning State` — `queued_design`
- `6H Stub Replacement auf NAS` — `queued_design`
- `6I Model Registry / versionierte Lernoutputs` — `queued_design`
- `6J Learning komplett aus Online-Pipeline entfernen` — `covered_by_report`

Current live evidence:

- `daily_learning_cycle`
- `runtime_control_probe`

## P07 best_setups_v4

- `7A Ranking Only Mode` — `queued_design`
- `7B Precomputed Candidate Pool` — `queued_design`
- `7C Stateless Ranking Engine` — `queued_design`
- `7D Score-first Contract` — `queued_design`
- `7E Offline/Online Trennung` — `queued_design`
- `7F DAG-basierte Zerlegung` — `queued_design`
- `7G 4/5-Modul-Split` — `queued_design`
- `7H Immutable Step Outputs` — `queued_design`
- `7I No Side Effect Policy` — `queued_design`
- `7J Materialized Candidate Store` — `queued_design`
- `7K Distributed Ranking / Subjobs` — `queued_design`
- `7L Backfill separat auslagern` — `queued_design`

Current live evidence:

- `best_setups_v4_smoke`

## P08 UI Rendering

- `8A Static UI Snapshot Test` — `queued_design`
- `8B API Mock Rendering` — `queued_design`
- `8C API-first Rendering` — `live_probe`
- `8D Golden File Testing` — `queued_design`
- `8E Static Site Generation` — `queued_design`
- `8F Render Consistency Tests` — `queued_design`

Current live evidence:

- `ui_contract_probe`

## P09 UI Audit / Browser Tests

- `9A Contract-Based UI Testing` — `live_probe`
- `9B Visual Diff Testing` — `queued_design`
- `9C Headless Snapshot Benchmark` — `queued_design`
- `9D Browser-Tests aus NAS herausziehen` — `manual_or_external`
- `9E Playwright/Puppeteer separat` — `manual_or_external`
- `9F UI Audit komplett von Daily Core entkoppeln` — `covered_by_report`

Current live evidence:

- `universe_audit_sample`
- `ui_contract_probe`

## P10 md0 / Root-FS / Scheduler

- `10A Root-FS Write Isolation` — `queued_design`
- `10B Read-only Root Audit` — `covered_by_report`
- `10C Root-FS Monitoring Daemon` — `covered_by_report`
- `10D Konservatives Cleanup` — `manual_or_external`
- `10E Write Path Audit` — `queued_design`
- `10F Bind-Mount / Symlink-Strategie` — `manual_or_external`
- `10G Scheduler Externalization` — `covered_by_report`
- `10H Supervisor statt DSM-Scheduler` — `covered_by_report`
- `10I Docker/Containerized Cron / Ofelia / Cronicle` — `queued_design`
- `10J systemd User Units / alternative Task-Schicht` — `manual_or_external`
- `10K Immutable Infrastructure Pattern` — `queued_design`
- `10L Quotas / Volume Limits` — `manual_or_external`

Current live evidence:

- `tmp/nas-system-audit/<STAMP>/summary.json`
- `tmp/nas-benchmarks/nas-night-watch-latest.json`

## Cross-Cutting Variants

- `A Containerisierung` — `queued_design`
- `B Contracts / Schema Enforcement` — `covered_by_report`
- `C Immutable / Append-only Data` — `queued_design`
- `D Queue / Worker Pattern` — `queued_design`
- `E Snapshot / Replay` — `queued_design`
- `F Separation of Concerns / Boundary Fix` — `covered_by_report`
- `G Externalization statt NAS-Zwang` — `manual_or_external`

## Current Active NAS Probe Set

- `refresh_history_sample`
- `fundamentals_sample`
- `quantlab_v4_daily_report`
- `q1_delta_ingest_smoke`
- `q1_delta_preflight`
- `quantlab_boundary_audit`
- `hist_probs_sample`
- `hist_probs_sample_w1`
- `hist_probs_sample_w2`
- `forecast_daily`
- `universe_audit_sample`
- `runtime_control_probe`
- `ui_contract_probe`
- `best_setups_v4_smoke`
- `etf_diagnostic_smoke`
- `daily_audit_report_smoke`
- `cutover_readiness_smoke`
- `daily_learning_cycle`
