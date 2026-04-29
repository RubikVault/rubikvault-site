# Recovery State 2026-04-29

## Known Good

- Release run observed green: `20260429T100746Z`
- Preview deploy URL observed: `https://f3eb8d9c.rubikvault-site.pages.dev`
- Production deploy URL observed: `https://497888bc.rubikvault-site.pages.dev`
- Production Page-Core snapshot observed: `page-20260428-89921bb64f3e`
- Production Page-Core active pointer: `/data/page-core/latest.json`
- Production search canaries observed green: `ford -> US:F`, `visa -> US:V`, `tesl -> US:TSLA`
- Production Page-Core canaries observed green: `AAPL`, `BRK-B`, `BRK.B`, `BF-B`, `BF.B`
- Production stock endpoint canaries observed without public `bundle_missing|bundle_stale`: `F`, `V`, `MSFT`, `J`
- Live quote remains disabled by default: `RV_LIVE_QUOTE_ENABLED=false`

## NAS Secret Location

- Cloudflare env file: `/volume1/homes/neoboy/RepoOps/rubikvault-site/secrets/cloudflare.env`
- Required permissions: `0600`
- Do not commit this file or copy token contents into logs.

## Open Recovery Debt

- Hist-probs Tier-B catchup completed with remaining retry debt:
  - Scope: `46729`
  - Skipped: `44783`
  - Newly computed: `169`
  - Errors/remaining: `1374`
- Tiering remains a rescue/degraded mode. Normal target remains full/all-scope or budget-fresh all-scope.
- `HIST_PROBS_MAX_TICKERS` is emergency/canary only.
- `HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS=2` applies only to hist-probs add-on data, never market-data or decision hard gates.

## Release Rules

- Do not manually promote `public/data/page-core/latest.json`.
- Only valid promotion flow:
  1. Build Page-Core candidate.
  2. Run filesystem candidate smoke on NAS.
  3. Build deploy bundle with candidate overlay.
  4. Deploy Cloudflare preview.
  5. Smoke preview deployment URL.
  6. Promote `latest.json`.
  7. Deploy production.
  8. Smoke production.
- NAS automated release must not depend on `127.0.0.1:8788`.
- Local runtime smoke is operator/manual only via explicit opt-in.

## Dirty Tree Rule

- Keep code changes separate from generated data under `public/data`, `mirrors`, `runtime`, and `dist`.
- Do not deploy a dirty mixed tree unless release evidence explicitly records `--allow-dirty` and reason.
