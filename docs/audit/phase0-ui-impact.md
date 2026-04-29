# Phase 0 UI Impact Audit

Scope: bridge-only mitigation for `/api/v2/stocks/:ticker/summary` until page-core is active.

## Summary Consumers

`public/js/rv-v2-client.js` currently consumes:

- `summary.data.ticker`
- `summary.data.latest_bar`
- `summary.data.market_prices`
- `summary.data.market_stats`
- `summary.data.decision`
- `summary.data.daily_decision`
- `summary.data.analysis_readiness`

`RV_V2_SUMMARY_SNAPSHOT_MODE=skip` can remove snapshot enrichments such as universe, market-prices, and market-stats joins. The client now tolerates partial summary data when page-core or any identity/summary data exists.

`RV_V2_SUMMARY_DECISION_MODE=skip` can remove V4 evaluation-derived `decision`, `states`, and `explanation`. It should remain a bridge switch only. Page-core replaces these with prebuilt `summary_min` and `governance_summary`.

## Required Behavior

- Retry only 5xx and abort failures.
- Do not treat missing governance/fundamentals as full page failure when summary or page-core identity exists.
- Do not use retry as permanent 1102 mitigation.
