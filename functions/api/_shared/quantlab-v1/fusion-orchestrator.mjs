/**
 * QuantLab V1 — Fusion Orchestrator
 * Wires all components into a single entry point:
 * adapters → fusion → trade signals → frictions → integrity → ledger.
 */
import { randomUUID } from 'node:crypto';
import { adaptForecast } from './adapters/forecast-adapter.mjs';
import { adaptScientific } from './adapters/scientific-adapter.mjs';
import { adaptElliott } from './adapters/elliott-adapter.mjs';
import { adaptBreakoutV2 } from './adapters/breakout-v2-adapter.mjs';
import { adaptQuantLab } from './adapters/quantlab-adapter.mjs';
import { adaptHistProbs } from './adapters/hist-probs-adapter.mjs';
import { fuseContracts, determineRegimeBucket } from './fusion/fusion-engine-v1.mjs';
import { buildTradeSignal } from './trade/trade-signal-builder.mjs';
import { estimateFrictions } from './execution-frictions.mjs';
import { computeEntryDeadline } from './signal-lifecycle.mjs';
import { buildAuditChain } from './snapshot-integrity.mjs';
import { appendDecision } from './decision-ledger.mjs';
import { getActiveMode, isV1Active } from './cutover-policy.mjs';
import { loadLatestWeights } from './weight-history.mjs';

const PIPELINE_VERSION = 'quantlab-v1.0';
const POLICY_VERSION = '1.0.0';

/**
 * Run the full V1 fusion pipeline for a single symbol + horizon.
 * @param {Object} params
 * @param {string} params.symbol
 * @param {string} params.asof - ISO date
 * @param {string} params.horizon - 'short' | 'medium' | 'long'
 * @param {string} params.asset_class - 'stock' | 'etf'
 * @param {Object} [params.forecastState]
 * @param {Object} [params.scientificState]
 * @param {Object} [params.elliottState]
 * @param {Object} [params.breakoutData]
 * @param {Object} [params.quantlabState]
 * @param {Object} [params.histProbsData]
 * @param {Object} [params.regimeData]
 * @param {Object} [params.priceData] - { close, atr, volatility_bucket, liquidity_bucket }
 * @param {Object} [params.regimeContext] - { current, previous, history } for transition detection
 * @param {Object} [params.legacyDecision] - Legacy decision for comparison in shadow mode
 * @param {boolean} [params.dryRun=false]
 * @returns {Object} Complete DecisionRecord
 */
export async function runV1Fusion({
  symbol, asof, horizon, asset_class,
  forecastState, scientificState, elliottState, breakoutData,
  quantlabState, histProbsData, regimeData, priceData,
  regimeContext, legacyDecision, dryRun = false,
}) {
  const decisionId = randomUUID();
  const adapterContext = { symbol, horizon, asof };

  // 1. Run adapters → SignalContracts
  const contracts = [];
  if (forecastState) {
    const c = adaptForecast(forecastState, adapterContext);
    if (c) contracts.push(c);
  }
  if (scientificState) {
    const c = adaptScientific(scientificState, adapterContext);
    if (c) contracts.push(c);
  }
  if (elliottState) {
    const c = adaptElliott(elliottState, adapterContext);
    if (c) contracts.push(c);
  }
  if (breakoutData) {
    const c = adaptBreakoutV2(breakoutData, adapterContext);
    if (c) contracts.push(c);
  }
  if (quantlabState) {
    const c = adaptQuantLab(quantlabState, adapterContext);
    if (c) contracts.push(c);
  }
  if (histProbsData) {
    const c = adaptHistProbs(histProbsData, regimeData, adapterContext);
    if (c) contracts.push(c);
  }

  if (contracts.length === 0) {
    return { decision_id: decisionId, symbol, horizon, verdict: 'WAIT', reason: 'no_contracts', contracts: [] };
  }

  // 2. Determine regime bucket
  const regimeProbs = contracts.find(c => c.regime_probs)?.regime_probs || null;
  const regimeBucket = determineRegimeBucket(regimeProbs);

  // 3. Fuse contracts
  const fusionResult = fuseContracts(contracts, {
    horizon,
    asset_class,
    regime_bucket: regimeBucket,
    regimeContext,
  });

  // 4. Derive verdict from fused score
  let verdict = 'WAIT';
  if (fusionResult.fused_score > 0.3 && fusionResult.fused_confidence > 0.4) {
    verdict = 'BUY';
  } else if (fusionResult.fused_score < -0.3 && fusionResult.fused_confidence > 0.4) {
    verdict = 'SELL';
  }

  // 5. Build trade signal (BUY/SELL only)
  const tradeSignal = (verdict === 'BUY' || verdict === 'SELL')
    ? buildTradeSignal(verdict, contracts, fusionResult, priceData || {}, horizon)
    : null;

  // 6. Estimate execution frictions
  let frictions = null;
  if (tradeSignal && priceData) {
    frictions = estimateFrictions({
      close: priceData.close || 0,
      atr: priceData.atr || null,
      volatility_bucket: priceData.volatility_bucket || 'medium',
      liquidity_bucket: priceData.liquidity_bucket || 'medium',
    });
  }

  // 7. Build lifecycle metadata
  const entryDeadline = computeEntryDeadline(horizon, asof);

  // 8. Load current weights for audit
  const currentWeights = loadLatestWeights();

  // 9. Assemble DecisionRecord
  const record = {
    decision_id: decisionId,
    symbol,
    asset_class,
    horizon,
    asof,
    pipeline_version: PIPELINE_VERSION,
    policy_version: POLICY_VERSION,
    weights_version: currentWeights.version || 'unknown',
    code_ref: PIPELINE_VERSION,
    contracts,
    fusion_result: fusionResult,
    verdict,
    confidence: fusionResult.fused_confidence,
    fallback_level: fusionResult.fallback_level,
    fallback_reason: null,
    regime_probs: regimeProbs,
    regime_bucket: regimeBucket,
    regime_transition_active: fusionResult.regime_transition_active || false,
    volatility_bucket: priceData?.volatility_bucket || 'medium',
    trade_signal: tradeSignal,
    execution_frictions: frictions,
    entry_valid_until: entryDeadline,
    blocking_reasons: [],
    data_quality_flags: [...(fusionResult.data_quality_flags || [])],
    legacy_verdict: legacyDecision?.verdict || null,
    mode: getActiveMode(),
    created_at: new Date().toISOString(),
  };

  // 10. Compute integrity chain hashes
  const auditContext = {
    contracts,
    weights: currentWeights.weights || {},
    policy: { version: POLICY_VERSION, mode: getActiveMode() },
    fusionResult,
  };

  // 11. Write to ledger (hashes computed inside appendDecision)
  if (!dryRun && isV1Active()) {
    appendDecision(record, auditContext);
  } else if (!dryRun) {
    // Shadow mode: still write but mark
    record.shadow_only = true;
    appendDecision(record, auditContext);
  }

  return record;
}
