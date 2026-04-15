#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const SNAPSHOT_PATH = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/frontpage-snapshot-audit-latest.json');
const REQUIRED_ROW_FIELDS = [
  'ticker',
  'asset_class',
  'name',
  'price',
  'score',
  'confidence',
  'verdict',
  'horizon',
  'source',
  'learning_status',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function flattenRows(doc) {
  const rows = [];
  for (const section of ['stocks', 'etfs']) {
    for (const horizon of ['short', 'medium', 'long']) {
      const bucket = doc?.data?.[section]?.[horizon];
      if (Array.isArray(bucket)) {
        for (const row of bucket) {
          rows.push({ section, horizon, row });
        }
      }
    }
  }
  return rows;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function auditSnapshot(doc) {
  const violations = [];
  if (!doc || typeof doc !== 'object') {
    violations.push({ code: 'SNAPSHOT_MISSING', message: 'Snapshot document missing or invalid JSON.' });
    return { rows: [], violations };
  }
  if (typeof doc.schema_version !== 'string' || !doc.schema_version) {
    violations.push({ code: 'SCHEMA_VERSION_MISSING', message: 'schema_version missing.' });
  }
  if (typeof doc.generated_at !== 'string' || !doc.generated_at) {
    violations.push({ code: 'GENERATED_AT_MISSING', message: 'generated_at missing.' });
  }
  if (typeof doc?.meta?.data_asof !== 'string' || !doc.meta.data_asof) {
    violations.push({ code: 'DATA_ASOF_MISSING', message: 'meta.data_asof missing.' });
  }
  const rows = flattenRows(doc);
  const zeroRowsJustified = rows.length === 0
    && doc?.meta?.reason_summary?.snapshot_empty === true
    && Number(doc?.meta?.rows_emitted?.total || 0) === 0;
  if (!rows.length && !zeroRowsJustified) {
    violations.push({ code: 'ROWS_EMPTY', message: 'Snapshot emitted zero rows.' });
  }
  const actualTotal = rows.length;
  const metaTotal = Number(doc?.meta?.rows_emitted?.total || 0);
  if (metaTotal !== actualTotal) {
    violations.push({
      code: 'ROWS_TOTAL_MISMATCH',
      message: `meta.rows_emitted.total=${metaTotal} but actual=${actualTotal}.`,
    });
  }
  const seen = new Set();
  for (const entry of rows) {
    const { section, horizon, row } = entry;
    const key = `${section}:${horizon}:${row?.ticker || ''}`;
    if (seen.has(key)) {
      violations.push({ code: 'DUPLICATE_ROW', message: `Duplicate row ${key}.`, ticker: row?.ticker || null });
    }
    seen.add(key);

    for (const field of REQUIRED_ROW_FIELDS) {
      const value = row?.[field];
      if (value == null || value === '') {
        violations.push({ code: 'ROW_FIELD_MISSING', message: `${key}.${field} missing.`, ticker: row?.ticker || null, field });
      }
    }
    if (!isFiniteNumber(row?.price) || row.price <= 0) {
      violations.push({ code: 'PRICE_INVALID', message: `${key}.price invalid.`, ticker: row?.ticker || null });
    }
    if (!isFiniteNumber(row?.score)) {
      violations.push({ code: 'SCORE_INVALID', message: `${key}.score invalid.`, ticker: row?.ticker || null });
    }
    if (!['BUY', 'WAIT', 'SELL', 'AVOID', 'INSUFFICIENT_DATA'].includes(String(row?.verdict || '').toUpperCase())) {
      violations.push({ code: 'VERDICT_INVALID', message: `${key}.verdict invalid.`, ticker: row?.ticker || null });
    }
    if (!['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(String(row?.confidence || '').toUpperCase())) {
      violations.push({ code: 'CONFIDENCE_INVALID', message: `${key}.confidence invalid.`, ticker: row?.ticker || null });
    }
  }

  return { rows, violations };
}

function main() {
  const doc = fs.existsSync(SNAPSHOT_PATH) ? readJson(SNAPSHOT_PATH) : null;
  const { rows, violations } = auditSnapshot(doc);
  const report = {
    schema: 'rv.frontpage_snapshot_audit.v1',
    generated_at: new Date().toISOString(),
    snapshot_generated_at: doc?.generated_at || null,
    snapshot_data_asof: doc?.meta?.data_asof || null,
    rows_total: rows.length,
    by_section: {
      stocks: rows.filter((entry) => entry.section === 'stocks').length,
      etfs: rows.filter((entry) => entry.section === 'etfs').length,
    },
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    total_violations: violations.length,
    violations: violations.slice(0, 100),
  };
  writeJson(REPORT_PATH, report);
  if (violations.length > 0) process.exit(1);
}

main();
