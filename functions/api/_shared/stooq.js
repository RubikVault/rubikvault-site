function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchStooqDaily() {
  return { ok: false, error: "STATIC_ONLY", snippet: "", data: null };
}

export function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / slice.length;
}

export function pctChange(latest, previous) {
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) return null;
  return ((latest / previous - 1) * 100);
}

export function lastValue(values, offset = 0) {
  if (!Array.isArray(values)) return null;
  const idx = values.length - 1 - offset;
  if (idx < 0) return null;
  const value = values[idx];
  return Number.isFinite(value) ? value : null;
}

export function computeReturn(values, offset) {
  const latest = lastValue(values, 0);
  const previous = lastValue(values, offset);
  return pctChange(latest, previous);
}

export function atrPercent(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || closes.length < period + 1) return null;
  let trSum = 0;
  let count = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    if (i <= 0) continue;
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    if (![high, low, prevClose].every(Number.isFinite)) continue;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
    count += 1;
  }
  if (!count) return null;
  const avgTr = trSum / count;
  const latestClose = closes[closes.length - 1];
  if (!Number.isFinite(latestClose) || latestClose === 0) return null;
  return (avgTr / latestClose) * 100;
}

export function bodyPercent(open, high, low, close) {
  if (![open, high, low, close].every(Number.isFinite)) return null;
  const range = high - low;
  if (range === 0) return 0;
  return Math.abs(close - open) / range;
}
