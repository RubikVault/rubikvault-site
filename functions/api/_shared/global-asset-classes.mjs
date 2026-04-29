export const DEFAULT_GLOBAL_ASSET_CLASSES = Object.freeze(['STOCK', 'ETF']);
export const SUPPORTED_GLOBAL_ASSET_CLASSES = Object.freeze(['STOCK', 'ETF', 'INDEX']);

const SUPPORTED_SET = new Set(SUPPORTED_GLOBAL_ASSET_CLASSES);

export function normalizeAssetClass(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'INDICES' || normalized === 'INDEXES') return 'INDEX';
  return normalized;
}

export function parseGlobalAssetClasses(value, {
  defaultClasses = DEFAULT_GLOBAL_ASSET_CLASSES,
  supportedClasses = SUPPORTED_GLOBAL_ASSET_CLASSES,
} = {}) {
  const supported = new Set(supportedClasses.map(normalizeAssetClass));
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  const source = raw.length > 0 ? raw : defaultClasses;
  const out = [];
  for (const entry of source) {
    const normalized = normalizeAssetClass(entry);
    if (!normalized) continue;
    if (!supported.has(normalized) || !SUPPORTED_SET.has(normalized)) {
      throw new Error(`unsupported_asset_class:${normalized}`);
    }
    if (!out.includes(normalized)) out.push(normalized);
  }
  if (out.length === 0) {
    throw new Error('asset_classes_empty');
  }
  return out;
}

export function resolveGlobalAssetClasses(env = process.env) {
  return parseGlobalAssetClasses(env?.RV_GLOBAL_ASSET_CLASSES || '');
}

export function formatAssetClasses(classes) {
  return parseGlobalAssetClasses(classes).join(',');
}
