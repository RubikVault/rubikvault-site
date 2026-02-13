# Baseline Analyze Detail Inventory

- URL: `/analyze/AAPL`
- Baseline captured before NAV/UX rework changes

## Required Sections (Baseline Contract)

| # | Section | Present | Selector / Anchor | Notes |
|---|---|---|---|---|
| 1 | 1) Header: Ticker/Name + Back to Search | YES | #results-title + Back to Search button | Apple Inc. (AAPL) |
| 2 | 2) Close/Day/Volume + STALE Badge + Data as of + Provider | YES | results header KPI row + provenance chips | Close
              $2,256.89
            
            
              Day
              -14.01
      |
| 3 | 3) Gap up/down chip (or no-unusual-activity fallback) | YES | anomaly chip row below provenance | No unusual activity signals today. |
| 4 | 4) Fundamentals panel | YES | fundamentals_html block under source chain | Fundamentals |
| 5 | 5) Price History chart + timeframe controls | YES | #price-chart + #chart-controls buttons | Price History + range controls |
| 6 | 6) Corporate Actions | YES | #actions-content | No recent split/dividend events for this ticker. |
| 7 | 7) Indicators table + Validated | YES | Indicators header + validated chip | Indicators + Validated |
| 8 | 8) Performance vs Benchmark | YES | #performance-content | Performance vs Benchmark |
| 9 | 9) Risk & Liquidity | YES | #risk-liquidity-content | Risk & Liquidity |
| 10 | 10) Seasonality (5Y) | YES | #seasonality-content | Seasonality (5Y) |
| 11 | 11) Return Distribution (90d) | YES | #distribution-content | Return Distribution (90d) |
| 12 | 12) Analysis Summary: Elliott Waves | YES | #elliott-content | Elliott Waves |
| 13 | 13) Analysis Summary: Scientific Analyzer | YES | #scientific-content | Scientific Analyzer |
| 14 | 14) Analysis Summary: Market Pulse | YES | #market-pulse-content | Market Pulse |
| 15 | 15) Analysis Summary: Peer Snapshot | YES | #peer-content | Peer Snapshot |
| 16 | 16) Correlation (90d) | YES | #correlation-content | Correlation (90d) |
| 17 | 17) Up/Down Probability (Short/Medium/Long) | YES | #probability-content | Up/Down Probability (Short / Medium / Long) |

## Screenshots

- Desktop: `.rv_audit/ui_proof/screens/BASELINE_analyze_detail_desktop.png`
- Mobile: `.rv_audit/ui_proof/screens/BASELINE_analyze_detail_mobile.png`

## DOM + Console Evidence

- DOM: `.rv_audit/ui_proof/dom/baseline_analyze_detail_dom.json`
- Console: `.rv_audit/ui_proof/console/baseline_analyze_detail_console.json`
- Desktop console errors: 0
- Desktop page errors: 0
- Mobile console errors: 0
- Mobile page errors: 0

## Baseline Verdict

- All required baseline sections present (desktop): YES