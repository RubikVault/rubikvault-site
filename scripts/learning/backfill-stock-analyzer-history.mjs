#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeIndicators } from '../../functions/api/_shared/eod-indicators.mjs';
import { classifyAllStates } from '../../functions/api/_shared/stock-states-v1.js';
import { makeDecision } from '../../functions/api/_shared/stock-decisions-v1.js';
import { buildForecastCandidatePools, buildQuantLabCandidates } from '../../functions/api/_shared/best-setups-v4.js';

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
    const payload = readJson(path.join(dir, file));
    const byTicker = payload?.byTicker && typeof payload.byTicker === 'object' ? payload.byTicker : {};
    for (const [ticker, row] of Object.entries(byTicker)) {
      rows.push({ ticker, assetClass, ...row });
    }
  }
  return rows;
}

function loadAdjustedBars(ticker) {
  const cleanTicker = String(ticker || '').trim().toUpperCase();
  if (!cleanTicker) return [];
  const rows = readGzipNdjson(path.join(ROOT, 'public/data/v3/series/adjusted', `US__${cleanTicker}.ndjson.gz`));
  return rows
    .map((row) => {
      const date = isoDate(row?.date || row?.trading_date);
      const close = Number(row?.adjusted_close ?? row?.adjClose ?? row?.adj_close ?? row?.close ?? 0);
      if (!date || !Number.isFinite(close) || close <= 0) return null;
      const open = Number(row?.open);
      const high = Number(row?.high);
      const low = Number(row?.low);
      const volume = Number(row?.volume);
      return {
        date,
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        close,
        adjClose: close,
        volume: Number.isFinite(volume) ? volume : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function buildReplayUniverse() {
  const forecastDoc = readJson(FORECAST_PATH) || {};
  const forecastPools = buildForecastCandidatePools(forecastDoc, { candidateLimit: 200 });
  const quantlabRows = [
    ...buildQuantLabCandidates(readQuantLabRows('stock'), {
      candidateLimit: 160,
      assetClasses: ['stock'],
      exchangeAllowlist: [],
      minStockPercentile: 75,
      minStockStrongExperts: 4,
    }),
    ...buildQuantLabCandidates(readQuantLabRows('etf'), {
      candidateLimit: 120,
      assetClasses: ['etf'],
      exchangeAllowlist: [],
      minEtfPercentile: 50,
      minEtfStrongExperts: 6,
    }),
  ];
  const out = new Map();
  for (const horizon of Object.keys(forecastPools || {})) {
    for (const row of forecastPools[horizon] || []) {
      out.set(`stock:${row.ticker}`, { ticker: row.ticker, asset_class: 'stock', source: row.source || 'forecast_latest' });
    }
  }
  for (const row of quantlabRows) {
    out.set(`${row.asset_class}:${row.ticker}`, { ticker: row.ticker, asset_class: row.asset_class || 'stock', source: row.source || 'quantlab_publish' });
  }
  return [...out.values()];
}

function assetCostDefaults(assetClass) {
  return assetClass === 'etf'
    ? { estimated_costs_bps: 4, estimated_slippage_bps: 3 }
    : { estimated_costs_bps: 6, estimated_slippage_bps: 5 };
}

function replayPredictionRow({ ticker, assetClass, date, horizon, slice, close, states, source }) {
  const costs = assetCostDefaults(assetClass);
  return {
    prediction_uid: `stock_analyzer_replay:${date}:${ticker}:${assetClass}:${horizon.key}`,
    prediction_timestamp_utc: `${date}T00:00:00.000Z`,
    data_cutoff_timestamp_utc: `${date}T23:59:59.000Z`,
    source_env: 'local',
    asset_class: assetClass,
    model_family: 'stock_analyzer_v4_replay',
    decision_core_version: '1.0.0',
    feature_logic_version: 'v1_shared_core',
    regime_logic_version: 'v1_simple_pit',
    label_version: 'v1_tradeability_atr_net',
    cost_model_version: 'v1.0_replay_us_equities',
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
  const endDate = dateArg ? dateArg.split('=')[1] : isoDate(new Date());
  const replayDays = Number(replayDaysArg?.split('=')[1] || 60);
  const universe = buildReplayUniverse();
  const predictionsByDate = new Map();
  const outcomesByDate = new Map();
  const maxHorizonDays = Math.max(...HORIZONS.map((item) => item.days));

  for (const candidate of universe) {
    const ticker = candidate.ticker;
    const assetClass = candidate.asset_class || 'stock';
    const bars = loadAdjustedBars(ticker);
    if (!Array.isArray(bars) || bars.length < 220) continue;
    const endIdx = bars.findIndex((bar) => isoDate(bar?.date) === endDate);
    const lastIdx = endIdx >= 0 ? endIdx : bars.length - 1;
    const firstIdx = Math.max(219, lastIdx - maxHorizonDays - replayDays + 1);
    for (let idx = firstIdx; idx <= (lastIdx - maxHorizonDays); idx += 1) {
      const predictionDate = isoDate(bars[idx]?.date);
      if (!predictionDate) continue;
      const truncated = bars.slice(0, idx + 1);
      const stats = mapIndicatorsToStats(computeIndicators(truncated)?.indicators || []);
      const latestBar = truncated[truncated.length - 1];
      const close = Number(latestBar?.adjClose ?? latestBar?.close ?? 0);
      if (!Number.isFinite(close) || close <= 0) continue;
      const states = classifyAllStates(stats, close);
      const decision = makeDecision({ states, stats, close, scientific: null, forecast: null, elliott: null, quantlab: null });

      for (const horizon of HORIZONS) {
        const slice = decision?.horizons?.[horizon.bucket];
        if (!slice || slice?.buy_eligible !== true) continue;
        if (String(slice?.verdict || '').toUpperCase() !== 'BUY') continue;
        if (!['UP', 'STRONG_UP'].includes(String(states?.trend || '').toUpperCase())) continue;
        const row = replayPredictionRow({ ticker, assetClass, date: predictionDate, horizon, slice, close, states, source: `${candidate.source}_replay` });
        if (!predictionsByDate.has(predictionDate)) predictionsByDate.set(predictionDate, []);
        predictionsByDate.get(predictionDate).push(row);

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
        const outcome = {
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
        if (!outcomesByDate.has(outcomeDate)) outcomesByDate.set(outcomeDate, []);
        outcomesByDate.get(outcomeDate).push(outcome);
      }
    }
  }

  for (const [date, rows] of predictionsByDate.entries()) {
    const ranked = [];
    for (const horizon of HORIZONS) {
      const horizonRows = rows
        .filter((row) => row.horizon === horizon.key)
        .sort((a, b) => Number(b.rank_score || 0) - Number(a.rank_score || 0))
        .slice(0, 50)
        .map((row, index) => ({ ...row, rank: index + 1 }));
      ranked.push(...horizonRows);
    }
    const existing = readNdjson(predPath(date));
    const deduped = new Map();
    for (const row of [...existing, ...ranked]) {
      deduped.set(String(row?.prediction_uid || `${row?.ticker}:${row?.date}:${row?.horizon}`), row);
    }
    writeNdjson(predPath(date), [...deduped.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.horizon).localeCompare(String(b.horizon)) || Number(a.rank || 0) - Number(b.rank || 0)));
  }

  for (const [date, rows] of outcomesByDate.entries()) {
    const existing = readNdjson(outcomePath(date));
    const deduped = new Map();
    for (const row of [...existing, ...rows]) {
      deduped.set(String(row?.prediction_uid || `${row?.ticker}:${row?.date}:${row?.horizon}`), row);
    }
    writeNdjson(outcomePath(date), [...deduped.values()].sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)) || String(a.horizon).localeCompare(String(b.horizon))));
  }

  console.log(JSON.stringify({
    ok: true,
    replay_days: replayDays,
    candidate_universe: universe.length,
    prediction_dates: predictionsByDate.size,
    outcome_dates: outcomesByDate.size,
    predictions_written: [...predictionsByDate.values()].reduce((sum, rows) => sum + rows.length, 0),
    outcomes_written: [...outcomesByDate.values()].reduce((sum, rows) => sum + rows.length, 0),
  }));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
