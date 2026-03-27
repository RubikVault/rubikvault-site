# Stock Analyzer UI Hardening Plan

## Scope

This plan validates the reported QCOM/UI criticism against the current repo and turns the valid items into an implementation-ready hardening sequence for all stocks and ETFs.

## Validity Assessment

| ID | Point | Status | Why |
|---|---|---|---|
| 1 | Risk score vs final risk state | Valid | `Signal Quality` renders `_decision.scores.risk` in a way that visually reads like a positive score while the separate risk panel renders a final moderated state. |
| 2 | Risk override semantics | Valid | `riskLabel` is derived from state plus volatility-percentile override, but the panel still splits meaning across label, regime copy, fragments, and warning icon. |
| 3 | Executive Decision redundancy | Valid | Wait subtype, confidence, flags, report metadata, and rationale are spread across multiple surfaces and repeated in governance pills. |
| 4 | Catalysts low-value fallback | Valid | The card still occupies full module footprint even when it only shows low-information fallback text. |
| 5 | Historical regime looks too current | Valid | Regime pills still read as live semantic signals because stale state is not visually degraded enough. |
| 6 | `RSI remains negative` wording | Not currently active | That wording is not present in current repo code. |
| 7 | Company name missing in header | Valid on active V2 path | `stock.html` prefers V2, but `transformV2ToStockShape()` drops `name`, so the main decision header can fall back to ticker-only. |
| 8 | Catalysts + Historical blocks honest but not high-quality | Valid | The modules are more truthful than before but still not consistently high-value. |
| 9 | Trade-plan null safety | Valid | Guard logic exists, but the UI does not consume it before rendering BUY/SELL trade-plan fields. |
| 10 | Key-level feed asynchrony safety | Valid | `close` can come from `market_prices`, levels come from bars/derived stats, and there is no canonical page-level ownership before render. |
| 11 | Tooltip stability | Valid | Tooltip uses `position:fixed` with raw `clientX/clientY`; there is no clamping or container-aware positioning. |

## Extra Repo-Level Finding

The biggest structural issue is V2 page parity.

- `public/stock.html` first attempts `/api/v2/stocks/[ticker]/summary`.
- `public/js/rv-v2-client.js` maps only ticker, one latest bar, market prices/stats, change, states, decision, explanation.
- This drops `name` and leaves the page exposed to thin-payload rendering.

This remains P0, but it is not the first implementation step because visible UX contradictions should be fixed first.

## Target Architecture

Use one stock-page presentation contract, not ad-hoc DOM derivations.

- Add one pure builder module for stock-page presentation data.
- Feed it normalized input contracts only.
- Let `stock.html` render contract fields, not recompute semantics inline.
- Make V1 and V2 paths produce the same presentation contract.
- Separate raw analytics from display semantics:
  - `risk_score_raw`
  - `risk_state_final`
  - `risk_override_reason`
  - `risk_regime_label`
  - `risk_explanation`
- Add explicit freshness and provenance to every optional module:
  - `status`
  - `as_of`
  - `staleness_days`
  - `degraded`
  - `fallback_kind`
- Define canonical page truth sources:
  - `page_close`
  - `page_as_of`

## Implementation Sequence

### P-1: Immediate Visual UX Cleanup

Goal:
Stop the visible UX bleeding before architecture refactors.
Do not do broad refactors here.
Only targeted frontend logic and rendering cleanup.

#### P-1.1 Risk Score vs Final Risk State Synchronization

This is a visible release-blocking UX contradiction.

Current issue:
`Signal Quality` shows `_decision.scores.risk` in a way that visually implies “better/safer” while the separate risk panel shows a moderated or elevated final risk state.

Required plan change:
This workstream has two layers:

- immediate visible cleanup here
- later durable semantic contract in P2

Immediate implementation:

- Audit every user-facing field currently labeled `Risk`.
- If a higher numeric value means safer or stronger structure, rename the UI label from `Risk` to `Risk Quality` or `Stability`.
- If the field remains `Risk`, align score direction and coloring with final risk severity.
- Add direct adjacent explanation when override is active.
- Remove reliance on contradictory color cues to communicate nuance.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-data-guard.js`

Acceptance:

- No field labeled `Risk` may visually imply the opposite of the final risk state.
- If a higher numeric value means safer or stronger structure, the UI label is `Risk Quality` or `Stability`.
- If the field remains `Risk`, score direction and coloring align with final risk severity.
- No green or high-looking score may sit next to `Elevated` or `High` final risk without an explicit direct explanation adjacent to it.
- The explanation is human-readable, not just a warning icon.
- If override is active, the page does not rely on color contradiction to communicate nuance.

#### P-1.2 Executive Decision Dedupe

This is a measurable cleanup, not a vague polish task.

Primary-owner rule:
The 6-field executive grid becomes the primary owner of decision metadata.

The following fields may appear prominently at most once in the Executive Decision card:

- as-of
- confidence
- flags
- verdict / wait subtype
- reason / rationale

Governance row rule:
The governance row may contain only non-duplicating process/runtime metadata, for example:

- mode
- drivers
- runtime/system flags
- report date only if not already shown prominently elsewhere

Explicit removals:

- duplicated `As-of`
- duplicated `Confidence`
- duplicated `Flags`
- duplicated `Reason/Rationale`
- duplicated `Wait` / `NO EDGE`

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Acceptance:

- No repeated `As-of`, `Conf`, `Flags`, `Wait`, or `Reason` in the same executive card.
- The grid is the single primary decision surface.
- The governance row is secondary and audit-oriented only.

#### P-1.3 Catalyst Empty-State Collapse

This is a visible UX and value-density issue and must be treated as immediate cleanup.

Required plan change:
A full-size catalyst card must not remain on screen when it contains no meaningful information.

Immediate UI behavior:

1. confirmed catalyst(s) -> full card
2. estimated earnings window available -> compact informative card or row
3. no meaningful catalyst data -> slim inline status row, not a full-height card

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/fundamentals.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/fundamentals-eodhd.mjs`

Acceptance:

- Empty or near-empty catalyst cards disappear.
- If `nextEarningsDate` exists, the UI shows an estimated earnings window.
- If no meaningful data exists, the catalyst area collapses to a compact status row.
- Stocks and ETFs do not share fake earnings-style fallback copy.

#### P-1.4 Historical Regime Stale Visual Degradation

This is already a visible fast-scan UX problem and must be treated as immediate cleanup.

Stale presentation rules:

- If regime age is greater than 2 business days:
  - reduce opacity of regime pills to `<= 0.6`
  - reduce semantic saturation and mute colors
  - show a visible `STALE` or `DELAYED` badge next to the regime strip
  - show age in days inline without requiring hover

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/style.css`

Acceptance:

- A fast scan cannot mistake stale regime pills for live signals.
- Age is visible without hovering.
- Stale status is visible from color, opacity, and badge alone, not only from subtitle text.

### P0: Establish Data Truth and V2 Page Parity

Goal:
Eliminate silent partial-data rendering after visible UX contradictions are cleaned up.

Required implementation:

- Replace the current V2 shortcut in `public/stock.html` with one of two safe modes:
  - preferred: load summary + historical + governance V2 endpoints and merge them
  - safe fallback: if the minimum full-page contract is unavailable, hard-fallback to V1
- Define canonical `page_close`.
- Define canonical `page_as_of`.
- Ensure every page-level price, level, and recency calculation reuses the same canonical ownership.
- Extend `public/js/rv-v2-client.js` to preserve `name` and all identity and freshness fields required by the page.
- Add a parity guard so a thin one-bar V2 payload never renders as a full stock dashboard.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/data-interface.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/v2/stocks/[ticker]/summary.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/v2/stocks/[ticker]/historical.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/v2/stocks/[ticker]/governance.js`

Acceptance:

- `page_close` is explicitly defined and reused by levels, decision, and trade-plan logic.
- `page_as_of` is explicitly defined and reused by header, governance, and historical freshness messaging.
- V2 summary adapter preserves `name` and other identity and freshness fields needed by the page.
- A thin one-bar V2 payload never renders as a full stock dashboard.
- If V2 cannot provide the minimum full-page contract, the page hard-fallbacks to V1 or a composite V2 load.

### P1: Build a Shared Stock Page View-Model Contract

Goal:
Centralize page semantics after data truth is stabilized.

Required implementation:

- Add a new pure module, e.g. `public/js/stock-page-view-model.js`.
- Build one normalized view-model that explicitly contains:

`identity`

- `name`
- `ticker`
- `page_as_of`

`decision`

- `verdict`
- `confidence`
- `setup`
- `flags`
- `reason`

`risk`

- `score_raw`
- `score_label`
- `score_direction`
- `final_state`
- `override_applied`
- `override_reason`
- `regime_label`
- `explanation`

`levels`

- `canonical_close`
- `as_of`
- validated levels
- degraded state if inconsistent

`tradePlan`

- status
- entry
- stop
- target
- rr
- invalid_reason

`catalysts`

- status
- fallback_kind
- as_of
- confirmed items
- estimated window if any

`historical`

- status
- as_of
- staleness_days
- delayed/degraded flags

`governance`

- mode
- drivers
- runtime/system flags

- Move critical inline derivations out of `stock.html`.
- Reuse existing guard helpers from `public/js/stock-data-guard.js`, but evolve them into contract-safe outputs instead of warnings-only helpers.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-data-guard.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-analyzer-contract.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js` (new)

Acceptance:

- `stock.html` is mostly render-only.
- No section derives critical semantics ad hoc inline.
- V1 and V2 paths produce the same stock-page presentation semantics.

### P2: Finalize Risk Semantics End-to-End

Goal:
Convert the P-1 visible cleanup into a durable semantic model.

This is not only a product discussion.
It must eliminate semantically confusing combinations.

Required semantic distinction:

- raw risk signal
- final risk state
- override
- regime label
- human explanation

Required deterministic fields:

- `raw_signal_band`
- `final_state`
- `override_applied`
- `override_reason`
- `regime_label`
- `display_sentence`

Required implementation:

- Replace ad-hoc risk derivation with structured contract fields.
- Define one deterministic matrix for all supported asset classes:
  - volatility state
  - volatility percentile band
  - structural moderation
  - final label
  - color token
  - explanation sentence
- Ensure stock and ETF risk semantics share the same model but remain asset-class-aware.
- If raw extreme percentile is shown, the final moderated state must be explained in one coherent sentence, not fragmented badges plus a warning icon.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-data-guard.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/stock-decisions-v1.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/stock-insights-v4.js`

Acceptance:

- A user can understand final risk from one primary sentence.
- The page never relies on conflicting color cues to communicate nuance.
- The same meaning appears in KPI chip, Signal Quality, risk panel, and What Changed.

### P3: Enforce Single Ownership in Executive Decision

Goal:
Make ownership rules permanent after the immediate dedupe pass.

Implementation rule:

- Grid owns decision-state metadata.
- Governance owns audit/runtime metadata.
- No field may have dual prominent ownership.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Acceptance:

- `As-of` appears prominently at most once.
- `Confidence` appears prominently at most once.
- `Flags` appear prominently at most once.
- `Reason/Rationale` appears prominently at most once.
- `Wait` / `NO EDGE` is not repeated across grid, pills, and rationale.

### P4: Make Catalysts High-Value or Collapse Them

Goal:
Every catalyst footprint must justify itself.

Visible rule:
No full-size catalyst module may survive if it provides only a low-information placeholder.

Operational fallback precedence:

1. confirmed catalyst
2. estimated earnings window
3. ETF-specific sourced fallback
4. compact inline unavailable status

Required implementation:

- Build catalyst resolver precedence using sourced data only.
- Keep stocks and ETFs on different fallback paths where needed.
- Expose `status`, `fallback_kind`, `as_of`, and `confidence`.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/fundamentals.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/fundamentals-eodhd.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/fundamentals-fmp.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/earnings-calendar.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/earnings-calendar.json`

Acceptance:

- No large empty catalyst card remains on screen.
- Estimated earnings window is shown whenever possible.
- ETFs never get fake stock-style earnings fallback.
- Catalyst UI value density justifies card footprint.

### P5: Make Historical Regime Visibly Non-Current

Goal:
Make historical regime context read as delayed background information, not a live signal.

Explicit stale tiers:

- `fresh`
- `delayed`
- `stale`
- `unavailable`

Measurable style requirements:

- stale opacity `<= 0.6`
- muted semantic colors
- visible delayed or stale badge
- visible age text inline

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/style.css`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Acceptance:

- Stale regime cannot read like a live signal in a 1-second scan.
- Age is visible without hover.
- Stale styling is snapshot-testable.

### P6: Harden Trade Plan Geometry and Level Consistency

Goal:
No invalid geometry and no silent disagreement with canonical price.

Trade-plan validity requires:

- finite entry
- finite stop
- finite target
- finite RR denominator
- correct directional geometry
- no partial BUY/SELL math render

Level consistency requires:

- same-timeframe rolling highs and lows validated against canonical `page_close`
- no support above current price unless explicitly marked broken
- no resistance below current price unless explicitly marked reclaimed
- degraded or integrity state if inconsistency remains

Required implementation:

- Replace inline trade-plan rendering with contract-gated rendering.
- Centralize level generation and validation in the contract layer.
- Bind both trade-plan and level validation to canonical `page_close`.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-data-guard.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-analyzer-contract.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Acceptance:

- No `NaN`, `—x`, half-filled plan, or contradictory direction.
- Current price and displayed levels cannot disagree silently.

### P7: Stabilize Tooltip Positioning and Pointer UX

Goal:
Keep chart hover behavior deterministic under scroll, resize, and container movement.

Concrete implementation requirements:

- container-relative positioning
- bounds clamping
- `requestAnimationFrame` throttling
- hide on scroll and resize
- recompute on next move
- prefer absolutely positioned tooltip inside chart container

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/style.css`

Acceptance:

- Tooltip never detaches from chart context.
- Tooltip never renders off-card or off-screen.
- Behavior remains stable after scroll and resize.

## Test Strategy

Tests must be added alongside each implementation phase, not only after architecture work.

Phase-linked tests:

- P-1:
  - executive panel duplication checks
  - risk label and score presentation checks
  - catalyst collapse and fallback checks
  - stale regime visual state checks
- P0:
  - V1 and V2 parity adapter checks
  - canonical `page_close` and `page_as_of` checks
- P1 and P2:
  - view-model contract tests
  - risk semantic matrix tests
- P4, P5, P6, P7:
  - catalyst resolver tests
  - historical staleness classifier tests
  - trade-plan gate tests
  - key-level validator tests
  - tooltip UI smoke tests

UI smoke requirements:

- header shows `name + ticker` when available
- no duplicate `As-of`, `Conf`, `Flags`, or `Reason` in Executive Decision card
- empty catalyst card suppressed or collapsed
- stale historical regime visibly degraded
- invalid BUY/SELL trade plan renders unavailable state
- levels cannot silently contradict canonical close

Likely files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-data-guard.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/cross-panel-consistency.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/contracts/v2-contracts.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/fixtures/golden/qcom-downtrend.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/fixtures/golden/spy-etf-neutral.json`

## Rollout Order

1. P-1 Immediate visible UX cleanup
2. P0 data truth and V2 page parity
3. P1 shared stock-page view-model contract
4. P2 finalize risk semantics
5. P3 executive decision single-ownership cleanup
6. P4 catalysts high-value or collapse behavior
7. P5 historical stale visual degradation
8. P6 trade-plan geometry and level consistency hardening
9. P7 tooltip stabilization

## Definition of Done

- Visible risk presentation is unambiguous:
  - no contradictory score/state cues
  - final risk understandable from one primary explanation
- Executive Decision has one primary metadata surface only
- Company name renders whenever upstream data provides it
- Empty optional modules collapse instead of consuming card-sized space
- Catalyst section provides value or collapses
- Stale historical regime looks stale at first glance
- BUY/SELL trade plans never render partial or invalid math
- Key levels and current price cannot contradict each other without an explicit degraded state
- V1 and V2 stock-page paths produce equivalent presentation semantics
- Stock and ETF fallbacks remain asset-class-aware
- Tooltip remains stable under scroll, resize, and container movement
