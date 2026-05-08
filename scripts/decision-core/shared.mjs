import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
export const DECISION_CORE_PART_COUNT = 64;
export const BUNDLE_VERSION = 'decision-core-v1';
export const POLICY_PATH = path.join(ROOT, 'public/data/decision-core/policies/latest.json');
export const REASON_CODES_PATH = path.join(ROOT, 'public/data/decision-core/reason-codes/latest.json');
export const FEATURE_MANIFEST_PATH = path.join(ROOT, 'public/data/decision-core/feature-manifests/latest.json');
export const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
export const HIST_PROBS_PUBLIC_LATEST = path.join(ROOT, 'public/data/hist-probs-public/latest.json');
export const DECISION_CORE_PUBLIC_ROOT = path.join(ROOT, 'public/data/decision-core');
export const DECISION_CORE_RUNTIME_ROOT = path.resolve(
  process.env.RV_DECISION_CORE_RUNTIME_ROOT
    || (process.env.NAS_RUNTIME_ROOT ? path.join(process.env.NAS_RUNTIME_ROOT, 'decision-runs') : '')
    || path.join(ROOT, 'runtime/decision-runs')
);
export const UI_ROW_RAW_TARGET_BYTES = 2.5 * 1024;
export const PART_TARGET_BYTES_GZIP = 512 * 1024;
export const PART_HARD_BYTES_GZIP = 1024 * 1024;

export const HARD_VETO_CODES = new Set([
  'SUSPICIOUS_ADJUSTED_DATA',
  'SUSPECT_SPLIT',
  'PENDING_CORPORATE_ACTION',
  'HALTED_RECENTLY',
  'PRICE_BELOW_MIN',
  'SPREAD_PROXY_TOO_HIGH',
  'DOLLAR_VOLUME_TOO_LOW',
  'LIQUIDITY_SCORE_TOO_LOW',
  'STALE_PRICE',
  'CRITICAL_DATA_GAP',
  'SEVERE_ILLIQUIDITY',
  'MODEL_VERSION_MISMATCH',
  'EOD_GAP_INVALIDATED',
]);

export const WAIT_SUBTYPES = new Set([
  'WAIT_ENTRY_BAD',
  'WAIT_TRIGGER_PENDING',
  'WAIT_PULLBACK_WATCH',
  'WAIT_LOW_EVIDENCE',
  'WAIT_RISK_BLOCKER',
  'WAIT_LOW_RANK',
  'WAIT_EVENT_RISK',
  'WAIT_NO_SETUP',
  'WAIT_CONFLICTING_SIGNALS',
]);

export function isoDate(value) {
  if (typeof value !== 'string') return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function isoNow() {
  return new Date().toISOString();
}

export function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}

export function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function clamp(n, min, max) {
  const value = finiteNumber(n);
  if (value == null) return null;
  return Math.max(min, Math.min(max, value));
}

export function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function decisionHash(value) {
  return `sha256:${sha256Hex(stableStringify(value))}`;
}

export function partitionFor(assetId) {
  const hex = sha256Hex(normalizeId(assetId));
  const n = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(n) ? n % DECISION_CORE_PART_COUNT : 0;
}

export function partName(index) {
  return `part-${String(index).padStart(3, '0')}.ndjson.gz`;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

export function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function writeGzipAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const gz = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9, mtime: 0 });
  fs.writeFileSync(tmp, gz);
  fs.renameSync(tmp, filePath);
  return { bytes: gz.length };
}

export function readGzipText(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
}

export function readTextMaybeGzip(filePath) {
  return String(filePath || '').endsWith('.gz') ? readGzipText(filePath) : fs.readFileSync(filePath, 'utf8');
}

export function readRegistryRows({ maxAssets = null, registryPath = null } = {}) {
  const sourcePath = registryPath || process.env.RV_DECISION_CORE_REGISTRY_OVERRIDE || REGISTRY_PATH;
  if (!fs.existsSync(sourcePath)) return [];
  const text = readTextMaybeGzip(sourcePath);
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const assetType = normalizeAssetType(row?.type_norm || row?.asset_class || row?.type);
      if (!['STOCK', 'ETF', 'INDEX'].includes(assetType)) continue;
      rows.push(row);
      if (maxAssets && rows.length >= maxAssets) break;
    } catch {
      // malformed rows excluded; validator records bundle-level errors.
    }
  }
  return rows;
}

export function normalizeAssetType(value) {
  const raw = normalizeId(value);
  if (raw === 'STOCK' || raw === 'COMMON_STOCK') return 'STOCK';
  if (raw === 'ETF' || raw === 'FUND') return raw === 'ETF' ? 'ETF' : 'ETF';
  if (raw === 'INDEX' || raw === 'INDX') return 'INDEX';
  return raw;
}

export function dateDiffDays(a, b) {
  const left = isoDate(a);
  const right = isoDate(b);
  if (!left || !right) return null;
  const diff = Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`);
  return Number.isFinite(diff) ? Math.floor(diff / 86400000) : null;
}

export function nextIsoDate(value) {
  const iso = isoDate(value);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function loadPolicyBundle() {
  const policy = readJson(POLICY_PATH);
  const reasonRegistry = readJson(REASON_CODES_PATH);
  const featureManifest = readJson(FEATURE_MANIFEST_PATH);
  const reasonMap = new Map((reasonRegistry.codes || []).map((row) => [row.code, row]));
  return { policy, reasonRegistry, featureManifest, reasonMap };
}

export function selectMainBlocker(reasonCodes, reasonMap) {
  const candidates = uniqueStrings(reasonCodes)
    .map((code) => reasonMap?.get(code))
    .filter((row) => row?.is_blocking && row?.can_be_main_blocker);
  candidates.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  return candidates[0]?.code || null;
}

export function capReasonCodes(reasonCodes, reasonMap, cap = 5) {
  const rows = uniqueStrings(reasonCodes).map((code) => ({
    code,
    meta: reasonMap?.get(code) || null,
  }));
  rows.sort((a, b) => {
    const ab = a.meta?.is_blocking ? 1 : 0;
    const bb = b.meta?.is_blocking ? 1 : 0;
    if (ab !== bb) return bb - ab;
    return Number(b.meta?.priority || 0) - Number(a.meta?.priority || 0);
  });
  return rows.slice(0, cap).map((row) => row.code);
}

export function horizonBlockers(reasonCodes, reasonMap, horizon, cap = 3) {
  const rows = uniqueStrings(reasonCodes).map((code) => ({ code, meta: reasonMap?.get(code) || null }))
    .filter((row) => {
      const applies = row.meta?.applies_to;
      return row.meta?.is_blocking && (applies === 'all' || applies === horizon || applies === 'overall');
    });
  rows.sort((a, b) => Number(b.meta?.priority || 0) - Number(a.meta?.priority || 0));
  return rows.slice(0, cap).map((row) => row.code);
}

export function classifyRegion(row) {
  const exchange = normalizeId(row?.exchange || row?.canonical_id?.split(':')?.[0]);
  if (['US', 'NASDAQ', 'NYSE', 'NYSEARCA', 'NYSEMKT', 'BATS'].includes(exchange)) return 'US';
  if ([
    'EUFUND', 'LSE', 'PA', 'DE', 'F', 'MI', 'MC', 'AS', 'BR', 'SW', 'ST', 'STU',
    'HE', 'CO', 'OL', 'LS', 'VI', 'IR', 'LU', 'EU', 'XETRA', 'BE', 'MU', 'DU',
    'HM', 'HA', 'RO', 'WAR', 'BUD', 'AT', 'BA', 'BC',
  ].includes(exchange)) return 'EU';
  if ([
    'SHE', 'SHG', 'KO', 'KQ', 'TW', 'TWO', 'KLSE', 'JK', 'BK', 'TA', 'KAR',
    'VN', 'PSE', 'XNSA', 'XNAI', 'AU',
  ].includes(exchange)) return 'ASIA';
  return 'OTHER';
}

export function parseArgs(argv) {
  const get = (name) => {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.startsWith(prefix));
    if (found) return found.slice(prefix.length);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] || null : null;
  };
  return {
    mode: get('mode') || (argv.includes('--mode=production') ? 'production' : 'shadow'),
    targetMarketDate: isoDate(get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || new Date().toISOString().slice(0, 10)),
    replace: argv.includes('--replace'),
    maxAssets: finiteNumber(get('max-assets')),
    registryOverride: get('registry-override') || process.env.RV_DECISION_CORE_REGISTRY_OVERRIDE || null,
  };
}
