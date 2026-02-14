const TICKER_MAX_LENGTH = 15;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-]+$/;

function normalizeQuery(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > TICKER_MAX_LENGTH) return null;
  if (/\s/.test(trimmed)) return null;
  const normalized = trimmed.toUpperCase();
  if (!VALID_TICKER_REGEX.test(normalized)) return null;
  return normalized;
}

function normalizeNameKey(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function fetchResolveIndex(request) {
  const baseUrl = new URL(request.url);
  const candidates = [
    '/data/symbol-resolve.v1.json',
    '/public/data/symbol-resolve.v1.json'
  ];
  for (const candidate of candidates) {
    const url = new URL(candidate, baseUrl);
    const response = await fetch(url.toString());
    if (!response.ok) {
      continue;
    }
    const payload = await response.json();
    return payload;
  }
  const error = new Error('symbol-resolve index not found');
  error.code = 'RESOLVE_INDEX_UNAVAILABLE';
  throw error;
}

function buildNameMap(indexPayload) {
  const entries = Array.isArray(indexPayload?.entries) ? indexPayload.entries : [];
  const map = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const ticker = normalizeTicker(entry.ticker);
    if (!ticker) continue;
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null;
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    const keys = new Set();
    if (name) keys.add(normalizeNameKey(name));
    for (const alias of aliases) {
      const key = normalizeNameKey(alias);
      if (key) keys.add(key);
    }
    for (const key of keys) {
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { ticker, name });
      }
    }
  }
  return map;
}

export async function resolveSymbol(query, request) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return {
      ok: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Missing query parameter',
        details: { query }
      }
    };
  }

  const asTicker = normalizeTicker(normalized);
  const treatAsTicker = asTicker && normalized === normalized.toUpperCase();
  if (treatAsTicker) {
    let name = null;
    try {
      const indexPayload = await fetchResolveIndex(request);
      const map = buildNameMap(indexPayload);
      for (const item of map.values()) {
        if (item.ticker === asTicker) {
          name = item.name;
          break;
        }
      }
    } catch {
      // ignore
    }

    return {
      ok: true,
      data: {
        ticker: asTicker,
        name,
        confidence: 1,
        method: 'ticker'
      }
    };
  }

  let indexPayload;
  try {
    indexPayload = await fetchResolveIndex(request);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code || 'RESOLVE_INDEX_UNAVAILABLE',
        message: 'Resolve index is not available',
        details: { message: error.message }
      }
    };
  }

  const key = normalizeNameKey(normalized);
  const map = buildNameMap(indexPayload);
  const hit = map.get(key) || null;
  if (!hit) {
    return {
      ok: false,
      error: {
        code: 'SYMBOL_NOT_FOUND',
        message: 'Unable to resolve symbol',
        details: { query: normalized }
      }
    };
  }

  return {
    ok: true,
    data: {
      ticker: hit.ticker,
      name: hit.name,
      confidence: 0.95,
      method: 'name_exact'
    }
  };
}
