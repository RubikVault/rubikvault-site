# 06 Secrecy Scan Evidence

## Policy-Level Rules
Evidence:
- `policies/forecast/v6/secrecy_policy.v6.json:5-13` forbidden extensions include `*.pkl` and weight-like binaries.
- `policies/forecast/v6/secrecy_policy.v6.json:14-19` allowlist exceptions.
- `policies/forecast/v6/secrecy_policy.v6.json:24-25` CI gate + local vault env contract.

## Scanner Implementation
Evidence:
- `scripts/forecast/v6/lib/secrecy_scan.mjs:25-37` scans tracked + untracked files via git file lists.
- `scripts/forecast/v6/lib/secrecy_scan.mjs:39-52` forbid pattern matcher with hard-block for `.pkl`.
- `scripts/forecast/v6/lib/secrecy_scan.mjs:54-95` policy load, decision logic, diagnostics output.
- `scripts/forecast/v6/lib/secrecy_scan.mjs:97-115` CLI exits non-zero on violations.

## Workflow Gate Wiring
Evidence:
- `.github/workflows/forecast-v6-publish.yml:48-49` executes secrecy scan before pipeline publish step.

## Runtime Evidence
Command:
```bash
node scripts/forecast/v6/lib/secrecy_scan.mjs --mode=CI
```
Output:
```text
SECRECY_SCAN_OK: scanned=1254
```

## Supporting Unit Test
Command:
```bash
node --test tests/forecast/v6/unit/secrecy_scan.test.mjs
```
Output excerpt:
```text
✔ secrecy scan returns structured result
```
