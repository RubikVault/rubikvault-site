# Blocks 1–30 (Phase 1)

## Package 1 (Blocks 1–12)

1) 01 - US Yield Curve
- Provider: FRED (DGS1MO/DGS3MO/DGS6MO/DGS1/DGS2/DGS5/DGS10/DGS20/DGS30)
- Cadence: 6h
- Max fanout: 9
- Validators: minItems 5, minCoverage 60%
- Poison guard: allow degraded, minCoverage 60%

2) 02 - ECB Rates Board
- Provider: ECB SDMX (MRR/DFR/MLF)
- Cadence: 6h
- Max fanout: 3
- Validators: minItems 2, minCoverage 66%
- Poison guard: allow degraded

3) 03 - Inflation Pulse
- Provider: FRED (CPIAUCSL)
- Cadence: daily
- Validators: minItems 1, minCoverage 100%
- Poison guard: strict

4) 04 - Labor Pulse
- Provider: FRED (UNRATE, PAYEMS)
- Cadence: daily
- Validators: minItems 1, minCoverage 50%
- Poison guard: allow degraded

5) 05 - Energy Macro
- Provider: FRED (DCOILWTICO)
- Cadence: 6h
- Validators: minItems 1, minCoverage 100%
- Poison guard: strict

6) 06 - Credit Stress Proxy
- Provider: FRED (BAMLH0A0HYM2)
- Cadence: 6h
- Validators: minItems 1, minCoverage 100%
- Poison guard: strict

7) 07 - FX Board
- Provider: ECB SDMX (USD/EUR, GBP/EUR, JPY/EUR)
- Cadence: 6h
- Validators: minItems 2, minCoverage 66%
- Poison guard: allow degraded

8) 08 - Market Breadth
- Provider: Stooq EOD (15 symbols)
- Cadence: daily
- Validators: minItems 8, minCoverage 50%
- Poison guard: allow degraded

9) 09 - Highs vs Lows
- Provider: derived from Market Breadth history
- Cadence: daily
- Validators: minItems 8, minCoverage 50%
- Poison guard: allow degraded

10) 10 - Sector Rotation
- Provider: Stooq EOD (11 sector ETFs)
- Cadence: daily
- Validators: minItems 6, minCoverage 55%
- Poison guard: allow degraded

11) 11 - Vol Regime
- Provider: FRED (VIXCLS)
- Cadence: 6h
- Validators: minItems 1, minCoverage 100%
- Poison guard: strict

12) 12 - Liquidity Conditions Proxy
- Provider: FRED (RRPONTSYD)
- Cadence: daily
- Validators: minItems 1, minCoverage 100%
- Poison guard: strict

## Failure Modes (Common)
- PROVIDER_TIMEOUT / PROVIDER_429_RATE_LIMIT
- PROVIDER_BAD_PAYLOAD / PROVIDER_SCHEMA_MISMATCH
- BUDGET_EXCEEDED
- POISON_GUARD (write blocked)

## Budget Notes
- Requests and credits tracked separately per provider.
- When budgets tighten, reduce fanout or skip non-critical blocks.
