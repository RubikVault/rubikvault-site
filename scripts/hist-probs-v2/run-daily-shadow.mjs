#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { iterateGzipNdjson } from '../lib/io/gzip-ndjson.mjs';
import { readErrors } from '../lib/hist-probs/error-ledger.mjs';
import { REPO_ROOT, loadLocalBars, setLocalBarsRuntimeOverrides } from '../lib/best-setups-local-loader.mjs';
import {
  HIST_PROBS_V2_FEATURE_VERSION,
  HIST_PROBS_V2_MODEL_VERSION,
  HIST_PROBS_V2_SCHEMA,
  scoreBarsWithBaselineV2,
} from './lib/baseline-v2.mjs';

const ROOT = process.env.RUBIKVAULT_ROOT || REPO_ROOT || process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const RUN_ROOT = path.join(ROOT, 'mirrors/hist-probs-v2/runs');
const STATE_ROOT = path.join(ROOT, 'mirrors/hist-probs-v2/state');
const PUBLIC_REPORT = path.join(ROOT, 'public/data/reports/hist-probs-v2-latest.json');
const PRED_ROOT = path.join(ROOT, 'mirrors/learning/predictions/hist_probs_v2_shadow');

const ANCHORS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA']);

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1';
  }
  return fallback;
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function readJson(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function inferTargetDate() {
  return normalizeDate(argValue('--date'))
    || normalizeDate(process.env.TARGET_MARKET_DATE)
    || normalizeDate(process.env.RV_TARGET_MARKET_DATE)
    || normalizeDate(readJson(path.join(ROOT, 'public/data/hist-probs/run-summary.json'))?.regime_date)
    || normalizeDate(new Date().toISOString());
}

async function writeJsonAtomic(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
  await fs.rename(tmp, filePath);
}

async function writeNdjson(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  await fs.rename(tmp, filePath);
}

async function writeNdjsonGz(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const body = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  await fs.writeFile(tmp, zlib.gzipSync(body));
  await fs.rename(tmp, filePath);
}

async function selectUniverse({ maxAssets, errorAssetLimit, minBars, tickers }) {
  const explicitTickers = tickers
    ? new Set(tickers.split(',').map(normalizeTicker).filter(Boolean))
    : null;
  const errorTickers = new Set(readErrors({ maxAgeDays: 30 }).map((entry) => normalizeTicker(entry.ticker)).filter(Boolean));
  const rows = [];
  for await (const row of iterateGzipNdjson(REGISTRY_PATH)) {
    const symbol = normalizeTicker(row?.symbol);
    const assetClass = String(row?.type_norm || '').trim().toUpperCase();
    if (!symbol || !['STOCK', 'ETF'].includes(assetClass)) continue;
    if (explicitTickers && !explicitTickers.has(symbol)) continue;
    const barsCount = Number(row?.bars_count || 0);
    if (barsCount < minBars) continue;
    const historyPack = String(row?.pointers?.history_pack || row?.history_pack || '').trim();
    if (!historyPack) continue;
    rows.push({
      symbol,
      ticker: symbol,
      canonical_id: String(row?.canonical_id || '').trim().toUpperCase() || null,
      exchange: String(row?.exchange || '').trim().toUpperCase() || null,
      asset_class: assetClass,
      bars_count: barsCount,
      last_trade_date: normalizeDate(row?.last_trade_date),
      history_pack: historyPack,
      source_priority: ANCHORS.has(symbol) ? 3 : errorTickers.has(symbol) ? 2 : 1,
    });
  }
  const bySymbol = new Map();
  for (const row of rows) {
    const prev = bySymbol.get(row.symbol);
    if (!prev
      || row.source_priority > prev.source_priority
      || String(row.last_trade_date || '').localeCompare(String(prev.last_trade_date || '')) > 0
      || row.bars_count > prev.bars_count) {
      bySymbol.set(row.symbol, row);
    }
  }
  rows.length = 0;
  rows.push(...bySymbol.values());
  rows.sort((a, b) => (
    b.source_priority - a.source_priority
    || String(b.last_trade_date || '').localeCompare(String(a.last_trade_date || ''))
    || b.bars_count - a.bars_count
    || a.symbol.localeCompare(b.symbol)
  ));
  if (explicitTickers) return rows;
  const core = rows.filter((row) => row.source_priority !== 2).slice(0, maxAssets);
  const included = new Set(core.map((row) => row.symbol));
  const errors = rows.filter((row) => row.source_priority === 2 && !included.has(row.symbol)).slice(0, errorAssetLimit);
  return [...core, ...errors].slice(0, maxAssets + errorAssetLimit);
}

function predictionPath(date) {
  const [year, month] = date.split('-');
  return path.join(PRED_ROOT, year, month, `${date}.ndjson`);
}

function buildLearningPredictions(scores, targetDate) {
  const freshRows = scores
    .filter((row) => row.score_date === targetDate && row.observations >= 20)
    .sort((a, b) => Number(b.expected_value || 0) - Number(a.expected_value || 0));
  return freshRows.map((row, index) => ({
    feature: 'hist_probs_v2_shadow',
    ticker: row.ticker,
    date: targetDate,
    asset_class: row.asset_class,
    horizon: row.horizon,
    horizon_bucket: row.horizon,
    direction: 'bullish',
    probability: row.probability,
    calibrated_probability: row.calibrated_probability,
    raw_probability: row.raw_probability,
    confidence: row.probability,
    confidence_bucket: 'SHADOW',
    verdict: 'SHADOW',
    buy_eligible: false,
    abstain_reason: 'SHADOW_ONLY',
    rank: index + 1,
    rank_score: row.expected_value,
    quality_score: row.expected_value,
    expected_value: row.expected_value,
    observations: row.observations,
    bucket: row.bucket,
    price_at_prediction: row.price_at_prediction,
    source: 'hist_probs_v2_shadow',
    model_version: row.model_version,
    feature_version: row.feature_version,
  }));
}

export async function runDailyShadow(options = {}) {
  const targetDate = normalizeDate(options.date) || inferTargetDate();
  const maxAssets = Math.max(1, Number(options.maxAssets ?? argValue('--max-assets', process.env.RV_HIST_PROBS_V2_MAX_ASSETS || '300')) || 300);
  const errorAssetLimit = Math.max(0, Number(options.errorAssetLimit ?? argValue('--error-assets', '200')) || 0);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? argValue('--timeout-ms', process.env.RV_HIST_PROBS_V2_TIMEOUT_MS || '600000')) || 600000);
  const minBars = Math.max(60, Number(options.minBars ?? argValue('--min-bars', '60')) || 60);
  const tickers = options.tickers ?? argValue('--tickers', null);
  const started = performance.now();
  const runId = `hist-probs-v2-${targetDate}-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;
  const runDir = path.join(RUN_ROOT, runId);
  const scores = [];
  const states = [];
  const errors = [];
  let timedOut = false;

  setLocalBarsRuntimeOverrides({ localBarStaleDays: 9999, allowRemoteBarFetch: false });
  const universe = await selectUniverse({ maxAssets, errorAssetLimit, minBars, tickers });
  for (const entry of universe) {
    if (performance.now() - started > timeoutMs) {
      timedOut = true;
      break;
    }
    try {
      const bars = await loadLocalBars(entry.symbol, {
        preferredCanonicalId: entry.canonical_id,
        preferredExchange: entry.exchange,
      });
      const result = scoreBarsWithBaselineV2(bars, {
        ticker: entry.symbol,
        assetClass: entry.asset_class.toLowerCase(),
      });
      const freshnessStatus = result.state.last_bar_date === targetDate ? 'current' : 'stale';
      states.push({
        asset_id: entry.canonical_id || entry.symbol,
        asset_class: entry.asset_class,
        last_bar_date: result.state.last_bar_date || entry.last_trade_date || null,
        last_processed_date: targetDate,
        history_pack_sha: null,
        v1_status: null,
        v2_status: result.status,
        freshness_status: freshnessStatus,
        eligible_for_signal: result.status === 'ready' && freshnessStatus === 'current',
        reason: result.status === 'ready' ? null : result.status,
        error_class: null,
        retry_count: 0,
      });
      for (const score of result.scores || []) {
        scores.push({ ...score, freshness_status: freshnessStatus, target_market_date: targetDate });
      }
    } catch (error) {
      errors.push({
        ticker: entry.symbol,
        asset_id: entry.canonical_id || entry.symbol,
        error_class: 'COMPUTE_ERROR',
        message: error?.message || String(error),
      });
      states.push({
        asset_id: entry.canonical_id || entry.symbol,
        asset_class: entry.asset_class,
        last_bar_date: entry.last_trade_date || null,
        last_processed_date: targetDate,
        history_pack_sha: null,
        v1_status: null,
        v2_status: 'error',
        freshness_status: 'unknown',
        eligible_for_signal: false,
        reason: 'compute_error',
        error_class: 'COMPUTE_ERROR',
        retry_count: 1,
      });
    }
  }

  const predictions = buildLearningPredictions(scores, targetDate);
  const elapsedMs = Math.round(performance.now() - started);
  const status = timedOut || errors.length > 0 ? 'warning' : 'ok';
  const coverage = {
    schema: 'rv.hist_probs_v2.coverage.v1',
    target_market_date: targetDate,
    selected_assets: universe.length,
    processed_assets: states.length,
    ready_assets: states.filter((row) => row.v2_status === 'ready').length,
    current_assets: states.filter((row) => row.freshness_status === 'current').length,
    stale_assets: states.filter((row) => row.freshness_status === 'stale').length,
    error_assets: errors.length,
    scores: scores.length,
    predictions: predictions.length,
  };
  const performanceReport = {
    schema: 'rv.hist_probs_v2.performance.v1',
    elapsed_ms: elapsedMs,
    timeout_ms: timeoutMs,
    timed_out: timedOut,
    rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    assets_per_second: states.length ? Number((states.length / Math.max(1, elapsedMs / 1000)).toFixed(3)) : 0,
  };
  const manifest = {
    schema: HIST_PROBS_V2_SCHEMA,
    run_id: runId,
    generated_at: new Date().toISOString(),
    target_market_date: targetDate,
    status,
    non_blocking_shadow: true,
    feature_version: HIST_PROBS_V2_FEATURE_VERSION,
    model_version: HIST_PROBS_V2_MODEL_VERSION,
    storage: 'ndjson.gz',
    artifacts: {
      scores: 'scores.ndjson.gz',
      state: 'state.ndjson.gz',
      errors: 'errors.ndjson',
      coverage: 'coverage.json',
      performance: 'performance.json',
    },
    coverage,
    performance: performanceReport,
  };

  await fs.mkdir(runDir, { recursive: true });
  await writeJsonAtomic(path.join(runDir, 'manifest.json'), manifest);
  await writeJsonAtomic(path.join(runDir, 'coverage.json'), coverage);
  await writeJsonAtomic(path.join(runDir, 'performance.json'), performanceReport);
  await writeNdjsonGz(path.join(runDir, 'scores.ndjson.gz'), scores);
  await writeNdjsonGz(path.join(runDir, 'state.ndjson.gz'), states);
  await writeNdjson(path.join(runDir, 'errors.ndjson'), errors);
  await writeNdjson(predictionPath(targetDate), predictions);
  await writeNdjsonGz(path.join(STATE_ROOT, 'asset-state.latest.ndjson.gz'), states);
  await writeJsonAtomic(path.join(RUN_ROOT, 'latest.json'), {
    schema: 'rv.hist_probs_v2.latest.v1',
    run_id: runId,
    target_market_date: targetDate,
    manifest_path: path.relative(ROOT, path.join(runDir, 'manifest.json')),
    generated_at: manifest.generated_at,
    status,
  });
  await writeJsonAtomic(PUBLIC_REPORT, {
    schema: 'rv.hist_probs_v2.public_latest.v1',
    generated_at: manifest.generated_at,
    status,
    run_id: runId,
    target_market_date: targetDate,
    source: 'shadow_only',
    hist_probs_source_default: 'v1_primary',
    coverage,
    performance: performanceReport,
    sample_scores: scores
      .slice()
      .sort((a, b) => Number(b.expected_value || 0) - Number(a.expected_value || 0))
      .slice(0, 25),
  });
  return { manifest, coverage, performance: performanceReport, predictions };
}

async function main() {
  const result = await runDailyShadow();
  console.log(`[hist-probs-v2] status=${result.manifest.status} run_id=${result.manifest.run_id} predictions=${result.predictions.length}`);
  if (result.manifest.status !== 'ok' && process.argv.includes('--fail-on-warning')) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error) => {
    const targetDate = inferTargetDate();
    await writeJsonAtomic(PUBLIC_REPORT, {
      schema: 'rv.hist_probs_v2.public_latest.v1',
      generated_at: new Date().toISOString(),
      status: 'failed',
      target_market_date: targetDate,
      source: 'shadow_only',
      error: error?.message || String(error),
    }).catch(() => {});
    console.error('[hist-probs-v2] fatal', error);
    process.exit(1);
  });
}
