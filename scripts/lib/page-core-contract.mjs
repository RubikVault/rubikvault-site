import crypto from 'node:crypto';

export const PAGE_CORE_SCHEMA = 'rv.page_core.v1';
export const ALIAS_SHARD_COUNT = 64;
export const PAGE_SHARD_COUNT = 1024;
export const PAGE_CORE_TARGET_BYTES = 3 * 1024;
export const PAGE_CORE_HARD_BYTES = 6 * 1024;

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function sha256Prefix(value) {
  return `sha256:${sha256Hex(value)}`;
}

export function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function normalizeIsoDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function normalizePageCoreAlias(value) {
  return String(value || '').trim().toUpperCase();
}

export function isValidPageCoreAlias(value) {
  const normalized = normalizePageCoreAlias(value);
  return Boolean(normalized) && /^[A-Z0-9_.:^/-]+$/.test(normalized);
}

export function hashMod(value, count) {
  const hex = sha256Hex(normalizePageCoreAlias(value));
  const parsed = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(parsed) ? parsed % count : 0;
}

export function aliasShardIndex(alias) {
  return hashMod(alias, ALIAS_SHARD_COUNT);
}

export function pageShardIndex(canonicalId, count = PAGE_SHARD_COUNT) {
  return hashMod(canonicalId, count);
}

export function aliasShardName(index) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= ALIAS_SHARD_COUNT) {
    throw new Error(`INVALID_ALIAS_SHARD:${index}`);
  }
  return `${String(value).padStart(2, '0')}.json.gz`;
}

export function pageShardName(index, count = PAGE_SHARD_COUNT) {
  const value = Number(index);
  const total = Number(count);
  if (!Number.isInteger(total) || total <= 0) throw new Error(`INVALID_PAGE_SHARD_COUNT:${count}`);
  if (!Number.isInteger(value) || value < 0 || value >= total) {
    throw new Error(`INVALID_PAGE_SHARD:${index}`);
  }
  return `${String(value).padStart(3, '0')}.json.gz`;
}

export function buildPageCoreSnapshotId({ runId, targetMarketDate, manifestSeed = '' }) {
  const target = normalizeIsoDate(targetMarketDate);
  if (!target) throw new Error('PAGE_CORE_TARGET_MARKET_DATE_REQUIRED');
  const shortHash = sha256Hex(`${runId || ''}|${target}|${manifestSeed || ''}`).slice(0, 12);
  return `page-${target.replaceAll('-', '')}-${shortHash}`;
}
