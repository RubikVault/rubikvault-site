import { createHash } from 'node:crypto';

export const PAGE_CORE_SCHEMA = 'rv.page_core.v1';
export const ALIAS_SHARD_COUNT = 64;
export const PAGE_SHARD_COUNT = 256;

export function normalizePageCoreAlias(value) {
  return String(value || '').trim().toUpperCase();
}

export function isValidPageCoreAlias(value) {
  const normalized = normalizePageCoreAlias(value);
  return Boolean(normalized) && /^[A-Z0-9_.:^/-]+$/.test(normalized);
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

export function hashMod(value, count) {
  const hex = sha256Hex(normalizePageCoreAlias(value));
  const parsed = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(parsed) ? parsed % count : 0;
}

export function aliasShardIndex(alias) {
  return hashMod(alias, ALIAS_SHARD_COUNT);
}

export function pageShardIndex(canonicalId) {
  return hashMod(canonicalId, PAGE_SHARD_COUNT);
}

export function aliasShardName(index) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= ALIAS_SHARD_COUNT) {
    throw new Error(`INVALID_ALIAS_SHARD:${index}`);
  }
  return `${String(value).padStart(2, '0')}.json.gz`;
}

export function pageShardName(index) {
  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= PAGE_SHARD_COUNT) {
    throw new Error(`INVALID_PAGE_SHARD:${index}`);
  }
  return `${String(value).padStart(3, '0')}.json.gz`;
}
