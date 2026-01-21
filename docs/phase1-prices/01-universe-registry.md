# Phase 1 Prices — Universe Registry (v1)

This introduces:
- `public/data/registry/universe.v1.json` (what symbols exist)
- `public/data/registry/providers.v1.json` (provider chain stub)
- `public/data/registry/params_registry.v1.json` (placeholder for later phases)
- Validator: `scripts/validate/universe-registry.v1.mjs`
- CI hook: `npm run test:universe-registry`

Next step (WP2): implement EOD price fetcher for index proxies first (SPY/QQQ/DIA/IWM), producing artifacts for the finalizer.
