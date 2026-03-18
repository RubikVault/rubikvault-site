/**
 * Capital Rotation Monitor — Ratio Universe & Data Source Configuration
 */

export const RATIO_UNIVERSE = [
  // ═══ MACRO ═══
  { id: 'SPY_GLD', displayName: 'S&P 500 / Gold', symbolA: 'SPY.US', symbolB: 'GLD.US', category: 'macro', benchmarkGroup: 'equityVsHard', riskCluster: 'risk-appetite', enabled: true },
  { id: 'SPY_TLT', displayName: 'S&P 500 / Long Treasuries', symbolA: 'SPY.US', symbolB: 'TLT.US', category: 'macro', benchmarkGroup: 'equityVsBonds', riskCluster: 'risk-appetite', enabled: true },
  { id: 'QQQ_DIA', displayName: 'NASDAQ / Dow', symbolA: 'QQQ.US', symbolB: 'DIA.US', category: 'macro', benchmarkGroup: 'growthVsValue', riskCluster: 'growth', enabled: true },
  { id: 'BTC_GLD', displayName: 'Bitcoin / Gold', symbolA: 'BTC-USD.CC', symbolB: 'GLD.US', category: 'macro', benchmarkGroup: 'cryptoVsHard', riskCluster: 'speculative', enabled: true },
  { id: 'GLD_UUP', displayName: 'Gold / Dollar (Proxy)', symbolA: 'GLD.US', symbolB: 'UUP.US', category: 'macro', benchmarkGroup: 'goldVsDollar', riskCluster: 'macro-hedge', enabled: true },
  { id: 'HYG_LQD', displayName: 'High Yield / Investment Grade', symbolA: 'HYG.US', symbolB: 'LQD.US', category: 'macro', benchmarkGroup: 'creditSpread', riskCluster: 'credit', enabled: true },
  { id: 'VWO_SPY', displayName: 'Emerging Markets / S&P 500', symbolA: 'VWO.US', symbolB: 'SPY.US', category: 'macro', benchmarkGroup: 'emVsDm', riskCluster: 'geo', enabled: true },
  { id: 'SPY_VGK', displayName: 'S&P 500 / Europe', symbolA: 'SPY.US', symbolB: 'VGK.US', category: 'macro', benchmarkGroup: 'usVsEurope', riskCluster: 'geo', enabled: true },

  // ═══ SECTOR ═══
  { id: 'XLK_XLP', displayName: 'Tech / Staples', symbolA: 'XLK.US', symbolB: 'XLP.US', category: 'sector', benchmarkGroup: 'cyclicalVsDefensive', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'SOXX_XLU', displayName: 'Semis / Utilities', symbolA: 'SOXX.US', symbolB: 'XLU.US', category: 'sector', benchmarkGroup: 'cyclicalVsDefensive', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'XLY_XLP', displayName: 'Discretionary / Staples', symbolA: 'XLY.US', symbolB: 'XLP.US', category: 'sector', benchmarkGroup: 'consumerCycle', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'XLE_XLU', displayName: 'Energy / Utilities', symbolA: 'XLE.US', symbolB: 'XLU.US', category: 'sector', benchmarkGroup: 'realAssets', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'XLF_SPY', displayName: 'Financials / S&P 500', symbolA: 'XLF.US', symbolB: 'SPY.US', category: 'sector', benchmarkGroup: 'financials', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'XLI_XLP', displayName: 'Industrials / Staples', symbolA: 'XLI.US', symbolB: 'XLP.US', category: 'sector', benchmarkGroup: 'cyclicalVsDefensive', riskCluster: 'sector-cyclical', enabled: true },
  { id: 'XLV_XLU', displayName: 'Health Care / Utilities', symbolA: 'XLV.US', symbolB: 'XLU.US', category: 'sector', benchmarkGroup: 'defensive', riskCluster: 'sector-defensive', enabled: true },
  { id: 'XLK_RSP', displayName: 'Tech / Equal Weight S&P', symbolA: 'XLK.US', symbolB: 'RSP.US', category: 'sector', benchmarkGroup: 'benchmarkBias', riskCluster: 'sector-cyclical', enabled: true },

  // ═══ STYLE ═══
  { id: 'QQQ_SPY', displayName: 'NASDAQ / S&P 500', symbolA: 'QQQ.US', symbolB: 'SPY.US', category: 'style', benchmarkGroup: 'growthVsBroad', riskCluster: 'growth', enabled: true },
  { id: 'IWM_SPY', displayName: 'Small Cap / Large Cap', symbolA: 'IWM.US', symbolB: 'SPY.US', category: 'style', benchmarkGroup: 'sizeRotation', riskCluster: 'small-cap', enabled: true },
  { id: 'IVW_IVE', displayName: 'Growth / Value', symbolA: 'IVW.US', symbolB: 'IVE.US', category: 'style', benchmarkGroup: 'styleRotation', riskCluster: 'growth', enabled: true },
  { id: 'SMH_SPY', displayName: 'Semiconductors / S&P 500', symbolA: 'SMH.US', symbolB: 'SPY.US', category: 'style', benchmarkGroup: 'techConcentration', riskCluster: 'growth', enabled: true }
];

/** All unique symbols needed for ratio computation */
export function getUniqueSymbols() {
  const set = new Set();
  for (const r of RATIO_UNIVERSE) {
    if (r.enabled) {
      set.add(r.symbolA);
      set.add(r.symbolB);
    }
  }
  return [...set];
}

/** Data source config per symbol */
export const SYMBOL_META = Object.freeze({
  'BTC-USD.CC': { calendarType: 'crypto', is24x7: true, source: 'eodhd', inceptionDate: '2014-01-01' },
  // All US ETFs default to NYSE calendar
  _default: { calendarType: 'nyse', is24x7: false, source: 'eodhd', inceptionDate: '2000-01-01' }
});

export function getSymbolMeta(symbol) {
  return SYMBOL_META[symbol] || SYMBOL_META._default;
}

/** Block definitions mapping ratios to scoring blocks */
export const BLOCK_DEFS = Object.freeze({
  macroRegime: {
    label: 'Macro Regime',
    ratioIds: ['SPY_GLD', 'SPY_TLT', 'QQQ_DIA', 'BTC_GLD', 'GLD_UUP', 'VWO_SPY', 'SPY_VGK']
  },
  riskAppetite: {
    label: 'Risk Appetite',
    ratioIds: ['HYG_LQD', 'SPY_TLT', 'BTC_GLD', 'XLY_XLP']
  },
  sectorBreadth: {
    label: 'Sector Breadth',
    ratioIds: ['XLK_XLP', 'SOXX_XLU', 'XLY_XLP', 'XLE_XLU', 'XLF_SPY', 'XLI_XLP', 'XLV_XLU', 'XLK_RSP']
  },
  confirmationLiquidity: {
    label: 'Confirmation & Liquidity',
    ratioIds: ['HYG_LQD', 'GLD_UUP', 'QQQ_SPY', 'IWM_SPY']
  }
});
