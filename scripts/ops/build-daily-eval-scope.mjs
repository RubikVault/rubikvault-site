/**
 * Generates public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json
 *
 * The daily-eval scope is the set of assets evaluated daily for decisions.
 * In v1 it mirrors the existing stocks_etfs compat scope (STOCK + ETF).
 * When INDEX instruments are added as direct tradable assets, extend the logic here.
 *
 * Usage: node scripts/ops/build-daily-eval-scope.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { writeJsonDurableAtomicSync } from '../lib/durable-atomic-write.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const COMPAT_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const compat = readJson(COMPAT_PATH);
const ids = Array.isArray(compat?.canonical_ids) ? compat.canonical_ids : [];
if (!ids.length) {
  console.error(`ERROR: compat scope has no canonical_ids: ${COMPAT_PATH}`);
  process.exitCode = 1;
} else {
  const payload = {
    schema: 'rv.daily_eval_scope.v1',
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    scope: 'us_eu_daily_eval',
    source: 'derived_from_compat_scope',
    count: ids.length,
    counts: compat.counts || {},
    canonical_ids: ids,
  };
  writeJsonDurableAtomicSync(OUTPUT_PATH, payload);
  console.log(`[build-daily-eval-scope] wrote ${ids.length} IDs → ${OUTPUT_PATH}`);
}
