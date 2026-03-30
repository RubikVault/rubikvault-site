/**
 * V6.0 — Layer 1A: Corporate Action Ledger & PIT Price Adjustment
 *
 * Pure functions, no I/O. Follows isotonic.mjs pattern.
 * Handles splits, dividends, reverse splits.
 */

/**
 * Build a sorted corporate action ledger from raw data.
 * @param {Array} bars - OHLCV bars with optional split_factor / dividend fields
 * @param {Array} [dividendData] - External dividend records [{ date, amount }]
 * @param {Array} [splitData] - External split records [{ date, ratio }]
 * @returns {Array} Sorted ledger entries
 */
export function buildCorporateActionLedger(bars = [], dividendData = [], splitData = []) {
  const ledger = [];

  for (const bar of bars) {
    if (bar.dividend && Number(bar.dividend) > 0) {
      ledger.push({
        date: bar.date || bar.timestamp,
        action_type: 'DIVIDEND',
        split_factor: null,
        dividend_amount: Number(bar.dividend),
        effective_date: bar.date || bar.timestamp,
      });
    }
    if (bar.split_factor && Number(bar.split_factor) !== 1) {
      ledger.push({
        date: bar.date || bar.timestamp,
        action_type: 'SPLIT',
        split_factor: Number(bar.split_factor),
        dividend_amount: null,
        effective_date: bar.date || bar.timestamp,
      });
    }
  }

  for (const d of dividendData) {
    ledger.push({
      date: d.date,
      action_type: 'DIVIDEND',
      split_factor: null,
      dividend_amount: Number(d.amount),
      effective_date: d.date,
    });
  }

  for (const s of splitData) {
    ledger.push({
      date: s.date,
      action_type: 'SPLIT',
      split_factor: Number(s.ratio),
      dividend_amount: null,
      effective_date: s.date,
    });
  }

  ledger.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return deduplicateLedger(ledger);
}

function deduplicateLedger(ledger) {
  const seen = new Set();
  return ledger.filter(entry => {
    const key = `${entry.date}|${entry.action_type}|${entry.split_factor}|${entry.dividend_amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compute PIT-adjusted close price (split-adjusted, NOT dividend-adjusted).
 * @param {number} rawClose - Unadjusted close price
 * @param {Array} ledger - Corporate action ledger
 * @param {string} asOfDate - Date string for the bar
 * @returns {number} close_pit
 */
export function computeClosePit(rawClose, ledger, asOfDate) {
  if (!Number.isFinite(rawClose) || rawClose <= 0) return rawClose;

  let cumulativeSplitFactor = 1.0;
  for (const entry of ledger) {
    if (entry.action_type === 'SPLIT' && entry.date > asOfDate && entry.split_factor) {
      cumulativeSplitFactor *= entry.split_factor;
    }
  }

  return rawClose / cumulativeSplitFactor;
}

/**
 * Adjust entire bar series for corporate actions (PIT-safe).
 * Returns new array with close_pit field added.
 * @param {Array} bars - OHLCV bars with date/timestamp
 * @param {Array} ledger - Corporate action ledger
 * @returns {Array} Bars enriched with close_pit
 */
export function adjustForCorporateActions(bars, ledger) {
  return bars.map(bar => {
    const date = bar.date || bar.timestamp;
    const closePit = computeClosePit(bar.close, ledger, date);
    return { ...bar, close_pit: closePit };
  });
}
