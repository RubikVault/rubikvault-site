# Historical Insights Runbook

Purpose: publish compact per-asset historical pattern rules for Stock Analyzer without adding a heavy NAS nightly research job.

## Monthly Mac Projection

Run on Mac after `Historical-Analyses` refresh:

```bash
node scripts/historical-insights/build-projection-from-parquet.mjs \
  --source-root=/Users/michaelpuchowezki/Desktop/Historical-Analyses
```

Output:

- `public/data/historical-insights/latest.json`
- `public/data/historical-insights/shards/*.json`

Public artifacts do not contain local paths. Shards are split by exchange and first ticker character to keep browser fetches small.

## UI Contract

Stock Analyzer reads the matching shard for the current canonical asset id and renders:

- active matching rules first
- stable historical rules second
- win rate, average return, sample size, entry condition, exit rule

Display gates:

- `sample_size >= 30`
- `win_rate > 0.50`
- highlighted when `win_rate >= 0.55`
- positive average return required

Missing projection is a typed unavailable state, not a green substitute.

## Production Rule

Do not run the full research audit in the NAS nightly pipeline. NAS may run a lightweight matcher later, but research generation belongs to the monthly Mac projection unless runtime proof shows it is safe.
