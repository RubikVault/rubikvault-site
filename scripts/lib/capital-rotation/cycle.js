/**
 * Capital Rotation Monitor — Cycle Position Detection
 */

const CYCLE_STATES = [
  'Early Rotation',
  'Mid Rotation',
  'Late Rotation',
  'Exhausted',
  'Reversal Watch',
  'Neutral / Undefined'
];

/**
 * Detect cycle position from ratio-level and global-level signals.
 * @param {number|null} percentile - current 5Y percentile (0-100)
 * @param {number|null} longPercentile - 10-20Y percentile (0-100)
 * @param {number|null} zScore - current z-score
 * @param {number} ramComposite - RAM composite
 * @param {number|null} slope - trend slope
 * @returns {{positionPct:number, state:string, confidence:number, description:string}}
 */
export function detectCyclePosition(percentile, longPercentile, zScore, ramComposite, slope) {
  // Insufficient data → Neutral
  if (percentile == null) {
    return {
      positionPct: 50,
      state: 'Neutral / Undefined',
      confidence: 0.2,
      description: 'Insufficient history for cycle detection.'
    };
  }

  // Compute position percentage based on percentile + momentum direction
  const momentumDir = ramComposite > 0.3 ? 1 : ramComposite < -0.3 ? -1 : 0;
  const slopeDir = slope != null ? (slope > 0.002 ? 1 : slope < -0.002 ? -1 : 0) : 0;

  // Cycle state logic
  let state, confidence, description;

  if (percentile < 20 && momentumDir >= 0 && slopeDir >= 0) {
    state = 'Early Rotation';
    confidence = 0.7;
    description = 'Ratio near historical lows with improving momentum — potential early rotation signal.';
  } else if (percentile >= 20 && percentile < 50 && momentumDir > 0) {
    state = 'Mid Rotation';
    confidence = 0.75;
    description = 'Ratio advancing from low levels with positive momentum — rotation in progress.';
  } else if (percentile >= 50 && percentile < 80 && momentumDir > 0) {
    state = 'Late Rotation';
    confidence = 0.7;
    description = 'Ratio at elevated levels with continued momentum — late stage rotation.';
  } else if (percentile >= 80) {
    if (momentumDir <= 0 || slopeDir < 0) {
      state = 'Exhausted';
      confidence = 0.65;
      description = 'Ratio at historical extremes with fading momentum — rotation may be exhausted.';
    } else {
      state = 'Late Rotation';
      confidence = 0.55;
      description = 'Ratio at extremes but momentum still positive — extended late rotation.';
    }
  } else if (percentile > 60 && momentumDir < 0 && slopeDir < 0) {
    state = 'Reversal Watch';
    confidence = 0.6;
    description = 'Ratio declining from elevated levels — potential reversal underway.';
  } else if (percentile < 40 && momentumDir < 0) {
    state = 'Reversal Watch';
    confidence = 0.55;
    description = 'Ratio declining from mid-range — watch for acceleration.';
  } else {
    state = 'Neutral / Undefined';
    confidence = 0.4;
    description = 'No clear cycle signal — mixed or neutral positioning.';
  }

  // Adjust confidence if long percentile available and agrees
  if (longPercentile != null) {
    const agreement = Math.abs(percentile - longPercentile) < 20;
    if (agreement) confidence = Math.min(confidence + 0.1, 1);
    else confidence = Math.max(confidence - 0.1, 0.2);
  }

  const positionPct = Math.round(percentile);

  return { positionPct, state, confidence: Math.round(confidence * 100) / 100, description };
}

export { CYCLE_STATES };
