#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_SOURCE = '/Users/michaelpuchowezki/Desktop/Historical-Analyses';
const DEFAULT_OUT = path.join(ROOT, 'public/data/universe/v7/index-memberships/nasdaq_composite_all.preview.json');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function runDuckJson(sql) {
  const out = execFileSync('duckdb', ['-json', '-c', sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 128 });
  return JSON.parse(out || '[]');
}

function main() {
  const sourceRoot = path.resolve(argValue('source-root', DEFAULT_SOURCE));
  const outPath = path.resolve(argValue('out', DEFAULT_OUT));
  const parquetPath = path.join(sourceRoot, 'data/universe_us.parquet');
  if (!fs.existsSync(parquetPath)) throw new Error(`Historical-Analyses US universe parquet missing: ${parquetPath}`);
  const rows = runDuckJson(`
    SELECT
      UPPER(canonical_id) AS canonical_id,
      symbol,
      exchange,
      COUNT(*) AS bars_count,
      MIN(date) AS first_date,
      MAX(date) AS last_date
    FROM read_parquet('${parquetPath.replaceAll("'", "''")}')
    WHERE canonical_id IS NOT NULL
      AND symbol IS NOT NULL
      AND exchange = 'US'
    GROUP BY 1,2,3
    HAVING bars_count >= 200
    ORDER BY canonical_id
  `);
  const constituents = rows.map((row) => ({
    canonical_id: row.canonical_id,
    ticker: row.symbol,
    exchange: row.exchange,
    asset_class: 'STOCK',
    asset_class_source: 'historical_analyses_us_equity_seed_requires_eodhd_validation',
    source: 'historical_analyses_seed',
    bars_count: Number(row.bars_count || 0),
    first_date: row.first_date || null,
    last_date: row.last_date || null,
    validation_status: 'seed_unvalidated',
  }));
  atomicWriteJson(outPath, {
    schema: 'rv.universe.index_membership.preview.v1',
    membership_id: 'nasdaq_composite_all',
    generated_at: new Date().toISOString(),
    source: {
      kind: 'historical_analyses_us_universe_seed',
      local_paths_redacted: true,
    },
    production_ready: false,
    required_followup: [
      'Validate membership against EODHD/registry exchange truth before enabling production scope.',
      'Confirm asset_class against EODHD/registry before enabling production scope; preview seeds are marked STOCK only because source is US equity history.',
      'Dedupe against existing index_core scope by canonical_id.',
      'Run provider-exception classification before final scope flip.',
    ],
    count: constituents.length,
    constituents,
  });
  console.log(`[nasdaq-composite-preview] wrote ${constituents.length} seed assets to ${path.relative(ROOT, outPath)}`);
}

main();
