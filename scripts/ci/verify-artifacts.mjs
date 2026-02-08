#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const MIN_MARKET_PRICE_ROWS = Number(process.env.RV_MIN_MARKET_PRICE_ROWS || 517);
const MIN_FORECAST_ROWS = Number(process.env.RV_MIN_FORECAST_ROWS || 1);

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasSchemaField(doc) {
  return Boolean(doc?.schema_version || doc?.schemaVersion || doc?.schema);
}

function hasGeneratedAt(doc) {
  return Boolean(doc?.generated_at || doc?.generatedAt || doc?.meta?.generated_at || doc?.meta?.generatedAt);
}

function readArtifact(relPath) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) return { ok: false, issues: [`missing file: ${relPath}`], doc: null };

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return { ok: false, issues: [`not a file: ${relPath}`], doc: null };
  if (stat.size <= 0) return { ok: false, issues: [`empty file: ${relPath}`], doc: null };

  try {
    const doc = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    return { ok: true, issues: [], doc };
  } catch (err) {
    return { ok: false, issues: [`invalid JSON: ${relPath} (${err.message})`], doc: null };
  }
}

function validateMarketPrices(doc, relPath) {
  const issues = [];
  if (!hasSchemaField(doc)) issues.push(`missing schema field in ${relPath}`);
  if (!hasGeneratedAt(doc)) issues.push(`missing generated_at in ${relPath}`);

  const rowsLen = Array.isArray(doc?.data) ? doc.data.length : 0;
  const recordCount = toFiniteNumber(doc?.metadata?.record_count);
  const effectiveCount = Math.max(rowsLen, recordCount ?? 0);
  const asof = doc?.asof ?? doc?.metadata?.as_of ?? doc?.meta?.asOf ?? null;

  if (rowsLen <= 0) issues.push(`${relPath}: expected non-empty data array`);
  if (!asof) issues.push(`${relPath}: expected asof/metadata.as_of`);
  if (effectiveCount < MIN_MARKET_PRICE_ROWS) {
    issues.push(`${relPath}: expected >= ${MIN_MARKET_PRICE_ROWS} rows, got ${effectiveCount}`);
  }

  console.log(`ℹ ${relPath}: rows=${rowsLen} record_count=${recordCount ?? 'n/a'} asof=${asof ?? 'null'}`);
  return issues;
}

function validateForecastLatest(doc, relPath) {
  const issues = [];
  if (!hasSchemaField(doc)) issues.push(`missing schema field in ${relPath}`);
  if (!hasGeneratedAt(doc)) issues.push(`missing generated_at in ${relPath}`);

  const rowsLen = Array.isArray(doc?.data?.forecasts) ? doc.data.forecasts.length : 0;
  const asof = doc?.data?.asof ?? doc?.asof ?? doc?.meta?.asof ?? doc?.meta?.data_date ?? null;
  if (rowsLen < MIN_FORECAST_ROWS) {
    issues.push(`${relPath}: expected >= ${MIN_FORECAST_ROWS} forecast rows, got ${rowsLen}`);
  }
  if (!asof) issues.push(`${relPath}: expected non-null asof`);

  console.log(`ℹ ${relPath}: forecast_rows=${rowsLen} asof=${asof ?? 'null'} status=${doc?.meta?.status ?? doc?.status ?? 'unknown'}`);
  return issues;
}

function validateForecastStatus(doc, relPath) {
  const issues = [];
  if (!hasSchemaField(doc)) issues.push(`missing schema field in ${relPath}`);
  if (!hasGeneratedAt(doc)) issues.push(`missing generated_at in ${relPath}`);

  const status = String(doc?.status ?? doc?.meta?.status ?? '').toLowerCase();
  const circuitState = String(doc?.circuit_state ?? doc?.circuit?.state ?? '').toLowerCase();
  const reason = doc?.reason ?? doc?.message ?? doc?.meta?.reason ?? null;
  const reasonText = typeof reason === 'string' ? reason.trim() : '';

  if (!status) issues.push(`${relPath}: expected status/meta.status`);
  if (status === 'circuit_open' || circuitState === 'open') {
    if (!reasonText) issues.push(`${relPath}: circuit open requires non-empty reason`);
  }

  console.log(`ℹ ${relPath}: status=${status || 'null'} circuit_state=${circuitState || 'null'} reason=${reasonText || 'null'}`);
  return issues;
}

const specs = [
  {
    label: 'market-prices snapshot',
    relPath: 'public/data/snapshots/market-prices/latest.json',
    validate: validateMarketPrices
  },
  {
    label: 'forecast latest',
    relPath: 'public/data/forecast/latest.json',
    validate: validateForecastLatest
  },
  {
    label: 'forecast status',
    relPath: 'public/data/forecast/system/status.json',
    validate: validateForecastStatus
  }
];

const failures = [];
for (const spec of specs) {
  const loaded = readArtifact(spec.relPath);
  if (!loaded.ok) {
    console.log(`❌ ${spec.label}: ${spec.relPath}`);
    for (const issue of loaded.issues) {
      failures.push(issue);
      console.log(`   - ${issue}`);
    }
    continue;
  }

  const issues = spec.validate(loaded.doc, spec.relPath);
  if (issues.length > 0) {
    console.log(`❌ ${spec.label}: ${spec.relPath}`);
    for (const issue of issues) {
      failures.push(issue);
      console.log(`   - ${issue}`);
    }
    continue;
  }

  console.log(`✅ ${spec.label}: ${spec.relPath}`);
}

if (failures.length > 0) {
  console.error('\nArtifact semantic verification failed. Attempted critical paths:');
  for (const spec of specs) {
    console.error(`- ${spec.relPath}`);
  }
  process.exit(1);
}

console.log('\n✅ Critical artifact semantic checks passed.');
