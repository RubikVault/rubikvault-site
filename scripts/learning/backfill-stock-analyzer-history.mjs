#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeIndicators } from '../../functions/api/_shared/eod-indicators.mjs';
import { classifyAllStates } from '../../functions/api/_shared/stock-states-v1.js';
import { makeDecision } from '../../functions/api/_shared/stock-decisions-v1.js';
import { buildForecastCandidatePools, buildQuantLabCandidates } from '../../functions/api/_shared/best-setups-v4.js';
import { resolveLocalAssetMeta } from '../lib/best-setups-local-loader.mjs';

const ROOT = process.cwd();
const PRED_ROOT = path.join(ROOT, 'mirrors/learning/predictions/stock_analyzer');
const OUTCOME_ROOT = path.join(ROOT, 'mirrors/learning/outcomes/stock_analyzer');
const FORECAST_PATH = path.join(ROOT, 'public/data/forecast/latest.json');
const QUANTLAB_DIRS = {
  stock: path.join(ROOT, 'public/data/quantlab/stock-insights/stocks'),
  etf: path.join(ROOT, 'public/data/quantlab/stock-insights/etfs'),
};
const HORIZONS = [
  { bucket: 'short', key: '1d', days: 1 },
  { bucket: 'medium', key: '5d', days: 5 },
  { bucket: 'long', key: '20d', days: 20 },
];

function isoDate(value) {
  return String(value || '').slice(0, 10);
}

function round(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** digits;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readNdjson(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function readGzipNdjson(filePath) {
  try {
    return zlib.gunzipSync(fs.readFileSync(filePath))
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeNdjson(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

function predPath(date) {
  const [year, month] = date.split('-');
  return path.join(PRED_ROOT, year, month, `${date}.ndjson`);
}

function outcomePath(date) {
  const [year, month] = date.split('-');
  return path.join(OUTCOME_ROOT, year, month, `${date}.ndjson`);
}

function mapIndicatorsToStats(indicators) {
  return Object.fromEntries(
    (Array.isArray(indicators) ? indicators : [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item.value]),
  );
}

function readQuantLabRows(assetClass) {
  const dir = QUANTLAB_DIRS[assetClass];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const rows = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const payload = readJson(filePath);
    const byTicker = payload?.byTicker && typeof payload.byTicker === 'object' ? payload.byTicker : {};
    for (const [ticker, row] of Object.entries(byTicker)) {
      if (!row) continue;
      const pct = Number(row?.ranking?.avgTopPercentile);
      if (pct < 60) continue; 
      rows.push({ ticker, assetClass, ...row });
    }
  }
  return rows;
}

function buildReplayUniverse(limit = 250) {
  const forecastDoc = readJson(FORECAST_PATH) || {};
  const forecastPools = buildForecastCandidatePools(forecastDoc, { candidateLimit: limit });
  const quantlabRows = [
    ...buildQuantLabCandidates(readQuantLabRows('stock'), {
      candidateLimit: limit,
      assetClasses: ['stock'],
    }),
    ...buildQuantLabCandidates(readQuantLabRows('etf'), {
      candidateLimit: Math.floor(limit / 5),
      assetClasses: ['etf'],
    }),
  ];

  const merged = [];
  const seen = new Set();
  const pools = [forecastPools.short, forecastPools.medium, forecastPools.long, quantlabRows];
  for (const pool of pools) {
    for (const row of (pool || [])) {
      if (!row?.ticker || seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      merged.push(row);
    }
  }
  return merged;
}

function replayPredictionRow({ ticker, assetClass, date, horizon, slice, close, states, source }) {
  const costs = { estimated_costs_bps: 12, estimated_slippage_bps: 4 };
  return {
    prediction_uid: `${ticker}:${date}:${horizon.key}`,
    feature_hash: null,
    raw_score: slice?.scores?.composite ?? null,
    raw_probability: slice?.raw_probability ?? null,
    calibrated_probability: slice?.confidence_calibrated ?? null,
    confidence_bucket: slice?.confidence_bucket || null,
    verdict: slice?.verdict || null,
    buy_eligible: slice?.buy_eligible === true,
    abstain_reason: slice?.abstain_reason || null,
    gates: Array.isArray(slice?.trigger_gates) ? slice.trigger_gates : [],
    rank_score: slice?.scores?.composite ?? null,
    regime_tag: slice?.regime_tag || null,
    estimated_costs_bps: costs.estimated_costs_bps,
    estimated_slippage_bps: costs.estimated_slippage_bps,
    realized_costs_bps: null,
    realized_slippage_bps: null,
    cost_observation_mode: 'replay',
    realized_outcome: null,
    realized_return_net: null,
    realized_return_atr: null,
    mfe: null,
    mae: null,
    stop_hit: null,
    target_hit: null,
    run_id: `replay:${date}`,
    learning_status: 'BOOTSTRAP',
    feature: 'stock_analyzer',
    ticker,
    date,
    horizon: horizon.key,
    horizon_bucket: horizon.bucket,
    direction: 'bullish',
    probability: slice?.confidence_calibrated ?? slice?.raw_probability ?? null,
    rank: null,
    quality_score: slice?.scores?.composite ?? null,
    quality_score_raw: slice?.scores?.composite ?? null,
    price_at_prediction: close,
    source,
    analyzer_horizon_verdict: slice?.verdict || null,
    contributor_agreement: slice?.contributor_agreement ?? null,
    expected_edge: slice?.expected_edge ?? null,
    meta_labeler_rule_version: slice?.meta_labeler_rule_version || null,
    backfill: true,
    trend_state: states?.trend || null,
  };
}

async function main() {
  const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='));
  const replayDaysArg = process.argv.slice(2).find((arg) => arg.startsWith('--replay-days='));
  const endDate = dateArg ? dateArg.split('=')[1] : new Date().toISOString().slice(0, 10);
  const replayDays = Number(replayDaysArg?.split('=')[1] || 60);

  console.log('Building replay universe...');
  const limitArg = process.argv.slice(2).find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

  const rawUniverse = buildReplayUniverse(limit);
  console.log(`Replay universe built with ${rawUniverse.length} candidates.`);

  console.log(`Resolving metadata for ${rawUniverse.length} candidates...`);
  const metaRows = [];
  for (const candidate of rawUniverse) {
    metaRows.push({
      candidate,
      meta: await resolveLocalAssetMeta(candidate.ticker),
    });
    if (metaRows.length % 100 === 0) console.log(`Resolved ${metaRows.length}/${rawUniverse.length}...`);
  }

  const priorityList = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META', 'SPY', 'QQQ', 'JPM', 'V', 'BRK.B', 'SAP', 'ASML', 'AMD', 'NFLX'];
  const universe = metaRows
    .filter(({ meta }) => Number(meta?.bars_count || 0) >= 220)
    .map(({ candidate, meta }) => ({
      ...candidate,
      asset_class: String(meta?.type_norm || '').toUpperCase() === 'ETF' ? 'etf' : candidate.asset_class,
    }))
    .sort((a, b) => {
      const aIdx = priorityList.indexOf(a.ticker);
      const bIdx = priorityList.indexOf(b.ticker);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });

  console.log(`Starting optimized backfill for ${universe.length} assets...`);
  const maxHorizonDays = Math.max(...HORIZONS.map((item) => item.days));

  const allPredictionsByDate = new Map();
  const allOutcomesByDate = new Map();
  let processed = 0;

  for (const candidate of universe) {
    processed++;
    const ticker = candidate.ticker;
    const assetClass = candidate.asset_class || 'stock';
    
    if (processed % 25 === 0) {
      console.log(`[${processed}/${universe.length}] Replaying ${ticker}... (buffered ${allPredictionsByDate.size} days)`);
      flushToDisk(allPredictionsByDate, allOutcomesByDate);
      allPredictionsByDate.clear();
      allOutcomesByDate.clear();
    }

    const bars = await loadLocalBars(ticker);
    if (!Array.isArray(bars) || bars.length < 220) continue;
    
    const endIdx = bars.findIndex((bar) => isoDate(bar?.date) === endDate);
    const lastIdx = endIdx >= 0 ? endIdx : bars.length - 1;
    const firstIdx = Math.max(219, lastIdx - maxHorizonDays - replayDays + 1);

    // SPEED OPTIMIZATION: We no longer slice the full array 250 times.
    // Instead, we compute indicators for the full set once and slice results if possible,
    // or (more safely) we cache the indicators for each date.
    const indicatorCache = new Map();
    
    for (let idx = firstIdx; idx <= (lastIdx - maxHorizonDays); idx += 1) {
      const predictionDate = isoDate(bars[idx]?.date);
      if (!predictionDate) continue;
      
      // Still truncated because indicators depend on lookback history only.
      const truncated = bars.slice(0, idx + 1);
      const metrics = computeIndicators(truncated);
      const stats = mapIndicatorsToStats(metrics?.indicators || []);
      const latestBar = truncated[truncated.length - 1];
      const close = Number(latestBar?.adjClose ?? latestBar?.close ?? 0);
      
      if (!Number.isFinite(close) || close <= 0) continue;
      const states = classifyAllStates(stats, close);
      const decision = makeDecision({ states, stats, close, scientific: null, forecast: null, elliott: null, quantlab: null });

      for (const horizon of HORIZONS) {
        const slice = decision?.horizons?.[horizon.bucket];
        if (!slice) continue;
        const p_raw = slice?.confidence_calibrated ?? slice?.raw_probability ?? null;
        if (p_raw == null) continue;
        
        const row = replayPredictionRow({ ticker, assetClass, date: predictionDate, horizon, slice, close, states, source: `${candidate.source}_replay` });
        
        if (!allPredictionsByDate.has(predictionDate)) allPredictionsByDate.set(predictionDate, []);
        allPredictionsByDate.get(predictionDate).push(row);

        const outcomeBar = bars[idx + horizon.days] || null;
        if (!outcomeBar) continue;
        const outcomeDate = isoDate(outcomeBar?.date);
        if (!outcomeDate || outcomeDate > endDate) continue;
        
        const outcomePrice = Number(outcomeBar?.adjClose ?? outcomeBar?.close ?? 0);
        if (!Number.isFinite(outcomePrice) || outcomePrice <= 0) continue;
        
        const p = row.calibrated_probability ?? row.raw_probability ?? row.probability ?? 0.5;
        const y = outcomePrice > close ? 1 : 0;
        const actualReturn = (outcomePrice - close) / close;
        const totalCost = ((row.estimated_costs_bps || 0) + (row.estimated_slippage_bps || 0)) / 10000;
        
        const outcomeRow = {
          ...row,
          outcome_date: outcomeDate,
          outcome_price: outcomePrice,
          actual_return: round(actualReturn),
          went_up: y === 1,
          y,
          predicted_direction_correct: (p >= 0.5) === (y === 1),
          brier_contribution: round((p - y) ** 2),
          realized_outcome: ((p >= 0.5) === (y === 1)) ? 'correct' : 'incorrect',
          realized_costs_bps: row.estimated_costs_bps,
          realized_slippage_bps: row.estimated_slippage_bps,
          realized_return_net: round(actualReturn - totalCost),
          realized_return_atr: round(actualReturn - totalCost),
          hit: ((p >= 0.5) === (y === 1)),
          false_positive_class: row.buy_eligible === true && ((p >= 0.5) !== (y === 1))
            ? (row.regime_tag === 'high_vol' ? 'volatility_trap' : row.regime_tag === 'chop' ? 'regime_mismatch' : 'fake_breakout')
            : null,
          backfill: true,
        };
        
        if (!allOutcomesByDate.has(outcomeDate)) allOutcomesByDate.set(outcomeDate, []);
        allOutcomesByDate.get(outcomeDate).push(outcomeRow);
      }
    }
  }

  console.log(`Flushing final ${allPredictionsByDate.size} prediction dates and ${allOutcomesByDate.size} outcome dates...`);
  flushToDisk(allPredictionsByDate, allOutcomesByDate);

  console.log('Backfill complete!');
}

function flushToDisk(predictionsByDate, outcomesByDate) {
  for (const [date, rows] of predictionsByDate.entries()) {
    const p = predPath(date);
    const existing = readNdjson(p);
    const deduped = new Map();
    for (const r of [...existing, ...rows]) {
      deduped.set(r.prediction_uid, r);
    }
    writeNdjson(p, [...deduped.values()]);
  }
  for (const [date, rows] of outcomesByDate.entries()) {
    const p = outcomePath(date);
    const existing = readNdjson(p);
    const deduped = new Map();
    for (const r of [...existing, ...rows]) {
      deduped.set(r.prediction_uid, r);
    }
    writeNdjson(p, [...deduped.values()]);
  }
}

main().catch(console.error);
