/**
 * Learning System — Shared Metrics Library
 *
 * Computes Brier Score, accuracy, hit rates, and trend detection
 * for the unified daily learning report.
 */

/**
 * Brier Score: mean squared error of probability vs outcome.
 * Lower = better. Range [0, 1].
 * @param {{p: number, y: number}[]} preds - p=predicted probability, y=0|1 outcome
 * @returns {number|null}
 */
export function brierScore(preds) {
    const valid = preds.filter(d => d.p != null && d.y != null);
    if (!valid.length) return null;
    return valid.reduce((s, { p, y }) => s + (p - y) ** 2, 0) / valid.length;
}

/**
 * Classification accuracy: did the predicted direction match?
 * @param {{p: number, y: number}[]} preds - p≥0.5 means "up", y=1 means "went up"
 * @returns {number|null}
 */
export function accuracy(preds) {
    const valid = preds.filter(d => d.p != null && d.y != null);
    if (!valid.length) return null;
    const correct = valid.filter(({ p, y }) => (p >= 0.5 ? 1 : 0) === y).length;
    return correct / valid.length;
}

/**
 * Hit rate: fraction of items where .hit === true.
 * @param {{hit: boolean}[]} items
 * @returns {number|null}
 */
export function hitRate(items) {
    const valid = items.filter(d => d.hit != null);
    if (!valid.length) return null;
    return valid.filter(d => d.hit).length / valid.length;
}

/**
 * Detect trend from two metric values.
 * @param {number|null} current
 * @param {number|null} previous
 * @param {boolean} lowerIsBetter - if true, decrease = "improving"
 * @returns {'improving'|'declining'|'stable'|'no_data'}
 */
export function trend(current, previous, lowerIsBetter = false) {
    if (current == null || previous == null) return 'no_data';
    const diff = current - previous;
    if (Math.abs(diff) < 0.005) return 'stable';
    if (lowerIsBetter) return diff < 0 ? 'improving' : 'declining';
    return diff > 0 ? 'improving' : 'declining';
}

/**
 * Rolling average of last N values.
 * @param {number[]} values
 * @param {number} window
 * @returns {number|null}
 */
export function rollingAverage(values, window) {
    const nums = values.filter(v => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    const slice = nums.slice(-window);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Round to N decimal places.
 */
export function round(v, n = 4) {
    if (v == null || !Number.isFinite(v)) return null;
    const f = 10 ** n;
    return Math.round(v * f) / f;
}

/**
 * Format trend with emoji for console output.
 */
export function trendEmoji(t) {
    if (t === 'improving') return '↑ BESSER ✅';
    if (t === 'declining') return '↓ SCHLECHTER 🔴';
    if (t === 'stable') return '→ STABIL ⚠️';
    return '— KEINE DATEN';
}

export function isoDate(d) {
    return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

export function daysAgo(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - n);
    return isoDate(d);
}
