# EVIDENCE

Generated: 2026-02-11T18:42:51Z

## Output index (exactly 9 files)

- `audit-run-v9/CONTRACTS.md`
- `audit-run-v9/DECISIONS.csv`
- `audit-run-v9/DEPENDENCIES.md`
- `audit-run-v9/EVIDENCE.md`
- `audit-run-v9/EXEC_SUMMARY.md`
- `audit-run-v9/FIX_PLAN.md`
- `audit-run-v9/INVENTORY.md`
- `audit-run-v9/REALITY.md`
- `audit-run-v9/SECURITY.md`

## No-touch guard (`git status --porcelain=v1`)

### `$ pwd` (rc=0)
```text
/Users/michaelpuchowezki/Dev/rubikvault-site
```

### `$ git rev-parse --show-toplevel` (rc=0)
```text
/Users/michaelpuchowezki/Dev/rubikvault-site
```

### `$ git status --porcelain=v1` (rc=0)
```text
?? RUNBOOK.md
?? audit-evidence/
?? audit-report/
?? audit-run-v8/
?? audit-run-v9/
?? run-audit.sh
?? workflow_ids.txt
```

### `$ git branch --show-current` (rc=0)
```text
codex/p0p1-hardening
```

### `$ git remote -v` (rc=0)
```text
origin	https://github.com/RubikVault/rubikvault-site.git (fetch)
origin	https://github.com/RubikVault/rubikvault-site.git (push)
```

### `$ git log -1 --oneline` (rc=0)
```text
5e3bb449 fix
```

### `$ ls -la .github/workflows | sed -n "1,40p"` (rc=0)
```text
total 232
drwxr-xr-x@ 22 michaelpuchowezki  staff    704 Feb  9 15:46 .
drwxr-xr-x@  4 michaelpuchowezki  staff    128 Jan  7 12:31 ..
-rw-r--r--@  1 michaelpuchowezki  staff   1069 Feb  6 18:01 ci-determinism.yml
-rw-r--r--@  1 michaelpuchowezki  staff  17676 Feb 10 22:14 ci-gates.yml
-rw-r--r--@  1 michaelpuchowezki  staff    551 Feb  5 17:01 ci-policy.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2404 Jan 30 14:05 cleanup-daily-snapshots.yml
-rw-r--r--@  1 michaelpuchowezki  staff    610 Feb  8 20:25 e2e-playwright.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1576 Feb  6 21:58 eod-history-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3254 Feb 10 22:16 eod-latest.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2959 Feb  6 11:49 forecast-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2803 Feb  5 00:38 forecast-monthly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2734 Feb  5 17:01 forecast-rollback.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3798 Feb  5 00:38 forecast-weekly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   7060 Feb 10 22:18 monitor-prod.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2868 Feb  5 17:02 ops-auto-alerts.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3110 Feb 10 22:16 ops-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1171 Jan 30 14:05 refresh-health-assets.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2128 Feb  8 20:12 scheduler-kick.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1347 Feb  6 20:37 universe-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   8871 Feb  8 20:12 v3-finalizer.yml
-rw-r--r--@  1 michaelpuchowezki  staff  10979 Feb  8 20:12 v3-scrape-template.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3543 Feb  8 20:12 wp16-manual-market-prices.yml
```

### `$ gh --version` (rc=0)
```text
gh version 2.86.0 (2026-01-21)
https://github.com/cli/cli/releases/tag/v2.86.0
```

### `$ gh auth status` (rc=0)
```text
github.com
  ✓ Logged in to github.com account RubikVault (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

### `$ rg --version` (rc=0)
```text
ripgrep 15.1.0

features:+pcre2
simd(compile):+NEON
simd(runtime):+NEON

PCRE2 10.45 is available (JIT is available)
```

### `$ jq --version` (rc=0)
```text
jq-1.8.1
```

### `$ node --version` (rc=0)
```text
v25.2.1
```

### `$ npm --version` (rc=0)
```text
11.6.2
```

### `$ command -v yq >/dev/null && yq --version || echo 'MISSING: yq'` (rc=0)
```text
MISSING: yq
```

### `$ command -v actionlint >/dev/null && actionlint -version || echo 'MISSING: actionlint'` (rc=0)
```text
MISSING: actionlint
```

### `$ gh workflow list --all --json name,path,state,id | jq 'length'` (rc=0)
```text
20
```

### `$ gh run list --workflow eod-latest.yml --limit 3 --json databaseId,conclusion,createdAt | jq .` (rc=0)
```text
[
  {
    "conclusion": "success",
    "createdAt": "2026-02-10T22:57:39Z",
    "databaseId": 21885653618
  },
  {
    "conclusion": "failure",
    "createdAt": "2026-02-09T22:54:36Z",
    "databaseId": 21844075239
  },
  {
    "conclusion": "failure",
    "createdAt": "2026-02-08T18:58:48Z",
    "databaseId": 21803567264
  }
]
```

### `$ gh run list --workflow monitor-prod.yml --limit 3 --json databaseId,conclusion,createdAt | jq .` (rc=0)
```text
[
  {
    "conclusion": "failure",
    "createdAt": "2026-02-11T06:55:36Z",
    "databaseId": 21895644780
  },
  {
    "conclusion": "failure",
    "createdAt": "2026-02-10T18:59:53Z",
    "databaseId": 21878443915
  },
  {
    "conclusion": "failure",
    "createdAt": "2026-02-10T06:58:25Z",
    "databaseId": 21854979453
  }
]
```

### `$ curl -sS -H 'cache-control: no-cache' https://rubikvault.com/api/mission-control/summary?debug=1 | jq '{status:.meta.status,reason:.meta.reason,circuitOpen:.meta.circuitOpen}'` (rc=0)
```text
{
  "status": "error",
  "reason": "MARKETPHASE_INDEX_MISSING",
  "circuitOpen": null
}
```

### `$ curl -sS -H 'cache-control: no-cache' https://rubikvault.com/api/elliott-scanner | jq '{count:.meta.count,status:.meta.status,universeMode:.meta.universeMode}'` (rc=0)
```text
{
  "count": 517,
  "status": "fresh",
  "universeMode": null
}
```

### `$ curl -sS -I https://rubikvault.com/data/marketphase/index.json | sed -n '1,15p'` (rc=0)
```text
HTTP/2 404 
date: Wed, 11 Feb 2026 18:42:58 GMT
content-type: text/html; charset=utf-8
access-control-allow-origin: *
cache-control: no-store
referrer-policy: strict-origin-when-cross-origin
x-content-type-options: nosniff
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=Ph2gnF%2ByWHNJEeQ%2Fkq3FHY3DMowE77%2BI8TCf8mDwBEZY57aQ5dTObQgo0eU0j3%2FKWFW9Z8O94GcDpG9ZcstoyDru9%2FS6F27QSPDjfPQLAUG13Mi0EDfRYkXF"}]}
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
server: cloudflare
cf-cache-status: DYNAMIC
cf-ray: 9cc5fd3a2eab293c-LHR
alt-svc: h3=":443"; ma=86400

```

### `$ find audit-run-v9 -maxdepth 1 -type f | wc -l` (rc=0)
```text
       9
```

### `$ ls -1 audit-run-v9 | sort` (rc=0)
```text
CONTRACTS.md
DECISIONS.csv
DEPENDENCIES.md
EVIDENCE.md
EXEC_SUMMARY.md
FIX_PLAN.md
INVENTORY.md
REALITY.md
SECURITY.md
```

## Embedded runner script (documentation only; no extra file written)
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="audit-run-v9"
mkdir -p "$ROOT"
# 1) inventory from .github/workflows/*.yml
# 2) run-health from gh run list --limit 30 per workflow
# 3) signature extraction from gh run view <id> --log (strict patterns)
# 4) dependency scan (upload/download-artifact + script read refs)
# 5) contract probes (mission-control, elliott-scanner, marketphase)
# 6) security scan (mutable actions, permissions, concurrency, secrets)
# 7) decisions + fix plan + exec summary
echo "Embedded procedure documented; see existing audit-run-v9/*.md for outputs"
```