# Stock Analyzer UI Final Hardening Plan

## Scope

This plan validates the current residual criticism against the live stock analyzer UI and translates the valid items into a repo-specific, implementation-ready rollout for stocks and ETFs.

Primary route:

- `/analyze/:ticker`

Primary rendering surface:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Primary contract modules:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`

## Validity Assessment

| ID | Point | Status | Repo Judgment |
|---|---|---|---|
| 1 | Risk Quality vs Final Risk | Valid | Still the main visible semantic risk when structurally positive score color and elevated final risk appear together. |
| 2 | Executive / Governance redundancy | Partially valid | Much better than before, but ownership rules are not yet strict enough across grid, governance, and rationale surfaces. |
| 3 | Pre-Trade Checklist on `WAIT` / `Mixed / No Clean Entry` | Valid | Checklist still reads like active execution prep when no actionable setup exists. |
| 4 | Catalyst block too low-value | Valid | Honest fallback exists, but value density is still too low relative to visual footprint. |
| 5 | Company name fragile or missing | Partially valid | Header can render correctly now, but identity resolution needs a fully fixed long-term fallback order. |
| 6 | Historical regime still looks too active | Valid | Freshness communication exists, but stale context still needs stronger visual demotion in non-fresh states. |
| 7 | Market Context honest but not functionally good | Valid | Degraded fallback is better than infinite loading, but service stability and compact fallback behavior are still not final. |
| 8 | Model Evidence empty-state unclear | Valid | Hidden/degraded/empty states are still not fully explicit and standardized. |
| 9 | Risk override semantics not product-final | Valid | Communication is better, but the final product rule for extreme raw signal vs moderated final state still needs explicit consolidation. |
| 10.1 | Tooltip stability under scroll / resize | Valid QA guard | Needs to stay explicitly guarded because it is a known regression class. |
| 10.2 | Key levels vs feed asynchrony | Valid QA guard | Canonical ownership exists conceptually, but this must remain a hard release gate. |
| 10.3 | Trade-plan null safety | Valid QA guard | Geometry guards exist but must remain enforced as a permanent render gate. |

## Product Rules

- `final risk` is the only primary risk judgment.
- `risk quality` is a secondary structure-quality metric and must never visually compete with final risk.
- `canonical_close` is the only page-level price owner for levels, trade plan, and consistency checks.
- `canonical_as_of` is the only page-level freshness owner for header, meta, and historical age messaging.
- `stock-page-view-model` is the only page-level rendering contract.
- `stock.html` remains render-only.
- No optional module may consume card-sized space without clear user value.
- If any valid upstream knows the company name, ticker-only rendering is not allowed.
- Governance metadata must never duplicate primary executive metadata.

## Do Not Do

- Do not solve Phase 0 with a broad refactor.
- Do not leave visible UX contradictions in place while moving logic into deeper architecture layers.
- Do not render large optional cards with no user value.
- Do not duplicate executive metadata across grid, governance, and rationale surfaces.
- Do not use non-canonical close or as-of values in section-local calculations.
- Do not render ticker-only identity if any valid upstream source knows the company name.

## Canonical Ownership Rules

### Identity

Name resolution order:

1. V2 summary `name`
2. fundamentals `companyName`
3. universe/company mapping
4. V1 fallback identity
5. ticker only as final fallback

Acceptance:

- If any valid upstream source contains a company name, the header renders `name + ticker`.

### Price Truth

`canonical_close` ownership:

- key levels
- trade-plan geometry
- consistency guards
- price-related panel validation

Acceptance:

- No level or trade-plan math may use a non-canonical close.

### Time Truth

`canonical_as_of` ownership:

- header
- executive `As-of`
- technical panel meta
- narrative panel meta
- historical freshness messaging
- integrity recency labels

Acceptance:

- No visible `As-of` or freshness copy may improvise a section-local date.

## Rollout Order

1. Phase 0: Immediate Visible Cleanup
2. Phase 1: Data Truth / Identity / Parity
3. Phase 2: Shared Stock Page Contract
4. Phase 3: Robustness / Release Gates

## Phase 0: Immediate Visible Cleanup

Goal:

Close the remaining visible UX contradictions before deeper architecture work.

Constraint:

- No broad refactor in Phase 0.
- No contract migration prerequisite in Phase 0.
- Fix only visible UX contradictions and render-state errors first.
- Preserve existing data flow unless a specific visible bug requires a targeted data-path change.

### 0.1 Risk Quality vs Final Risk

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- Keep label as `Risk Quality`, never `Risk`, for the structural score.
- Add direct helper text:
  - `Higher = better structural quality, not lower final risk.`
- When final risk is `Elevated` or `High`, do not render the quality score in strong safe-green.
- If final risk is `Elevated` or `High`, helper text alone is not enough if score color still implies safety.
- Score color must be neutral, muted, or caution-aligned whenever final risk is not low.
- Render risk information in one fixed order:
  1. `Final Risk`
  2. `Raw signal`
  3. `Override reason`
- If `override_applied === true`, render one coherent sentence, not fragmented badge logic.

Acceptance:

- A 2-second scan makes clear what `Risk Quality` means.
- `Final Risk` is the only primary risk statement.
- No strong green score appears adjacent to `Elevated` or `High` final risk without direct helper text.
- A user must not be able to confuse `Risk Quality` with `Final Risk` in a 2-second scan.
- Final risk, raw signal, and override reason are readable in one place.

### 0.2 Executive / Governance Ownership Cleanup

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- Executive grid is the sole owner of:
  - `As-of`
  - `Confidence`
  - `Flags`
  - `Setup`
  - `Decision Basis`
  - `Horizon View`
- Governance row may contain only:
  - `Mode`
  - `Drivers`
  - `Fallback`
  - `Runtime Flags`
- Strategic rationale must add narrative, not repeat metadata.

Forbidden in governance row:

- `As-of`
- `Confidence`
- `Flags`
- `Decision Basis`
- `Setup`
- any verdict synonym such as `WAIT`, `NO EDGE`, or `NO TRADE` if already shown in the executive grid

Acceptance:

- `As-of`, `Confidence`, `Flags`, and `Decision Basis` appear prominently at most once inside the executive card.
- `As-of`, `Confidence`, `Flags`, `Setup`, and `Decision Basis` each appear prominently at most once within the executive card surface.
- Governance row contains no duplicated primary metadata.
- `WAIT` / `NO EDGE` subtype is not repeated across multiple prominent surfaces.

### 0.3 Pre-Trade Checklist Applicability

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- Render active pre-trade checklist only when there is a real tradeable setup:
  - `tradePlan.status === 'ready'`
  - or `decision.verdict` is `BUY` or `SELL`
- For `WAIT`, `Mixed / No Clean Entry`, or no active setup:
  - replace checklist with:
  - `No active trade setup — pre-trade checklist not applicable.`

Forbidden:

- No active checklist bullets may render for `WAIT`.
- No active checklist bullets may render for `Mixed / No Clean Entry`.
- No active checklist bullets may render when geometry is missing or invalid.

Acceptance:

- `WAIT` / no-clean-entry states never show an active checklist UI.
- Checklist block becomes a clear non-applicable state when no setup exists.

### 0.4 Catalyst Value Density

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/fundamentals.js`

Render modes:

1. `card`
2. `compact`
3. `inline`
4. `hidden`

Implementation:

- `card` only for confirmed catalysts with real user value.
- `compact` for estimated earnings window or similarly useful near-term fallback.
- `inline` for temporary unavailability.
- `hidden` when the module adds no value in the current context.

Forbidden:

- `card` mode may not be used for pure unavailability copy.
- `card` mode requires at least one dated or estimated event with user value.

Fallback rule:

- If next earnings window exists, prefer `compact`.
- If neither confirmed nor estimated value exists, use `inline` or `hidden`, never full card.

Acceptance:

- No large catalyst card may contain only unavailable/feed-limited copy.
- Stocks with estimated earnings window show at least a compact useful fallback.
- ETFs never get stock-style pseudo-earnings fallback.

### 0.5 Historical Regime Fast-Scan Demotion

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/style.css`

Freshness tiers:

- `fresh`
- `delayed`
- `stale`
- `unavailable`

Implementation:

- If `staleness_days > 2`:
  - badge visible
  - age visible inline
  - opacity `<= 0.6`
  - colors muted
  - subtitle visible without hover
- semantic pill colors must not read as live-strength green/red when stale or very stale
- stale pills must visually read as background context, not current signal
- subtitle must explicitly communicate one of:
  - `Background context only`
  - `Not current`
  - `Delayed regime overlay`
- If `staleness_days > 10`:
  - stronger visual degradation
  - lower opacity than normal stale
  - stronger badge contrast
  - explicit caution subtitle
  - inline warning:
  - `Historical regime data is 12 business days old. Use as background context only.`

Acceptance:

- Stale pills do not look live in a 1-second scan.
- Age and stale state are readable without hover.
- Very stale state has stronger warning than normal stale state.

### 0.6 Market Context Visual Discipline

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- Prefer real benchmark output.
- If benchmark fetch fails:
  - retry once
  - then prefer recent cached benchmark data with degraded freshness label
  - then use compact degraded state
- Degraded state text:
  - `Benchmark comparison temporarily unavailable.`
- Degraded state must be visually compact, not card-dominant.
- Never leave the module in a loading state after timeout.

Acceptance:

- Market Context either delivers real comparison value or collapses to a slim degraded row.
- No endless loading state.
- No large degraded block that dominates the column.

## Phase 1: Data Truth / Identity / Parity

Goal:

Remove data-source ambiguity behind the visible UI.

### 1.1 Identity Hardening

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- Enforce the documented name fallback order exactly.
- Preserve name/freshness fields through V2 adapter and composite loads.

Acceptance:

- Header never falls back to ticker-only when any valid upstream identity exists.

### 1.2 V2 Full-Page Parity

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Implementation:

- Only render V2 full page from a sufficient multi-endpoint contract.
- Thin V2 summary may not render as full stock dashboard.
- If minimum contract unavailable:
  - hard-fallback to V1
  - or composite V2 load with explicit merge strategy

Hard block:

- Thin V2 summary payloads must not render the stock page shell as if full-page semantics exist.
- If parity minimum is not met, abort to V1 fallback or explicit degraded composite mode.

Acceptance:

- Thin V2 payloads cannot silently render full page.
- V1 and V2 produce equivalent visible page semantics.

### 1.3 Canonical Truth Wiring

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- All levels use `canonical_close`.
- All trade-plan calculations use `canonical_close`.
- All panel meta dates use `canonical_as_of`.
- All freshness/status messaging uses `canonical_as_of`.

Acceptance:

- No section reads a different close or date than the page contract.

## Phase 2: Shared Stock Page Contract

Goal:

Centralize all presentation semantics for durability and low-maintenance evolution.

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Required top-level fields:

- `identity`
- `decision`
- `risk`
- `levels`
- `tradePlan`
- `catalysts`
- `historical`
- `marketContext`
- `governance`
- `integrity`
- `moduleStates`

Required module-state rule:

- Every optional module exposes one render mode:
  - `card`
  - `compact`
  - `inline`
  - `hidden`

Render mode semantics:

- `card`: module has meaningful standalone value and deserves normal panel space
- `compact`: module has secondary but still useful value
- `inline`: module is degraded or informational only
- `hidden`: module adds no value in current state

Required semantic rule:

- Empty, degraded, unavailable, and hidden states are explicit.
- No panel invents display semantics inline in `stock.html`.
- No module may reserve card-sized height in `inline` or `hidden` state.

Acceptance:

- `stock.html` becomes predominantly render-only.
- Optional modules follow one shared state discipline.
- Hidden vs degraded vs unavailable is explicit and testable.

## Phase 3: Robustness / Release Gates

Goal:

Protect the page against regression and data drift.

### 3.1 Risk Override Product Finalization

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/stock-decisions-v1.js`

Decision required:

- Variant A:
  - final state dominates
  - extreme raw signal is explanation only
- Variant B:
  - raw extreme dominates
  - moderated structure is explanation only

Acceptance:

- Only one primary risk hierarchy exists on page.
- No three-level semantic split between score, raw extreme, and final state.

### 3.2 Model Evidence State Finalization

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Implementation:

- If data exists: render normally.
- If module relevant but data unavailable:
  - render explicit empty state:
  - `Additional model evidence modules currently unavailable for this analysis.`
- If module adds no value:
  - hide completely.

Acceptance:

- No unexplained `N/A`.
- No ambiguous empty space.
- Hidden vs unavailable is user-legible.

### 3.3 Tooltip Stability

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/style.css`

Implementation:

- absolutely positioned inside chart container
- bounds clamping
- `requestAnimationFrame` throttling
- hide on scroll / resize
- recompute on next pointer move
- never render outside chart/card bounds

Acceptance:

- No tooltip drift after scroll or resize.
- No off-card rendering.

### 3.4 Key-Level Consistency

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Implementation:

- Validate `5D` / `20D` levels against `canonical_close`.
- If inconsistent:
  - explicit degraded state
  - explicit degraded note or suppression of conflicting derived levels
  - never silently display contradictory values

Acceptance:

- Current price cannot silently contradict displayed levels.

### 3.5 Trade-Plan Geometry

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Geometry rules:

- `BUY`: `stop < entry < target`
- `SELL`: `target < entry < stop`

Invalid fallback:

- `Trade plan unavailable — missing or invalid inputs`

Required gate:

- Trade plan must not render if any of `entry`, `stop`, `target`, `direction`, or `rr` is invalid.
- This gate applies even when verdict is `BUY` or `SELL`.

Acceptance:

- No partial entry/stop/target rendering.
- No `NaN`.
- No contradictory direction.

## Test Strategy

Tests must land with each phase, not after the full refactor.

### Phase 0

- Executive metadata duplication checks
- Risk helper-text and color-severity presentation checks
- Checklist applicability checks for `WAIT` / `Mixed / No Clean Entry`
- Catalyst render-mode checks
- Historical stale fast-scan checks
- Market Context degraded compact fallback checks

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`

### Phase 1

- identity fallback order tests
- V1/V2 parity adapter tests
- canonical close / canonical as-of ownership tests

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/rv-v2-client.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/contracts/v2-contracts.test.mjs`

### Phase 2

- shared view-model contract tests
- module state discipline tests
- hidden/degraded/unavailable render-mode tests

### Phase 3

- risk semantic matrix tests
- model evidence state tests
- tooltip smoke tests
- key-level consistency tests
- trade-plan gate tests

## Release Gates

Release must be blocked if any of the following is still true:

- Risk Quality still looks visually safer than Final Risk suggests.
- `WAIT` / `Mixed / No Clean Entry` still shows an active checklist.
- Executive card still duplicates `As-of`, `Confidence`, `Flags`, or `Decision Basis`.
- Catalyst module still renders as a large low-value card.
- Thin V2 payload can still render as a full stock page.
- Trade plan can still render partial or invalid geometry.
- Key levels can still silently contradict `canonical_close`.

## Definition of Done

- Risk Quality and Final Risk are visually unambiguous.
- Final Risk is the only primary risk statement.
- Executive card has one primary metadata surface.
- Pre-Trade Checklist is hidden or marked not applicable when no setup exists.
- Catalyst module provides real value or collapses appropriately.
- Company name renders whenever any valid upstream source knows it.
- Historical stale states read as stale at first glance.
- Market Context either works or degrades compactly.
- Model Evidence states are explicit and non-ambiguous.
- Tooltips stay inside chart/card bounds under scroll and resize.
- Key levels cannot silently contradict canonical close.
- Trade plans never render partial or invalid geometry.
- V1 and V2 stock-page paths produce equivalent presentation semantics.
- Stocks and ETFs stay asset-class-aware across catalyst and fallback logic.

## Repo Execution Order

1. `public/stock.html`
2. `public/js/stock-page-view-model.js`
3. `public/js/rv-v2-client.js`
4. stock analyzer tests
5. V2 contract/parity tests
