/**
 * effective-scope.mjs
 *
 * Single source of truth for "how many assets is the pipeline actually
 * processing this run". After the Nasdaq Composite validated extension
 * the universe has dual-scope semantics:
 *
 *   - public/data/universe/v7/ssot/assets.global.canonical.ids.json
 *     counts the index_core core SSOT (~6,110 today)
 *   - public/data/page-core/latest.json counts the effective UI scope
 *     including the validated Nasdaq extension (~12,445 today)
 *
 * Producer-side budgets (heap, EODHD preflight, throttling) MUST size
 * to the effective scope so they don't OOM/throttle mid-run. UI-level
 * audits and contract validators MAY still use the canonical SSOT.
 *
 * This module is plain Node ESM and stays dependency-free so it can
 * also be wrapped by the bash supervisor (`effective_scope_count`).
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PAGE_CORE_LATEST = 'public/data/page-core/latest.json';
const DEFAULT_CANONICAL_IDS = 'public/data/universe/v7/ssot/assets.global.canonical.ids.json';
const FALLBACK_COUNT = 6110;

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function positiveInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Returns the count to size pipeline budgets against.
 * Priority: page-core/latest.json.asset_count → canonical_ids.count → fallback.
 *
 * @param {object} [options]
 * @param {string} [options.repoRoot] - absolute path; defaults to cwd
 * @param {string} [options.pageCorePath] - override page-core/latest.json
 * @param {string} [options.canonicalIdsPath] - override canonical_ids json
 * @param {number} [options.fallback=6110] - last-resort value
 * @returns {{count: number, source: string}}
 */
export function effectiveScopeCount(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const pageCoreRel = options.pageCorePath || DEFAULT_PAGE_CORE_LATEST;
  const canonicalRel = options.canonicalIdsPath || DEFAULT_CANONICAL_IDS;
  const fallback = positiveInteger(options.fallback) || FALLBACK_COUNT;

  const pageCorePath = path.isAbsolute(pageCoreRel) ? pageCoreRel : path.join(repoRoot, pageCoreRel);
  const pageCore = readJsonMaybe(pageCorePath);
  const pageCoreCount = positiveInteger(pageCore?.asset_count);
  if (pageCoreCount) {
    return { count: pageCoreCount, source: 'page_core' };
  }

  const canonicalPath = path.isAbsolute(canonicalRel) ? canonicalRel : path.join(repoRoot, canonicalRel);
  const canonical = readJsonMaybe(canonicalPath);
  const canonicalCount = positiveInteger(canonical?.count)
    || positiveInteger(Array.isArray(canonical?.canonical_ids) ? canonical.canonical_ids.length : null);
  if (canonicalCount) {
    return { count: canonicalCount, source: 'canonical_ids' };
  }

  return { count: fallback, source: 'fallback' };
}

// CLI hook: print the count so bash can consume it (`effective_scope_count`)
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = effectiveScopeCount();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${result.count}\n`);
  }
}
