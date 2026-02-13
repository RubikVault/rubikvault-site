# P2.1 No Feature Loss Check

- Route checked: `/analyze/AAPL`
- Compare target: `.rv_audit/ui_proof/BASELINE_ANALYZE_DETAIL.md`

| Baseline Section | Present? | Where (selector/anchor) | Notes |
|---|---|---|---|
| 1_header_back | YES | #results-title + button | Present after NAV changes |
| 2_kpis_badges | YES | kpi row + provenance | Present after NAV changes |
| 3_gap_chip | YES | anomaly row | Present after NAV changes |
| 4_fundamentals | YES | fundamentals_html | Present after NAV changes |
| 5_price_history | YES | #price-chart + controls | Present after NAV changes |
| 6_corporate_actions | YES | #actions-content | Present after NAV changes |
| 7_indicators_validated | YES | indicators block | Present after NAV changes |
| 8_performance_vs_benchmark | YES | #performance-content | Present after NAV changes |
| 9_risk_liquidity | YES | #risk-liquidity-content | Present after NAV changes |
| 10_seasonality | YES | #seasonality-content | Present after NAV changes |
| 11_distribution | YES | #distribution-content | Present after NAV changes |
| 12_analysis_elliott | YES | #elliott-content | Present after NAV changes |
| 13_analysis_scientific | YES | #scientific-content | Present after NAV changes |
| 14_analysis_market_pulse | YES | #market-pulse-content | Present after NAV changes |
| 15_analysis_peer_snapshot | YES | #peer-content | Present after NAV changes |
| 16_analysis_correlation | YES | #correlation-content | Present after NAV changes |
| 17_probability | YES | #probability-content | Present after NAV changes |

## Evidence
- DOM: `.rv_audit/ui_proof/dom/p2_1_after_sections.json`
- Desktop screen: `.rv_audit/ui_proof/screens/P2_1_after_analyze_detail_desktop.png`
- Mobile screen: `.rv_audit/ui_proof/screens/P2_1_after_analyze_detail_mobile.png`
- Console capture: `.rv_audit/ui_proof/console/p2_1_after_console.json`

## Verdict
- All baseline sections present: YES