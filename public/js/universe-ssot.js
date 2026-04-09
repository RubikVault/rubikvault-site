export const WEB_UNIVERSE_ALLOWED_CLASSES = ['STOCK', 'ETF', 'BOND'];
export const WEB_UNIVERSE_ALLOWED_FILTERS = ['all', 'stock', 'etf', 'bond'];
export const WEB_UNIVERSE_REMOVED_CLASSES = ['FUND', 'CRYPTO', 'FOREX', 'INDEX', 'OTHER'];
export const WEB_UNIVERSE_REMOVED_FILTERS = ['fund', 'crypto', 'forex', 'index', 'other'];

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
    { value: 'bond', label: 'Bonds' },
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
  const typeNorm = normalizeUniverseTypeNorm(record?.type_norm || record?.type);
  if (typeNorm === 'STOCK') return true;
  if (typeNorm === 'ETF') return true;
  if (typeNorm === 'BOND') return isWhitelistedContextBond(record);
  return false;
}

export function preferredCanonicalForSymbol(symbol) {
  return PREFERRED_CANONICAL_BY_SYMBOL[String(symbol || '').trim().toUpperCase()] || null;
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

  const aType = normalizeUniverseTypeNorm(a?.type_norm || a?.type);
  const bType = normalizeUniverseTypeNorm(b?.type_norm || b?.type);
  const typePriority = { ETF: 3, STOCK: 2, BOND: 1 };
  const aTypeScore = typePriority[aType] || 0;
  const bTypeScore = typePriority[bType] || 0;
  if (aTypeScore !== bTypeScore) return aTypeScore - bTypeScore;

  const aUs = String(a?.exchange || '').trim().toUpperCase() === 'US' ? 1 : 0;
  const bUs = String(b?.exchange || '').trim().toUpperCase() === 'US' ? 1 : 0;
  if (aUs !== bUs) return aUs - bUs;

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
