#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { readJson } from './io.mjs';
import { validateDocument } from './schema_validate.mjs';

const REQUIRED_FILES = ['hotset.json', 'watchlist.json', 'triggers.json', 'scorecard.json', 'model_card.json', 'diagnostics_summary.json'];
const REQUIRED_META_KEYS = ['asof_date', 'mode', 'policy_hashes', 'model_ids', 'bars_manifest_hash', 'outcome_revision', 'circuitOpen', 'reason', 'last_good_date_used', 'generated_at'];

function parseArgs(argv) {
  const out = { date: null };
  for (const arg of argv) {
    if (arg.startsWith('--date=')) out.date = arg.split('=')[1];
  }
  return out;
}

function latestDateDir(baseDir) {
  if (!fs.existsSync(baseDir)) return null;
  const dates = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((ent) => ent.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(ent.name))
    .map((ent) => ent.name)
    .sort();
  return dates[dates.length - 1] || null;
}

function assertMeta(filePath, doc) {
  if (!doc || typeof doc !== 'object') throw new Error(`INVALID_JSON_OBJECT:${filePath}`);
  if (!doc.meta || typeof doc.meta !== 'object') throw new Error(`MISSING_META:${filePath}`);

  for (const key of REQUIRED_META_KEYS) {
    if (!(key in doc.meta)) {
      throw new Error(`MISSING_META_KEY:${filePath}:${key}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const baseDir = path.join(repoRoot, 'public/data/forecast/v6/daily');
  const date = args.date || latestDateDir(baseDir);

  if (!date) {
    throw new Error('PUBLISHED_DATE_NOT_FOUND');
  }

  const dayDir = path.join(baseDir, date);
  if (!fs.existsSync(dayDir)) {
    throw new Error(`PUBLISHED_DAY_DIR_MISSING:${dayDir}`);
  }

  for (const name of REQUIRED_FILES) {
    const filePath = path.join(dayDir, name);
    if (!fs.existsSync(filePath)) {
      throw new Error(`PUBLISHED_FILE_MISSING:${filePath}`);
    }
    const doc = readJson(filePath, null);
    assertMeta(filePath, doc);
  }

  const diagnosticsPath = path.join(dayDir, 'diagnostics_summary.json');
  const diagnosticsDoc = readJson(diagnosticsPath, null);
  const diagSchemaPath = path.join(repoRoot, 'schemas/forecast/v6/diagnostics.schema.v6.json');
  const diagValidation = validateDocument({ schemaPath: diagSchemaPath, doc: diagnosticsDoc, label: 'diagnostics_summary' });
  if (!diagValidation.ok) {
    throw new Error(`DIAGNOSTICS_SCHEMA_INVALID:${JSON.stringify(diagValidation.errors)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    date,
    validated_files: REQUIRED_FILES
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`FORECAST_V6_PUBLISH_VALIDATION_FAILED: ${err.message}`);
  process.exit(1);
}
