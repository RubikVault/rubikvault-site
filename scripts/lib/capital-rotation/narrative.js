/**
 * Capital Rotation Monitor — Structured Narrative Engine
 * Emits semantic codes + params — frontend resolves to text via narrative-dictionary.json.
 * No freeform string building. No LLM.
 */

/**
 * Generate structured narrative from computed data.
 * @param {object} ctx
 * @returns {{headline: object, blocks: object[], generatedAt: string, legacy_text: string}}
 */
export function generateNarrative(ctx) {
  const { globalScore, regime, confidence, confidenceLabel, neutralMode,
    blockScores, cycle, confirmations, divergences } = ctx;

  const blocks = [];
  const now = new Date().toISOString();

  // Block 1: Headline (structured)
  const headline = buildHeadline(globalScore, regime, confidenceLabel, neutralMode);

  // Block 2: Global State
  blocks.push({
    type: 'global_state',
    primary_code: 'GLOBAL_SCORE',
    params: { score: globalScore, regime, confidence_label: confidenceLabel },
    severity: globalScore <= 20 ? 'warn' : globalScore >= 80 ? 'caution' : 'info',
  });

  // Block 3: Rotation Focus
  blocks.push(buildRotationFocus(blockScores));

  // Block 4: Cycle Context
  if (cycle?.state && cycle.state !== 'Neutral / Undefined') {
    blocks.push({
      type: 'cycle',
      primary_code: 'CYCLE_POSITION',
      params: { state: cycle.state, position_pct: cycle.positionPct, description: cycle.description || null },
      severity: cycle.positionPct > 80 ? 'warn' : cycle.positionPct < 20 ? 'caution' : 'info',
    });
  }

  // Block 5: Watch Item
  const watchBlock = buildWatchBlock(divergences, confirmations, confidenceLabel, neutralMode);
  if (watchBlock) blocks.push(watchBlock);

  // Legacy fallback text (for consumers not yet migrated)
  const legacy_text = buildLegacyText(headline, blocks);

  return { headline, blocks: blocks.slice(0, 4), generatedAt: now, legacy_text };
}

function buildHeadline(score, regime, confLabel, neutralMode) {
  if (neutralMode === 'conflicted') {
    return { primary_code: 'NEUTRAL_CONFLICTED', params: { score }, severity: 'caution' };
  }
  if (neutralMode === 'quiet') {
    return { primary_code: 'NEUTRAL_QUIET', params: { score }, severity: 'info' };
  }
  let code;
  if (score <= 20) code = 'DEEP_RISK_OFF';
  else if (score <= 40) code = 'CAUTIOUS';
  else if (score <= 60) code = 'NEUTRAL';
  else if (score <= 80) code = 'RISK_ON';
  else code = 'EXTREME_RISK_ON';

  return { primary_code: code, params: { score, regime, confidence_label: confLabel }, severity: score <= 20 || score >= 80 ? 'caution' : 'info' };
}

function buildRotationFocus(blockScores) {
  if (!blockScores) {
    return { type: 'rotation_focus', primary_code: 'NO_BLOCK_DATA', params: {}, severity: 'info' };
  }
  const entries = Object.entries(blockScores)
    .filter(([, b]) => b && Number.isFinite(b.score))
    .sort(([, a], [, b]) => b.score - a.score);

  if (!entries.length) {
    return { type: 'rotation_focus', primary_code: 'NO_BLOCK_DATA', params: {}, severity: 'info' };
  }

  const [topId, topBlock] = entries[0];
  const [bottomId, bottomBlock] = entries[entries.length - 1];

  return {
    type: 'rotation_focus',
    primary_code: topBlock.score > 60 ? 'STRONG_LEADER' : 'BALANCED',
    params: {
      top_block: topId, top_score: topBlock.score,
      bottom_block: bottomId, bottom_score: bottomBlock.score,
    },
    severity: topBlock.score > 70 ? 'info' : 'info',
  };
}

function buildWatchBlock(divergences, confirmations, confLabel, neutralMode) {
  const codes = [];
  const params = {};

  if (divergences?.length) {
    const top = divergences.find(d => d.severity === 'alert') || divergences[0];
    codes.push('DIVERGENCE');
    params.divergence_title = top.title;
    params.divergence_count = divergences.length;
  }

  const contradictions = Object.values(confirmations || {}).filter(c => c.supportsRotation === 'no');
  if (contradictions.length) {
    codes.push('CONTRADICTION');
    params.contradiction_sources = contradictions.map(c => c.source);
  }

  if (confLabel === 'Low') {
    codes.push('LOW_CONFIDENCE');
  }

  if (!codes.length) return null;
  return {
    type: 'watch',
    primary_code: codes[0],
    secondary_codes: codes.slice(1),
    params,
    severity: codes.includes('DIVERGENCE') ? 'warn' : 'caution',
  };
}

/**
 * Build legacy text for consumers not yet using structured payloads.
 * Marked as transitional — will be removed once all consumers use dictionary rendering.
 */
function buildLegacyText(headline, blocks) {
  const parts = [];
  const score = headline.params?.score ?? 50;
  const code = headline.primary_code;

  // Headline
  const headlineMap = {
    NEUTRAL_CONFLICTED: `Rotation score neutral (${score}/100) with conflicting block signals.`,
    NEUTRAL_QUIET: `Rotation score neutral (${score}/100) — quiet, no strong signal.`,
    DEEP_RISK_OFF: `Deep risk-off (${score}/100). Capital rotating toward safety.`,
    CAUTIOUS: `Cautious positioning (${score}/100). Defensive assets favored.`,
    NEUTRAL: `Neutral rotation (${score}/100). No dominant direction.`,
    RISK_ON: `Risk-on rotation active (${score}/100). Growth assets gaining.`,
    EXTREME_RISK_ON: `Extreme risk-on (${score}/100). Strong risk-asset momentum.`,
  };
  parts.push(headlineMap[code] || `Score: ${score}/100`);

  // Blocks
  for (const b of blocks) {
    if (b.primary_code === 'STRONG_LEADER') {
      parts.push(`${b.params.top_block} leads at ${b.params.top_score}.`);
    }
    if (b.primary_code === 'CYCLE_POSITION') {
      parts.push(`Cycle: ${b.params.state}.`);
    }
    if (b.type === 'watch') {
      if (b.params.divergence_title) parts.push(`Watch: ${b.params.divergence_title}.`);
    }
  }

  return parts.join(' ');
}
