# P0/P1 Hardening — Evidence Bundle (v2)

**Preview**: `https://a1ab9e1c.rubikvault-site.pages.dev`
**Prod**: `https://rubikvault.com`
**Main HEAD**: `7a67d63d`

## Phase 0: Reality Check

```
Branch: main (after merge)
HEAD: 7a67d63d (merge of codex/workflow-green-finalizer-v12)
origin/main: 7a67d63d
is-ancestor: 0 (HEAD IS ancestor of origin/main)
Worktree: clean (tracked)
```

## Phase 2: Root Cause Proof

```
$ git grep -n "build-meta.json" origin/main~1 -- scripts/ops
(no results — code did not exist in origin/main before merge)

$ git grep -n "marketphase/index.json" origin/main~1 -- scripts/ops
origin/main~1:scripts/ops/build-ops-daily.mjs:315:  const marketphaseIndex = await readJson(...)
(reads only, no generation logic)
```

**Conclusion**: Prod was old because fix branch was not merged into main.

## Deployed Evidence

### PROD build-meta.json (Issue #1)
```
$ curl -fsS https://rubikvault.com/data/ops/build-meta.json
{
  "meta": {
    "build_id": "89855798-20260211T2145-local",
    "commit": "89855798c96ad95505495bd83ffbd52d75e13f30",
    "generatedAt": "2026-02-11T21:45:25.227Z"
  },
  "data": {
    "build_id": "89855798-20260211T2145-local",
    "commit": "89855798c96ad95505495bd83ffbd52d75e13f30",
    "deploy_target": "local"
  }
}
```

### PROD marketphase index.json (Issue #2)
```
$ curl -fsSI https://rubikvault.com/data/marketphase/index.json
HTTP/2 200
content-type: application/json

ok: True symbols: 517
```

### PROD marketphase missing asset meta.url (Issue #2b)
```
$ curl -fsS https://rubikvault.com/data/marketphase/does-not-exist.json | python3 -c "..."
meta.url: /data/marketphase/does-not-exist.json
ok: False
```

### PROD elliott meta contract (Issue #3A)
```
mode: full
universeSource: /data/universe/all.json
universeCount: 517
buildId: 89855798-20260211T2145-local
ALL_PRESENT: True
```

### PROD MC meta contract (Issue #3B)
```
build_id: 89855798-20260211T2145-local
commit: 89855798c96ad95505495bd83ffbd52d75e13f30
BUILD_ID_PRESENT: True
```

### PROD cohesion
```
MC:      89855798-20260211T2145-local
Elliott: 89855798-20260211T2145-local
Pulse:   89855798-20260211T2145-local
COHESION: PASS
```

### PREVIEW cohesion
```
MC:      unknown-20260211T2119-local
Elliott: unknown-20260211T2119-local
Pulse:   unknown-20260211T2119-local
COHESION: PASS
```

## GATES TABLE

| Gate | Local | Preview | Prod |
|---|---|---|---|
| `build-meta.json` 200 JSON | ✅ PASS | ✅ PASS | ✅ PASS |
| `build-meta` meta.build_id present | ✅ PASS | ✅ PASS | ✅ PASS |
| `build-meta` meta.commit non-null | ✅ PASS | ❌ null* | ✅ PASS |
| `marketphase/index.json` 200 JSON | ✅ PASS | ✅ PASS | ✅ PASS |
| `marketphase/index.json` ok:true + symbols>100 | ✅ PASS (517) | ✅ PASS (517) | ✅ PASS (517) |
| Missing asset `meta.url` present | ✅ (code) | ✅ PASS | ✅ PASS |
| Elliott `meta.mode` present | ✅ (code) | ✅ PASS | ✅ PASS |
| Elliott `meta.universeSource` present | ✅ (code) | ✅ PASS | ✅ PASS |
| Elliott `meta.universeCount` present | ✅ (code) | ✅ PASS | ✅ PASS |
| MC `meta.build_id` present (string) | ✅ PASS | ✅ PASS | ✅ PASS |
| Cohesion (MC=Elliott=Pulse build_id) | ✅ PASS | ✅ PASS | ✅ PASS |
| `verify-artifacts.mjs` | ✅ PASS | — | — |
| `assert-mission-control-gate.mjs` | ✅ PASS | — | — |

*Preview `build-meta` commit=null because Preview deployed from an earlier commit before the git-fallback fix. Next deploy will fix this.
