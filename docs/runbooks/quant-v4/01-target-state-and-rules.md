# Quant v4.0 Target State and Rules (Implementation Anchor)

Last updated: 2026-02-26 (local)

## 1. Goal (simple)

Build a deterministic, audit-ready quant signal system that:
- ingests daily EOD data,
- appends it correctly per asset (no silent corruption),
- maintains reproducible snapshots and features,
- evaluates candidates with real time-split methodology,
- promotes/demotes models with explicit governance,
- and can run locally on the MacBook with fast hot storage and archived raw data.

Primary focus:
- `Stocks + ETFs` first.
- Other asset classes (`crypto`, `forex`, `bond`, `index`, `fund`) are secondary until v7 pointer coverage is fixed.

## 2. Scope boundaries (do not blur systems)

There are two systems in parallel:

1. Website / v7 operational data system (repo + `public/data` + `mirrors/universe-v7`)
2. Quant v4.0 local/private system (T9 + Mac hot storage + local quant scripts)

Rules:
- Do not rewrite website v7 history pack files in place for Quant.
- Quant reads v7 history and writes its own Parquet/snapshot/feature artifacts.
- Quant runtime/training artifacts stay local/private unless explicitly curated for publish.

## 3. Storage model (current target)

Hot / fast (Mac internal):
- `/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab`
- active snapshots, feature stores, runs, registry, logs

Warm (T9 SSD):
- `/Volumes/T9/rubikvault-quantlab`
- large raw Parquet, staging exports, heavy transforms

Cold (archive, later NAS):
- v7 raw history archive (JSON/NDJSON packs)
- old snapshots/runs/reports

Current v7 history archive move (already done):
- Repo path (compatibility): `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/universe-v7/history` (symlink)
- Actual storage: `/Volumes/T9/rubikvault-archive/mirrors/universe-v7/history`

## 4. Hard rules for implementation (v4.0)

### 4.1 Data truth
- Raw source is append-only.
- Snapshot manifests are required.
- Feature manifests are required.
- Every run must emit run status and artifact references.

### 4.2 Time correctness
- No lookahead.
- Features/signals for T use data <= close(T-1) (or explicitly documented variant).
- Fold boundaries and embargo must be persisted as artifacts.

### 4.3 Keying and reproducibility
- `canonical_id` is the primary key for assets whenever possible.
- Every meaningful artifact must be reproducible from:
  - input snapshot,
  - code version,
  - configuration,
  - random seed (if any).

### 4.4 No hidden failures
- Every drop/exclusion must be reason-coded.
- Every gate result must be explicit (pass/fail + threshold + value).

### 4.5 Local/private-first for Quant
- Do not push Quant training/runtime artifacts to `main`.
- Only small, reviewed code/docs changes should ever move to `main`.

## 5. What "100% v4.0" means (high level)

Not just "it runs":
- Daily delta ingest + incremental snapshot + incremental features are stable.
- Data Truth layer includes corp actions, delistings, TRI logic.
- Stage B is real (not only proxy/light).
- Registry/champion governance is active and audited.
- Portfolio/risk layer is implemented.
- Tests, invariants, red-flag reporting, invalidation logic are operational.

## 6. Critical path (fastest path to useful production-grade system)

The fastest route is:
1. Daily data backbone (delta ingest + incremental snapshot/features)
2. Real Stage B (beyond proxy)
3. Registry/champion governance
4. Tests + red flags + invalidation
5. Portfolio layer
6. Alt-assets expansion later

Reason:
- This gets to a trustworthy Stocks+ETFs quant engine fastest.
- Alt-assets currently are blocked mostly by v7 pointer coverage, not Quant code.

## 7. What other AIs must not do

Unless explicitly tasked:
- Do not modify Quant private data artifacts under hot/T9 roots.
- Do not rewrite v7 history packs in repo.
- Do not mix UI experiments (Ideas tabs) with Quant pipeline code.
- Do not push large generated artifacts to `main`.

