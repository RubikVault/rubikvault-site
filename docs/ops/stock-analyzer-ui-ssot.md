Stock Analyzer UI SSOT
======================

This document defines the single source of truth for the `analyze-v4` UI.
Do not bypass these contracts in browser code or endpoint code.

1. Canonical market context
---------------------------

The `analyze-v4` UI must derive decision-critical price and level data from:

- `payload.data.market_prices`
- `payload.data.market_stats`
- `payload.data.bars`
- `payload.data.ssot.market_context`

These nodes are produced by the V2 client adapter in:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-ssot.js`

Rules:

- Key levels must render only when `payload.data.ssot.market_context.key_levels_ready === true`.
- If `key_levels_ready === false`, the UI must suppress the level visualization and show an unavailable/degraded state.
- The UI must not mix a current price from one source with 52W / MA / ATR values from another incoherent source.

2. Historical modules
---------------------

The `Historical Performance` and `Historical signal profile` modules must read only from:

- `payload.data.historical_profile.profile`
- `payload.data.historical_profile.regime`
- `payload.data.historical_profile.availability`

These nodes come from:

- `/api/v2/stocks/{ticker}/historical-profile`

Rules:

- The browser UI must not fetch `/data/hist-probs/*.json` directly.
- Missing profile coverage is a valid product state, not a reason to fall back to a different API contract.
- The UI must distinguish:
  - `ready`
  - `not_generated`
  - `insufficient_history`
  - `pending`

3. Analyze-v4 route contract
----------------------------

The `analyze-v4` page must use the V2 contract as its only decision-critical source.

Rules:

- No V1 fallback for `analyze-v4` decision rendering.
- Missing optional modules must degrade in place rather than switching truth paths.
- Any future endpoint or builder change must preserve parity with this document.

4. Enforcement
--------------

Non-regression coverage must verify:

- canonical market context picks one coherent price basis
- key levels are suppressed on scale/date mismatch
- historical modules use the V2 historical-profile endpoint
- direct `/data/hist-probs/*.json` fetches are not reintroduced into `stock.html`
