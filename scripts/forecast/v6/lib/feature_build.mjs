import path from 'node:path';
import { sha256Json, stableSortRows } from './hashing.mjs';
import { writeJsonAtomic } from './io.mjs';

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function logRet(current, prev) {
  if (!Number.isFinite(current) || !Number.isFinite(prev) || current <= 0 || prev <= 0) return 0;
  return Math.log(current / prev);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, n) => acc + n, 0) / values.length;
}

function std(values) {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = mean(values.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function winsorize(rows, featureNames, pLow, pHigh) {
  for (const feature of featureNames) {
    const values = rows
      .map((row) => row.features?.[feature])
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (!values.length) continue;

    const low = quantile(values, pLow);
    const high = quantile(values, pHigh);

    for (const row of rows) {
      const v = row.features?.[feature];
      if (!Number.isFinite(v)) continue;
      row.features[feature] = Math.max(low, Math.min(high, v));
    }
  }
}

function trailing(rows, asofDate, lookback = 80) {
  const eligible = rows.filter((row) => row.date <= asofDate);
  return eligible.slice(Math.max(0, eligible.length - lookback));
}

function computeFeaturesFromBars({ bars, asofDate, liquidityBucket, regimeBucket }) {
  const recent = trailing(bars, asofDate, 120);
  if (recent.length < 60) return null;

  const closes = recent.map((r) => safeNumber(r.close));
  const highs = recent.map((r) => safeNumber(r.high, safeNumber(r.close)));
  const lows = recent.map((r) => safeNumber(r.low, safeNumber(r.close)));
  const volumes = recent.map((r) => safeNumber(r.volume));

  const n = closes.length - 1;
  const close0 = closes[n];
  const close1 = closes[Math.max(0, n - 1)];
  const close5 = closes[Math.max(0, n - 5)];
  const close20 = closes[Math.max(0, n - 20)];
  const close50 = closes[Math.max(0, n - 50)];

  const trValues = [];
  for (let i = Math.max(1, n - 14); i <= n; i++) {
    const prevClose = closes[i - 1];
    const high = highs[i];
    const low = lows[i];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(Math.abs(tr));
  }
  const atr14 = mean(trValues) || 1;

  const vol20 = volumes.slice(Math.max(0, volumes.length - 20));
  const volMean20 = mean(vol20);
  const volStd20 = std(vol20) || 1;
  const volZ = (volumes[n] - volMean20) / volStd20;

  const closes20 = closes.slice(Math.max(0, closes.length - 20));
  const closes50 = closes.slice(Math.max(0, closes.length - 50));
  const closeStd20 = std(closes20) || 1;
  const closeStd50 = std(closes50) || 1;

  const features = {
    log_ret_1d: logRet(close0, close1),
    log_ret_5d: logRet(close0, close5),
    log_ret_20d: logRet(close0, close20),
    zscore_ret_1d: (close0 - close1) / closeStd20,
    zscore_ret_20d: (close0 - close20) / closeStd50,
    ratio_ma20: close0 / (mean(closes20) || close0),
    ratio_ma50: close0 / (mean(closes50) || close0),
    pctile_momentum_20d: Math.max(0, Math.min(1, (logRet(close0, close20) + 0.2) / 0.4)),
    rank_volatility_20d: Math.max(0, Math.min(1, std(closes20) / (Math.abs(close0) + 1e-9))),
    dist_ma50_atr: (close0 - (mean(closes50) || close0)) / atr14,
    zscore_volume_20d: volZ,
    liquidity_bucket: liquidityBucket,
    regime_bucket: regimeBucket
  };

  return features;
}

export function buildFeaturesByDate({
  repoRoot,
  asofDate,
  candidates,
  barsBySymbol,
  memoryPolicy,
  featurePolicy,
  featureStorePolicy,
  dryRun = false
}) {
  const maxChunk = Number(memoryPolicy?.stage2_chunking?.max_symbols_per_chunk ?? 100);
  const symbols = candidates.map((c) => c.symbol);
  const chunks = [];
  for (let i = 0; i < symbols.length; i += maxChunk) {
    chunks.push(symbols.slice(i, i + maxChunk));
  }

  const rows = [];
  for (const chunkSymbols of chunks) {
    for (const symbol of chunkSymbols) {
      const bars = barsBySymbol[symbol] || [];
      const candidate = candidates.find((c) => c.symbol === symbol);
      const computed = computeFeaturesFromBars({
        bars,
        asofDate,
        liquidityBucket: candidate?.liquidity_bucket ?? 0,
        regimeBucket: candidate?.regime_bucket ?? 'NEUTRAL'
      });
      if (!computed) continue;
      rows.push({
        symbol,
        date: asofDate,
        is_control: Boolean(candidate?.is_control),
        features: computed
      });
    }
  }

  const sortedRows = stableSortRows(rows, ['symbol', 'date']);
  const featureNames = [...new Set(sortedRows.flatMap((r) => Object.keys(r.features || {})))].sort();

  if (featurePolicy?.winsorize?.enabled) {
    const pLow = Number(featurePolicy?.winsorize?.p_low ?? 0.01);
    const pHigh = Number(featurePolicy?.winsorize?.p_high ?? 0.99);
    winsorize(sortedRows, featureNames, pLow, pHigh);
  }

  const doc = {
    schema: 'forecast_features_v6',
    asof_date: asofDate,
    float_precision: 'f64',
    sort_order: ['symbol', 'date'],
    rows: sortedRows
  };

  const outputRel = (featureStorePolicy?.ssot_write || 'mirrors/forecast/ledgers/features/by_date/YYYY-MM-DD.parquet.zst')
    .replace('YYYY-MM-DD', asofDate);
  const outputAbs = path.join(repoRoot, outputRel);
  if (!dryRun) {
    writeJsonAtomic(outputAbs, doc);
  }

  return {
    doc,
    output_path: outputRel,
    chunk_count: chunks.length,
    row_count: sortedRows.length,
    feature_columns: featureNames,
    features_hash: sha256Json(doc)
  };
}

export default { buildFeaturesByDate };
