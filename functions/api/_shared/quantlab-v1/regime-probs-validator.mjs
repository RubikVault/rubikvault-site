/**
 * QuantLab V1 — Regime Probs Validator
 * Validates regime probability objects and flags fabricated/uniform distributions.
 */

const REQUIRED_KEYS = ['bull', 'chop', 'bear'];
const OPTIONAL_KEYS = ['high_vol'];
const SUM_TOLERANCE = 0.05;
const UNIFORM_TOLERANCE = 0.02;

/**
 * Validate a regime_probs object.
 * @param {Object|null|undefined} probs - { bull, chop, bear, high_vol? }
 * @param {string[]} [flags=[]] - Existing data_quality_flags array
 * @returns {{ valid: boolean, warnings: string[], adjusted_flags: string[] }}
 */
export function validateRegimeProbs(probs, flags = []) {
  const adjusted_flags = [...flags];
  const warnings = [];

  if (!probs || typeof probs !== 'object') {
    warnings.push('regime_probs missing entirely');
    if (!adjusted_flags.includes('missing_regime_probs')) {
      adjusted_flags.push('missing_regime_probs');
    }
    return { valid: false, warnings, adjusted_flags };
  }

  // Check required keys present and numeric
  for (const key of REQUIRED_KEYS) {
    if (typeof probs[key] !== 'number' || !Number.isFinite(probs[key])) {
      warnings.push(`regime_probs.${key} is not a valid number`);
      if (!adjusted_flags.includes('missing_regime_probs')) {
        adjusted_flags.push('missing_regime_probs');
      }
      return { valid: false, warnings, adjusted_flags };
    }
  }

  // Check values in [0, 1]
  for (const key of [...REQUIRED_KEYS, ...OPTIONAL_KEYS]) {
    const val = probs[key];
    if (typeof val === 'number' && (val < 0 || val > 1)) {
      warnings.push(`regime_probs.${key} = ${val} is outside [0, 1]`);
    }
  }

  // Check sum ≈ 1.0
  const sum = REQUIRED_KEYS.reduce((s, k) => s + (probs[k] || 0), 0) + (probs.high_vol || 0);
  if (Math.abs(sum - 1.0) > SUM_TOLERANCE) {
    warnings.push(`regime_probs sum = ${sum.toFixed(3)}, expected ~1.0`);
  }

  // Detect uniform/fabricated distribution
  const values = REQUIRED_KEYS.map(k => probs[k]);
  const allClose = values.every((v, _, arr) => Math.abs(v - arr[0]) <= UNIFORM_TOLERANCE);
  if (allClose) {
    warnings.push('regime_probs appear uniform/fabricated');
    if (!adjusted_flags.includes('uniform_regime_probs')) {
      adjusted_flags.push('uniform_regime_probs');
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    adjusted_flags,
  };
}
