#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const MIN_MARKET_PRICE_ROWS = Number(process.env.RV_MIN_MARKET_PRICE_ROWS || 517);
const MIN_FORECAST_ROWS = Number(process.env.RV_MIN_FORECAST_ROWS || 1);
const MIN_UNIVERSE_COVERAGE_TOTAL = Number(process.env.RV_MIN_UNIVERSE_COVERAGE_TOTAL || 2000);
const MIN_EOD_COVERAGE_RATIO = Number(process.env.RV_MIN_EOD_COVERAGE_RATIO || 0.995);
const MIN_FORECAST_COVERAGE_RATIO = Number(process.env.RV_MIN_FORECAST_COVERAGE_RATIO || 0.95);
const MIN_MARKETPHASE_COVERAGE_RATIO = Number(process.env.RV_MIN_MARKETPHASE_COVERAGE_RATIO || 0.9);
const MIN_FUNDAMENTALS_REFRESH_RATIO = Number(process.env.RV_MIN_FUNDAMENTALS_REFRESH_RATIO || 0.95);
const SAMPLE_LIMIT = Number(process.env.RV_COVERAGE_SAMPLE_LIMIT || 20);

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasSchemaField(doc) {
  return Boolean(doc?.schema_version || doc?.schemaVersion || doc?.schema || doc?.meta?.schema);
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

function readNdjsonGzArtifact(relPath) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) return { ok: false, issues: [`missing file: ${relPath}`], rows: [] };

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return { ok: false, issues: [`not a file: ${relPath}`], rows: [] };
  if (stat.size <= 0) return { ok: false, issues: [`empty file: ${relPath}`], rows: [] };

  try {
    const gz = fs.readFileSync(absPath);
    const text = zlib.gunzipSync(gz).toString('utf8');
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { ok: true, issues: [], rows };
  } catch (err) {
    return { ok: false, issues: [`invalid NDJSON GZ: ${relPath} (${err.message})`], rows: [] };
  }
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function summarizeSet(set, limit = SAMPLE_LIMIT) {
  return [...set].sort().slice(0, Math.max(0, limit));
}

function createTickerSetFromUniverse(doc) {
  if (!Array.isArray(doc)) return new Set();
  const out = new Set();
  for (const row of doc) {
    const ticker = normalizeTicker(typeof row === 'string' ? row : row?.ticker || row?.symbol);
    if (ticker) out.add(ticker);
  }
  return out;
}

function createTickerSetFromForecast(doc) {
  const rows = Array.isArray(doc?.data?.forecasts) ? doc.data.forecasts : [];
  const out = new Set();
  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker);
    if (ticker) out.add(ticker);
  }
  return out;
}

function createTickerSetFromMarketphaseIndex(doc) {
  const rows = Array.isArray(doc?.data?.symbols) ? doc.data.symbols : [];
  const out = new Set();
  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker || row);
    if (ticker) out.add(ticker);
  }
  return out;
}

function createTickerSetFromEodRows(rows) {
  const out = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ticker = normalizeTicker(row?.ticker || row?.symbol || row?.canonical_id?.split(':')?.[1]);
    if (ticker) out.add(ticker);
  }
  return out;
}

function setDifference(a, b) {
  const out = new Set();
  for (const value of a) {
    if (!b.has(value)) out.add(value);
  }
  return out;
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
  const hasChampionId = Object.prototype.hasOwnProperty.call(doc || {}, 'champion_id') || doc?.data?.champion_id !== undefined;
  const hasTrainedAt = Object.prototype.hasOwnProperty.call(doc || {}, 'trained_at') || doc?.data?.trained_at !== undefined || doc?.meta?.trained_at !== undefined;
  const hasFreshness = Object.prototype.hasOwnProperty.call(doc || {}, 'freshness') || doc?.data?.freshness !== undefined || doc?.meta?.freshness !== undefined;
  const hasStatus = Object.prototype.hasOwnProperty.call(doc || {}, 'status') || doc?.meta?.status !== undefined;
  const hasAccuracy = Object.prototype.hasOwnProperty.call(doc || {}, 'accuracy') || doc?.data?.accuracy !== undefined || doc?.meta?.accuracy !== undefined;
  if (rowsLen < MIN_FORECAST_ROWS) {
    issues.push(`${relPath}: expected >= ${MIN_FORECAST_ROWS} forecast rows, got ${rowsLen}`);
  }
  if (!asof) issues.push(`${relPath}: expected non-null asof`);
  if (!hasChampionId) issues.push(`${relPath}: champion_id missing`);
  if (!hasTrainedAt) issues.push(`${relPath}: trained_at missing`);
  if (!hasFreshness) issues.push(`${relPath}: freshness missing`);
  if (!hasStatus) issues.push(`${relPath}: status missing`);
  if (!hasAccuracy) issues.push(`${relPath}: accuracy missing`);

  console.log(`ℹ ${relPath}: forecast_rows=${rowsLen} asof=${asof ?? 'null'} status=${doc?.status ?? doc?.meta?.status ?? 'unknown'} champion=${doc?.champion_id ?? doc?.data?.champion_id ?? 'null'}`);
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

function validateUniverseManifest(doc, relPath) {
  const issues = [];
  const coverage = doc?.coverage;
  if (!coverage || typeof coverage !== 'object') {
    issues.push(`${relPath}: missing coverage object`);
    return issues;
  }

  const total = toFiniteNumber(coverage.total);
  if (!Number.isFinite(total)) issues.push(`${relPath}: coverage.total must be numeric`);
  if (!coverage.by_index || typeof coverage.by_index !== 'object') issues.push(`${relPath}: coverage.by_index missing`);
  if (!coverage.freshness) issues.push(`${relPath}: coverage.freshness missing`);
  if (!coverage.health) issues.push(`${relPath}: coverage.health missing`);
  if (!coverage.run_id && !doc?.run_id && !doc?.meta?.run_id) issues.push(`${relPath}: run_id missing`);

  if (Number.isFinite(total) && total < MIN_UNIVERSE_COVERAGE_TOTAL) {
    issues.push(`${relPath}: coverage.total ${total} below minimum ${MIN_UNIVERSE_COVERAGE_TOTAL}`);
  }
  if (String(coverage.health || '').toLowerCase() !== 'ok') {
    issues.push(`${relPath}: coverage.health must be ok (got ${coverage.health})`);
  }

  console.log(`ℹ ${relPath}: coverage.total=${total ?? 'null'} health=${coverage.health ?? 'null'} freshness=${coverage.freshness ?? 'null'}`);
  return issues;
}

function validateFundamentalsManifest(doc, relPath) {
  const issues = [];
  if (!hasSchemaField(doc)) issues.push(`missing schema field in ${relPath}`);
  if (!hasGeneratedAt(doc)) issues.push(`missing generated_at in ${relPath}`);

  const quality = doc?.meta?.quality;
  if (!quality || typeof quality !== 'object') {
    issues.push(`${relPath}: meta.quality missing`);
    return issues;
  }
  const refreshed = toFiniteNumber(quality.refreshed);
  const total = toFiniteNumber(quality.total);
  const status = String(quality.status || '').toLowerCase();
  if (!Number.isFinite(refreshed)) issues.push(`${relPath}: meta.quality.refreshed must be numeric`);
  if (!Number.isFinite(total)) issues.push(`${relPath}: meta.quality.total must be numeric`);
  if (!status) issues.push(`${relPath}: meta.quality.status missing`);

  console.log(`ℹ ${relPath}: status=${quality.status ?? 'null'} refreshed=${refreshed ?? 'null'} total=${total ?? 'null'} reason=${quality.reason ?? 'null'}`);
  return issues;
}

function runCoverageConsistencyChecks(failures) {
  const universeLoaded = readArtifact('public/data/universe/all.json');
  const eodLoaded = readNdjsonGzArtifact('public/data/v3/eod/US/latest.ndjson.gz');
  const forecastLoaded = readArtifact('public/data/forecast/latest.json');
  const marketphaseLoaded = readArtifact('public/data/marketphase/index.json');
  const fundamentalsManifestLoaded = readArtifact('public/data/v3/fundamentals/manifest.json');
  const healthLoaded = readArtifact('public/data/v3/system/health.json');

  for (const loaded of [universeLoaded, eodLoaded, forecastLoaded, marketphaseLoaded, fundamentalsManifestLoaded, healthLoaded]) {
    if (!loaded.ok) {
      for (const issue of loaded.issues) failures.push(issue);
    }
  }
  if (!universeLoaded.ok || !eodLoaded.ok || !forecastLoaded.ok || !marketphaseLoaded.ok || !fundamentalsManifestLoaded.ok || !healthLoaded.ok) {
    return;
  }

  const universeSet = createTickerSetFromUniverse(universeLoaded.doc);
  const eodSet = createTickerSetFromEodRows(eodLoaded.rows);
  const forecastSet = createTickerSetFromForecast(forecastLoaded.doc);
  const marketphaseSet = createTickerSetFromMarketphaseIndex(marketphaseLoaded.doc);

  const universeCount = universeSet.size;
  const eodInUniverse = new Set([...eodSet].filter((ticker) => universeSet.has(ticker)));
  const forecastInUniverse = new Set([...forecastSet].filter((ticker) => universeSet.has(ticker)));
  const marketphaseInUniverse = new Set([...marketphaseSet].filter((ticker) => universeSet.has(ticker)));

  const eodCoverage = universeCount > 0 ? eodInUniverse.size / universeCount : 0;
  const forecastCoverage = universeCount > 0 ? forecastInUniverse.size / universeCount : 0;
  const marketphaseCoverage = universeCount > 0 ? marketphaseInUniverse.size / universeCount : 0;

  console.log(`ℹ coverage: universe=${universeCount} eod=${eodInUniverse.size} (${eodCoverage.toFixed(4)}) forecast=${forecastInUniverse.size} (${forecastCoverage.toFixed(4)}) marketphase=${marketphaseInUniverse.size} (${marketphaseCoverage.toFixed(4)})`);

  if (eodCoverage < MIN_EOD_COVERAGE_RATIO) {
    const missingEod = setDifference(universeSet, eodSet);
    failures.push(`coverage gate: eod coverage ${(eodCoverage * 100).toFixed(2)}% below minimum ${(MIN_EOD_COVERAGE_RATIO * 100).toFixed(2)}% (missing=${missingEod.size}, sample=${summarizeSet(missingEod).join(',')})`);
  }

  if (forecastCoverage < MIN_FORECAST_COVERAGE_RATIO) {
    const missingForecast = setDifference(universeSet, forecastSet);
    failures.push(`coverage gate: forecast coverage ${(forecastCoverage * 100).toFixed(2)}% below minimum ${(MIN_FORECAST_COVERAGE_RATIO * 100).toFixed(2)}% (missing=${missingForecast.size}, sample=${summarizeSet(missingForecast).join(',')})`);
  }

  if (marketphaseCoverage < MIN_MARKETPHASE_COVERAGE_RATIO) {
    const missingMarketphase = setDifference(universeSet, marketphaseSet);
    failures.push(`coverage gate: marketphase coverage ${(marketphaseCoverage * 100).toFixed(2)}% below minimum ${(MIN_MARKETPHASE_COVERAGE_RATIO * 100).toFixed(2)}% (missing=${missingMarketphase.size}, sample=${summarizeSet(missingMarketphase).join(',')})`);
  }

  const forecastOutsideUniverse = setDifference(forecastSet, universeSet);
  if (forecastOutsideUniverse.size > 0) {
    failures.push(`forecast consistency: ${forecastOutsideUniverse.size} symbols not in universe (sample=${summarizeSet(forecastOutsideUniverse).join(',')})`);
  }

  const forecastWithoutPrice = setDifference(forecastSet, eodSet);
  if (forecastWithoutPrice.size > 0) {
    failures.push(`forecast consistency: ${forecastWithoutPrice.size} symbols missing canonical eod price (sample=${summarizeSet(forecastWithoutPrice).join(',')})`);
  }

  const fundamentalsQuality = fundamentalsManifestLoaded.doc?.meta?.quality || {};
  const fundamentalsStatus = String(fundamentalsQuality.status || '').toLowerCase();
  const fundamentalsRefreshed = toFiniteNumber(fundamentalsQuality.refreshed) ?? 0;
  const fundamentalsTotal = toFiniteNumber(fundamentalsQuality.total) ?? 0;
  const fundamentalsRefreshRatio = fundamentalsTotal > 0 ? fundamentalsRefreshed / fundamentalsTotal : 0;

  if (fundamentalsTotal < universeCount) {
    failures.push(`fundamentals gate: manifest total ${fundamentalsTotal} below universe ${universeCount}`);
  }
  if (fundamentalsRefreshRatio < MIN_FUNDAMENTALS_REFRESH_RATIO) {
    failures.push(`fundamentals gate: refresh ratio ${(fundamentalsRefreshRatio * 100).toFixed(2)}% below minimum ${(MIN_FUNDAMENTALS_REFRESH_RATIO * 100).toFixed(2)}%`);
  }
  if (fundamentalsStatus !== 'ok') {
    failures.push(`fundamentals gate: status must be ok (got ${fundamentalsQuality.status ?? 'null'})`);
  }

  const dp7 = healthLoaded.doc?.dp?.dp7_fundamentals;
  const dp7Status = String(dp7?.status || '').toLowerCase();
  const dp7Refreshed = toFiniteNumber(dp7?.coverage?.refreshed) ?? 0;
  const dp7Total = toFiniteNumber(dp7?.coverage?.total) ?? 0;
  const dp7Ratio = dp7Total > 0 ? dp7Refreshed / dp7Total : 0;
  console.log(`ℹ dp7 health: status=${dp7?.status ?? 'null'} refreshed=${dp7Refreshed} total=${dp7Total} ratio=${dp7Ratio.toFixed(4)}`);

  if (!dp7 || typeof dp7 !== 'object') {
    failures.push('fundamentals gate: dp7_fundamentals entry missing in health.json');
  } else {
    if (dp7Status !== 'ok') failures.push(`fundamentals gate: dp7_fundamentals status must be ok (got ${dp7?.status ?? 'null'})`);
    if (dp7Total < universeCount) failures.push(`fundamentals gate: dp7 coverage total ${dp7Total} below universe ${universeCount}`);
    if (dp7Ratio < MIN_FUNDAMENTALS_REFRESH_RATIO) {
      failures.push(`fundamentals gate: dp7 refresh ratio ${(dp7Ratio * 100).toFixed(2)}% below minimum ${(MIN_FUNDAMENTALS_REFRESH_RATIO * 100).toFixed(2)}%`);
    }
  }
}

async function validateFundamentalsApiContract() {
  const issues = [];
  const modulePath = path.join(root, 'functions/api/fundamentals.js');
  if (!fs.existsSync(modulePath)) {
    return [`missing file: functions/api/fundamentals.js`];
  }

  try {
    const mod = await import(pathToFileURL(modulePath).href);
    if (typeof mod?.onRequestGet !== 'function') {
      return ['functions/api/fundamentals.js: onRequestGet export missing'];
    }

    const runProbe = async (url) => {
      const response = await mod.onRequestGet({ request: new Request(url), env: {} });
      const status = Number(response?.status ?? 0);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return { status, payload };
    };

    const validProbe = await runProbe('https://local.test/api/fundamentals?ticker=KO');
    if (validProbe.status !== 200) {
      issues.push(`fundamentals api contract: expected status 200 for valid ticker, got ${validProbe.status}`);
    }
    const validPayload = validProbe.payload;
    if (!validPayload || typeof validPayload !== 'object') {
      issues.push('fundamentals api contract: valid ticker response is not JSON object');
    } else {
      if (typeof validPayload.schema_version !== 'string') issues.push('fundamentals api contract: schema_version missing');
      if (!validPayload.meta || typeof validPayload.meta !== 'object') issues.push('fundamentals api contract: meta missing');
      if (!validPayload.metadata || typeof validPayload.metadata !== 'object') issues.push('fundamentals api contract: metadata missing');
      if (!validPayload.data || typeof validPayload.data !== 'object') issues.push('fundamentals api contract: data missing');
      if (!Object.prototype.hasOwnProperty.call(validPayload, 'error')) issues.push('fundamentals api contract: error field missing');

      const data = validPayload.data || {};
      for (const field of ['ticker', 'marketCap', 'pe_ttm', 'eps_ttm']) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) {
          issues.push(`fundamentals api contract: data.${field} missing`);
        }
      }
    }

    const invalidProbe = await runProbe('https://local.test/api/fundamentals?ticker=');
    if (invalidProbe.status !== 200) {
      issues.push(`fundamentals api contract: expected status 200 for invalid ticker envelope, got ${invalidProbe.status}`);
    }
    const invalidCode = invalidProbe.payload?.error?.code ?? null;
    if (invalidCode !== 'BAD_REQUEST') {
      issues.push(`fundamentals api contract: invalid ticker should return BAD_REQUEST (got ${invalidCode ?? 'null'})`);
    }
  } catch (err) {
    issues.push(`fundamentals api contract: probe failed (${err?.message || String(err)})`);
  }

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
  },
  {
    label: 'v3 universe manifest',
    relPath: 'public/data/v3/universe/manifest.json',
    validate: validateUniverseManifest
  },
  {
    label: 'v3 fundamentals manifest',
    relPath: 'public/data/v3/fundamentals/manifest.json',
    validate: validateFundamentalsManifest
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

runCoverageConsistencyChecks(failures);

const fundamentalsContractIssues = await validateFundamentalsApiContract();
if (fundamentalsContractIssues.length > 0) {
  console.log('❌ fundamentals api contract');
  for (const issue of fundamentalsContractIssues) {
    failures.push(issue);
    console.log(`   - ${issue}`);
  }
} else {
  console.log('✅ fundamentals api contract');
}

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const issue of failures) {
    console.error(`- ${issue}`);
  }
  console.error('\nArtifact semantic verification failed. Attempted critical paths:');
  for (const spec of specs) {
    console.error(`- ${spec.relPath}`);
  }
  console.error('- coverage consistency (universe/eod/forecast/marketphase/fundamentals)');
  console.error('- fundamentals api contract');
  process.exit(1);
}

console.log('\n✅ Critical artifact semantic checks passed.');
