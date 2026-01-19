/**
 * KV Dedupe Logic
 * 
 * Prevents unnecessary KV writes by checking digest changes.
 * This is critical for staying within Cloudflare's 1000 writes/day limit.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KV_DIGEST_CACHE_PATH = join(process.cwd(), 'public/data/.kv-digest-cache.json');

/**
 * Load the KV digest cache
 * This cache stores the digest of the last KV write for each module.
 */
export async function loadKVDigestCache() {
  try {
    const content = await readFile(KV_DIGEST_CACHE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Cache doesn't exist yet - first run
      return {};
    }
    throw err;
  }
}

/**
 * Save the KV digest cache
 */
export async function saveKVDigestCache(cache) {
  await writeFile(KV_DIGEST_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Check if a KV write should be skipped (digest hasn't changed)
 * 
 * @param {string} moduleName - Module name
 * @param {string} newDigest - New snapshot digest
 * @param {object} cache - Current KV digest cache
 * @returns {{ shouldWrite: boolean, reason: string }}
 */
export function shouldWriteToKV(moduleName, newDigest, cache) {
  const cached = cache[moduleName];
  
  if (!cached) {
    return {
      shouldWrite: true,
      reason: 'NO_CACHE_ENTRY'
    };
  }
  
  if (cached.digest !== newDigest) {
    return {
      shouldWrite: true,
      reason: 'DIGEST_CHANGED'
    };
  }
  
  // Check if cache is very old (>48h) - force refresh
  const ageMs = Date.now() - new Date(cached.last_write_at).getTime();
  const maxAgeMs = 48 * 60 * 60 * 1000; // 48 hours
  
  if (ageMs > maxAgeMs) {
    return {
      shouldWrite: true,
      reason: 'CACHE_STALE'
    };
  }
  
  return {
    shouldWrite: false,
    reason: 'DIGEST_UNCHANGED'
  };
}

/**
 * Update the KV digest cache after a successful write
 */
export function updateKVDigestCache(cache, moduleName, digest) {
  cache[moduleName] = {
    digest,
    last_write_at: new Date().toISOString()
  };
  return cache;
}

/**
 * Get daily KV write statistics
 * 
 * @param {object} cache - Current KV digest cache
 * @returns {{ writes_today: number, writes_last_24h: number, limit: number, budget_remaining: number }}
 */
export function getKVWriteStats(cache) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  let writesToday = 0;
  let writesLast24h = 0;
  
  for (const [moduleName, entry] of Object.entries(cache)) {
    const writeDate = new Date(entry.last_write_at);
    
    if (writeDate >= todayStart) {
      writesToday++;
    }
    
    if (writeDate >= last24hStart) {
      writesLast24h++;
    }
  }
  
  const DAILY_LIMIT = 1000;
  
  return {
    writes_today: writesToday,
    writes_last_24h: writesLast24h,
    limit: DAILY_LIMIT,
    budget_remaining: DAILY_LIMIT - writesToday,
    budget_available: DAILY_LIMIT - writesToday > 0
  };
}

/**
 * Check if KV write budget is exhausted
 * 
 * @param {object} stats - KV write stats from getKVWriteStats()
 * @returns {boolean} - True if budget allows writes
 */
export function hasKVWriteBudget(stats) {
  // Keep 10% buffer
  const SAFETY_BUFFER = 100;
  return stats.budget_remaining > SAFETY_BUFFER;
}
