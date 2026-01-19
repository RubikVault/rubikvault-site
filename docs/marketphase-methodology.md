# MarketPhase AI — Scientific Elliott Research (v8.0)

## Standards & Compliance
- **ISO 8000**: Data quality and reproducibility
- **IEEE 7000**: Traceability and auditability
- **Precision**: All numeric outputs rounded to 6 significant digits (IEEE 754)
- **Reproducibility**: All stochastic steps seeded by Git commit hash (PRNG: Mulberry32)

## Components
- `marketphase-generate.mjs`: Builds deterministic snapshots with audit trail (`auditTrail.commitHash`)
- `marketphase-evaluate.mjs`: Backtesting (no look-ahead, history-only)
- `marketphase-learn.mjs`: Deterministic bootstrap calibration (seeded RNG)
- `marketphase-falsify.mjs`: Dual hypothesis test vs Random Walk & AR(1) with Bonferroni correction (alpha=0.025)
- `scientific-math.mjs`: PRNG + `round6` helpers

## Statistical Tests
- **Bonferroni**: alpha_global=0.05 → alpha_corrected=0.025
- **Random Walk & AR(1)** surrogates generated with seeded PRNG
- P-values reported in `public/data/marketphase/scientific-audit.json`

## Verification
1. Determinism: run `node scripts/marketphase-falsify.mjs` twice → identical `scientific-audit.json`
2. Significance: check `alphaCorrected: 0.025` and p-values
3. Generation: `SYMBOLS=AAPL DUMMY=0 node scripts/marketphase-generate.mjs` → audit trail with commit hash
