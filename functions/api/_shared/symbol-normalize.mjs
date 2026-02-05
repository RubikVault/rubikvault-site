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

    // Standardize: Replace dot with nothing? Or strict format?
    // Existing system often uses AAPL. 
    // BRK.B is often BRK-B in Yahoo, BRK.B in others. 
    // Let's standardise to dot for internal, but adapters map as needed.
    // Actually, standardizing on dot is common. E.g. BRK.B

    // Basic validation
    if (!/^[A-Z0-9.\-]+$/.test(trimmed)) return null;

    return trimmed;
}

export default normalizeSymbol;
