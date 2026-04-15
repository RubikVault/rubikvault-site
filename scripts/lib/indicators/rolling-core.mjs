function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

class FixedWindow {
  constructor(size) {
    this.size = size;
    this.values = [];
    this.sum = 0;
    this.sumSq = 0;
  }

  push(value) {
    const numeric = Number(value);
    this.values.push(numeric);
    this.sum += numeric;
    this.sumSq += numeric * numeric;
    if (this.values.length > this.size) {
      const dropped = this.values.shift();
      this.sum -= dropped;
      this.sumSq -= dropped * dropped;
    }
  }

  mean() {
    if (this.values.length < this.size) return null;
    return this.sum / this.values.length;
  }

  sampleStd() {
    const n = this.values.length;
    if (n < this.size || n < 2) return null;
    const variance = (this.sumSq - (this.sum * this.sum) / n) / (n - 1);
    return Math.sqrt(Math.max(variance, 0));
  }
}

function calcRsi(values, period = 14, length = values.length) {
  if (length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta >= 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let index = period + 1; index < length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function rsiBin(value) {
  if (value === null) return null;
  if (value < 10) return 'lt_10';
  if (value < 20) return '10_20';
  if (value < 30) return '20_30';
  if (value < 50) return '30_50';
  if (value < 70) return '50_70';
  if (value < 80) return '70_80';
  return 'gt_80';
}

function zscoreBin(value) {
  if (value === null) return null;
  if (value < -3) return 'lt_neg3';
  if (value < -2) return 'neg3_neg2';
  if (value <= 2) return 'neg2_pos2';
  return 'gt_pos2';
}

function distSma200Bin(value) {
  if (value === null) return null;
  if (value < -0.20) return 'lt_neg20';
  if (value < -0.10) return 'neg20_neg10';
  if (value <= 0.10) return 'neg10_pos10';
  if (value <= 0.20) return 'pos10_pos20';
  return 'gt_pos20';
}

function dist52wBin(value) {
  const dist = Math.abs(value);
  if (dist <= 0.01) return '99_100';
  if (dist <= 0.05) return '95_99';
  if (dist <= 0.10) return '90_95';
  return 'gt_10pct_below';
}

function liquidityBucket(dollarVolume20d) {
  if (!Number.isFinite(dollarVolume20d)) return 'low';
  if (dollarVolume20d >= 2_500_000) return 'high';
  if (dollarVolume20d >= 250_000) return 'mid';
  return 'low';
}

function marketCapBucket(marketCapUsd) {
  if (!Number.isFinite(marketCapUsd) || marketCapUsd <= 0) return null;
  if (marketCapUsd >= 10e9) return 'large';
  if (marketCapUsd >= 2e9) return 'mid';
  if (marketCapUsd >= 250e6) return 'small';
  return 'micro';
}

function roundFixed(value, digits) {
  return value === null ? null : parseFloat(Number(value).toFixed(digits));
}

function rollingPercentile252(closes) {
  const start = Math.max(0, closes.length - 253);
  const window = closes.slice(start);
  if (window.length < 30) return null;
  const currentVal = calcRsi(window, 14);
  if (currentVal === null || !Number.isFinite(currentVal)) return null;
  const vals = [];
  for (let length = 21; length <= window.length; length += 1) {
    const value = calcRsi(window, 14, length);
    if (value !== null && Number.isFinite(value)) vals.push(value);
  }
  if (vals.length < 10) return null;
  const below = vals.filter((value) => value <= currentVal).length;
  return roundFixed((below / vals.length) * 100, 1);
}

function maxMinClose(values, start, end) {
  let min = null;
  let max = null;
  for (let index = start; index <= end; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)) continue;
    if (min === null || value < min) min = value;
    if (max === null || value > max) max = value;
  }
  return { min, max };
}

function maxMinHighLow(bars, start, end) {
  let min = null;
  let max = null;
  for (let index = start; index <= end; index += 1) {
    const bar = bars[index];
    if (!bar) continue;
    const high = Number.isFinite(bar.high) ? bar.high : bar.close;
    const low = Number.isFinite(bar.low) ? bar.low : bar.close;
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    if (min === null || low < min) min = low;
    if (max === null || high > max) max = high;
  }
  return { min, max };
}

export class HistProbsRollingCore {
  constructor(opts = {}) {
    this.opts = { ...opts };
    this.cleanBars = [];
    this.closes = [];
    this.volumes = [];

    this.close20 = new FixedWindow(20);
    this.close50 = new FixedWindow(50);
    this.close60 = new FixedWindow(60);
    this.close200 = new FixedWindow(200);
    this.volume20 = new FixedWindow(20);

    this.prevClose = null;
    this.rsiDeltaCount = 0;
    this.rsiAvgGain = null;
    this.rsiAvgLoss = null;
    this.rsiSeedGain = 0;
    this.rsiSeedLoss = 0;

    this.prevTypicalPrice = null;
    this.mfiFlows = [];
    this.mfiPosSum = 0;
    this.mfiNegSum = 0;

    this.ema12 = null;
    this.ema26 = null;
    this.ema12Seed = [];
    this.ema26Seed = [];
    this.lastPpo = null;
    this.ppoSeriesCount = 0;
    this.ppoSeed = [];
    this.ppoSignal = null;

    this.prevAdxBar = null;
    this.adxDmCount = 0;
    this.adxSmoothPlus = 0;
    this.adxSmoothMinus = 0;
    this.adxSmoothTr = 0;
    this.adxDxWindow = [];
    this.adxDxSum = 0;

    this.lastSnapshot = { short_history_flag: true };
  }

  push(inputBar, opts = {}) {
    const close = toFinite(inputBar?.adjClose ?? inputBar?.close);
    if (close === null || close <= 0) {
      return this.lastSnapshot;
    }

    const bar = {
      date: String(inputBar?.date || inputBar?.trading_date || '').slice(0, 10) || null,
      open: toFinite(inputBar?.open) ?? close,
      high: toFinite(inputBar?.high) ?? close,
      low: toFinite(inputBar?.low) ?? close,
      close,
      adjClose: close,
      volume: toFinite(inputBar?.volume) ?? 0,
    };

    this.cleanBars.push(bar);
    this.closes.push(close);
    this.volumes.push(bar.volume);
    this.close20.push(close);
    this.close50.push(close);
    this.close60.push(close);
    this.close200.push(close);
    this.volume20.push(bar.volume);

    this.#advanceRsi(close);
    this.#advanceMfi(bar);
    this.#advancePpo(close);
    this.#advanceAdx(bar);

    this.lastSnapshot = this.#buildSnapshot({
      ...this.opts,
      ...opts,
    });
    return this.lastSnapshot;
  }

  #advanceRsi(close) {
    if (this.prevClose !== null) {
      const delta = close - this.prevClose;
      const gain = delta >= 0 ? delta : 0;
      const loss = delta < 0 ? -delta : 0;
      this.rsiDeltaCount += 1;
      if (this.rsiDeltaCount <= 14) {
        this.rsiSeedGain += gain;
        this.rsiSeedLoss += loss;
        if (this.rsiDeltaCount === 14) {
          this.rsiAvgGain = this.rsiSeedGain / 14;
          this.rsiAvgLoss = this.rsiSeedLoss / 14;
        }
      } else {
        this.rsiAvgGain = ((this.rsiAvgGain * 13) + gain) / 14;
        this.rsiAvgLoss = ((this.rsiAvgLoss * 13) + loss) / 14;
      }
    }
    this.prevClose = close;
  }

  #advanceMfi(bar) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const rawFlow = typicalPrice * bar.volume;
    if (this.prevTypicalPrice !== null) {
      const flow = {
        pos: typicalPrice >= this.prevTypicalPrice ? rawFlow : 0,
        neg: typicalPrice < this.prevTypicalPrice ? rawFlow : 0,
      };
      this.mfiFlows.push(flow);
      this.mfiPosSum += flow.pos;
      this.mfiNegSum += flow.neg;
      if (this.mfiFlows.length > 14) {
        const dropped = this.mfiFlows.shift();
        this.mfiPosSum -= dropped.pos;
        this.mfiNegSum -= dropped.neg;
      }
    }
    this.prevTypicalPrice = typicalPrice;
  }

  #advancePpo(close) {
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    const k9 = 2 / 10;

    this.ema12Seed.push(close);
    if (this.ema12Seed.length > 12) this.ema12Seed.shift();
    this.ema26Seed.push(close);
    if (this.ema26Seed.length > 26) this.ema26Seed.shift();

    if (this.closes.length === 12) {
      this.ema12 = this.ema12Seed.reduce((sum, value) => sum + value, 0) / 12;
    } else if (this.closes.length > 12 && this.ema12 !== null) {
      this.ema12 = close * k12 + this.ema12 * (1 - k12);
    }

    if (this.closes.length === 26) {
      const seed26 = this.ema26Seed.reduce((sum, value) => sum + value, 0) / 26;
      this.ema26 = close * k26 + seed26 * (1 - k26);
    } else if (this.closes.length > 26 && this.ema26 !== null) {
      this.ema26 = close * k26 + this.ema26 * (1 - k26);
    }

    if (this.ema12 === null || this.ema26 === null || this.ema26 === 0) return;
    const currentPpo = ((this.ema12 - this.ema26) / this.ema26) * 100;
    const previousPpo = this.lastPpo;
    this.lastPpo = currentPpo;
    this.ppoSeriesCount += 1;

    if (this.ppoSeriesCount <= 9) {
      this.ppoSeed.push(currentPpo);
    } else if (this.ppoSeriesCount === 10) {
      const seedSignal = this.ppoSeed.reduce((sum, value) => sum + value, 0) / 9;
      this.ppoSignal = currentPpo * k9 + seedSignal * (1 - k9);
    } else {
      this.ppoSignal = currentPpo * k9 + this.ppoSignal * (1 - k9);
    }

    this.prevPpoForSignal = previousPpo;
  }

  #advanceAdx(bar) {
    if (this.prevAdxBar) {
      const upMove = bar.high - this.prevAdxBar.high;
      const downMove = this.prevAdxBar.low - bar.low;
      const dmPlus = (upMove > downMove && upMove > 0) ? upMove : 0;
      const dmMinus = (downMove > upMove && downMove > 0) ? downMove : 0;
      const tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - this.prevAdxBar.close),
        Math.abs(bar.low - this.prevAdxBar.close),
      );
      this.adxDmCount += 1;
      if (this.adxDmCount <= 14) {
        this.adxSmoothPlus += dmPlus;
        this.adxSmoothMinus += dmMinus;
        this.adxSmoothTr += tr;
      } else {
        this.adxSmoothPlus = this.adxSmoothPlus - this.adxSmoothPlus / 14 + dmPlus;
        this.adxSmoothMinus = this.adxSmoothMinus - this.adxSmoothMinus / 14 + dmMinus;
        this.adxSmoothTr = this.adxSmoothTr - this.adxSmoothTr / 14 + tr;
        if (this.adxSmoothTr !== 0) {
          const diPlus = 100 * this.adxSmoothPlus / this.adxSmoothTr;
          const diMinus = 100 * this.adxSmoothMinus / this.adxSmoothTr;
          const diSum = diPlus + diMinus;
          const dx = diSum === 0 ? 0 : 100 * Math.abs(diPlus - diMinus) / diSum;
          this.adxDxWindow.push(dx);
          this.adxDxSum += dx;
          if (this.adxDxWindow.length > 14) {
            this.adxDxSum -= this.adxDxWindow.shift();
          }
        }
      }
    }
    this.prevAdxBar = bar;
  }

  #buildSnapshot(opts) {
    const n = this.closes.length;
    if (n < 30) return { short_history_flag: true };

    const short_history_flag = n < 252;
    const latestClose = this.closes[n - 1];
    const latest = this.cleanBars[n - 1];

    const rsi14_value = this.rsiDeltaCount >= 14
      ? (this.rsiAvgLoss === 0 ? 100 : 100 - 100 / (1 + this.rsiAvgGain / this.rsiAvgLoss))
      : null;
    const rsi14_bin = rsiBin(rsi14_value);
    const rsi14_pctile_252 = short_history_flag ? null : rollingPercentile252(this.closes);

    let zscore_sma50_value = null;
    const sma50Current = this.close50.mean();
    const std60Current = this.close60.sampleStd();
    if (n >= 60 && sma50Current !== null && std60Current && std60Current > 0) {
      zscore_sma50_value = roundFixed((latestClose - sma50Current) / std60Current, 4);
    }
    const zscore_sma50_bin = zscoreBin(zscore_sma50_value);
    const event_zscore_lt_neg3 = zscore_sma50_value !== null && zscore_sma50_value < -3;
    const event_zscore_gt_pos2 = zscore_sma50_value !== null && zscore_sma50_value > 2;

    const sma200ValueRaw = this.close200.mean();
    let dist_sma200_value = null;
    if (sma200ValueRaw !== null && sma200ValueRaw !== 0) {
      dist_sma200_value = roundFixed((latestClose - sma200ValueRaw) / sma200ValueRaw, 4);
    }
    const dist_sma200_bin = distSma200Bin(dist_sma200_value);

    let mfi14_value = null;
    if (this.mfiFlows.length >= 14) {
      if (this.mfiNegSum === 0) mfi14_value = 100;
      else mfi14_value = 100 - 100 / (1 + this.mfiPosSum / this.mfiNegSum);
    }
    const event_mfi_lt_20 = mfi14_value !== null && mfi14_value < 20;
    const event_mfi_gt_80 = mfi14_value !== null && mfi14_value > 80;

    const ppoReady = this.ppoSeriesCount >= 10 && this.ppoSignal !== null;
    const ppo_value = ppoReady ? this.lastPpo : null;
    const ppo_signal_value = ppoReady ? this.ppoSignal : null;
    const ppo_bin_gt_0 = ppo_value !== null && ppo_value > 0;
    const event_ppo_cross_signal = (() => {
      if (ppo_value === null || ppo_signal_value === null || this.prevPpoForSignal === null || this.prevPpoForSignal === undefined) return false;
      const crossedAbove = this.prevPpoForSignal <= ppo_signal_value && ppo_value > ppo_signal_value;
      const crossedBelow = this.prevPpoForSignal >= ppo_signal_value && ppo_value < ppo_signal_value;
      return crossedAbove || crossedBelow;
    })();

    const adx14_value = this.adxDxWindow.length >= 14 ? this.adxDxSum / this.adxDxWindow.length : null;
    const event_adx_gt_25 = adx14_value !== null && adx14_value > 25;
    const event_adx_lt_20 = adx14_value !== null && adx14_value < 20;

    const avgVol20 = this.volume20.mean();
    const latestVol = this.volumes[n - 1];
    const volume_ratio_20d_value = avgVol20 && avgVol20 > 0 ? roundFixed(latestVol / avgVol20, 3) : null;
    const volume_ratio_20d_bin_gt_2x = volume_ratio_20d_value !== null && volume_ratio_20d_value > 2;
    const event_volume_spike_2x = volume_ratio_20d_bin_gt_2x;

    const donchian20 = n >= 20 ? maxMinClose(this.closes, Math.max(0, n - 21), n - 2) : { min: null, max: null };
    const donchian50 = n >= 50 ? maxMinClose(this.closes, Math.max(0, n - 51), n - 2) : { min: null, max: null };
    const event_new_high_20 = donchian20.max !== null && latestClose > donchian20.max;
    const event_new_low_20 = donchian20.min !== null && latestClose < donchian20.min;
    const event_new_high_50 = donchian50.max !== null && latestClose > donchian50.max;
    const event_new_low_50 = donchian50.min !== null && latestClose < donchian50.min;

    const lookback = n >= 2 ? maxMinHighLow(this.cleanBars, Math.max(0, n - 253), n - 2) : { min: null, max: null };
    const event_new_52w_high = lookback.max !== null && latestClose > lookback.max;
    const event_new_52w_low = lookback.min !== null && latestClose < lookback.min;
    const current52wHigh = lookback.max !== null ? Math.max(lookback.max, latestClose) : null;
    const current52wLow = lookback.min !== null ? Math.min(lookback.min, latestClose) : null;
    const dist_to_52w_high_pct = current52wHigh && current52wHigh > 0
      ? roundFixed((latestClose - current52wHigh) / current52wHigh, 4)
      : null;
    const dist_to_52w_high_bin = dist_to_52w_high_pct === null ? null : dist52wBin(dist_to_52w_high_pct);
    const dist_to_52w_low_pct = current52wLow && current52wLow > 0
      ? roundFixed((latestClose - current52wLow) / current52wLow, 4)
      : null;
    const dist_to_52w_low_bin = (() => {
      if (dist_to_52w_low_pct === null) return null;
      if (dist_to_52w_low_pct <= 0.01) return '99_100';
      if (dist_to_52w_low_pct <= 0.05) return '95_99';
      if (dist_to_52w_low_pct <= 0.10) return '90_95';
      return 'gt_10pct_above';
    })();

    const dollarVol20d = avgVol20 !== null ? avgVol20 * latestClose : null;
    const liquidity_bucket = liquidityBucket(dollarVol20d);
    const liquidity_flag = liquidity_bucket !== 'low';
    const market_cap_bucket = opts.marketCapUsd ? marketCapBucket(opts.marketCapUsd) : null;

    return {
      short_history_flag,
      bars_count: n,
      latest_date: latest?.date ?? null,
      latest_close: roundFixed(latestClose, 4),
      rsi14_value: roundFixed(rsi14_value, 2),
      rsi14_bin,
      rsi14_pctile_252,
      zscore_sma50_value,
      zscore_sma50_bin,
      event_zscore_lt_neg3,
      event_zscore_gt_pos2,
      sma200_value: roundFixed(sma200ValueRaw, 4),
      dist_sma200_value,
      dist_sma200_bin,
      mfi14_value: roundFixed(mfi14_value, 2),
      event_mfi_lt_20,
      event_mfi_gt_80,
      ppo_value: roundFixed(ppo_value, 4),
      ppo_signal_value: roundFixed(ppo_signal_value, 4),
      ppo_bin_gt_0,
      event_ppo_cross_signal,
      adx14_value: roundFixed(adx14_value, 2),
      event_adx_gt_25,
      event_adx_lt_20,
      volume_ratio_20d_value,
      volume_ratio_20d_bin_gt_2x,
      event_volume_spike_2x,
      event_new_high_20,
      event_new_low_20,
      event_new_high_50,
      event_new_low_50,
      event_new_52w_high,
      event_new_52w_low,
      dist_to_52w_high_pct,
      dist_to_52w_high_bin,
      dist_to_52w_low_pct,
      dist_to_52w_low_bin,
      liquidity_bucket,
      liquidity_flag,
      market_cap_bucket,
    };
  }

  get length() {
    return this.closes.length;
  }

  snapshot() {
    return this.lastSnapshot;
  }
}

export default { HistProbsRollingCore };
