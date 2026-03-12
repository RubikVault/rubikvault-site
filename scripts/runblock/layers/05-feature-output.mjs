/**
 * RUNBLOCK v3.0 — Layer 5: Feature Output
 *
 * No feature output may bypass upstream layers.
 * All outputs gated by global state, regime, data quality.
 */

/**
 * Gate Scientific Analyzer output.
 *
 * @param {Object} params
 * @param {string} params.globalState - GREEN|YELLOW|ORANGE|RED
 * @param {string} params.dataQuality - PASS|SUSPECT|FAIL
 * @param {string} params.regimeTag - Current regime
 * @param {Object} params.liquidityBucket - From liquidity-bucket service
 * @param {boolean} params.fallbackUsed
 * @returns {{ allowed: boolean, model_state: string, reason_codes: string[] }}
 */
export function gateScientificOutput({ globalState, dataQuality, regimeTag, liquidityBucket, fallbackUsed, featureState }) {
  const reasons = [];

  if (globalState === 'RED') {
    return { allowed: false, model_state: 'BLOCKED', reason_codes: ['GLOBAL_RED'] };
  }
  if (dataQuality === 'FAIL') {
    return { allowed: false, model_state: 'BLOCKED', reason_codes: ['DATA_FAIL'] };
  }
  if (featureState === 'SUPPRESSED') {
    return { allowed: true, model_state: 'SUPPRESSED', reason_codes: ['UPSTREAM_SUPPRESSED'] };
  }
  if (featureState === 'DEGRADED') {
    reasons.push('UPSTREAM_DEGRADED');
    return { allowed: true, model_state: 'DEGRADED', reason_codes: reasons };
  }
  if (globalState === 'ORANGE') {
    reasons.push('DEGRADED_MODE');
    return { allowed: true, model_state: 'DEGRADED', reason_codes: reasons };
  }
  if (fallbackUsed) {
    reasons.push('FALLBACK_ACTIVE');
    return { allowed: true, model_state: 'FALLBACK', reason_codes: reasons };
  }
  if (!liquidityBucket?.tradability) {
    reasons.push('UNTRADABLE_BUCKET');
    return { allowed: true, model_state: 'INFORMATIONAL', reason_codes: reasons };
  }

  return { allowed: true, model_state: 'ACTIVE', reason_codes: [] };
}

/**
 * Gate ML Forecast output.
 *
 * @param {Object} params - Same as gateScientificOutput + horizons
 * @returns {{ allowed: boolean, state: string, suppressed_horizons: string[], reason_codes: string[] }}
 */
export function gateForecastOutput({ globalState, dataQuality, validationReady, nonIndependent, featureState }) {
  if (globalState === 'RED') {
    return { allowed: false, state: 'BLOCKED', suppressed_horizons: ['1d', '5d', '20d'], reason_codes: ['GLOBAL_RED'] };
  }
  if (dataQuality === 'FAIL') {
    return { allowed: false, state: 'BLOCKED', suppressed_horizons: ['1d', '5d', '20d'], reason_codes: ['DATA_FAIL'] };
  }
  if (featureState === 'SUPPRESSED') {
    return { allowed: true, state: 'SUPPRESSED', suppressed_horizons: ['1d', '5d', '20d'], reason_codes: ['UPSTREAM_SUPPRESSED'] };
  }

  const suppressed = [];
  const reasons = [];

  if (!validationReady) {
    reasons.push('VALIDATION_NOT_READY');
    return { allowed: true, state: 'SUPPRESSED', suppressed_horizons: ['1d', '5d', '20d'], reason_codes: reasons };
  }
  if (nonIndependent) {
    suppressed.push('5d', '20d');
    reasons.push('NON_INDEPENDENT_HORIZONS');
  }

  return {
    allowed: true,
    state: suppressed.length ? 'PARTIAL' : 'ACTIVE',
    suppressed_horizons: suppressed,
    reason_codes: reasons,
  };
}

/**
 * Gate Elliott Wave output.
 * V1/V3 base: passive only, no directional score.
 *
 * @param {Object} params
 * @returns {{ allowed: boolean, mode: 'PASSIVE'|'INVALIDATED'|'BLOCKED', no_directional: boolean, reason_codes: string[] }}
 */
export function gateElliottOutput({ globalState, dataQuality, structuralConfidence, v2Enabled = false, featureState }) {
  if (globalState === 'RED') {
    return { allowed: false, mode: 'BLOCKED', no_directional: true, reason_codes: ['GLOBAL_RED'] };
  }
  if (featureState === 'INVALIDATED') {
    return { allowed: true, mode: 'INVALIDATED', no_directional: true, reason_codes: ['UPSTREAM_INVALIDATED'] };
  }

  if (structuralConfidence != null && structuralConfidence < 0.3) {
    return { allowed: true, mode: 'INVALIDATED', no_directional: true, reason_codes: ['LOW_STRUCTURAL_CONFIDENCE'] };
  }

  return {
    allowed: true,
    mode: 'PASSIVE',
    no_directional: !v2Enabled,
    reason_codes: v2Enabled ? [] : ['V1_PASSIVE_ONLY'],
  };
}

/**
 * Build complete feature output payload with all gates applied.
 *
 * @param {Object} params
 * @returns {Object} Feature output with gates, state, and metadata
 */
export function buildFeaturePayload({
  ticker,
  snapshotId,
  globalState,
  dataQuality,
  regimeTag,
  scientific,
  forecast,
  elliott,
  liquidityBucket,
  costModel,
  elliottV2Enabled = false,
}) {
  const sciGate = gateScientificOutput({
    globalState,
    dataQuality,
    regimeTag,
    liquidityBucket,
    fallbackUsed: scientific?.fallback_used,
    featureState: scientific?.state,
  });

  const fcGate = gateForecastOutput({
    globalState,
    dataQuality,
    validationReady: forecast?.validation_ready,
    nonIndependent: forecast?.non_independent,
    featureState: forecast?.state,
  });

  const ewGate = gateElliottOutput({
    globalState,
    dataQuality,
    structuralConfidence: elliott?.structural_confidence,
    featureState: elliott?.state,
    v2Enabled: elliottV2Enabled,
  });

  const scientificPayload = sciGate.allowed && !['BLOCKED', 'SUPPRESSED'].includes(sciGate.model_state)
    ? {
        ...scientific,
        ModelState: sciGate.model_state,
        fallback_used: Boolean(scientific?.fallback_used || sciGate.model_state !== 'ACTIVE'),
        reason_codes: [...new Set([...(scientific?.reason_codes || []), ...sciGate.reason_codes])],
        tradability_flag: liquidityBucket?.tradability ?? scientific?.tradability_flag ?? false,
        liquidity_bucket: liquidityBucket?.bucket || null,
      }
    : {
        ModelState: sciGate.model_state,
        fallback_used: true,
        reason_codes: sciGate.reason_codes,
        tradability_flag: liquidityBucket?.tradability ?? false,
        liquidity_bucket: liquidityBucket?.bucket || null,
        regime_tag: regimeTag,
        data_quality_state: dataQuality,
      };

  const forecastPayload = fcGate.state === 'ACTIVE' || fcGate.state === 'PARTIAL'
    ? {
        ...forecast,
        state: fcGate.state,
        reason_codes: [...new Set([...(forecast?.reason_codes || []), ...fcGate.reason_codes])],
        suppressed_horizons: fcGate.suppressed_horizons,
      }
    : {
        state: fcGate.state,
        direction_prob: null,
        expected_move_net: null,
        uncertainty_band: null,
        reason_codes: fcGate.reason_codes,
        suppressed_horizons: fcGate.suppressed_horizons,
        regime_tag: regimeTag,
      };

  const elliottPayload = {
    ...elliott,
    state: ewGate.mode,
    reason_codes: [...new Set([...(elliott?.reason_codes || []), ...ewGate.reason_codes])],
    directional_score: ewGate.no_directional ? null : elliott?.directional_score ?? null,
    direction_label: ewGate.no_directional ? null : elliott?.direction_label ?? null,
    no_directional: ewGate.no_directional,
  };

  return {
    ticker,
    snapshot_id: snapshotId,
    global_state: globalState,
    regime_tag: regimeTag,
    data_quality: dataQuality,
    liquidity: liquidityBucket,
    scientific: {
      ...scientificPayload,
      gate: sciGate,
    },
    forecast: {
      ...forecastPayload,
      gate: fcGate,
    },
    elliott: {
      ...elliottPayload,
      gate: ewGate,
    },
    generated_at: new Date().toISOString(),
  };
}
