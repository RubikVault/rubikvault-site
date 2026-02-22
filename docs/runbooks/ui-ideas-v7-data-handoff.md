# UI Handoff: Ideas Blocks (v7 Data Safety)

This file is for UI-only edits around the Ideas/Super-Modules blocks.

## Allowed Scope
- UI layout/text/components only
- Read existing `public/data/**` files

## Do Not Change
- `scripts/**`
- `mirrors/**`
- API routes / data generation logic / workflows
- Any rebuild or pipeline command

## Use These v7 Sources for Counts / Universe Labels
- `public/data/universe/v7/ssot/feature_stock_universe_report.json`
- `public/data/universe/v7/reports/feature_gap_reasons_summary.json`
- `public/data/universe/v7/reports/scientific_gap_reasons_summary.json`
- `public/data/universe/v7/reports/dropout_summary.json`
- `public/data/forecast/latest.json` (for forecast latest snapshot info)

## Avoid as Universe Truth
- `public/data/universe/all.json` (legacy)
- `public/data/v3/**` (legacy)
- `public/data/marketphase/index.json` as global universe cap (legacy UI file only)

## Important Metric Nuance
- `scientific_effective` in `feature_stock_universe_report.json` is not the same as scientific-ready if entries exist but are `DATA_UNAVAILABLE`.
- For scientific-ready and unavailable counts, use `scientific_gap_reasons_summary.json`.
