# P0/P1 Hardening — Evidence

## Phase 0: Reality Check

```
Branch: codex/workflow-green-finalizer-v12
HEAD: 86565007
Worktree: Modified pulse.json + untracked audit dirs (expected)
Required commits in history: aeee8a4e, 69daf238, 5e3bb449, 87fe721b
Changed files vs merge-base to origin/main: 39
```

## Phase 1: MarketPhase index.json

**File evidence:**
- Generator: `scripts/ops/build-ops-daily.mjs:327-343` — generates `public/data/marketphase/index.json` from universe when missing
- Runtime fallback: `functions/data/marketphase/[asset].js:84-101` — returns `MARKETPHASE_INDEX_MISSING` envelope

**Local verification:**
```
$ node scripts/ops/build-ops-daily.mjs
build-meta.json written (build_id=unknown-20260211T2119-local)
marketphase/index.json generated (517 symbols)

$ node -e "const d=require('./public/data/marketphase/index.json'); console.log(d.data.symbols.length, d.ok)"
517 true
```

## Phase 2: meta.url Fix

**File evidence:**
- `functions/data/marketphase/[asset].js:61` — url in UNSUPPORTED_MARKETPHASE_PATH
- `functions/data/marketphase/[asset].js:79-81` — url injected on static pass-through
- `functions/data/marketphase/[asset].js:89` — url in MARKETPHASE_INDEX_MISSING
- `functions/data/marketphase/[asset].js:112` — url in MARKETPHASE_SYMBOL_MISSING

## Phase 3: Build_id Cohesion

**SSOT:** `scripts/ops/build-ops-daily.mjs:233-245` writes `public/data/ops/build-meta.json`
**Consumers:**
- `scripts/ops/build-ops-pulse.mjs:76-78` — reads build-meta, prefers its build_id
- `functions/api/mission-control/summary.js:373-382` — async fetch of build-meta.json
- `functions/api/elliott-scanner.js:191-197` — fetchJsonSafe of build-meta.json

**Local verification:**
```
$ node -e "const bm=require('./public/data/ops/build-meta.json'); const p=require('./public/data/ops/pulse.json'); console.log('match:', bm.meta.build_id === p.meta.build_id)"
match: true
```

## Phase 4: Report/A Files

```
$ ls Report/A/
DIFF_SUMMARY.md  EVIDENCE.md  FIX_REPORT.md
```
