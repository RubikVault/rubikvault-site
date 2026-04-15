const TICKER_MAX_LENGTH = 15;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-:^]+$/;

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

function normalizeExactKey(input) {
  return String(input || '')
    .trim()
    .toUpperCase();
}

let cachedLookupMaps = globalThis.__rvCachedLookupMaps || null;

async function fetchResolveIndex(request, { preferFull = false } = {}) {
  const baseUrl = new URL(request.url);
  const candidates = preferFull
    ? [
      '/data/symbol-resolve.v1.json'
    ]
    : [
      '/data/symbol-resolve.v1.lookup.json',
      '/data/symbol-resolve.v1.json'
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

function buildLookupMaps(indexPayload) {
  if (indexPayload && typeof indexPayload === 'object' && indexPayload.exact && !indexPayload.entries) {
    const byTicker = new Map();
    const byExact = new Map();
    const byName = new Map();
    const unpack = (value) => {
      if (!Array.isArray(value) || !value[0]) return null;
      return {
        ticker: normalizeTicker(value[0]),
        name: typeof value[1] === 'string' && value[1].trim() ? value[1].trim() : null,
        exchange: typeof value[2] === 'string' && value[2].trim() ? value[2].trim().toUpperCase() : null,
        country: typeof value[3] === 'string' && value[3].trim() ? value[3].trim().toUpperCase() : null,
        canonical_id: typeof value[4] === 'string' && value[4].trim() ? value[4].trim().toUpperCase() : null,
        type_norm: typeof value[5] === 'string' && value[5].trim() ? value[5].trim().toUpperCase() : null,
      };
    };
    for (const [key, value] of Object.entries(indexPayload.exact || {})) {
      const entry = unpack(value);
      if (!entry?.ticker) continue;
      if (!byTicker.has(entry.ticker)) byTicker.set(entry.ticker, entry);
      if (!byExact.has(key)) byExact.set(key, entry);
    }
    return { byTicker, byExact, byName };
  }

  const entries = Array.isArray(indexPayload?.entries) ? indexPayload.entries : [];
  const byTicker = new Map();
  const byExact = new Map();
  const byName = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const ticker = normalizeTicker(entry.ticker);
    if (!ticker) continue;
    const resolvedEntry = {
      ticker,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
      exchange: typeof entry.exchange === 'string' && entry.exchange.trim() ? entry.exchange.trim().toUpperCase() : null,
      country: typeof entry.country === 'string' && entry.country.trim() ? entry.country.trim().toUpperCase() : null,
      canonical_id: typeof entry.canonical_id === 'string' && entry.canonical_id.trim() ? entry.canonical_id.trim().toUpperCase() : null,
      type_norm: typeof entry.type_norm === 'string' && entry.type_norm.trim() ? entry.type_norm.trim().toUpperCase() : null
    };
    if (!byTicker.has(ticker)) {
      byTicker.set(ticker, resolvedEntry);
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null;
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    const keys = new Set();
    if (name) keys.add(normalizeNameKey(name));
    for (const alias of aliases) {
      const key = normalizeNameKey(alias);
      if (key) keys.add(key);
      const exactKey = normalizeExactKey(alias);
      if (exactKey && !byExact.has(exactKey)) {
        byExact.set(exactKey, resolvedEntry);
      }
    }
    const tickerKey = normalizeExactKey(ticker);
    if (tickerKey && !byExact.has(tickerKey)) {
      byExact.set(tickerKey, resolvedEntry);
    }
    const canonicalKey = normalizeExactKey(resolvedEntry.canonical_id);
    if (canonicalKey && !byExact.has(canonicalKey)) {
      byExact.set(canonicalKey, resolvedEntry);
    }
    for (const key of keys) {
      if (!key) continue;
      if (!byName.has(key)) {
        byName.set(key, resolvedEntry);
      }
    }
  }
  return { byTicker, byExact, byName };
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
  const treatAsTicker = Boolean(asTicker);
  if (treatAsTicker) {
    return {
      ok: true,
      data: {
        ticker: asTicker,
        name: null,
        exchange: null,
        country: null,
        canonical_id: null,
        type_norm: null,
        confidence: 1,
        method: 'ticker_fast_path',
      }
    };
  }

  let maps = cachedLookupMaps;
  if (!maps) {
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
    maps = buildLookupMaps(indexPayload);
    maps.hasFullEntries = Array.isArray(indexPayload?.entries);
    cachedLookupMaps = maps;
    globalThis.__rvCachedLookupMaps = maps;
  }
  const exactKey = normalizeExactKey(normalized);
  const exactHit = maps.byExact.get(exactKey) || null;
  if (exactHit) {
    return {
      ok: true,
      data: {
        ticker: exactHit.ticker,
        name: exactHit.name,
        exchange: exactHit.exchange,
        country: exactHit.country,
        canonical_id: exactHit.canonical_id,
        type_norm: exactHit.type_norm,
        confidence: 1,
        method: exactHit.canonical_id === exactKey ? 'canonical_exact' : 'alias_exact'
      }
    };
  }

  if (!maps.hasFullEntries) {
    try {
      const indexPayload = await fetchResolveIndex(request, { preferFull: true });
      maps = buildLookupMaps(indexPayload);
      maps.hasFullEntries = Array.isArray(indexPayload?.entries);
      cachedLookupMaps = maps;
      globalThis.__rvCachedLookupMaps = maps;
    } catch {
      // keep lightweight maps and fall through
    }
  }

  const key = normalizeNameKey(normalized);
  const hit = maps.byName.get(key) || null;
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
        exchange: hit.exchange,
        country: hit.country,
        canonical_id: hit.canonical_id,
        type_norm: hit.type_norm,
        confidence: 0.95,
        method: 'name_exact'
      }
  };
}
