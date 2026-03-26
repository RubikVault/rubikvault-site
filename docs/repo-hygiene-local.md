# Local Repo Hygiene

This repository keeps generated data and scratch files out of Git, but leaves ship-ready code visible in `git status`.

## Skip-worktree policy

Use `skip-worktree` only for generated tracked data files that change locally as part of learning, forecast, or budget runs.

Do not use `skip-worktree` for:

- `functions/api/**`
- `scripts/forecast/*.mjs`
- `scripts/learning/*.mjs`
- `scripts/runblock/*.mjs`
- `config/**`
- `tests/**`

## Current generated tracked files to hide locally

```bash
git update-index --skip-worktree \
  mirrors/learning/calibration/elliott.json \
  mirrors/learning/calibration/scientific.json \
  mirrors/learning/outcomes/forecast/2026/03/2026-03-20.ndjson \
  mirrors/learning/predictions/elliott/2026/03/2026-03-20.ndjson \
  mirrors/learning/predictions/forecast/2026/03/2026-03-20.ndjson \
  mirrors/learning/reports/2026-03-20.json \
  policies/universe/identity_bridge.json.gz \
  public/dashboard_v6_meta_data.json \
  public/data/hist-probs/AAPL.json \
  public/data/hist-probs/regime-daily.json \
  public/data/hist-probs/run-summary.json \
  public/data/v3/system/budget-ledger.json
```

## Undo skip-worktree

```bash
git update-index --no-skip-worktree <path>
```

## Inspect active skip-worktree entries

```bash
git ls-files -v | grep '^S'
```
