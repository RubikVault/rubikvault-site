import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchText,
  isHtmlLike,
  safeSnippet,
  swrGetOrRefresh,
  normalizeFreshness,
  kvGetJson,
  kvPutJson
} from "./_shared.js";
import { US_TOP_30 } from "./_shared/us-universes.js";
import { calculateConfidence, resolveDataQuality } from "./_shared/feature-contract.js";
import { computeAlphaRadarPicks } from "../../scripts/core/alpha-radar-core.mjs";

const FEATURE_ID = "alpha-radar";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 48 * 60 * 60;
const CACHE_KEY = "DASH:ALPHA_RADAR";
const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";
const EARNINGS_LAST_GOOD = "earnings-calendar:last_good";
const LAST_GOOD_KEY = "alpha-radar:last_good";

const DEFINITIONS = {
  setupMax: 40,
  triggerMax: 60,
  buyThreshold: 70,
  earningsRiskCutoffDays: 3,
  setupReasons: [
    "RSI_LT_25",
    "RSI_LT_30",
    "RSI_LT_35",
    "BBPCTB_LT_005",
    "BBPCTB_LT_015",
    "NEAR_SMA200_1P",
    "NEAR_SMA200_2P",
    "NEAR_SMA200_3P",
    "RVOL_GE_15",
    "VOL_GE_12x",
    "NO_EXTREME_FOUND"
  ],
  triggerReasons: [
    "EMA21_RECLAIM",
    "HIGHER_LOW_FT",
    "BOS_BREAK",
    "VOL_CONFIRM_12x",
    "RSI_UPTURN",
    "MACD_HIST_LESS_NEG",
    "STOCHRSI_UPTURN",
    "EARNINGS_RISK_CAP",
    "WEAK_RECLAIM_NO_VOL"
  ]
};

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseStooqCsv(text) {
  if (!text || isHtmlLike(text)) return null;
  const lines = text.trim().split("\n");
  if (lines.length < 3) return null;
  const closes = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const open = parseNumber(parts[1]);
    const high = parseNumber(parts[2]);
    const low = parseNumber(parts[3]);
    const close = parseNumber(parts[4]);
    const volume = parseNumber(parts[5]);
    if (close === null || high === null || low === null) continue;
    opens.push(open);
    closes.push(close);
    highs.push(high);
    lows.push(low);
    volumes.push(volume ?? 0);
  }
  return { opens, closes, highs, lows, volumes };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / slice.length;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const output = [];
  let prev = values[0];
  output.push(prev);
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    output.push(prev);
  }
  return output;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function rsiSeries(values, period = 14) {
  if (values.length < period + 1) return [];
  const output = new Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  output[period] = firstRsi;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      output[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      output[i] = 100 - 100 / (1 + rs);
    }
  }
  return output;
}

function stochRsiAt(series, index, period = 14) {
  if (!Array.isArray(series) || index < 0) return null;
  const start = Math.max(0, index - period + 1);
  const window = series.slice(start, index + 1).filter((value) => typeof value === "number");
  if (window.length < period) return null;
  const min = Math.min(...window);
  const max = Math.max(...window);
  if (max === min) return 0;
  const current = series[index];
  if (typeof current !== "number") return null;
  return ((current - min) / (max - min)) * 100;
}

function computeStochRsi(series, period = 14) {
  const lastIndex = series.length - 1;
  return {
    value: stochRsiAt(series, lastIndex, period),
    prev: stochRsiAt(series, lastIndex - 1, period)
  };
}

function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  const slice = trs.slice(-period);
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

function bollinger(values, period = 20, multiplier = 2) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
  const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  const upper = mean + multiplier * std;
  const lower = mean - multiplier * std;
  const latest = values[values.length - 1];
  const percentB = upper === lower ? null : (latest - lower) / (upper - lower);
  return { upper, lower, mean, percentB };
}

function macd(values) {
  if (values.length < 26) return null;
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const length = Math.min(ema12.length, ema26.length);
  const macdSeries = [];
  for (let i = 0; i < length; i += 1) {
    macdSeries.push(ema12[i] - ema26[i]);
  }
  const signalSeries = emaSeries(macdSeries, 9);
  if (!signalSeries.length) return null;
  const hist = macdSeries[macdSeries.length - 1] - signalSeries[signalSeries.length - 1];
  const prevHist =
    macdSeries.length > 1 && signalSeries.length > 1
      ? macdSeries[macdSeries.length - 2] - signalSeries[signalSeries.length - 2]
      : null;
  return { macd: macdSeries[macdSeries.length - 1], signal: signalSeries[signalSeries.length - 1], hist, prevHist };
}

function pivotPoints(values, window = 2, lookback = 60, mode = "low") {
  if (!Array.isArray(values) || values.length < window * 2 + 1) return [];
  const points = [];
  const start = Math.max(window, values.length - lookback);
  const end = values.length - window;
  for (let i = start; i < end; i += 1) {
    const current = values[i];
    if (typeof current !== "number") continue;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      const compare = values[j];
      if (typeof compare !== "number") continue;
      if (mode === "low" && compare < current) {
        isPivot = false;
        break;
      }
      if (mode === "high" && compare > current) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) points.push({ index: i, value: current });
  }
  return points;
}

function findPivotLows(lows) {
  const lowsList = pivotPoints(lows, 2, 80, "low");
  const last = lowsList[lowsList.length - 1];
  const prev = lowsList[lowsList.length - 2];
  return {
    pivotLow: last?.value ?? null,
    pivotLowPrev: prev?.value ?? null
  };
}

function findLastLowerHigh(highs) {
  const highsList = pivotPoints(highs, 2, 80, "high");
  if (highsList.length < 2) return null;
  const last = highsList[highsList.length - 1];
  const prev = highsList[highsList.length - 2];
  if (last && prev && last.value < prev.value) return last.value;
  return null;
}

function buildEarningsMap(cached) {
  const map = new Map();
  const items = cached?.value?.data?.items || [];
  items.forEach((item) => {
    if (!item.symbol || !item.date) return;
    map.set(item.symbol, item.date);
  });
  return map;
}

function daysToEarnings(dateStr) {
  if (!dateStr) return null;
  const now = Date.now();
  const target = Date.parse(dateStr);
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

function evaluateAlphaRadarSignal(input) {
  const reasonsSetup = [];
  const reasonsTrig = [];
  const hardTriggers = [];
  let setupScore = 0;
  let triggerScore = 0;

  const setupGate =
    (typeof input.rsi14 === "number" && input.rsi14 < 35) ||
    (typeof input.bbPctB === "number" && input.bbPctB < 0.15) ||
    (typeof input.distSMA200 === "number" && input.distSMA200 <= 0.02);

  if (!setupGate) {
    reasonsSetup.push("NO_EXTREME_FOUND");
    setupScore = 0;
  } else {
    if (typeof input.rsi14 === "number") {
      if (input.rsi14 < 25) {
        setupScore += 14;
        reasonsSetup.push("RSI_LT_25");
      } else if (input.rsi14 < 30) {
        setupScore += 10;
        reasonsSetup.push("RSI_LT_30");
      } else if (input.rsi14 < 35) {
        setupScore += 6;
        reasonsSetup.push("RSI_LT_35");
      }
    }

    if (typeof input.bbPctB === "number") {
      if (input.bbPctB < 0.05) {
        setupScore += 12;
        reasonsSetup.push("BBPCTB_LT_005");
      } else if (input.bbPctB < 0.15) {
        setupScore += 8;
        reasonsSetup.push("BBPCTB_LT_015");
      }
    }

    if (typeof input.distSMA200 === "number") {
      if (input.distSMA200 <= 0.01) {
        setupScore += 11;
        reasonsSetup.push("NEAR_SMA200_1P");
      } else if (input.distSMA200 <= 0.02) {
        setupScore += 9;
        reasonsSetup.push("NEAR_SMA200_2P");
      } else if (input.distSMA200 <= 0.03) {
        setupScore += 5;
        reasonsSetup.push("NEAR_SMA200_3P");
      }
    }

    if (typeof input.rvol === "number" && input.rvol >= 1.5) {
      setupScore += 8;
      reasonsSetup.push("RVOL_GE_15");
    } else if (typeof input.vol === "number" && typeof input.vol20 === "number") {
      if (input.vol > input.vol20 * 1.2) {
        setupScore += 5;
        reasonsSetup.push("VOL_GE_12x");
      }
    }
  }

  const emaReclaim =
    typeof input.close === "number" &&
    typeof input.ema21 === "number" &&
    typeof input.closePrev === "number" &&
    typeof input.ema21Prev === "number" &&
    input.close > input.ema21 &&
    input.closePrev <= input.ema21Prev;
  if (emaReclaim) {
    triggerScore += 15;
    reasonsTrig.push("EMA21_RECLAIM");
    hardTriggers.push("EMA21_RECLAIM");
  }

  const higherLow =
    typeof input.pivotLow === "number" &&
    typeof input.pivotLowPrev === "number" &&
    typeof input.close === "number" &&
    typeof input.open === "number" &&
    input.pivotLow > input.pivotLowPrev &&
    input.close > input.open;
  if (higherLow) {
    triggerScore += 25;
    reasonsTrig.push("HIGHER_LOW_FT");
    hardTriggers.push("HIGHER_LOW_FT");
  }

  const bos =
    typeof input.lastLowerHigh === "number" &&
    typeof input.close === "number" &&
    input.close > input.lastLowerHigh;
  if (bos) {
    triggerScore += 20;
    reasonsTrig.push("BOS_BREAK");
    hardTriggers.push("BOS_BREAK");
  }

  if (typeof input.vol === "number" && typeof input.vol20 === "number") {
    if (input.vol > input.vol20 * 1.2) {
      triggerScore += 10;
      reasonsTrig.push("VOL_CONFIRM_12x");
    }
  }
  if (typeof input.rvol === "number" && input.rvol >= 1.5) {
    triggerScore += 5;
    reasonsTrig.push("RVOL_GE_15");
  }

  if (typeof input.rsi14 === "number" && typeof input.rsiPrev === "number") {
    if (input.rsi14 > input.rsiPrev) {
      triggerScore += 8;
      reasonsTrig.push("RSI_UPTURN");
    }
  }

  if (typeof input.macdHist === "number" && typeof input.macdHistPrev === "number") {
    if (input.macdHist < 0 && input.macdHist > input.macdHistPrev) {
      triggerScore += 4;
      reasonsTrig.push("MACD_HIST_LESS_NEG");
    }
  }

  const stochRsiUpturn =
    typeof input.stochRsi === "number" &&
    typeof input.stochRsiPrev === "number" &&
    (input.stochRsi < 20 || input.stochRsiPrev < 20) &&
    input.stochRsi > input.stochRsiPrev;
  if (stochRsiUpturn) {
    triggerScore += 3;
    reasonsTrig.push("STOCHRSI_UPTURN");
  }

  setupScore = Math.min(setupScore, 40);
  triggerScore = Math.min(triggerScore, 60);
  let totalScore = setupScore + triggerScore;

  const dataQuality = {
    barsUsed: input.barsUsed,
    missingFields: input.missingFields || [],
    isPartial: input.barsUsed < 220 || (input.missingFields || []).length > 0
  };
  dataQuality.status = dataQuality.isPartial ? "PARTIAL" : "LIVE";
  dataQuality.reason = dataQuality.isPartial ? "PARTIAL_DATA" : "LIVE";

  if (typeof input.daysToEarnings === "number" && input.daysToEarnings <= 3) {
    totalScore = Math.min(totalScore, 69);
    reasonsTrig.push("EARNINGS_RISK_CAP");
  }

  if (dataQuality.isPartial) {
    totalScore = Math.min(totalScore, 59);
  }

  const volConfirm =
    typeof input.vol === "number" &&
    typeof input.vol20 === "number" &&
    input.vol > input.vol20 * 1.2;
  const emaOnly = emaReclaim && !higherLow && !bos;
  const emaOnlyNeedsVol = emaOnly && !volConfirm;
  if (emaOnlyNeedsVol) {
    totalScore = Math.min(totalScore, 69);
    reasonsTrig.push("WEAK_RECLAIM_NO_VOL");
  }

  const hardTrigCount = hardTriggers.length;
  let label = "IGNORE";
  if (totalScore >= 70 && hardTrigCount >= 1 && !dataQuality.isPartial && !emaOnlyNeedsVol) {
    label = "BUY";
  } else if (setupScore >= 25 || (totalScore >= 55 && totalScore <= 69) || dataQuality.isPartial) {
    label = dataQuality.isPartial ? "DATA_ERROR" : "WATCHLIST";
  }

  return {
    setupScore,
    triggerScore,
    totalScore,
    label,
    reasonsSetup,
    reasonsTrig,
    dataQuality,
    debug: {
      close: input.close,
      closePrev: input.closePrev,
      open: input.open,
      low: input.low,
      rsi14: input.rsi14,
      rsiPrev: input.rsiPrev,
      bbPctB: input.bbPctB,
      ema21: input.ema21,
      ema21Prev: input.ema21Prev,
      sma200: input.sma200,
      distSMA200: input.distSMA200,
      vol: input.vol,
      vol20: input.vol20,
      rvol: input.rvol,
      macdHist: input.macdHist,
      macdHistPrev: input.macdHistPrev,
      stochRsi: input.stochRsi,
      stochRsiPrev: input.stochRsiPrev,
      pivotLow: input.pivotLow,
      pivotLowPrev: input.pivotLowPrev,
      lastLowerHigh: input.lastLowerHigh,
      barsUsed: input.barsUsed,
      missingFields: input.missingFields,
      emaReclaim,
      higherLow,
      bos,
      setupGate,
      hardTrigCount,
      hardTriggers,
      setupScore,
      triggerScore,
      totalScore,
      label,
      reasonsSetup,
      reasonsTrig,
      dataQuality
    }
  };
}

function scorePick(symbol, name, series, earningsDate) {
  const { opens, closes, highs, lows, volumes } = series;
  const close = closes[closes.length - 1];
  const closePrev = closes[closes.length - 2] ?? null;
  const open = opens?.[opens.length - 1] ?? null;
  const low = lows?.[lows.length - 1] ?? null;
  const latestVolume = volumes[volumes.length - 1] ?? null;
  const barsUsed = closes.length;

  const sma200 = sma(closes, 200);
  const ema21Series = emaSeries(closes, 21);
  const ema21 = ema21Series.length ? ema21Series[ema21Series.length - 1] : null;
  const ema21Prev = ema21Series.length > 1 ? ema21Series[ema21Series.length - 2] : null;
  const rsiSeriesValues = rsiSeries(closes, 14);
  const rsi14 = rsiSeriesValues.length ? rsiSeriesValues[rsiSeriesValues.length - 1] : null;
  const rsiPrev = rsiSeriesValues.length > 1 ? rsiSeriesValues[rsiSeriesValues.length - 2] : null;
  const bb = bollinger(closes, 20, 2);
  const macdValues = macd(closes);
  const atr14 = atr(highs, lows, closes, 14);
  const vol20 = sma(volumes, 20);
  const rvol = typeof vol20 === "number" && vol20 !== 0 ? latestVolume / vol20 : null;

  const distSMA200 =
    typeof sma200 === "number" && typeof close === "number" && close !== 0
      ? Math.abs(close - sma200) / close
      : null;

  const pivotLows = findPivotLows(lows);
  const lastLowerHigh = findLastLowerHigh(highs);
  const stoch = computeStochRsi(rsiSeriesValues, 14);

  const earningsDays = daysToEarnings(earningsDate);
  const missingFields = [];
  const fieldChecks = {
    close,
    closePrev,
    open,
    low,
    rsi14,
    rsiPrev,
    bbPctB: bb?.percentB ?? null,
    ema21,
    ema21Prev,
    sma200,
    distSMA200,
    vol: latestVolume,
    vol20,
    rvol,
    macdHist: macdValues?.hist ?? null,
    macdHistPrev: macdValues?.prevHist ?? null,
    stochRsi: stoch.value,
    stochRsiPrev: stoch.prev,
    pivotLow: pivotLows.pivotLow,
    pivotLowPrev: pivotLows.pivotLowPrev,
    lastLowerHigh
  };
  Object.entries(fieldChecks).forEach(([key, value]) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      missingFields.push(key);
    }
  });

  const evaluation = evaluateAlphaRadarSignal({
    symbol,
    close,
    closePrev,
    open,
    low,
    rsi14,
    rsiPrev,
    bbPctB: bb?.percentB ?? null,
    ema21,
    ema21Prev,
    sma200,
    distSMA200,
    vol: latestVolume,
    vol20,
    rvol,
    macdHist: macdValues?.hist ?? null,
    macdHistPrev: macdValues?.prevHist ?? null,
    stochRsi: stoch.value,
    stochRsiPrev: stoch.prev,
    pivotLow: pivotLows.pivotLow,
    pivotLowPrev: pivotLows.pivotLowPrev,
    lastLowerHigh,
    barsUsed,
    missingFields,
    daysToEarnings: earningsDays
  });

  const setup = {
    rsiExtreme: typeof rsi14 === "number" && rsi14 < 35,
    bbExtreme: typeof bb?.percentB === "number" && bb.percentB < 0.15,
    nearSma200: typeof distSMA200 === "number" && distSMA200 <= 0.02,
    rvolBonus: typeof rvol === "number" && rvol >= 1.5,
    setupGate: evaluation.debug?.setupGate ?? false
  };

  const trigger = {
    emaReclaim: evaluation.debug?.emaReclaim ?? false,
    higherLow: evaluation.debug?.higherLow ?? false,
    bos: evaluation.debug?.bos ?? false,
    volConfirm: typeof latestVolume === "number" && typeof vol20 === "number" && latestVolume > vol20 * 1.2,
    rsiUpturn: typeof rsi14 === "number" && typeof rsiPrev === "number" && rsi14 > rsiPrev
  };

  return {
    symbol,
    name,
    setupScore: evaluation.setupScore,
    triggerScore: evaluation.triggerScore,
    totalScore: evaluation.totalScore,
    label: evaluation.label,
    setup,
    trigger,
    reasonsSetup: evaluation.reasonsSetup,
    reasonsTrig: evaluation.reasonsTrig,
    reasons: [...evaluation.reasonsSetup, ...evaluation.reasonsTrig],
    debug: evaluation.debug,
    dataQuality: evaluation.dataQuality,
    stop: atr14 !== null && typeof close === "number" ? close - atr14 * 2 : null,
    earningsRisk: earningsDays !== null && earningsDays <= 3,
    earningsDays,
    close,
    changePercent: closePrev ? ((close / closePrev - 1) * 100) : null
  };
}

async function fetchSeries(symbol, env) {
  const stooqSymbol = `${symbol}.US`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await safeFetchText(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return { ok: false, error: "UPSTREAM_5XX", snippet: safeSnippet(text) };
  }
  const parsed = parseStooqCsv(text);
  if (!parsed || parsed.closes.length < 60) {
    return { ok: false, error: "SCHEMA_INVALID", snippet: safeSnippet(text) };
  }
  return { ok: true, data: parsed, snippet: "" };
}

async function fetchAlphaRadar(env, options = {}) {
  const symbolOverride = options.symbol ? String(options.symbol).toUpperCase() : null;
  const cachedEarnings = await kvGetJson(env, EARNINGS_LAST_GOOD);
  const earningsMap = buildEarningsMap(cachedEarnings);

  const universe = symbolOverride
    ? [{ s: symbolOverride, n: symbolOverride }]
    : US_TOP_30;

  const results = await Promise.allSettled(
    universe.map(async (entry) => {
      const symbol = String(entry.s || "").toUpperCase();
      const name = entry.n || symbol;
      const series = await fetchSeries(symbol, env);
      return { symbol, name, series };
    })
  );

  const picks = [];
  const missingSymbols = [];
  let upstreamSnippet = "";

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, name, series } = result.value;
    if (!series.ok) {
      missingSymbols.push(symbol);
      upstreamSnippet = upstreamSnippet || series.snippet || "";
      return;
    }
    const earningsDate = earningsMap.get(symbol) || null;
    picks.push(scorePick(symbol, name, series.data, earningsDate));
  });

  if (!picks.length) {
    return {
      ok: false,
      error: {
        code: "UPSTREAM_5XX",
        message: "No alpha radar data",
        details: { missingSymbols }
      },
      snippet: upstreamSnippet
    };
  }

  const sortedByTotal = [...picks].sort((a, b) => b.totalScore - a.totalScore);
  const sortedByTrigger = [...picks].sort((a, b) => b.triggerScore - a.triggerScore);
  const sortedBySetup = [...picks].sort((a, b) => b.setupScore - a.setupScore);
  const buyPicks = sortedByTotal.filter((pick) => pick.label === "BUY");
  const hasPartialPick = picks.some((pick) => pick.dataQuality?.isPartial);
  const groupedPicks = computeAlphaRadarPicks({
    picks: {
      shortterm: sortedByTrigger.slice(0, 3),
      longterm: sortedBySetup.slice(0, 3),
      top: (buyPicks.length ? buyPicks : sortedByTotal).slice(0, 3)
    }
  });

  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      source: "stooq",
      partial: missingSymbols.length > 0 || hasPartialPick,
      missingSymbols,
      universe: universe.map((entry) => entry.s),
      picks: groupedPicks,
      method: "Alpha Radar Reversal v1 (extremes + structural reversals)",
      warnings: missingSymbols.length ? ["Some symbols unavailable"] : [],
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: missingSymbols.length > 0 || hasPartialPick,
        hasData: sortedByTotal.length > 0
      }),
      confidence: calculateConfidence(
        universe.length - missingSymbols.length,
        universe.length
      ),
      definitions: DEFINITIONS,
      reasons: []
    },
    upstreamSnippet
  };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const url = new URL(request.url);
  const debugSymbol = url.searchParams.get("symbol");
  const debugMode = url.searchParams.get("debug") === "1" || Boolean(debugSymbol);

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  if (debugMode) {
    const result = await fetchAlphaRadar(env, { symbol: debugSymbol || "AAPL", debug: true });
    if (!result?.ok || !result?.data) {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "stooq", status: null, snippet: result?.snippet || "" },
        error: result?.error || { code: "UPSTREAM_5XX", message: "No debug data", details: {} },
        cacheStatus: "ERROR",
        status: 200
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return response;
    }
    result.data.traceId = traceId;
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: result.data,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: 200, snippet: "" },
      cacheStatus: "MISS",
      status: 200
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 200,
      durationMs: Date.now() - started
    });
    return response;
  }

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchAlphaRadar(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: null, snippet: swr.error?.snippet || "" },
      error: swr.error || { code: "UPSTREAM_5XX", message: "No upstream data", details: {} },
      cacheStatus: "ERROR"
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  payload.traceId = traceId;
  payload.dataQuality =
    payload.dataQuality ||
    resolveDataQuality({
      ok: true,
      isStale: swr.isStale,
      partial: payload.partial,
      hasData: (payload.picks?.top || []).length > 0
    });

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: "stooq", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus
  });

  if (!swr.isStale) {
    await kvPutJson(env, LAST_GOOD_KEY, { ts: new Date().toISOString(), data: payload }, 24 * 60 * 60);
  }

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
