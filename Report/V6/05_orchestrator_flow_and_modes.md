# 05 Orchestrator Flow and Modes

## Entrypoint + Mode Contract
Evidence:
- `scripts/forecast/v6/run_daily_v6.mjs:1` executable node entrypoint.
- `scripts/forecast/v6/run_daily_v6.mjs:52-65` CLI args (`--date`, `--mode`, `--dry-run`, `--input-dir`).
- `scripts/forecast/v6/run_daily_v6.mjs:70-73` mode default (`CI` only when `GITHUB_ACTIONS=true`, else `LOCAL`).
- `scripts/forecast/v6/run_daily_v6.mjs:479-485` mode invariants (CI forbids vault env; LOCAL requires vault env).

## Mandatory Step Flow Implemented
Evidence:
- Step 1/2 resolve asof and bars manifest: `scripts/forecast/v6/run_daily_v6.mjs:529-573`.
- Step 3 DQ gate with circuit-open degrade: `scripts/forecast/v6/run_daily_v6.mjs:630-648`.
- Step 4 PIT universe reconstruction + fallback handling: `scripts/forecast/v6/run_daily_v6.mjs:650-678`.
- Step 5 regime pre-stage1: `scripts/forecast/v6/run_daily_v6.mjs:680-682`.
- Step 6 candidates + deterministic control sampling: `scripts/forecast/v6/run_daily_v6.mjs:683-704`.
- Step 7 chunked features SSOT write + policy gate: `scripts/forecast/v6/run_daily_v6.mjs:706-732`.
- Step 8 LOCAL inference / CI predictions ledger check: `scripts/forecast/v6/run_daily_v6.mjs:743-799`.
- Step 9 triggers/hotset/watchlist: `scripts/forecast/v6/run_daily_v6.mjs:807-809`.
- Step 10 monitoring: `scripts/forecast/v6/run_daily_v6.mjs:810-820`.
- Step 11 monitoring rollback path: `scripts/forecast/v6/run_daily_v6.mjs:822-833`.
- Step 12 publish atomic contract: `scripts/forecast/v6/run_daily_v6.mjs:906-937`.
- Step 13 last_good + feasibility: `scripts/forecast/v6/run_daily_v6.mjs:939-956`.
- Step 14 outcomes maturation/revisioned stream: `scripts/forecast/v6/run_daily_v6.mjs:958-976`.

## Option A Behavior Evidence
- CI missing predictions triggers degraded success path (`MISSING_PREDICTIONS_OPTION_A`): `scripts/forecast/v6/run_daily_v6.mjs:791-798`.
- Runtime evidence command:
```bash
node scripts/forecast/v6/run_daily_v6.mjs --mode=CI --date=2026-02-06
```
Output excerpt:
```json
{
  "ok": true,
  "degraded": true,
  "reason": "MISSING_PREDICTIONS_OPTION_A",
  "published": { "target_dir": "public/data/forecast/v6/daily/2026-02-06" }
}
```

## Degrade/Fail-Loud Airbag
- Central degrade handler with rollback publish: `scripts/forecast/v6/run_daily_v6.mjs:575-628`.
- last_good publish/restore logic: `scripts/forecast/v6/lib/rollback.mjs:89-212`.
