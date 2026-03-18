/**
 * EODHD Resilient Fetch — shared across all DP8 scripts.
 *
 * Built on the existing fetchWithRetry() infrastructure:
 * - 429 / 5xx → exponential backoff with jitter
 * - Retry-After header respected
 * - Bounded concurrency via semaphore
 * - Partial failures explicitly marked, never silent
 */

import { fetchWithRetry } from '../fetch.js';

const UA = 'RubikVault-v3-data-plane/1.0';
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CONCURRENCY = 6;

// ─── Jitter-aware sleep (used by semaphore, not by retry — retry uses fetch.js) ──

function jitterMs(baseMs) {
  return baseMs + Math.floor(Math.random() * baseMs * 0.3);
}

// ─── Bounded Concurrency Semaphore ────────────────────────────────────────

function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  return {
    async acquire() {
      if (active < limit) { active++; return; }
      await new Promise(resolve => queue.push(resolve));
      active++;
    },
    release() {
      active--;
      if (queue.length > 0) queue.shift()();
    }
  };
}

// ─── Core EODHD Fetch ─────────────────────────────────────────────────────

/**
 * Fetch a single EODHD endpoint with retry/backoff.
 * Returns { ok, data, status, retries, rateLimited, error }.
 */
export async function fetchEodhd(url, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = opts;

  const result = await fetchWithRetry(
    url,
    { headers: { 'user-agent': UA }, timeoutMs },
    { maxRetries, baseDelayMs: 1000 }
  );

  if (!result.ok) {
    return {
      ok: false,
      data: null,
      status: result.upstream?.http_status || null,
      retries: result.upstream?.retry_count || 0,
      rateLimited: result.upstream?.rate_limited || false,
      error: result.error?.message || 'fetch failed',
    };
  }

  // Parse JSON
  try {
    const parsed = JSON.parse(result.text);
    return {
      ok: true,
      data: parsed,
      status: result.upstream?.http_status,
      retries: result.upstream?.retry_count || 0,
      rateLimited: result.upstream?.rate_limited || false,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      data: null,
      status: result.upstream?.http_status,
      retries: result.upstream?.retry_count || 0,
      rateLimited: false,
      error: `JSON parse: ${e.message}`,
    };
  }
}

// ─── EODHD EOD History ────────────────────────────────────────────────────

const EODHD_BASE = 'https://eodhd.com/api';

/**
 * Fetch EOD history bars for a symbol. Returns array of bars or null.
 * Partial/failed results are explicitly returned as null (never empty-as-ok).
 */
export async function fetchEodBars(symbol, from, to, apiKey, opts = {}) {
  const url = `${EODHD_BASE}/eod/${encodeURIComponent(symbol)}?from=${from}&to=${to}&fmt=json&api_token=${encodeURIComponent(apiKey)}`;
  const result = await fetchEodhd(url, opts);

  if (!result.ok) {
    if (result.rateLimited) {
      console.warn(`[eodhd-fetch] Rate-limited on ${symbol} (${result.retries} retries)`);
    }
    return null;
  }

  if (!Array.isArray(result.data) || result.data.length === 0) return null;
  return result.data;
}

// ─── Batch Fetch with Bounded Concurrency ─────────────────────────────────

/**
 * Fetch multiple symbols with bounded concurrency.
 * Returns Map<symbol, { bars, error, rateLimited }>.
 *
 * @param {Array<{symbol: string, name?: string}>} symbols
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @param {string} apiKey
 * @param {Object} [opts]
 * @param {number} [opts.concurrency=6]
 * @param {Function} [opts.transform] - transform raw bars per symbol
 */
export async function fetchBatch(symbols, from, to, apiKey, opts = {}) {
  const { concurrency = DEFAULT_CONCURRENCY, transform } = opts;
  const sem = createSemaphore(concurrency);
  const results = new Map();

  const tasks = symbols.map(async (s) => {
    await sem.acquire();
    try {
      if (!apiKey) {
        results.set(s.symbol, { bars: null, error: 'no_api_key', rateLimited: false });
        return;
      }
      const bars = await fetchEodBars(s.symbol, from, to, apiKey);
      const transformed = bars && transform ? transform(bars, s) : bars;
      results.set(s.symbol, { bars: transformed, error: bars ? null : 'fetch_failed', rateLimited: false });
    } catch (e) {
      results.set(s.symbol, { bars: null, error: e.message, rateLimited: false });
    } finally {
      sem.release();
    }
  });

  await Promise.all(tasks);
  return results;
}
