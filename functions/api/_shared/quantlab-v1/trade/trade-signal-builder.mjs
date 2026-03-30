/**
 * QuantLab V1 — TradeSignal Builder
 * Constructs actionable, auditable trade definitions from fusion results.
 */

const HORIZON_HOLD_DAYS = { short: 5, medium: 20, long: 60 };

/**
 * Build a TradeSignal from verdict, contracts, fusion result, and price data.
 * @param {string} verdict - 'BUY' | 'SELL'
 * @param {Object[]} contracts - Array of SignalContracts
 * @param {Object} fusionResult - Output from fuseContracts()
 * @param {Object} priceData - { close, atr, support_levels?, resistance_levels?, breakout_level? }
 * @param {string} [horizon='medium']
 * @returns {Object|null} TradeSignal or null for WAIT
 */
export function buildTradeSignal(verdict, contracts, fusionResult, priceData, horizon = 'medium') {
  if (verdict !== 'BUY' && verdict !== 'SELL') return null;
  if (!priceData || typeof priceData.close !== 'number') return null;

  const close = priceData.close;
  const atr = typeof priceData.atr === 'number' && priceData.atr > 0 ? priceData.atr : null;

  const { stopLoss, stopMethodology } = resolveStop(verdict, contracts, priceData, atr, fusionResult);
  const { targets, targetMethodology } = resolveTargets(verdict, close, stopLoss, priceData);
  const entryZone = resolveEntryZone(verdict, close, atr);
  const drivers = resolvePrimaryDrivers(contracts, fusionResult);
  const quality = gradeSignalQuality(fusionResult);

  return {
    decision: verdict,
    entry_zone: entryZone,
    stop_loss: stopLoss,
    stop_methodology: stopMethodology,
    target_methodology: targetMethodology,
    targets,
    invalidation_rule: buildInvalidationRule(verdict, stopLoss, stopMethodology),
    max_hold_days: HORIZON_HOLD_DAYS[horizon] || 20,
    position_size_hint: quality === 'A' ? 'full' : quality === 'B' ? 'half' : 'quarter',
    primary_drivers: drivers,
    signal_quality: quality,
  };
}

function resolveStop(verdict, contracts, priceData, atr, fusionResult) {
  const contributions = fusionResult?.source_contributions || {};

  // Breakout stop — only if breakout_v2 has meaningful fusion weight (>15%)
  const breakout = contracts.find(c => c.source === 'breakout_v2');
  const breakoutWeight = contributions.breakout_v2?.effective_weight || 0;
  if (breakout && breakout.raw_payload?.breakout_level && breakoutWeight > 0.15) {
    const bl = Number(breakout.raw_payload.breakout_level);
    if (Number.isFinite(bl) && bl > 0) {
      return {
        stopLoss: verdict === 'BUY' ? bl * 0.98 : bl * 1.02,
        stopMethodology: 'breakout_level',
      };
    }
  }

  // Structural stop — only if scientific has meaningful fusion weight (>10%)
  const scientific = contracts.find(c => c.source === 'scientific');
  const scientificWeight = contributions.scientific?.effective_weight || 0;
  if (scientific?.raw_payload && scientificWeight > 0.10) {
    const rp = scientific.raw_payload;
    const supports = rp.support_levels || priceData.support_levels;
    const resistances = rp.resistance_levels || priceData.resistance_levels;

    if (verdict === 'BUY' && Array.isArray(supports) && supports.length > 0) {
      const nearestSupport = supports.filter(s => typeof s === 'number' && s < priceData.close)
        .sort((a, b) => b - a)[0];
      if (nearestSupport) {
        return { stopLoss: nearestSupport * 0.99, stopMethodology: 'structural' };
      }
    }
    if (verdict === 'SELL' && Array.isArray(resistances) && resistances.length > 0) {
      const nearestRes = resistances.filter(r => typeof r === 'number' && r > priceData.close)
        .sort((a, b) => a - b)[0];
      if (nearestRes) {
        return { stopLoss: nearestRes * 1.01, stopMethodology: 'structural' };
      }
    }
  }

  // ATR-based fallback
  if (atr) {
    const multiplier = 1.5;
    return {
      stopLoss: verdict === 'BUY' ? priceData.close - atr * multiplier : priceData.close + atr * multiplier,
      stopMethodology: 'atr_based',
    };
  }

  // Last resort: percentage-based
  const pct = 0.03;
  return {
    stopLoss: verdict === 'BUY' ? priceData.close * (1 - pct) : priceData.close * (1 + pct),
    stopMethodology: 'atr_based',
  };
}

function resolveTargets(verdict, close, stopLoss, priceData) {
  if (stopLoss == null) return { targets: null, targetMethodology: 'risk_ratio' };

  const risk = Math.abs(close - stopLoss);
  if (risk <= 0) return { targets: null, targetMethodology: 'risk_ratio' };

  let structuralCount = 0;
  let rrCount = 0;

  if (verdict === 'BUY') {
    const resistances = (priceData.resistance_levels || [])
      .filter(r => typeof r === 'number' && r > close)
      .sort((a, b) => a - b);

    const t1 = resistances[0] || (rrCount++, close + risk * 1.5);
    const t2 = resistances[1] || (rrCount++, close + risk * 2.5);
    const t3 = resistances[2] || (rrCount++, close + risk * 4);
    if (resistances[0]) structuralCount++;
    if (resistances[1]) structuralCount++;
    if (resistances[2]) structuralCount++;

    const methodology = structuralCount === 0 ? 'risk_ratio' : rrCount === 0 ? 'structural' : 'hybrid';
    return { targets: { t1, t2, t3 }, targetMethodology: methodology };
  }

  // SELL targets
  const supports = (priceData.support_levels || [])
    .filter(s => typeof s === 'number' && s < close)
    .sort((a, b) => b - a);

  const t1 = supports[0] || (rrCount++, close - risk * 1.5);
  const t2 = supports[1] || (rrCount++, close - risk * 2.5);
  const t3 = supports[2] || (rrCount++, close - risk * 4);
  if (supports[0]) structuralCount++;
  if (supports[1]) structuralCount++;
  if (supports[2]) structuralCount++;

  const methodology = structuralCount === 0 ? 'risk_ratio' : rrCount === 0 ? 'structural' : 'hybrid';
  return { targets: { t1, t2, t3 }, targetMethodology: methodology };
}

function resolveEntryZone(verdict, close, atr) {
  if (!atr) return { low: close * 0.995, high: close * 1.005 };
  const halfATR = atr * 0.5;
  return verdict === 'BUY'
    ? { low: close - halfATR * 0.3, high: close + halfATR * 0.2 }
    : { low: close - halfATR * 0.2, high: close + halfATR * 0.3 };
}

function resolvePrimaryDrivers(contracts, fusionResult) {
  const contributions = fusionResult.source_contributions || {};
  return Object.entries(contributions)
    .sort((a, b) => Math.abs(b[1].contribution || 0) - Math.abs(a[1].contribution || 0))
    .slice(0, 3)
    .map(([source, data]) => {
      const dir = data.direction_score > 0 ? 'bullish' : data.direction_score < 0 ? 'bearish' : 'neutral';
      return `${source}: ${dir} (w=${(data.effective_weight || 0).toFixed(3)})`;
    });
}

function gradeSignalQuality(fusionResult) {
  const conf = fusionResult.fused_confidence || 0;
  const score = Math.abs(fusionResult.fused_score || 0);
  const combined = conf * 0.6 + score * 0.4;
  if (combined >= 0.65) return 'A';
  if (combined >= 0.45) return 'B';
  return 'C';
}

function buildInvalidationRule(verdict, stopLoss, methodology) {
  if (!stopLoss) return null;
  const action = verdict === 'BUY' ? 'close below' : 'close above';
  return `${action} $${stopLoss.toFixed(2)} (${methodology})`;
}
