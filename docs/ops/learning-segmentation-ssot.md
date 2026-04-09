# Learning Segmentation SSOT

## Scope

This file defines the single source of truth for how RubikVault isolates liquid large-cap behavior from peripheral micro-cap and illiquid behavior in learning and promotion flows.

## Canonical segmentation dimensions

Every decision or learning row that participates in segmented weighting must resolve the same fields:

- `asset_class`
- `liquidity_bucket`
- `market_cap_bucket`
- `learning_lane`
- `regime_bucket`

The canonical resolver lives in:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/asset-segmentation.mjs`

## Canonical rules

- `liquidity_bucket`
  - `high`
  - `mid`
  - `low`
  - `unknown`
- `market_cap_bucket`
  - `mega`
  - `large`
  - `mid`
  - `small`
  - `micro`
  - `fund`
  - `unknown`
- `learning_lane`
  - `blue_chip_core`
  - `core`
  - `peripheral`

## Hard protection rules

- `micro` stocks are not promotion-eligible
- `low` liquidity assets are not promotion-eligible
- `peripheral` lane rows are excluded from primary-learning weights
- `blue_chip_core` rows may learn from their own lane without being diluted by peripheral rows

## Weight snapshot contract

Segmented QuantLab weight snapshots must be written as:

`weights[horizon][asset_class][liquidity_bucket][market_cap_bucket][learning_lane][regime_bucket]`

The canonical readers/writers are:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/quantlab-v1/weight-history.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/quantlab-v1/fusion/segment-weight-resolver.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/learning/quantlab-v1/daily-reweight.mjs`

## Stock Analyzer integration

The Stock Analyzer decision path must consume the same segmentation profile through:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/decision-input-assembly.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/stock-insights-v4.js`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/functions/api/_shared/stock-decisions-v1.js`

## Non-negotiable rule

No secondary implementation may invent a different `market_cap_bucket`, `liquidity_bucket`, or `learning_lane` mapping. Any drift from `asset-segmentation.mjs` is a contract violation.
