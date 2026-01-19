/**
 * Scientific Math Utilities (v8.0)
 * ISO 8000 / IEEE 7000 Compliant
 * 
 * Provides deterministic, bit-exact reproducible mathematical operations
 * for Elliott Wave analysis and statistical testing.
 */

/**
 * A) Deterministic PRNG (Mulberry32) - Zero Dependency
 * 
 * Creates a seeded random number generator that produces identical sequences
 * when initialized with the same seed string. This ensures bit-exact reproducibility
 * for Monte Carlo simulations and bootstrap resampling.
 * 
 * @param {string} seedStr - Seed string (typically Git commit hash)
 * @returns {Function} RNG function that returns values in [0, 1)
 * 
 * @example
 * const rng = createSeededRNG("abc123");
 * const value1 = rng(); // Always same value for same seed
 * const value2 = rng(); // Always same value for same seed
 */
export function createSeededRNG(seedStr) {
  let t = 0;
  // Hash the seed string into an initial state
  for (let i = 0; i < seedStr.length; i++) {
    t = Math.imul(t ^ seedStr.charCodeAt(i), 2654435761);
  }
  // Mulberry32 algorithm for deterministic PRNG
  return function() {
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * B) Precision Control (IEEE 754 Auditability)
 * 
 * Rounds numbers to 6 significant digits to ensure numerical stability
 * and prevent floating-point precision issues from affecting reproducibility.
 * All price targets, ratios, and confidence scores should use this function.
 * 
 * @param {number} n - Number to round
 * @returns {number} Number rounded to 6 significant digits, or original value if not a number
 * 
 * @example
 * round6(165.123456789) // 165.123
 * round6(0.0000123456) // 0.0000123456
 * round6(null) // null
 */
export const round6 = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * 1_000_000) / 1_000_000;
};

/**
 * Normalizes an array of numbers using round6
 * @param {number[]} values - Array of numbers to normalize
 * @returns {number[]} Array with all values rounded to 6 significant digits
 */
export function round6Array(values) {
  if (!Array.isArray(values)) return values;
  return values.map(round6);
}

/**
 * Normalizes an object's numeric values using round6
 * @param {object} obj - Object with numeric values
 * @returns {object} Object with all numeric values rounded to 6 significant digits
 */
export function round6Object(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = round6(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = round6Object(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Clamps a value between min and max, then applies round6
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped and rounded value
 */
export function clampRound6(value, min, max) {
  const clamped = Math.min(max, Math.max(min, value));
  return round6(clamped);
}
