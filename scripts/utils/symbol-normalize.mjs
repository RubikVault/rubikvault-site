/**
 * Normalizes a stock ticker symbol to a standard internal format.
 * - Upper case
 * - Trims whitespace
 * - Handles exceptions like BRK.B -> BRK-B (or provider specific preferences, usually handled by adapter)
 * - But internal canonical format is usually dot or dash?
 * 
 * Runbook 4.2: "Must handle provider symbol quirks (BRK.B etc.) deterministically."
 * 
 * @param {string} symbol 
 * @returns {string|null} Normalized symbol or null if invalid
 */
export function normalizeSymbol(symbol) {
    if (typeof symbol !== 'string') return null;
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return null;

    // Basic validation
    if (!/^[A-Z0-9.\-]+$/.test(trimmed)) return null;

    return trimmed;
}

/**
 * Known multi-char ticker suffixes that are part of the symbol itself (not exchange suffixes).
 * These must NOT be stripped by stripExchangeSuffix.
 * Examples: BRK.B, BF.B, BRK.A
 */
const TICKER_SUFFIXES = new Set(['A', 'B']);

/**
 * Strips exchange suffix from international tickers while preserving
 * multi-char class suffixes like BRK.B.
 *
 * Examples:
 *   MALLPLAZA.SN  → MALLPLAZA   (exchange suffix .SN stripped)
 *   BSANTANDER.SN → BSANTANDER  (exchange suffix .SN stripped)
 *   BRK.B         → BRK.B       (share class suffix preserved)
 *   AAPL          → AAPL        (no suffix, unchanged)
 *
 * @param {string} symbol
 * @returns {string} Symbol with exchange suffix stripped
 */
export function stripExchangeSuffix(symbol) {
    if (typeof symbol !== 'string') return symbol;
    const trimmed = symbol.trim().toUpperCase();
    const dotIdx = trimmed.lastIndexOf('.');
    if (dotIdx <= 0) return trimmed;
    const suffix = trimmed.slice(dotIdx + 1);
    // Single-char suffixes like .B are share classes — keep them
    if (TICKER_SUFFIXES.has(suffix)) return trimmed;
    // Multi-char suffixes like .SN, .SA, .L, .TO are exchange codes — strip them
    if (suffix.length >= 2) return trimmed.slice(0, dotIdx);
    return trimmed;
}

export default normalizeSymbol;
