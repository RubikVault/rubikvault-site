/**
 * Capital Rotation Monitor — Versioned Parameters
 * All scoring defaults are frozen and versioned for auditability.
 */

export const PARAMS_V1 = Object.freeze({
  schemaVersion: '1.0',
  scoreVersion: '1.0',
  paramsVersion: '1.0',
  narrativeVersion: '1.0',

  // Return lookback windows (trading days)
  returnWindows: [21, 63, 126, 252],

  // Volatility
  volatilityWindow: 60,

  // Z-score
  zScoreWindow: 252,
  longZScoreWindow: 756,
  zScoreCapAbs: 2.5,

  // Winsorization
  winsorLowerPct: 0.025,
  winsorUpperPct: 0.975,

  // History requirements (years)
  minHistoryYearsForAnyPercentile: 3,
  minHistoryYearsFor5YPercentile: 5,
  minHistoryYearsForLongPercentile: 10,
  targetLongPercentileYears: 20,

  // Staleness (trading days)
  staleTradingDaysSoft: 2,
  staleTradingDaysHard: 4,

  // Neutral range
  neutralRangeLow: 40,
  neutralRangeHigh: 60,

  // Confidence thresholds
  confidenceThresholds: Object.freeze({
    high: 0.75,
    medium: 0.55,
    mixed: 0.35
  }),

  // RAM weights by window (trading days)
  ramWeights: Object.freeze({
    21: 0.20,
    63: 0.35,
    126: 0.30,
    252: 0.15
  }),

  // Ratio composite score weights
  compositeWeights: Object.freeze({
    ramScore: 0.40,
    currentRegimePercentileScore: 0.25,
    zScoreMapped: 0.20,
    trendDirectionScore: 0.15
  }),

  // Global score block weights
  blockWeights: Object.freeze({
    macroRegime: 0.30,
    riskAppetite: 0.20,
    sectorBreadth: 0.30,
    confirmationLiquidity: 0.20
  }),

  // Max gap before marking partial
  maxGapTradingDays: 3,

  // Alignment
  maxCalendarDaysLookback: 400,
  tradingDaysTarget: 252
});
