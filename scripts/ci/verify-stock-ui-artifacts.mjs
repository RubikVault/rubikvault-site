#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readJson(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return { ok: false, errors: [`missing file: ${relPath}`], doc: null };
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return { ok: false, errors: [`not a file: ${relPath}`], doc: null };
  if (stat.size <= 0) return { ok: false, errors: [`empty file: ${relPath}`], doc: null };
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    return { ok: true, errors: [], doc: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${relPath} (${error.message})`], doc: null };
  }
}

function validateMeta(doc, relPath) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return [`invalid document: ${relPath}`];
  const meta = doc.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push(`${relPath}: missing meta`);
    return errors;
  }
  if (!meta.generated_at) errors.push(`${relPath}: meta.generated_at missing`);
  if (!meta.schema_version) errors.push(`${relPath}: meta.schema_version missing`);
  if (!meta.provider) errors.push(`${relPath}: meta.provider missing`);
  return errors;
}

function validateBenchmarks(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const map = doc?.data?.benchmarks;
  if (!map || typeof map !== 'object') {
    errors.push(`${relPath}: data.benchmarks missing`);
    return errors;
  }
  for (const [symbol, row] of Object.entries(map)) {
    if (!row || typeof row !== 'object') {
      errors.push(`${relPath}: ${symbol} is not an object`);
      continue;
    }
    const returns = row.returns;
    if (!returns || typeof returns !== 'object') {
      errors.push(`${relPath}: ${symbol} missing returns`);
      continue;
    }
    for (const key of ['d1', 'ytd', 'y1', 'y5']) {
      const value = returns[key];
      if (value == null) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) errors.push(`${relPath}: ${symbol}.returns.${key} must be finite or null`);
    }
  }
  return errors;
}

function validatePeers(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const peers = doc?.data?.peers;
  if (!peers || typeof peers !== 'object') {
    errors.push(`${relPath}: data.peers missing`);
    return errors;
  }

  const keys = Object.keys(peers);
  if (keys.length < 100) {
    errors.push(`${relPath}: expected at least 100 peer mappings, got ${keys.length}`);
  }

  for (const [ticker, list] of Object.entries(peers)) {
    if (!Array.isArray(list)) {
      errors.push(`${relPath}: ${ticker} peers is not an array`);
      continue;
    }
    if (list.length > 8) errors.push(`${relPath}: ${ticker} peers length > 8 (${list.length})`);
    for (const symbol of list) {
      if (typeof symbol !== 'string' || !symbol.trim()) {
        errors.push(`${relPath}: ${ticker} contains invalid peer symbol`);
      }
    }
  }

  return errors;
}

function validateCorrelations(doc, relPath) {
  const errors = validateMeta(doc, relPath);
  const correlations = doc?.data?.correlations;
  if (!correlations || typeof correlations !== 'object') {
    errors.push(`${relPath}: data.correlations missing`);
    return errors;
  }

  for (const [ticker, row] of Object.entries(correlations)) {
    if (!row || typeof row !== 'object') {
      errors.push(`${relPath}: ${ticker} row invalid`);
      continue;
    }
    if (!Number.isFinite(Number(row.window))) errors.push(`${relPath}: ${ticker} missing numeric window`);
    const items = row.items;
    if (!Array.isArray(items)) {
      errors.push(`${relPath}: ${ticker} items is not an array`);
      continue;
    }
    for (const item of items) {
      const corr = Number(item?.corr);
      if (!Number.isFinite(corr) || corr < -1 || corr > 1) {
        errors.push(`${relPath}: ${ticker} correlation out of range`);
      }
      if (typeof item?.symbol !== 'string' || !item.symbol.trim()) {
        errors.push(`${relPath}: ${ticker} correlation symbol missing`);
      }
    }
  }

  return errors;
}

const checks = [
  {
    relPath: 'public/data/ui/benchmarks/latest.json',
    label: 'benchmarks',
    validate: validateBenchmarks
  },
  {
    relPath: 'public/data/ui/peers/latest.json',
    label: 'peers',
    validate: validatePeers
  },
  {
    relPath: 'public/data/ui/correlations/latest.json',
    label: 'correlations',
    validate: validateCorrelations
  }
];

const failures = [];
for (const check of checks) {
  const loaded = readJson(check.relPath);
  if (!loaded.ok) {
    console.log(`❌ ${check.label}: ${check.relPath}`);
    for (const err of loaded.errors) {
      failures.push(err);
      console.log(`   - ${err}`);
    }
    continue;
  }

  const errs = check.validate(loaded.doc, check.relPath);
  if (errs.length) {
    console.log(`❌ ${check.label}: ${check.relPath}`);
    for (const err of errs) {
      failures.push(err);
      console.log(`   - ${err}`);
    }
    continue;
  }

  console.log(`✅ ${check.label}: ${check.relPath}`);
}

if (failures.length) {
  console.error('\nStock UI artifact verification failed.');
  process.exit(1);
}

console.log('\n✅ Stock UI artifact verification passed.');
