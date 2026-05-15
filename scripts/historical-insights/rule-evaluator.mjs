function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function closeOf(bar) {
  return num(bar?.adjClose ?? bar?.adjusted_close ?? bar?.adj_close ?? bar?.close);
}

function sma(values, n) {
  if (values.length < n) return null;
  const slice = values.slice(-n).filter(Number.isFinite);
  if (slice.length < n) return null;
  return slice.reduce((sum, value) => sum + value, 0) / n;
}

function std(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function pctChange(values, n) {
  if (values.length <= n) return null;
  const last = values[values.length - 1];
  const prior = values[values.length - 1 - n];
  return Number.isFinite(last) && Number.isFinite(prior) && prior > 0 ? (last / prior) - 1 : null;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (!Number.isFinite(diff)) return null;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return gains > 0 ? 100 : 50;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function rollingMin(values, n) {
  if (values.length < n) return null;
  const clean = values.slice(-n).filter(Number.isFinite);
  return clean.length === n ? Math.min(...clean) : null;
}

function rollingMax(values, n) {
  if (values.length < n) return null;
  const clean = values.slice(-n).filter(Number.isFinite);
  return clean.length === n ? Math.max(...clean) : null;
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function bollingerWidthAt(closes, endExclusive, n = 20) {
  const window = closes.slice(Math.max(0, endExclusive - n), endExclusive);
  if (window.length < n || !window.every(Number.isFinite)) return null;
  const mid = window.reduce((sum, value) => sum + value, 0) / n;
  const sd = std(window);
  return mid > 0 && sd != null ? (4 * sd) / mid : null;
}

function trueRange(bars, closes, idx) {
  const high = num(bars[idx]?.high);
  const low = num(bars[idx]?.low);
  const prevClose = idx > 0 ? closes[idx - 1] : null;
  if (high == null || low == null) return null;
  if (prevClose == null) return high - low;
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

function atrAt(bars, closes, endExclusive, n = 14) {
  if (endExclusive < n + 1) return null;
  const ranges = [];
  for (let i = endExclusive - n; i < endExclusive; i += 1) ranges.push(trueRange(bars, closes, i));
  return ranges.every(Number.isFinite) ? ranges.reduce((sum, value) => sum + value, 0) / n : null;
}

function obvSeries(closes, volumes) {
  const out = [0];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = out[out.length - 1];
    if (closes[i] > closes[i - 1]) out.push(prev + (volumes[i] || 0));
    else if (closes[i] < closes[i - 1]) out.push(prev - (volumes[i] || 0));
    else out.push(prev);
  }
  return out;
}

function redGreenStreak(closes, direction, n) {
  if (closes.length <= n) return false;
  for (let i = 0; i < n; i += 1) {
    const a = closes[closes.length - 1 - i];
    const b = closes[closes.length - 2 - i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (direction === 'green' && !(a > b)) return false;
    if (direction === 'red' && !(a < b)) return false;
  }
  return true;
}

function sequenceMatches(closes, seq) {
  const letters = String(seq || '').split('').reverse();
  if (closes.length <= letters.length) return false;
  return letters.every((letter, i) => {
    const a = closes[closes.length - 1 - i];
    const b = closes[closes.length - 2 - i];
    return letter === 'g' ? a > b : a < b;
  });
}

function insideDay(bars, offset = 0) {
  const last = bars[bars.length - 1 - offset];
  const prev = bars[bars.length - 2 - offset];
  return Boolean(last && prev && num(last.high) <= num(prev.high) && num(last.low) >= num(prev.low));
}

function rangePct(bar, prevClose) {
  const high = num(bar?.high);
  const low = num(bar?.low);
  return high != null && low != null && prevClose > 0 ? (high - low) / prevClose : null;
}

export function evaluateHistoricalPattern(patternId, bars) {
  const id = String(patternId || '').toLowerCase();
  if (!id || !Array.isArray(bars) || bars.length < 2) return false;
  const closes = bars.map(closeOf);
  const volumes = bars.map((bar) => num(bar?.volume) ?? 0);
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const lastClose = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const ret1 = prevClose > 0 ? (lastClose / prevClose) - 1 : null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const z20Base = closes.slice(-20);
  const z20Std = std(z20Base);
  const zscore20 = z20Std && z20Std > 0 ? (lastClose - sma(closes, 20)) / z20Std : null;
  const vol20 = sma(volumes, 20);
  const volRatio20 = vol20 && vol20 > 0 ? (volumes[volumes.length - 1] / vol20) : null;
  const gapPct = prevClose > 0 ? (num(lastBar.open) / prevClose) - 1 : null;
  const gapUp = gapPct != null && gapPct > 0.001;
  const gapDown = gapPct != null && gapPct < -0.001;
  const failedGap = (gapUp && lastClose < num(lastBar.open)) || (gapDown && lastClose > num(lastBar.open));

  if (id === 'all_days') return true;
  const month = id.match(/^month_([a-z]{3})$/);
  if (month) return ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][new Date(lastBar.date).getUTCMonth()] === month[1];
  const weekday = id.match(/^weekday_(monday|tuesday|wednesday|thursday|friday)$/);
  if (weekday) return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(lastBar.date).getUTCDay()] === weekday[1];
  const green = id.match(/^green_streak_(\d+)$/);
  if (green) return redGreenStreak(closes, 'green', Number(green[1]));
  const red = id.match(/^red_streak_(\d+)$/);
  if (red) return redGreenStreak(closes, 'red', Number(red[1]));
  const seq = id.match(/^seq_([gr]+)$/);
  if (seq) return sequenceMatches(closes, seq[1]);
  const high = id.match(/^new_(\d+)d_high$/);
  if (high) return lastClose >= (rollingMax(closes.slice(0, -1), Number(high[1])) ?? Infinity);
  const low = id.match(/^new_(\d+)d_low$/);
  if (low) return lastClose <= (rollingMin(closes.slice(0, -1), Number(low[1])) ?? -Infinity);

  if (id === 'gap_up') return gapUp;
  if (id === 'gap_down') return gapDown;
  if (id === 'gap_up_fill') return gapUp && num(lastBar.low) <= prevClose;
  if (id === 'gap_up_vol_confirm') return gapUp && volRatio20 >= 2;
  if (id === 'gap_dn_vol_confirm') return gapDown && volRatio20 >= 2;
  if (id === 'inside_day') return insideDay(bars);
  if (id === 'outside_day') return num(lastBar.high) > num(prevBar.high) && num(lastBar.low) < num(prevBar.low);
  if (id === 'nr7' || id === 'nr4' || id === 'nr14') {
    const n = Number(id.replace('nr', ''));
    const ranges = bars.map((bar, idx) => idx ? rangePct(bar, closes[idx - 1]) : null);
    const latest = ranges[ranges.length - 1];
    return latest != null && latest === rollingMin(ranges, n);
  }
  if (id === 'triple_inside') return insideDay(bars) && insideDay(bars, 1) && insideDay(bars, 2);
  if (id === 'nr7_inside_day') return evaluateHistoricalPattern('nr7', bars) && insideDay(bars);
  if (id === 'bollinger_squeeze') {
    const latestWidth = bollingerWidthAt(closes, closes.length, 20);
    const widths = [];
    for (let end = Math.max(20, closes.length - 252); end <= closes.length; end += 1) widths.push(bollingerWidthAt(closes, end, 20));
    const clean = widths.filter(Number.isFinite);
    return latestWidth != null && clean.length >= 20 && latestWidth <= Math.min(...clean);
  }
  if (id === 'atr_contraction_50pct') {
    const latestAtr = atrAt(bars, closes, bars.length, 14);
    const priorAtr = atrAt(bars, closes, bars.length - 20, 14);
    return latestAtr != null && priorAtr != null && latestAtr < 0.5 * priorAtr;
  }

  if (id === 'rsi14_lt_25') return rsi14 < 25;
  if (id === 'rsi14_lt_30') return rsi14 < 30;
  if (id === 'rsi14_gt_70') return rsi14 > 70;
  if (id === 'rsi14_gt_75') return rsi14 > 75;
  if (id === 'rsi_lt_30_above_sma200') return rsi14 < 30 && lastClose > sma200;
  if (id === 'rsi_gt_70_below_sma200') return rsi14 > 70 && lastClose < sma200;
  if (id === 'zscore20_lt_m2') return zscore20 < -2;
  if (id === 'monthly_red_daily_zscore_lt_m2') return pctChange(closes, 21) < 0 && zscore20 < -2;
  if (id === 'zscore20_gt_p2') return zscore20 > 2;
  if (id === 'far_above_sma20') return sma20 && lastClose / sma20 - 1 > 0.05;
  if (id === 'far_below_sma20') return sma20 && lastClose / sma20 - 1 < -0.05;
  if (id === 'above_bb_upper') return zscore20 > 2;
  if (id === 'weekly_zscore_gt_2_daily_red') return zscore20 > 2 && ret1 < 0;
  if (id === 'below_bb_lower' || id === 'bb_lower_break_low_vol_regime') return zscore20 < -2;
  if (id === 'weekly_up_daily_pullback_sma20') return pctChange(closes, 5) > 0 && lastClose < sma20 && lastClose > sma50;
  if (id === 'weekly_new_high_daily_inside') return lastClose >= (rollingMax(closes.slice(0, -1), 100) ?? Infinity) && insideDay(bars);
  if (id === 'breakout_with_vol' || id === 'breakout_with_vol_above_sma200') return evaluateHistoricalPattern('new_20d_high', bars) && volRatio20 >= 1 && (!id.includes('sma200') || lastClose > sma200);
  if (id === 'breakout_no_vol') return evaluateHistoricalPattern('new_20d_high', bars) && volRatio20 < 1;
  if (id === 'vol_spike_2x') return volRatio20 >= 2;
  if (id === 'vol_ratio_3x_no_range') {
    const ranges = bars.map((bar, idx) => idx ? rangePct(bar, closes[idx - 1]) : null);
    return volRatio20 >= 3 && ranges[ranges.length - 1] < median(ranges.slice(-21, -1));
  }
  if (id === 'price_new20d_high_obv_lower_high' || id === 'price_new20d_low_obv_higher_low') {
    const obv = obvSeries(closes, volumes);
    const latestObv = obv[obv.length - 1];
    if (id.includes('high')) {
      return evaluateHistoricalPattern('new_20d_high', bars) && latestObv < (rollingMax(obv.slice(0, -1), 20) ?? -Infinity);
    }
    return evaluateHistoricalPattern('new_20d_low', bars) && latestObv > (rollingMin(obv.slice(0, -1), 20) ?? Infinity);
  }
  if (id === 'gap_up_failed_vol_confirmed') return gapUp && failedGap && volRatio20 >= 1.5;
  if (id === 'island_reversal') {
    if (bars.length < 3) return false;
    const prevPrevClose = closes[closes.length - 3];
    const prevGapPct = prevPrevClose > 0 ? (num(prevBar.open) / prevPrevClose) - 1 : null;
    const prevGapUp = prevGapPct != null && prevGapPct > 0.001;
    const prevGapDown = prevGapPct != null && prevGapPct < -0.001;
    return (prevGapUp && gapDown) || (prevGapDown && gapUp);
  }
  if (id === 'close_in_range_top10pct') {
    const dayRange = num(lastBar.high) - num(lastBar.low);
    return dayRange > 0 && ((lastClose - num(lastBar.low)) / dayRange) >= 0.9;
  }
  if (id === 'close_top_decile_of_week' || id === 'close_bottom_decile_of_week') {
    const hi = Math.max(...bars.slice(-5).map((bar) => num(bar.high)).filter(Number.isFinite));
    const lo = Math.min(...bars.slice(-5).map((bar) => num(bar.low)).filter(Number.isFinite));
    const pos = hi > lo ? (lastClose - lo) / (hi - lo) : null;
    const isFriday = new Date(lastBar.date).getUTCDay() === 5;
    return isFriday && (id.includes('top') ? pos >= 0.9 : pos <= 0.1);
  }
  if (id === 'first_monday_of_month_gap_up') {
    const d = new Date(lastBar.date);
    return d.getUTCDate() <= 7 && d.getUTCDay() === 1 && gapUp;
  }
  if (id === 'last_friday_red_streak_2') {
    const d = new Date(lastBar.date);
    const nextWeek = new Date(d.getTime() + 7 * 86400000);
    return d.getUTCDay() === 5 && nextWeek.getUTCMonth() !== d.getUTCMonth() && redGreenStreak(closes, 'red', 2);
  }
  if (id === 'triple_witching_week_inside') {
    const d = new Date(lastBar.date);
    return d.getUTCDate() >= 15 && d.getUTCDate() <= 21 && insideDay(bars);
  }
  if (id === 'vol_spike_4x_event') {
    const ranges = bars.map((bar, idx) => idx ? rangePct(bar, closes[idx - 1]) : null);
    return volRatio20 >= 4 && ranges[ranges.length - 1] > 0.05 && ranges[ranges.length - 2] < 0.02;
  }
  if (id === 'post_event_drift_d1') {
    return evaluateHistoricalPattern('vol_spike_4x_event', bars.slice(0, -1)) && (prevClose / num(prevBar.open) - 1) > 0;
  }
  return false;
}
