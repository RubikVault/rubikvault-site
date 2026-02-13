# Durable WAF Solution (Implemented)

## Problem evidence
- `Scheduler Kick` old behavior posted to public endpoint and hit Cloudflare challenge.
- Evidence: run `21919890642` showed `HTTP 403` + `<!DOCTYPE html><title>Just a moment...</title>` while calling `/api/scheduler/run`.
- `Monitor Production Artifacts` old behavior failed on 403 curl endpoint checks.
- Evidence: run `21918758188` -> `curl: (22) ... 403`.

## Implemented architecture (Option B, GitHub-native)
1. Scheduler no longer calls public website endpoints.
- `.github/workflows/scheduler-kick.yml:46-111`
- Uses `gh workflow run` with `GITHUB_TOKEN` to dispatch downstream workflows.

2. Monitor defaults to WAF-safe local contract verification.
- `.github/workflows/monitor-prod.yml:21-47`
- Runs `scripts/ci/verify-artifacts.mjs` + mission-control gate on committed artifacts.

3. Remote probes are optional and auth-aware only.
- `.github/workflows/monitor-prod.yml:48-145`
- Enabled only via `vars.RV_MONITOR_REMOTE=1` or manual input.
- Supports `X-Admin-Token` header and strict JSON assertions.

## Verification evidence
- `scheduler-kick` success: run `21921261343`.
- `monitor-prod` success: run `21921263170`.

## External checklist (if remote probes must be always-on)
1. Set `RV_MONITOR_REMOTE=1` (repo variable).
2. Set `RV_ADMIN_TOKEN` (repo secret) for protected probes.
3. Re-run `monitor-prod.yml` and confirm remote block passes JSON/content-type checks.
