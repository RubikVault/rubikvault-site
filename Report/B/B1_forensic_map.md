# B1 Forensic Map — v2.1 Lawbook Audit

## Repo Reality Check

| Item | Value |
|------|-------|
| Root | `/Users/michaelpuchowezki/Dev/rubikvault-site` |
| Branch | `main` |
| Commit | `674bdfe` (v2.1: add canonical data.system root) |
| Status | Clean |

---

## Truth Map (SSOT Wiring)

| UI Component | Endpoint/File | JSON Path Consumed | Producer Code | Canonical? | Notes |
|--------------|---------------|-------------------|---------------|------------|-------|
| ops/index.html | `/api/mission-control/summary` | `data.health.system` | summary.js:1869 | ✅ Yes | Primary Ops UI |
| ops/index.html | `/api/mission-control/summary` | `data.health.prices` | summary.js:2063 | ✅ Yes | |
| ops/index.html | `/api/mission-control/summary` | `data.ssot.core.*` | summary.js:2187 | ✅ Yes | |
| mission-control/*.html | `/api/mission-control/summary` | Same as ops | summary.js | ✅ Yes | Shares endpoint |
| internal/health/index.html | `/api/health` | `data.system.critical_ok` | Different endpoint | N/A | Different API |
| **status.json** | `/data/status.json` | (not consumed by UI) | Build artifact | ❌ Input only | Used by summary.js as build-status input |

### Key Finding: SSOT Consistency ✅
- **Ops UI reads exclusively from `/api/mission-control/summary`** (evidence: ops/index.html:1186, 1292)
- **`status.json` is NOT a UI data source** — it's a pipeline build artifact read by summary.js as input
- **No UI-side recomputation** of system verdict

---

## Policy Enforcement Matrix

| Policy File | Exists? | Validated? | CI Enforced? | Priority | Action |
|-------------|---------|------------|--------------|----------|--------|
| ops_health.json | ✅ | ❌ | ❌ | P1 | Add JSON schema validation |
| canonical_json.json | ❌ | - | - | P2 | Optional per v2.1 |
| hashing.json | ❌ | - | - | P2 | Optional |
| markets.json | ❌ | - | - | P2 | Optional |
| ssot.json | ❌ | - | - | P2 | Optional |
| budgets.json | ❌ | - | - | P2 | Optional |
| circuit.json | ❌ | - | - | P2 | Optional |
| emergency.json | ❌ | - | - | P2 | Optional |
| visibility.json | ❌ | - | - | P2 | Optional |
| retention.json | ❌ | - | - | P2 | Optional |
| deploy.json | ❌ | - | - | P2 | Optional |
| concurrency.json | ❌ | - | - | P2 | Optional |
| licensing.json | ❌ | - | - | P2 | Optional |
| status_layout.json | ❌ | - | - | P2 | Optional |
| pointers.json | ❌ | - | - | P2 | Optional |

**Verdict**: Only `ops_health.json` exists. Per v2.1, other policies are **optional future artifacts**.

---

## Runtime Verification Results

```
=== MISSION-CONTROL/SUMMARY ===
ok: True
meta.status: fresh

data.system exists: True
data.health.system exists: True
data.cards.system exists: True

data.system.status: STALE
data.system.reason: PENDING

HASH COMPARISON:
  data.system hash: ea8b32d7a741b152
  data.health.system hash: ea8b32d7a741b152
  data.cards.system hash: ea8b32d7a741b152

BIT-IDENTICAL: True
```

```
=== STOCK CONTRACT ===
ok: True
meta.status: fresh
latest_bar.date: 2026-02-04
latest_bar.close: 73.92
latest_bar.volume: 62829558
CONTRACT: PASS
```

---

## P0/P1/P2 Findings

### P0 — Contract Blockers
| ID | Issue | Status |
|----|-------|--------|
| P0-1 | data.system missing | ✅ FIXED (commit 674bdfe) |
| P0-2 | Aliases not bit-identical | ✅ VERIFIED (hash match) |
| P0-3 | TDZ bug (freshnessHealth) | ✅ FIXED (commit 7b21b74) |

### P1 — Should Fix
| ID | Issue | Evidence | Recommendation |
|----|-------|----------|----------------|
| P1-1 | `meta.ok` always null | Probe shows `ok: True` at top-level, `meta.ok` undefined | Document as optional OR implement |
| P1-2 | policy validation missing | Only 1 of 15 policy files exists | Add JSON schema for ops_health.json |

### P2 — Nice to Have
| ID | Issue | Recommendation |
|----|-------|----------------|
| P2-1 | status.json role unclear in docs | Document as "build artifact input" not "canonical SSOT" |
| P2-2 | Missing policy stubs | Create when needed, mark optional in v2.1 |

---

## TERMINAL VERIFY (zsh-safe)

```zsh
#!/bin/zsh
set -e

echo "=== GIT STATUS ==="
git status --porcelain || true

echo ""
echo "=== MISSION-CONTROL SUMMARY ==="
curl -sS 'http://127.0.0.1:8788/api/mission-control/summary' | python3 -c '
import sys,json,hashlib
o=json.load(sys.stdin)
d=o.get("data") or {}
sys_obj = d.get("system")
health_sys = (d.get("health") or {}).get("system")
cards_sys = (d.get("cards") or {}).get("system")
def h(x): return hashlib.sha256(json.dumps(x,sort_keys=True).encode()).hexdigest()[:16] if x else None
print(f"data.system: {\"PRESENT\" if sys_obj else \"MISSING\"}")
print(f"data.system.status: {sys_obj.get(\"status\") if sys_obj else None}")
print(f"BIT-IDENTICAL: {sys_obj == health_sys == cards_sys}")
print(f"HASH: {h(sys_obj)}")
'

echo ""
echo "=== STOCK CONTRACT ==="
curl -sS 'http://127.0.0.1:8788/api/stock?ticker=UBER' | python3 -c '
import sys,json
o=json.load(sys.stdin)
lb = (o.get("data") or {}).get("latest_bar") or {}
print(f"latest_bar.date: {lb.get(\"date\")}")
print(f"CONTRACT: {\"PASS\" if lb.get(\"date\") and lb.get(\"close\") else \"FAIL\"}")
'

echo ""
echo "=== COMPLETE ==="
```
