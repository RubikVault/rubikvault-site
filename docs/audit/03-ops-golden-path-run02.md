# OPS Golden Path (run02)

## Entry → Summary
1. **OPS entrypoint**: `/ops/` loads `public/ops/index.html`, which fetches `/api/mission-control/summary` on load.
   - Evidence: `public/ops/index.html:1082-1097`

2. **Summary handler**: `/api/mission-control/summary` is built in `functions/api/mission-control/summary.js` and returns the envelope with `data.truthChains` and `data.pipeline`.
   - Evidence: `functions/api/mission-control/summary.js:1600-1656` (truthChains, pipeline counts)

## Summary reads (static artifacts)
3. **Pipeline artifacts**: summary reads pipeline stage files and latest counts from `/data/pipeline/*` using `fetchAssetJson`.
   - Evidence: `functions/api/mission-control/summary.js:1201-1215`

4. **Market-prices snapshot**: summary reads `/data/snapshots/market-prices/latest.json` and validates it.
   - Evidence: `functions/api/mission-control/summary.js:1327-1333`

## Summary builds truth chains
5. **Price truth chain**: summary builds `priceTruth` using `marketPricesSnapshot` and `apiSamples` and attaches to `data.truthChains.prices`.
   - Evidence: `functions/api/mission-control/summary.js:1339-1345`, `1639-1642`

6. **Indicators/pipeline truth chain**: summary builds `truthChainNasdaq100` from pipeline artifacts and attaches to `data.truthChains.indicators`.
   - Evidence: `functions/api/mission-control/summary.js:1451-1464`, `1639-1642`

## OPS UI renders summary
7. **Truth chains render**: OPS UI renders `data.truthChains.prices` and `data.truthChains.indicators`.
   - Evidence: `public/ops/index.html:742-744`

8. **Pipeline counts table**: OPS UI renders pipeline counts from `data.pipeline.counts`.
   - Evidence: `public/ops/index.html:686-709`

## Resulting OPS Golden Path
`/ops/` → `/api/mission-control/summary` → read `/data/pipeline/*` + `/data/snapshots/market-prices/latest.json` → build truthChains → render in OPS UI.

All steps above are evidenced by file/line references listed per step.
