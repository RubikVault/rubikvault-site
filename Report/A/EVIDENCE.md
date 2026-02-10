# Evidence Log

## 1) Repo Reality (UTC)
Command:
```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -5 --oneline
git status --short
```
Output excerpt:
```text
2026-02-10T21:18:53Z
/Users/michaelpuchowezki/Dev/rubikvault-site
codex/p0p1-hardening
166a15246fc75b11da12b0f8504ef8fb77a01229
166a1524 Merge branch 'fix/hardening-never-empty-deploy'
7fd10421 feat: Enhance Stock Analyzer chart and fix autocomplete
...
 M .github/workflows/ci-gates.yml
 M .github/workflows/eod-latest.yml
 M .github/workflows/monitor-prod.yml
 M .github/workflows/ops-daily.yml
 M functions/api/elliott-scanner.js
 M functions/api/mission-control/summary.js
 M public/index.html
 ?? public/data/ops/pulse.json
```

## 2) Baseline Deployed Symptoms (no-cache)
Command:
```bash
curl -sS -H 'cache-control: no-cache' https://rubikvault.com/api/elliott-scanner | jq '.meta'
curl -sS -H 'cache-control: no-cache' 'https://rubikvault.com/api/mission-control/summary?debug=1' | jq '.meta'
curl -i -H 'cache-control: no-cache' https://rubikvault.com/data/marketphase/index.json | sed -n '1,18p'

curl -sS -H 'cache-control: no-cache' https://6f493b24.rubikvault-site.pages.dev/api/elliott-scanner | jq '.meta'
curl -sS -H 'cache-control: no-cache' 'https://6f493b24.rubikvault-site.pages.dev/api/mission-control/summary?debug=1' | jq '.meta'
curl -i -H 'cache-control: no-cache' https://6f493b24.rubikvault-site.pages.dev/data/marketphase/index.json | sed -n '1,18p'
```
Output excerpt:
```text
PROD elliott meta: count=517 status=fresh
PROD mission-control meta: status=error reason=EOD_BATCH_MISSING
PROD /data/marketphase/index.json: HTTP/2 404, content-type: text/html

PREVIEW elliott meta: count=517 status=fresh
PREVIEW mission-control meta: status=error reason=EOD_BATCH_MISSING
PREVIEW /data/marketphase/index.json: HTTP/2 404, content-type: text/html
```

## 3) Code Evidence (file+line)

### Mission-control severity split + circuit/meta build markers
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:13`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:99`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:311`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:332`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:370`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:2210`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:2252`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:2323`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/mission-control/summary.js:2382`

### Elliott contract + universe parity policy
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/elliott-scanner.js:12`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/elliott-scanner.js:73`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/elliott-scanner.js:107`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/elliott-scanner.js:248`

### Marketphase JSON fallback route
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/data/marketphase/[asset].js:49`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/data/marketphase/[asset].js:80`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/data/marketphase/[asset].js:104`

### Preflight + pulse
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/ops/preflight-check.mjs:54`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/ops/preflight-check.mjs:97`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/ops/build-ops-pulse.mjs:72`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/ops/pulse.json:1`

### CI + monitor gates
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/eod-latest.yml:58`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/eod-latest.yml:88`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/ops-daily.yml:51`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/ops-daily.yml:84`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/ci-gates.yml:123`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/ci-gates.yml:126`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/monitor-prod.yml:39`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/.github/workflows/monitor-prod.yml:104`

## 4) Verification Commands + Results

### Workflow YAML parse
Command:
```bash
ruby -e 'require "yaml"; Dir[".github/workflows/*.{yml,yaml}"].sort.each{|f| YAML.load_file(f)}; puts "YAML OK"'
```
Output:
```text
YAML OK
```

### Syntax checks
Commands:
```bash
node --check 'functions/data/marketphase/[asset].js'
node --check scripts/ops/preflight-check.mjs
node --check scripts/ops/build-ops-pulse.mjs
node --check scripts/ci/assert-mission-control-gate.mjs
node --check scripts/ci/check-elliott-parity.mjs
npx --yes node@20 --check functions/api/elliott-scanner.js
npx --yes node@20 --check functions/api/mission-control/summary.js
```
Output excerpt:
```text
node@20 checks passed (only deprecation warning for import assertions in worker files).
```

### Artifact semantic check
Command:
```bash
node scripts/ci/verify-artifacts.mjs
```
Output excerpt:
```text
✅ market-prices snapshot
✅ forecast latest
✅ forecast status
✅ Critical artifact semantic checks passed.
```

### Unit tests
Commands:
```bash
npm run test:drop-threshold
npm run test:fetch-retry
```
Output excerpt:
```text
DROP THRESHOLD: Passed 12, Failed 0
FETCH RETRY: Passed 10, Failed 0
```

### Preflight behavior (fail-loud + pass)
Commands:
```bash
node scripts/ops/preflight-check.mjs --mode eod-latest
TIINGO_API_KEY=dummy RV_UNIVERSE=nasdaq100 node scripts/ops/preflight-check.mjs --mode eod-latest
CF_ACCOUNT_ID=dummy CF_API_TOKEN=dummy node scripts/ops/preflight-check.mjs --mode ops-daily
```
Output excerpt:
```text
BLOCKING NO_API_KEY...
BLOCKING INVALID_CONFIG...
Preflight failed with blocking errors.

OK: preflight passed
OK: preflight passed
```

### Mission-control gate behavior
Commands:
```bash
node scripts/ci/assert-mission-control-gate.mjs
MC_GATE_STRICT=1 node scripts/ci/assert-mission-control-gate.mjs
```
Output excerpt:
```text
(non-strict) ::warning:: blocking findings detected (NO_API_KEY)
(strict) Mission-control blocking gate failed ...
```

### Known pre-existing failing check (not introduced here)
Command:
```bash
bash scripts/ops/validate-truth.sh
```
Output excerpt:
```text
FAIL: pipeline stage fetched schema invalid at public/data/pipeline/nasdaq100.fetched.json
```

## 5) Policies Added
- `/Users/michaelpuchowezki/Dev/rubikvault-site/policies/universe-policy.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/policies/cohesion-policy.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/policies/mission-control-severity.json`

## 6) Contract Doc Added
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/ops/P0_P1_HARDENING_CONTRACTS.md`
