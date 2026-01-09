# Blocks 13-25 (Package 2)

Purpose: Derived, low-cost snapshots for blocks 13-25. No per-user upstream calls; snapshots only.

## Block specs

13 - Risk Regime Lite
- id: risk-regime-lite
- source: internal (vol-regime + market-breadth)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: regime derived from VIX regime + breadth ratio

14 - Drawdown Monitor
- id: drawdown-monitor
- source: stooq (SPY EOD)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite false
- notes: 252d max close vs latest close

15 - Trend Strength Board
- id: trend-strength-board
- source: stooq (SPY, QQQ, DIA)
- cadence: daily
- poison guard: minItems 2, allowDegradedWrite true
- notes: MA50 vs MA200 slope

16 - Momentum Heatmap Lite
- id: momentum-heatmap-lite
- source: stooq (15 core symbols)
- cadence: daily
- poison guard: minItems 6, allowDegradedWrite true
- notes: RSI-14 buckets (hot/warm/neutral/cool/weak)

17 - Volatility Term Lite
- id: volatility-term-lite
- source: stooq (SPY realized vol) + vol-regime snapshot
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: VIX vs realized spread

18 - Sector Relative Strength
- id: sector-relative-strength
- source: stooq (SPY) + sector-rotation snapshot
- cadence: daily
- poison guard: minItems 6, allowDegradedWrite true
- notes: sector return minus SPY return

19 - Credit Spread Proxy Lite
- id: credit-spread-proxy-lite
- source: internal (credit-stress-proxy)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: HY OAS level bucketed to calm/elevated/stress

20 - Liquidity Delta
- id: liquidity-delta
- source: internal (liquidity-conditions-proxy + prior snapshot)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: delta vs previous liquidity value

21 - Macro Surprise Lite
- id: macro-surprise-lite
- source: internal (inflation-pulse + labor-pulse + prior snapshots)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: changes vs previous values

22 - Market Stress Composite
- id: market-stress-composite
- source: internal (risk-regime-lite + credit-spread-proxy-lite + volatility-term-lite)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: weighted 0-100 stress score

23 - Breadth Delta
- id: breadth-delta
- source: internal (market-breadth + prior snapshot)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: delta of advancers/decliners

24 - Regime Transition Watch
- id: regime-transition-watch
- source: internal (risk-regime-lite + prior snapshot)
- cadence: daily
- poison guard: minItems 1, allowDegradedWrite true
- notes: detects regime change

25 - Market Health Summary
- id: market-health-summary
- source: internal rollup of blocks 1-24
- cadence: daily
- poison guard: minItems 12, allowDegradedWrite true
- notes: per-block status list + summary counts
