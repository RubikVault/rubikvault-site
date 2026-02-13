# Human Diff Summary (Key Hunks)

## Commit chain applied in this recovery
- `47d258ac` WAF-safe scheduler/monitor redesign.
- `5e833c23` EOD provider-chain + never-empty fallback.
- `72c9e1b6` writer guards + v3 registry fallback.
- `01af4914` manual scheduler dispatch allowance.
- `727763b3` checkout before `gh workflow run`.
- `e07df9db` tolerate per-symbol stooq gaps.
- `67952496` scope eod/ops concurrency by ref.
- `3291541c` v3/wp16 stooq mode fallback for missing key paths.
- `948752bb` reduced stooq retry budget.
- `4112fe9a` added per-ref concurrency/permissions on writers.
- `937466c3` market-stats fallback module/universe paths.
- `f79d64e8` v3 market-stats stage now reuses scrape artifact.
- `363924be` attempted eodhd-forced mode (rolled forward by later commit).
- `87fe721b` provider mode normalized to supported stooq mode for v3/wp16.

## Files changed (v11 scope)
- Workflows:
  - `.github/workflows/scheduler-kick.yml` (`46-111`) dispatch logic moved to GitHub-native.
  - `.github/workflows/monitor-prod.yml` (`21-47`, `48-145`) WAF-safe default + optional remote probe.
  - `.github/workflows/eod-latest.yml` (`58-89`) typo-safe token export + diagnostics + build.
  - `.github/workflows/forecast-daily.yml` (`14-20`) permissions/concurrency.
  - `.github/workflows/forecast-weekly.yml` (`14-20`) permissions/concurrency.
  - `.github/workflows/forecast-monthly.yml` (`21-26`) explicit writer permissions + concurrency.
  - `.github/workflows/refresh-health-assets.yml` (`8-10`) concurrency.
  - `.github/workflows/universe-refresh.yml` (`11-13`) concurrency.
  - `.github/workflows/v3-scrape-template.yml` (`14-16`, `132-149`, `246-263`) concurrency + provider mode + artifact reuse.
  - `.github/workflows/wp16-manual-market-prices.yml` (`31-38`) provider mode controls.
  - `.github/workflows/v3-finalizer.yml` guard/yaml correction already included in prior v11 commits.
- Scripts:
  - `scripts/eod/build-eod-latest.mjs` (`190-212`, `307-353`, `518-526`) EODHD fetch + previous last_good path + provider-empty handling.
  - `scripts/ops/preflight-check.mjs` (`57-76`, `85-91`, `117-123`) fail-loud policy for eod/ops.
  - `scripts/providers/market-prices-v3.mjs` (`197-206`, `258-261`) reduced retry budget; stooq loop speedup.
  - `scripts/providers/market-stats-v3.mjs` (`53-56`, `78-99`, `104-127`) fallback registry/universe + source snapshot selection.
  - `scripts/aggregator/finalize.mjs` (`237-241`) explicit validation failure path retained as hard gate.
  - `scripts/refresh-health-assets.mjs` seed-manifest fallback path (prior v11 commit chain).
