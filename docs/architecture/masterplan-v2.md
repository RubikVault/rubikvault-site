# Masterplan v2 (Phase 0/1)

## Goal
Deliver a static-first, registry-driven system that is safe on 0€ limits, debuggable, and deterministic.

## Core Principles
- Static-first: `public/data/*.json` is the primary data plane for the UI.
- Registry-driven: a single source of truth with deterministic build output.
- Budgets: track requests and credits separately per provider.
- Dependency DAG: explicit dependencies with cycle detection in CI.
- Poison guard: never overwrite last-good with dangerously empty data.
- Preview safety: avoid upstream spam; honor read-only defaults when bindings are missing.

## Data Flow (High Level)
Providers -> Seeder/Scripts -> registry-built.json + static snapshots + KV mirrors
UI -> reads public/data via CDN
API -> diagnostics, realtime, and fallback paths (never required for initial render)

## Phase 0 Deliverables
- Registry + schemas + deterministic build/validate scripts.
- Structural CI gates (no network, no freshness checks).
- Static placeholder outputs for system health / usage / audit.
- Middleware contract documented and enforced.

## Phase 1 Follow-ups
- Registry-driven seeder with poison-guard thresholds.
- Snapshot coverage expansion and mirror validation.
- UI migration to consume registry-built artifacts directly.
