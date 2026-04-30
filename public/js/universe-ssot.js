export const WEB_UNIVERSE_ALLOWED_CLASSES = ['STOCK', 'ETF', 'INDEX'];
export const WEB_UNIVERSE_ALLOWED_FILTERS = ['all', 'stock', 'etf', 'index'];
export const WEB_UNIVERSE_REMOVED_CLASSES = ['FUND', 'CRYPTO', 'FOREX', 'BOND', 'OTHER'];
export const WEB_UNIVERSE_REMOVED_FILTERS = ['fund', 'crypto', 'forex', 'bond', 'other'];

export const CONTEXT_BOND_SYMBOLS = Object.freeze([
  'US2Y',
  'US10Y',
  'US30Y',
  'US3M',
  'DE10Y',
  'DE2Y',
  'UK10Y',
  'JP10Y',
  'CN10Y',
]);

export const CONTEXT_BOND_CANONICAL_IDS = Object.freeze([
  'GBOND:US2Y',
  'GBOND:US10Y',
  'GBOND:US30Y',
  'GBOND:US3M',
  'GBOND:DE10Y',
  'GBOND:DE2Y',
  'GBOND:UK10Y',
  'GBOND:JP10Y',
  'GBOND:CN10Y',
]);

export const CREDIT_PROXY_SYMBOLS = Object.freeze(['LQD', 'HYG']);
export const CREDIT_PROXY_CANONICAL_IDS = Object.freeze(['US:LQD', 'US:HYG']);

export const PREFERRED_CANONICAL_BY_SYMBOL = Object.freeze({
  US2Y: 'GBOND:US2Y',
  US10Y: 'GBOND:US10Y',
  US30Y: 'GBOND:US30Y',
  US3M: 'GBOND:US3M',
  DE10Y: 'GBOND:DE10Y',
  DE2Y: 'GBOND:DE2Y',
  UK10Y: 'GBOND:UK10Y',
  JP10Y: 'GBOND:JP10Y',
  CN10Y: 'GBOND:CN10Y',
  LQD: 'US:LQD',
  HYG: 'US:HYG',
});

const CLASS_ALIASES = new Map([
  ['ALL', 'all'],
  ['STOCKS', 'stock'],
  ['EQUITIES', 'stock'],
  ['STOCK', 'stock'],
  ['ETFS', 'etf'],
  ['ETF', 'etf'],
  ['BONDS', 'bond'],
  ['BOND', 'bond'],
  ['FUNDS', 'fund'],
  ['FUND', 'fund'],
  ['CRYPTOS', 'crypto'],
  ['CRYPTO', 'crypto'],
  ['FOREX', 'forex'],
  ['FX', 'forex'],
  ['INDICES', 'index'],
  ['INDEX', 'index'],
  ['OTHER', 'other'],
]);

export function parseUniverseAssetClassFilter(raw) {
  const direct = String(raw || '').trim().toLowerCase();
  const upper = String(raw || '').trim().toUpperCase();
  const value = CLASS_ALIASES.get(upper) || direct || 'all';
  return {
    value: WEB_UNIVERSE_ALLOWED_FILTERS.includes(value) ? value : 'all',
    removed: WEB_UNIVERSE_REMOVED_FILTERS.includes(value),
    requested: value || 'all',
  };
}

export function normalizeUniverseAssetClassFilter(raw) {
  return parseUniverseAssetClassFilter(raw).value;
}

export function normalizeUniverseTypeNorm(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return 'OTHER';
  if (['COMMON STOCK', 'PREFERRED STOCK', 'EQUITY', 'EQUITIES', 'STOCK'].includes(value)) return 'STOCK';
  if (['ETF', 'ETFS'].includes(value)) return 'ETF';
  if (['BOND', 'BONDS'].includes(value)) return 'BOND';
  if (['FUND', 'FUNDS', 'MUTUAL FUND'].includes(value)) return 'FUND';
  if (['INDEX', 'INDICES', 'INDICIES'].includes(value)) return 'INDEX';
  if (['FOREX', 'FX'].includes(value)) return 'FOREX';
  if (['CRYPTO', 'CRYPTOS'].includes(value)) return 'CRYPTO';
  return value;
}

export function getUniverseAssetClassOptions() {
  return [
    { value: 'all', label: 'All Assets' },
    { value: 'stock', label: 'Stocks' },
    { value: 'etf', label: 'ETFs' },
    { value: 'index', label: 'Indices' },
  ];
}

export function isWhitelistedContextBond(record = {}) {
  const symbol = String(record?.symbol || record?.ticker || '').trim().toUpperCase();
  const canonicalId = String(record?.canonical_id || '').trim().toUpperCase();
  return CONTEXT_BOND_SYMBOLS.includes(symbol) || CONTEXT_BOND_CANONICAL_IDS.includes(canonicalId);
}

export function isPreferredCreditProxy(record = {}) {
  const symbol = String(record?.symbol || record?.ticker || '').trim().toUpperCase();
  const canonicalId = String(record?.canonical_id || '').trim().toUpperCase();
  return CREDIT_PROXY_SYMBOLS.includes(symbol) || CREDIT_PROXY_CANONICAL_IDS.includes(canonicalId);
}

export function isAllowedWebUniverseRecord(record = {}) {
  const typeNorm = normalizeUniverseTypeNorm(record?.type_norm || record?.type || record?.class);
  if (typeNorm === 'STOCK') return true;
  if (typeNorm === 'ETF') return true;
  if (typeNorm === 'INDEX') return true;
  return false;
}

export function preferredCanonicalForSymbol(symbol) {
  return PREFERRED_CANONICAL_BY_SYMBOL[String(symbol || '').trim().toUpperCase()] || null;
}

function canonicalExchange(record = {}) {
  const canonicalId = String(record?.canonical_id || '').trim().toUpperCase();
  if (canonicalId.includes(':')) return canonicalId.split(':')[0];
  return '';
}

function recordExchange(record = {}) {
  return String(record?.exchange || canonicalExchange(record) || '').trim().toUpperCase();
}

function structureScore(record = {}) {
  const typeNorm = normalizeUniverseTypeNorm(record?.type_norm || record?.type || record?.class);
  const name = String(record?.name || '').trim().toUpperCase();
  let score = 0;

  if (typeNorm === 'STOCK') score += 40;
  else if (typeNorm === 'ETF') score += 20;
  else if (typeNorm === 'INDEX') score += 10;

  if (!/\b(ADR|ADS|GDR|CDR|DRC|DEPOSITARY|RECEIPT|RECEIPTS)\b/.test(name)) score += 8;
  if (!/\b(TRACKER|ETP|ETN|TOKENIZED|XSTOCK)\b/.test(name)) score += 6;
  if (!/\b(BULL|BEAR|INVERSE|ULTRA|LEVERAGED|1X|1\.5X|2X|3X|OPTION INCOME|COVERED CALL|YIELDMAX)\b/.test(name)) score += 6;

  return score;
}

function exchangePriorityScore(record = {}) {
  const exchange = recordExchange(record);
  if (!exchange) return 0;
  if (exchange === 'US') return 100;
  if (['XETRA', 'LSE', 'TO', 'NEO', 'AS', 'PA', 'MI', 'MC', 'SW', 'ST', 'HE', 'CO', 'OSL', 'OL', 'CPH', 'HKEX', 'HK', 'TYO', 'JPX', 'ASX', 'SGX'].includes(exchange)) return 40;
  if (['MX', 'BA', 'SN', 'LIM', 'RO'].includes(exchange)) return 25;
  return 10;
}

export function normalizeUniverseSearchCompanyName(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/\.com\b/g, '');
  s = s.replace(/[.,\-()\/\\]/g, ' ');
  s = s.replace(/\b(inc|corp|corporation|ltd|limited|llc|plc|sa|ag|se|nv|co|company|group|holdings)\b/g, '');
  s = s.replace(/\b(cdr|adr|gdr|depositary|receipt|receipts|tokenized|xstock)\b/g, '');
  s = s.replace(/\b(stock|price|shares|share)\b/g, '');
  s = s.replace(/\b(usd|eur|gbp|jpy|cad|aud|chf)\b/g, '');
  s = s.replace(/\bclass\s*[a-z]\b/g, '');
  s = s.replace(/\bdl[\s\-]*\d+\b/g, '');
  s = s.replace(/\beo[\s\-]*\d+\b/g, '');
  s = s.replace(/\breg\.?\s*s\b/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function normalizeUniverseSearchQuery(raw) {
  return String(raw || '').trim().toLowerCase();
}

function normalizeUniverseSearchSymbol(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
}

function computeUniverseSearchMatch(record = {}, { query = '', symbolQuery = '' } = {}) {
  const normalizedQuery = normalizeUniverseSearchQuery(query);
  const normalizedSymbolQuery = normalizeUniverseSearchSymbol(symbolQuery || query);
  const symbol = String(record?.symbol || record?.ticker || '').trim().toUpperCase();
  const symbolLower = symbol.toLowerCase();
  const rawName = String(record?.name || '').trim();
  const rawNameLower = rawName.toLowerCase();
  const normalizedName = normalizeUniverseSearchCompanyName(rawName);
  const normalizedTokens = normalizedName ? normalizedName.split(' ').filter(Boolean) : [];
  const normalizedFirstToken = normalizedTokens[0] || '';

  const symbolExact = normalizedSymbolQuery && symbol === normalizedSymbolQuery ? 1 : 0;
  const normalizedNameExact = normalizedQuery && normalizedName === normalizedQuery ? 1 : 0;
  const normalizedFirstTokenExact = normalizedQuery && normalizedFirstToken === normalizedQuery ? 1 : 0;
  const symbolPrefix = normalizedSymbolQuery && symbolLower.startsWith(normalizedQuery) ? 1 : 0;
  const normalizedFirstTokenPrefix = normalizedQuery && normalizedFirstToken.startsWith(normalizedQuery) ? 1 : 0;
  const normalizedNamePrefix = normalizedQuery && normalizedName.startsWith(normalizedQuery) ? 1 : 0;
  const rawNamePrefix = normalizedQuery && rawNameLower.startsWith(normalizedQuery) ? 1 : 0;
  const symbolContains = normalizedQuery && symbolLower.includes(normalizedQuery) ? 1 : 0;
  const normalizedNameContains = normalizedQuery && normalizedName.includes(normalizedQuery) ? 1 : 0;
  const rawNameContains = normalizedQuery && rawNameLower.includes(normalizedQuery) ? 1 : 0;

  return {
    symbolExact,
    normalizedNameExact,
    normalizedFirstTokenExact,
    symbolPrefix,
    normalizedFirstTokenPrefix,
    normalizedNamePrefix,
    rawNamePrefix,
    symbolContains,
    normalizedNameContains,
    rawNameContains,
    firstTokenDistance: normalizedFirstTokenPrefix ? Math.max(0, normalizedFirstToken.length - normalizedQuery.length) : Number.POSITIVE_INFINITY,
    normalizedNameDistance: normalizedNamePrefix ? Math.max(0, normalizedName.length - normalizedQuery.length) : Number.POSITIVE_INFINITY,
    normalizedWordCount: normalizedTokens.length || Number.POSITIVE_INFINITY,
    normalizedNameLength: normalizedName.length || Number.POSITIVE_INFINITY,
  };
}

export function compareUniverseSearchCandidates(a = {}, b = {}, { query = '', symbolQuery = '' } = {}) {
  const aMatch = computeUniverseSearchMatch(a, { query, symbolQuery });
  const bMatch = computeUniverseSearchMatch(b, { query, symbolQuery });

  // When both candidates match the symbol exactly, name-based scoring is unreliable:
  // a ticker like "1X AMZN" contains "AMZN" in its name and would incorrectly beat
  // the real issuer. Skip to structural comparison immediately.
  if (aMatch.symbolExact === 1 && bMatch.symbolExact === 1) {
    return comparePreferredUniverseRows(a, b);
  }

  const aIssuerNameExact = aMatch.normalizedNameExact === 1 || aMatch.normalizedFirstTokenExact === 1;
  const bIssuerNameExact = bMatch.normalizedNameExact === 1 || bMatch.normalizedFirstTokenExact === 1;
  if (aIssuerNameExact && bIssuerNameExact) {
    const preferred = comparePreferredUniverseRows(a, b);
    if (preferred !== 0) return preferred;
  }

  const matchFields = [
    'symbolExact',
    'normalizedNameExact',
    'normalizedFirstTokenExact',
    'symbolPrefix',
    'normalizedFirstTokenPrefix',
    'normalizedNamePrefix',
    'rawNamePrefix',
    'symbolContains',
    'normalizedNameContains',
    'rawNameContains',
  ];

  for (const field of matchFields) {
    if (aMatch[field] !== bMatch[field]) return aMatch[field] - bMatch[field];
  }

  if (aMatch.firstTokenDistance !== bMatch.firstTokenDistance) {
    return bMatch.firstTokenDistance - aMatch.firstTokenDistance;
  }
  if (aMatch.normalizedWordCount !== bMatch.normalizedWordCount) {
    return bMatch.normalizedWordCount - aMatch.normalizedWordCount;
  }
  if (aMatch.normalizedNameDistance !== bMatch.normalizedNameDistance) {
    return bMatch.normalizedNameDistance - aMatch.normalizedNameDistance;
  }
  if (aMatch.normalizedNameLength !== bMatch.normalizedNameLength) {
    return bMatch.normalizedNameLength - aMatch.normalizedNameLength;
  }

  return comparePreferredUniverseRows(a, b);
}

export function comparePreferredUniverseRows(a = {}, b = {}) {
  const aSymbol = String(a?.symbol || '').trim().toUpperCase();
  const bSymbol = String(b?.symbol || '').trim().toUpperCase();
  const aCanonical = String(a?.canonical_id || '').trim().toUpperCase();
  const bCanonical = String(b?.canonical_id || '').trim().toUpperCase();
  const aPreferred = preferredCanonicalForSymbol(aSymbol) === aCanonical ? 1 : 0;
  const bPreferred = preferredCanonicalForSymbol(bSymbol) === bCanonical ? 1 : 0;
  if (aPreferred !== bPreferred) return aPreferred - bPreferred;

  const aAllowed = isAllowedWebUniverseRecord(a) ? 1 : 0;
  const bAllowed = isAllowedWebUniverseRecord(b) ? 1 : 0;
  if (aAllowed !== bAllowed) return aAllowed - bAllowed;

  const aStructure = structureScore(a);
  const bStructure = structureScore(b);
  if (aStructure !== bStructure) return aStructure - bStructure;

  const aExchange = exchangePriorityScore(a);
  const bExchange = exchangePriorityScore(b);
  if (aExchange !== bExchange) return aExchange - bExchange;

  const aScore = Number.isFinite(Number(a?.score_0_100)) ? Number(a.score_0_100) : -1;
  const bScore = Number.isFinite(Number(b?.score_0_100)) ? Number(b.score_0_100) : -1;
  if (aScore !== bScore) return aScore - bScore;

  const aBars = Number.isFinite(Number(a?.bars_count)) ? Number(a.bars_count) : -1;
  const bBars = Number.isFinite(Number(b?.bars_count)) ? Number(b.bars_count) : -1;
  if (aBars !== bBars) return aBars - bBars;

  const aVol = Number.isFinite(Number(a?.avg_volume_30d)) ? Number(a.avg_volume_30d) : -1;
  const bVol = Number.isFinite(Number(b?.avg_volume_30d)) ? Number(b.avg_volume_30d) : -1;
  if (aVol !== bVol) return aVol - bVol;

  return String(aCanonical || '').localeCompare(String(bCanonical || ''));
}
