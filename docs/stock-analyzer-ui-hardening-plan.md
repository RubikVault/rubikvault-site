# Stock Analyzer UI Final Hardening Plan

## Scope

Validated against:

- `origin/main` at `0dd6dca7ce06970332de9bc08816616113ee599e`
- live route: `https://rubikvault.com/analyze/QCOM?audit=1`
- validation date: `2026-03-27`

Primary surfaces:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/rv-v2-client.js`

Primary test surfaces:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/v2-data-integrity.test.mjs`

## Validity Assessment

| ID | Point | Status | Repo Judgment |
|---|---|---|---|
| 1 | Risk Quality competes with Final Risk | Valid | `Risk Quality 70` still sits inside the executive card with bar color and spatial weight close to `Final Risk: Elevated`, so the fast-scan hierarchy is still too weak. |
| 2 | Fundamentals card is large but empty | Valid | The current Fundamentals card renders even when all four core fields are `—`, which consumes card-sized space without value. |
| 3 | Catalyst block is honest but still too low-value | Valid | `Catalyst data temporarily unavailable.` is truthful, but it still consumes card space without enough decision value or fallback nuance. |
| 4 | Historical regime still looks too active | Valid | Freshness is already marked, but the colored regime pills still read too much like current signal rather than delayed background context. |
| 5 | Market Context degraded state is still too large | Valid | The degraded state is honest, but the fallback still occupies card-style space instead of collapsing to a compact degraded mode. |
| 6 | Model Evidence state is not fully standardized | Valid | The empty state is explicit, but the module still lacks a strict `card / compact / inline / hidden` contract shared with other optional modules. |
| 7 | Risk override hierarchy is not product-final | Partially valid | The current wording is understandable, but the repo still lacks one final, explicit product rule that fixes the relationship between raw extreme signal and final moderated state. |
| 8 | Tooltip stability | Valid QA gate | The known regression class still requires permanent automated guarding. |
| 9 | Key-level consistency vs canonical close | Valid QA gate | Guardrails exist, but the release contract still needs stronger explicit coverage. |
| 10 | Trade-plan geometry | Valid QA gate | Geometry guards exist, but they remain a permanent release-critical invariant. |

## Current Live Facts

Observed on `QCOM` live at the time of validation:

- Header shows `Latest Data: —` while the hero line shows `2026-03-26`
- Top KPI shows `Risk: Elevated`
- Executive card shows `Risk Quality: 70`
- Fundamentals card renders with `— / — / — / —`
- Catalyst card renders `Catalyst data temporarily unavailable.`
- Historical regime block shows stale labeling but still uses strong regime pills
- Market Context degraded block still renders as a card
- Model Evidence renders an explicit empty state card

These facts make the residual criticism materially valid.

## Product Rules

- `finalRisk` is the only primary risk statement on the page.
- `riskQuality` is never a safety statement; it is a secondary structural-quality signal.
- Optional modules must expose one explicit render mode:
  - `card`
  - `compact`
  - `inline`
  - `hidden`
- No optional module may render as a full card when it has no actionable value.
- Historical regime context must never visually outrank live page state.
- `canonical_close` is the only owner for level sanity and trade-plan geometry.
- `canonical_as_of` is the only owner for visible recency messaging.
- `stock-page-view-model.js` is the only place where module display semantics are decided.
- `stock.html` must remain predominantly render-only.

## P0: Must Fix Before Next Release

### P0.1 Risk Hierarchy: Final Risk vs Risk Quality

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Extend `buildRiskPresentation()` to emit:
  - `finalLabel`
  - `finalColor`
  - `qualityLabel`
  - `qualityColor`
  - `qualityTone`
  - `qualityHelperText`
  - `presentationPriority`
  - `renderSentence`
- Force `riskQuality` into neutral or amber presentation whenever `finalState` is `Elevated` or `High`.
- Remove ad hoc risk color logic from `stock.html`.
- Render risk in one strict order:
  1. final risk
  2. raw signal
  3. override reason
  4. structural quality helper

Acceptance:

- A user can distinguish `Final Risk` from `Risk Quality` in a 2-second scan.
- `Risk Quality` never appears strong-green next to `Elevated` or `High`.
- Header KPI, risk panel, and executive card all derive from the same `riskView` contract.

### P0.2 Fundamentals Value Density

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Add `buildFundamentalsPresentation()` to `stock-page-view-model.js`.
- Count core metrics:
  - `marketCap`
  - `pe_ttm`
  - `eps_ttm`
  - `dividendYield`
- Render rules:
  - `card` only when at least 2 core metrics are present
  - `compact` when exactly 1 useful metric is present
  - `inline` only for a tiny explanatory line when the module is relevant but data is thin
  - `hidden` when there is no value
- `stock.html` must only render the mode emitted by the view model.

Acceptance:

- No full Fundamentals card may render with only `—` values.
- Thin fundamentals data cannot consume card-sized space.

### P0.3 Catalyst Value Density

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/fundamentals.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Expand `buildCatalystPresentation()` into a strict resolver:
  1. confirmed catalysts
  2. `nextEarningsDate`
  3. estimated earnings window
  4. temporary unavailable inline state
  5. hidden
- For stocks:
  - prefer `compact` when only estimated timing exists
  - prefer `inline` when the feed is temporarily unavailable
  - do not use `card` for pure unavailability
- For ETFs:
  - never fabricate earnings fallback
  - use ETF-specific `inline` or `hidden`

Acceptance:

- Stocks do not show a large low-value catalyst card for pure unavailability.
- ETFs do not show stock-style earnings language.

## P1: Directly After P0

### P1.1 Historical Regime Demotion

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Keep `classifyHistoricalFreshness()` as the sole freshness classifier.
- Extend it to emit presentation fields:
  - `pillOpacity`
  - `pillTone`
  - `contextLabel`
  - `warningLevel`
- Apply stronger demotion rules:
  - `> 2` business days: delayed/stale demotion
  - `> 10` business days: very stale demotion
- Replace strong semantic colors on stale pills with muted variants.
- Add always-visible context copy:
  - `Background context only`
  - `Delayed historical regime overlay`

Acceptance:

- Historical regime pills do not look live in a 1-second scan.
- Very stale regimes are visibly weaker than normal stale.

### P1.2 Market Context Compact Degraded Mode

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Keep current fetch timeout and cache path, but add a one-time retry.
- Introduce a formal `marketContext.renderMode`:
  - `card`
  - `compact`
  - `inline`
  - `hidden`
- When degraded and no live benchmark data exists:
  - prefer `compact`
  - do not render a full card shell
- Keep the degraded copy explicit:
  - `Benchmark comparison temporarily unavailable.`

Acceptance:

- Degraded market context does not dominate the third column.
- No endless loading state.

### P1.3 Model Evidence Standardization

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-analyzer-ui.test.mjs`

Implementation:

- Give Model Evidence the same explicit contract as other optional modules:
  - `available -> card`
  - `unavailable_but_relevant -> compact or inline`
  - `not_useful_here -> hidden`
- Remove ambiguous card-vs-empty-state logic from `stock.html`.
- Hide the whole section when it provides no value.

Acceptance:

- Model Evidence never appears as an oversized empty-value block.
- Hidden vs unavailable is deterministic and testable.

## P2: Product Finalization

### P2.1 Final Risk Override Product Rule

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/tests/stock-page-view-model.test.mjs`

Decision:

- Lock the product to Variant A:
  - final risk dominates
  - raw extreme signal is explanatory context

Implementation:

- Rename view-model fields to reflect the final hierarchy:
  - `finalState`
  - `rawSignalBand`
  - `overrideApplied`
  - `overrideReason`
  - `displaySentence`
- Remove any UI wording that lets the raw signal compete with the final state.

Acceptance:

- There is exactly one primary risk hierarchy on the page.

## Permanent QA / Release Gates

### QA.1 Tooltip Stability

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`

Gate:

- Tooltip remains container-relative.
- Bounds clamp remains enforced.
- Hide on scroll and resize remains enforced.
- Recompute on next move remains enforced.

### QA.2 Key-Level Consistency

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Gate:

- `validateLevelConsistency()` must always compare against `canonical_close`.
- Inconsistent 5D/20D envelopes must degrade the module instead of silently rendering impossible levels.

### QA.3 Trade-Plan Geometry

Files:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/js/stock-page-view-model.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`

Gate:

- `BUY`: `stop < entry < target`
- `SELL`: `target < entry < stop`
- otherwise: unavailable state only

## Validation Matrix

### Repo Validation

- `node tests/stock-page-view-model.test.mjs`
- `node tests/stock-analyzer-ui.test.mjs`
- `node tests/v2-data-integrity.test.mjs`
- `npx wrangler pages functions build functions --project-directory . --build-output-directory public --outdir .wrangler-pages-build-current`

### Live Validation

Route:

- `https://rubikvault.com/analyze/QCOM?audit=1`

Required assertions after implementation:

- `Final Risk` remains the dominant risk statement
- `Risk Quality` no longer looks like a safe-green countermessage
- empty Fundamentals card no longer renders as a full card
- catalyst unavailability is compact or hidden unless there is real value
- stale historical regime pills are visibly demoted
- degraded Market Context is compact
- Model Evidence follows `card / compact / inline / hidden`
- no browser `pageerror`

### Regression Coverage To Add Or Tighten

- risk hierarchy snapshot test
- fundamentals render-mode test
- catalyst render-mode test for stock and ETF
- historical stale visual-state test
- market-context degraded compact-mode test
- model-evidence render-mode test
- tooltip clamp test
- key-level canonical-close sanity test
- trade-plan geometry invariants

## Rollout Order

1. `P0.1` Risk hierarchy
2. `P0.2` Fundamentals value density
3. `P0.3` Catalyst value density
4. `P1.1` Historical demotion
5. `P1.2` Market Context compact degraded mode
6. `P1.3` Model Evidence standardization
7. `P2.1` Final risk override rule
8. QA gate tightening

## Done Means Done

The page is release-clean only when all of the following are true:

- no primary/secondary risk ambiguity remains
- no card-sized empty-value module remains
- no stale historical regime can be mistaken for live context in a fast scan
- degraded modules collapse compactly instead of leaving low-value cards
- risk, catalysts, fundamentals, and model evidence all use explicit render modes
- repo tests and live route checks both pass against the same shipped `main`
