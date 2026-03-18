/**
 * Capital Rotation Monitor — Divergence Engine
 * Deterministic rule-based divergence detection.
 */

/**
 * Run all divergence rules.
 * @param {object} ctx - { ratioResults, globalScore, blockScores, confirmations, asOfDate }
 * @returns {Array<{id,title,category,severity,supportsOrContradicts,explanation,triggeredBy,asOfDate}>}
 */
export function detectDivergences(ctx) {
  const { ratioResults, globalScore, blockScores, confirmations, asOfDate } = ctx;
  const divergences = [];
  const date = asOfDate || new Date().toISOString().slice(0, 10);

  // Rule 1: SPY up + HYG/LQD down → liquidity divergence
  const spyTlt = ratioResults['SPY_TLT'];
  const hygLqd = ratioResults['HYG_LQD'];
  if (spyTlt?.returns?.[21] > 0.01 && hygLqd?.returns?.[21] < -0.01) {
    divergences.push({
      id: 'liquidity-divergence',
      title: 'Liquidity Divergence',
      category: 'credit',
      severity: 'warning',
      supportsOrContradicts: 'contradicts',
      explanation: 'Equities gained relative strength vs bonds, but credit spreads widened (HYG/LQD falling). Credit is not confirming the equity move.',
      triggeredBy: ['SPY_TLT', 'HYG_LQD'],
      asOfDate: date
    });
  }

  // Rule 2: QQQ up + QQQ/SPY down → internal growth weakness
  const qqqSpy = ratioResults['QQQ_SPY'];
  const qqqDia = ratioResults['QQQ_DIA'];
  if (qqqDia?.returns?.[21] > 0.01 && qqqSpy?.returns?.[21] < -0.005) {
    divergences.push({
      id: 'growth-weakness',
      title: 'Internal Growth Weakness',
      category: 'style',
      severity: 'info',
      supportsOrContradicts: 'contradicts',
      explanation: 'QQQ gained vs DIA (growth vs value broad) but lost vs SPY, suggesting narrow leadership within growth.',
      triggeredBy: ['QQQ_DIA', 'QQQ_SPY'],
      asOfDate: date
    });
  }

  // Rule 3: Market sideways + XLU/SPY rising → defensive rotation
  const spyGld = ratioResults['SPY_GLD'];
  // Use XLV_XLU or find a utility ratio; we approximate with sector breadth block
  if (spyGld && Math.abs(spyGld.returns?.[21] ?? 0) < 0.015) {
    const xlkXlp = ratioResults['XLK_XLP'];
    if (xlkXlp?.returns?.[21] < -0.01) {
      divergences.push({
        id: 'defensive-rotation',
        title: 'Defensive Rotation Under Surface',
        category: 'sector',
        severity: 'warning',
        supportsOrContradicts: 'contradicts',
        explanation: 'Market appears stable but cyclical sectors (Tech) are losing relative strength vs defensive (Staples), suggesting hidden rotation toward safety.',
        triggeredBy: ['SPY_GLD', 'XLK_XLP'],
        asOfDate: date
      });
    }
  }

  // Rule 4: Gold flat + GLD/UUP rising → metal resilience vs dollar
  const gldUup = ratioResults['GLD_UUP'];
  if (gldUup?.returns?.[21] > 0.02 && Math.abs(spyGld?.returns?.[21] ?? 0) < 0.01) {
    divergences.push({
      id: 'metal-resilience',
      title: 'Gold Resilience vs Dollar',
      category: 'macro',
      severity: 'info',
      supportsOrContradicts: 'supports',
      explanation: 'Gold gained relative strength against the dollar while equity/gold ratio was flat, suggesting safe-haven demand independent of equity weakness.',
      triggeredBy: ['GLD_UUP', 'SPY_GLD'],
      asOfDate: date
    });
  }

  // Rule 5: Neutral score + macro vs sector opposed → regime conflict
  if (globalScore >= 40 && globalScore <= 60 && blockScores) {
    const macro = blockScores.macroRegime?.score;
    const sector = blockScores.sectorBreadth?.score;
    if (macro != null && sector != null && Math.abs(macro - sector) > 25) {
      divergences.push({
        id: 'regime-conflict',
        title: 'Regime Conflict',
        category: 'regime',
        severity: 'warning',
        supportsOrContradicts: 'contradicts',
        explanation: `Global score is neutral (${globalScore}) but macro regime (${macro}) and sector breadth (${sector}) disagree significantly.`,
        triggeredBy: ['macroRegime', 'sectorBreadth'],
        asOfDate: date
      });
    }
  }

  // Rule 6: High risk-on + VIX rising → volatility contradiction
  if (globalScore > 65 && confirmations?.vix?.direction === 'elevated') {
    divergences.push({
      id: 'vol-contradiction',
      title: 'Volatility Contradiction',
      category: 'risk',
      severity: 'alert',
      supportsOrContradicts: 'contradicts',
      explanation: `Rotation score is risk-on (${globalScore}) but volatility is elevated. Risk-on signals may be fragile.`,
      triggeredBy: ['globalScore', 'vix'],
      asOfDate: date
    });
  }

  // Rule 7: SPY stable + SOXX/XLU declining → cyclical breadth erosion
  const soxxXlu = ratioResults['SOXX_XLU'];
  if (spyTlt?.returns?.[21] > 0 && soxxXlu?.returns?.[21] < -0.02) {
    divergences.push({
      id: 'breadth-erosion',
      title: 'Cyclical Breadth Erosion',
      category: 'sector',
      severity: 'warning',
      supportsOrContradicts: 'contradicts',
      explanation: 'Equities stable but semiconductors losing ground vs utilities, suggesting cyclical breadth is narrowing.',
      triggeredBy: ['SPY_TLT', 'SOXX_XLU'],
      asOfDate: date
    });
  }

  return divergences;
}
