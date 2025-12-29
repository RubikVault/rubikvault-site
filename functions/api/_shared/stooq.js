import { safeFetchText, isHtmlLike, safeSnippet } from "../_shared.js";

const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchStooqDaily(symbol, env) {
  const stooqSymbol = `${symbol}.US`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await safeFetchText(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return { ok: false, error: "UPSTREAM_5XX", snippet: safeSnippet(text), data: null };
  }
  const lines = text.trim().split("\n");
  if (lines.length < 3) {
    return { ok: false, error: "SCHEMA_INVALID", snippet: safeSnippet(text), data: null };
  }
  const dates = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volumes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const open = parseNumber(parts[1]);
    const high = parseNumber(parts[2]);
    const low = parseNumber(parts[3]);
    const close = parseNumber(parts[4]);
    const volume = parseNumber(parts[5]);
    if (close === null) continue;
    dates.push(parts[0]);
    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(volume ?? 0);
  }
  if (closes.length < 5) {
    return { ok: false, error: "SCHEMA_INVALID", snippet: safeSnippet(text), data: null };
  }
  return {
    ok: true,
    error: "",
    snippet: "",
    data: { dates, opens, highs, lows, closes, volumes }
  };
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
