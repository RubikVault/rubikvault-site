# Worker Budget: Stock Analyzer Page Core

`/api/v2/page/:ticker` is a thin read path. It may read:

- `public/data/page-core/latest.json`
- one `alias-shards/*.json.gz`
- one `page-shards/*.json.gz`

It must not do runtime aggregation.

## Banned In Page Worker

- Provider calls
- `forecast/latest.json`
- `decision-input-assembly.js`
- `stock-insights-v4.js`
- indicator computation
- linear scans over global arrays
- punctuation fallback resolution
- global decision index loads

If a field needs compute or joins, build it in `scripts/ops/build-page-core-bundle.mjs` during NAS pipeline execution.
