export const HIST_PROBS_V2_SCHEMA = 'rv.hist_probs_v2.shadow_run.v1';
export const HIST_PROBS_V2_MODEL_VERSION = 'hist_probs_v2_baseline_jeffreys_v1';
export const HIST_PROBS_V2_FEATURE_VERSION = 'hist_probs_v2_features_tail_v1';
export const HIST_PROBS_V2_HORIZONS = Object.freeze([1, 5, 20]);

function finite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mean(values) {
  const nums = values.map(finite).filter((value) => value != null);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
}

function stddev(values) {
  const nums = values.map(finite).filter((value) => value != null);
  if (nums.length < 2) return null;
  const avg = mean(nums);
  const variance = nums.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

function quantile(values, q) {
  const nums = values.map(finite).filter((value) => value != null).sort((a, b) => a - b);
  if (!nums.length) return null;
  return nums[Math.min(nums.length - 1, Math.max(0, Math.floor((nums.length - 1) * q)))];
}

function bucketByQuantiles(value, q1, q2, labels) {
  const num = finite(value);
  if (num == null || q1 == null || q2 == null) return 'unknown';
  if (num <= q1) return labels[0];
  if (num <= q2) return labels[1];
  return labels[2];
}

function clampProbability(value) {
  const num = finite(value);
  if (num == null) return 0.5;
  return Math.max(0.05, Math.min(0.95, num));
}

function round(value, digits = 6) {
  const num = finite(value);
  if (num == null) return null;
  return Number(num.toFixed(digits));
}

function computeRsi(closes, index, period = 14) {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = index - period + 1; i <= index; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (avgGain / avgLoss)));
}

export function buildFeatureRowsFromBars(bars, { assetClass = 'stock' } = {}) {
  const normalized = Array.isArray(bars)
    ? bars
        .map((bar) => ({
          date: String(bar?.date || bar?.trading_date || '').slice(0, 10),
          close: finite(bar?.adjClose ?? bar?.adjusted_close ?? bar?.close),
          volume: finite(bar?.volume) ?? 0,
        }))
        .filter((bar) => bar.date && bar.close != null && bar.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const closes = normalized.map((bar) => bar.close);
  const rows = [];
  for (let i = 30; i < normalized.length; i += 1) {
    const close = closes[i];
    const prev5 = closes[i - 5];
    const prev20 = closes[i - 20];
    const returns20 = [];
    for (let j = i - 19; j <= i; j += 1) {
      const prev = closes[j - 1];
      const current = closes[j];
      if (prev > 0 && current > 0) returns20.push((current - prev) / prev);
    }
    const volumeWindow = normalized.slice(Math.max(0, i - 20), i).map((bar) => bar.volume);
    const volMean = mean(volumeWindow) || 0;
    const volStd = stddev(volumeWindow) || 0;
    rows.push({
      index: i,
      date: normalized[i].date,
      asset_class: String(assetClass || 'stock').toLowerCase(),
      close,
      rsi_14: round(computeRsi(closes, i), 4),
      return_5d_past: prev5 > 0 ? round((close - prev5) / prev5, 6) : null,
      return_20d_past: prev20 > 0 ? round((close - prev20) / prev20, 6) : null,
      volatility_20: round(stddev(returns20), 6),
      volume_zscore: volStd > 0 ? round((normalized[i].volume - volMean) / volStd, 6) : 0,
    });
  }
  return rows;
}

export function buildAdaptiveBucketModel(featureRows) {
  const trainRows = featureRows.slice(0, -1);
  return {
    rsi_q1: quantile(trainRows.map((row) => row.rsi_14), 0.33),
    rsi_q2: quantile(trainRows.map((row) => row.rsi_14), 0.66),
    momentum_q1: quantile(trainRows.map((row) => row.return_20d_past), 0.33),
    momentum_q2: quantile(trainRows.map((row) => row.return_20d_past), 0.66),
    volatility_q1: quantile(trainRows.map((row) => row.volatility_20), 0.33),
    volatility_q2: quantile(trainRows.map((row) => row.volatility_20), 0.66),
  };
}

export function featureBucket(row, bucketModel) {
  const rsi = bucketByQuantiles(row?.rsi_14, bucketModel.rsi_q1, bucketModel.rsi_q2, ['rsi_low', 'rsi_mid', 'rsi_high']);
  const momentum = bucketByQuantiles(row?.return_20d_past, bucketModel.momentum_q1, bucketModel.momentum_q2, ['mom_low', 'mom_mid', 'mom_high']);
  const volatility = bucketByQuantiles(row?.volatility_20, bucketModel.volatility_q1, bucketModel.volatility_q2, ['vol_low', 'vol_mid', 'vol_high']);
  return `${row?.asset_class || 'stock'}|${rsi}|${momentum}|${volatility}`;
}

export function scoreBarsWithBaselineV2(bars, {
  ticker,
  assetClass = 'stock',
  estimatedCostBps = 10,
  alpha = 0.5,
  beta = 0.5,
} = {}) {
  const featureRows = buildFeatureRowsFromBars(bars, { assetClass });
  const latestFeature = featureRows.at(-1) || null;
  if (!latestFeature || bars.length < 60) {
    return {
      status: bars.length ? 'too_short_history' : 'no_data',
      ticker,
      scores: [],
      state: { bars_count: bars.length, last_bar_date: bars.at(-1)?.date || null },
    };
  }
  const bucketModel = buildAdaptiveBucketModel(featureRows);
  const latestBucket = featureBucket(latestFeature, bucketModel);
  const closeByIndex = new Map(
    bars.map((bar, index) => [index, finite(bar?.adjClose ?? bar?.adjusted_close ?? bar?.close)])
  );
  const byHorizon = new Map();
  for (const horizon of HIST_PROBS_V2_HORIZONS) {
    byHorizon.set(horizon, new Map());
  }
  for (const row of featureRows) {
    const entry = closeByIndex.get(row.index);
    if (!(entry > 0)) continue;
    const bucket = featureBucket(row, bucketModel);
    for (const horizon of HIST_PROBS_V2_HORIZONS) {
      const exit = closeByIndex.get(row.index + horizon);
      if (!(exit > 0)) continue;
      const ret = (exit - entry) / entry;
      const map = byHorizon.get(horizon);
      const agg = map.get(bucket) || { obs: 0, wins: 0, sum_win: 0, sum_loss_abs: 0, losses: 0 };
      agg.obs += 1;
      if (ret > 0) {
        agg.wins += 1;
        agg.sum_win += ret;
      } else {
        agg.losses += 1;
        agg.sum_loss_abs += Math.abs(ret);
      }
      map.set(bucket, agg);
    }
  }
  const cost = estimatedCostBps / 10000;
  const scores = [];
  for (const horizon of HIST_PROBS_V2_HORIZONS) {
    const agg = byHorizon.get(horizon)?.get(latestBucket) || { obs: 0, wins: 0, sum_win: 0, sum_loss_abs: 0, losses: 0 };
    const probability = clampProbability((agg.wins + alpha) / (agg.obs + alpha + beta));
    const avgWin = agg.wins > 0 ? agg.sum_win / agg.wins : 0;
    const avgLoss = agg.losses > 0 ? agg.sum_loss_abs / agg.losses : 0;
    const expectedValue = probability * avgWin - (1 - probability) * avgLoss - cost;
    scores.push({
      ticker,
      asset_class: String(assetClass || 'stock').toLowerCase(),
      horizon: `${horizon}d`,
      probability: round(probability, 6),
      calibrated_probability: round(probability, 6),
      raw_probability: round(probability, 6),
      expected_value: round(expectedValue, 6),
      observations: agg.obs,
      wins: agg.wins,
      bucket: latestBucket,
      price_at_prediction: round(latestFeature.close, 6),
      score_date: latestFeature.date,
      feature_version: HIST_PROBS_V2_FEATURE_VERSION,
      model_version: HIST_PROBS_V2_MODEL_VERSION,
      buy_eligible: false,
      source: 'hist_probs_v2_shadow',
    });
  }
  return {
    status: 'ready',
    ticker,
    latest_feature: latestFeature,
    bucket_model: bucketModel,
    scores,
    state: {
      bars_count: bars.length,
      last_bar_date: bars.at(-1)?.date || null,
      latest_bucket: latestBucket,
    },
  };
}
