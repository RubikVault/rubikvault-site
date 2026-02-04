/**
 * Forecast System v3.0 — Trading Date Resolution
 * 
 * Resolves trading dates using market calendar.
 * Implements v2.1 SYNC LAW: trading_date = market-calendar date (exchange TZ).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// US market holidays (2024-2026) - simplified static list
const US_HOLIDAYS = new Set([
    // 2024
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29',
    '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02',
    '2024-11-28', '2024-12-25',
    // 2025
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
    '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
    '2025-11-27', '2025-12-25',
    // 2026
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
    '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
    '2026-11-26', '2026-12-25'
]);

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a date is a trading day
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
export function isTradingDay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00Z');
    const dayOfWeek = date.getUTCDay();

    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    // Holiday check
    if (US_HOLIDAYS.has(dateStr)) return false;

    return true;
}

/**
 * Get the previous trading day
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string}
 */
export function getPreviousTradingDay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00Z');

    for (let i = 0; i < 10; i++) {
        date.setUTCDate(date.getUTCDate() - 1);
        const candidate = date.toISOString().slice(0, 10);
        if (isTradingDay(candidate)) return candidate;
    }

    throw new Error(`Could not find trading day before ${dateStr}`);
}

/**
 * Get the next trading day
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string}
 */
export function getNextTradingDay(dateStr) {
    const date = new Date(dateStr + 'T12:00:00Z');

    for (let i = 0; i < 10; i++) {
        date.setUTCDate(date.getUTCDate() + 1);
        const candidate = date.toISOString().slice(0, 10);
        if (isTradingDay(candidate)) return candidate;
    }

    throw new Error(`Could not find trading day after ${dateStr}`);
}

/**
 * Add N trading days to a date
 * @param {string} dateStr - Start date in YYYY-MM-DD format
 * @param {number} n - Number of trading days to add
 * @returns {string}
 */
export function addTradingDays(dateStr, n) {
    let current = dateStr;
    let remaining = Math.abs(n);
    const forward = n >= 0;

    while (remaining > 0) {
        current = forward ? getNextTradingDay(current) : getPreviousTradingDay(current);
        remaining--;
    }

    return current;
}

/**
 * Get outcome date for a forecast horizon
 * @param {string} forecastDate - Forecast date in YYYY-MM-DD format
 * @param {number} horizonDays - Horizon in trading days
 * @returns {string}
 */
export function getHorizonOutcomeDate(forecastDate, horizonDays) {
    return addTradingDays(forecastDate, horizonDays);
}

/**
 * Count trading days between two dates
 * @param {string} startDate - Start date (exclusive)
 * @param {string} endDate - End date (inclusive)
 * @returns {number}
 */
export function countTradingDays(startDate, endDate) {
    let count = 0;
    let current = startDate;

    while (current < endDate) {
        current = getNextTradingDay(current);
        if (current <= endDate) count++;
    }

    return count;
}

/**
 * Resolve trading date from a timestamp
 * Uses exchange timezone (America/New_York for US markets)
 * @param {Date} timestamp - Current timestamp
 * @param {object} policy - Forecast policy (optional)
 * @returns {string} Trading date in YYYY-MM-DD format
 */
export function resolveTradingDate(timestamp, policy = null) {
    // Convert to NY timezone
    const nyTime = new Date(timestamp.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();

    // Get date in NY timezone
    let dateStr = nyTime.toISOString().slice(0, 10);

    // Market closes at 16:00 ET
    // If before market close, use current trading day
    // If after market close, data is for current day but next trading day for forecasting
    const cutoffMinutes = policy?.trading_date_resolution?.cutoff_after_close_minutes ?? 0;
    const marketCloseMinutes = 16 * 60;
    const currentMinutes = hour * 60 + minute;

    if (currentMinutes >= marketCloseMinutes + cutoffMinutes) {
        // After cutoff, use next trading day for forecasting context
        // But the data date is still today
    }

    // If weekend or holiday, use previous trading day
    if (!isTradingDay(dateStr)) {
        dateStr = getPreviousTradingDay(dateStr);
    }

    return dateStr;
}

/**
 * Generate list of trading days in a range
 * @param {string} startDate - Start date (inclusive)
 * @param {string} endDate - End date (inclusive)
 * @returns {string[]}
 */
export function getTradingDaysInRange(startDate, endDate) {
    const days = [];
    let current = startDate;

    // If start is not trading day, find first trading day
    if (!isTradingDay(current)) {
        current = getNextTradingDay(current);
    }

    while (current <= endDate) {
        days.push(current);
        current = getNextTradingDay(current);
    }

    return days;
}

export default {
    isTradingDay,
    getPreviousTradingDay,
    getNextTradingDay,
    addTradingDays,
    getHorizonOutcomeDate,
    countTradingDays,
    resolveTradingDate,
    getTradingDaysInRange
};
