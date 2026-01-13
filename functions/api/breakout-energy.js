import {
  assertBindings,
  createTraceId,
  makeResponse,
  jsonResponse,
  logServer,
  kvGetJson,
  kvPutJson,
  normalizeFreshness,
  swrGetOrRefresh
} from "./_shared.js";
import {
  buildFeaturePayload,
  calculateConfidence,
  resolveDataQuality,
  normalizeResponse
} from "./_shared/feature-contract.js";
import { fetchStooqDaily } from "./_shared/stooq.js";
import { US_TOP_100 } from "./_shared/us-universes.js";
import { RequestBudget } from "../_shared/budget.js";
import { normalizeError } from "../_shared/errorCodes.js";

const FEATURE_ID = "breakout-energy";
const CACHE_KEY = "breakout-energy:v1";
const LAST_GOOD_KEY = "breakout-energy:last_good";
const LAST_GOOD_V1_KEY = "breakout-energy:v1:lastGood";
const MIRROR_KEY = "mirror:breakout-energy:v1";
const MIRROR_FILE = "/mirrors/breakout-energy.json";
const LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const KV_TTL = 60 * 60;
const STALE_MAX = 24 * 60 * 60;
const MAX_SYMBOLS = 100;
const SAFE_LIMIT = 35;
const REQUEST_BUDGET_MAX = 40;

const STATES = {
  IGNORE: "IGNORE",
  SETUP: "SETUP",
  TRIGGER: "TRIGGER",
  CONFIRMED: "CONFIRMED",
  COOLDOWN: "COOLDOWN"
};

const STATE_TRANSITIONS = {
  IGNORE: new Set([STATES.IGNORE, STATES.SETUP]),
  SETUP: new Set([STATES.IGNORE, STATES.SETUP, STATES.TRIGGER]),
  TRIGGER: new Set([STATES.IGNORE, STATES.TRIGGER, STATES.CONFIRMED, STATES.COOLDOWN]),
  CONFIRMED: new Set([STATES.CONFIRMED, STATES.COOLDOWN]),
  COOLDOWN: new Set([STATES.COOLDOWN, STATES.SETUP, STATES.IGNORE])
};

const DOW_SYMBOLS = new Set([
  "AAPL",
  "AMGN",
  "AXP",
  "BA",
  "CAT",
  "CRM",
  "CSCO",
  "CVX",
  "DIS",
  "DOW",
  "GS",
  "HD",
  "HON",
  "IBM",
  "INTC",
  "JNJ",
  "JPM",
  "KO",
  "MCD",
  "MMM",
  "MRK",
  "MSFT",
  "NKE",
  "PG",
  "TRV",
  "UNH",
  "V",
  "VZ",
  "WBA",
  "WMT"
]);

const DEFINITIONS = {
  stateMachine: {
    states: Object.values(STATES),
    transitions: {
      IGNORE: ["IGNORE", "SETUP"],
      SETUP: ["IGNORE", "SETUP", "TRIGGER"],
      TRIGGER: ["IGNORE", "TRIGGER", "CONFIRMED", "COOLDOWN"],
      CONFIRMED: ["CONFIRMED", "COOLDOWN"],
      COOLDOWN: ["COOLDOWN", "SETUP", "IGNORE"]
    }
  },
  setupScore: {
    bbwCompression: 20,
    natrCompression: 15,
    volumeDry: 10,
    aboveSma200: 5
  },
  triggerScore: {
    breakoutClose: 12,
    rvolHigh: 10,
    rvolMid: 5,
    trueRange: 8,
    bbUpperBonus: 5
  },
  confirmScore: {
    pullbackAtr: 8,
    retestVolume: 6,
    timing: 6
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function extractTimestamp(value) {
  const candidate =
    value?.ts ||
    value?.updatedAt ||
    value?.data?.updatedAt ||
    value?.data?.ts ||
    value?.data?.data?.updatedAt ||
    value?.data?.data?.ts ||
    null;
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractMirrorPayload(value) {
  if (!value || typeof value !== "object") return null;
  if (value.payload && typeof value.payload === "object") {
    return { payload: value.payload, ts: value.ts || value.payload.ts || null };
  }
  if (value.feature && value.data) {
    return { payload: value, ts: value.ts || value.updatedAt || value.data?.updatedAt || null };
  }
  return null;
}

async function loadMirrorPayload(env, request) {
  if (env?.RV_KV) {
    const mirror = await kvGetJson(env, MIRROR_KEY);
    const fromKv = extractMirrorPayload(mirror?.value);
    if (fromKv?.payload) return { source: "kv", ...fromKv };
  }
  try {
    const res = await fetch(new URL(MIRROR_FILE, request.url));
    if (!res.ok) return null;
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      const snippet = text.slice(0, 80).trim().toLowerCase();
      if (snippet.startsWith("<!doctype") || snippet.startsWith("<html")) return null;
      try {
        const json = JSON.parse(text);
        const fromFile = extractMirrorPayload(json);
        if (fromFile?.payload) return { source: "file", ...fromFile };
      } catch {
        return null;
      }
      return null;
    }
    const json = await res.json();
    const fromFile = extractMirrorPayload(json);
    if (fromFile?.payload) return { source: "file", ...fromFile };
  } catch {
    return null;
  }
  return null;
}

function attachCacheMeta(payload, ageSec) {
  if (!payload?.data) return;
  const existing = payload.data.cache && typeof payload.data.cache === "object" ? payload.data.cache : {};
  payload.data.cache = {
    ...existing,
    hit: true,
    ageSec: typeof ageSec === "number" ? ageSec : null
  };
}

function hasItems(payload) {
  const items = payload?.data?.items || payload?.data?.data?.items || payload?.items || [];
  return Array.isArray(items) && items.length > 0;
}

function safeNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function quantile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * q);
  return safeNumber(sorted[index]);
}

function computeRsiLast(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return null;
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

function computeSeries(data) {
  const { closes, highs, lows, volumes } = data;
  const length = closes.length;
  const sma200 = new Array(length).fill(null);
  const vol20 = new Array(length).fill(null);
  const vol50 = new Array(length).fill(null);
  const dollarVol50 = new Array(length).fill(null);
  const bbwSeries = new Array(length).fill(null);
  const bbUpper = new Array(length).fill(null);
  const bbLower = new Array(length).fill(null);
  const bbPctB = new Array(length).fill(null);
  const atr14 = new Array(length).fill(null);
  const natr = new Array(length).fill(null);
  const tr = new Array(length).fill(null);

  let sum20 = 0;
  let sum20sq = 0;
  let sum50Close = 0;
  let sum200 = 0;
  let sum20Vol = 0;
  let sum50Vol = 0;
  let sum50Dollar = 0;
  let trSum14 = 0;

  for (let i = 0; i < length; i += 1) {
    const close = closes[i];
    const volume = volumes[i] ?? 0;
    sum20 += close;
    sum20sq += close * close;
    sum50Close += close;
    sum200 += close;
    sum20Vol += volume;
    sum50Vol += volume;
    sum50Dollar += volume * close;

    if (i >= 20) {
      const drop = closes[i - 20];
      sum20 -= drop;
      sum20sq -= drop * drop;
      sum20Vol -= volumes[i - 20] ?? 0;
    }
    if (i >= 50) {
      sum50Close -= closes[i - 50];
      sum50Vol -= volumes[i - 50] ?? 0;
      sum50Dollar -= (volumes[i - 50] ?? 0) * closes[i - 50];
    }
    if (i >= 200) {
      sum200 -= closes[i - 200];
    }

    if (i >= 19) {
      const mean = sum20 / 20;
      const variance = Math.max(0, sum20sq / 20 - mean * mean);
      const std = Math.sqrt(variance);
      const upper = mean + 2 * std;
      const lower = mean - 2 * std;
      bbUpper[i] = safeNumber(upper);
      bbLower[i] = safeNumber(lower);
      bbwSeries[i] = mean ? safeNumber((upper - lower) / mean) : null;
      bbPctB[i] = upper === lower ? null : safeNumber((close - lower) / (upper - lower));
      vol20[i] = safeNumber(sum20Vol / 20);
    }
    if (i >= 49) {
      vol50[i] = safeNumber(sum50Vol / 50);
      dollarVol50[i] = safeNumber(sum50Dollar / 50);
    }
    if (i >= 199) {
      sma200[i] = safeNumber(sum200 / 200);
    }

    if (i > 0) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      const trValue = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      tr[i] = safeNumber(trValue);
      trSum14 += trValue;
      if (i > 14) {
        const dropTr = tr[i - 14] ?? 0;
        trSum14 -= dropTr;
      }
      if (i >= 14) {
        const atrValue = trSum14 / 14;
        atr14[i] = safeNumber(atrValue);
        natr[i] = safeNumber(atrValue / close);
      }
    }
  }

  return { sma200, vol20, vol50, dollarVol50, bbwSeries, bbUpper, bbLower, bbPctB, atr14, natr, tr };
}

function computeRegimeFactor(spyData) {
  if (!spyData?.closes?.length) return 1;
  const series = computeSeries(spyData);
  const closes = spyData.closes;
  const natrSeries = series.natr.filter((value) => Number.isFinite(value));
  const natrWindow = natrSeries.slice(-252);
  if (natrWindow.length < 60) return 1;
  const mean = natrWindow.reduce((acc, v) => acc + v, 0) / natrWindow.length;
  const variance =
    natrWindow.reduce((acc, v) => acc + (v - mean) ** 2, 0) / natrWindow.length;
  const std = Math.sqrt(variance);
  const latestNatr = natrWindow[natrWindow.length - 1];
  const z = std === 0 ? 0 : (latestNatr - mean) / std;
  let regimeFactor = clamp(1 - 0.1 * z, 0.6, 1);

  const lastIndex = closes.length - 1;
  const sma200 = series.sma200[lastIndex];
  const sma200Prev = series.sma200[lastIndex - 1];
  const slope = sma200 !== null && sma200Prev !== null ? sma200 - sma200Prev : 0;
  const spyClose = closes[lastIndex];
  if (sma200 !== null && spyClose < sma200 && slope < 0) {
    regimeFactor = clamp(regimeFactor * 0.8, 0.6, 1);
  }
  return safeNumber(regimeFactor) ?? 1;
}

function applyTransition(prevState, candidate, setupScore) {
  if (!prevState || !STATE_TRANSITIONS[prevState]) return candidate;
  const allowed = STATE_TRANSITIONS[prevState];
  if (allowed.has(candidate)) return candidate;
  if (allowed.has(STATES.SETUP) && setupScore >= 25) return STATES.SETUP;
  if (allowed.has(STATES.IGNORE)) return STATES.IGNORE;
  return prevState;
}

function computeSymbol({
  symbol,
  data,
  universe,
  prevState,
  regimeFactor
}) {
  const missingFields = [];
  if (!data?.closes?.length) {
    return {
      symbol,
      date: null,
      state: STATES.IGNORE,
      score: 0,
      stageScores: { setup: 0, trigger: 0, confirm: 0 },
      signals: ["NO_DATA"],
      meta: {
        universe,
        regime_factor: regimeFactor,
        cooldown_days_left: null,
        data_quality: "NO_DATA"
      },
      metrics: {
        bbw: null,
        bbw_q20: null,
        natr: null,
        rvol: null,
        vol_dry: null,
        dist_sma200: null,
        breakout_level: null
      },
      debug: { missingFields: ["NO_DATA"], barsUsed: 0 }
    };
  }

  const { closes, highs, lows, opens, volumes, dates } = data;
  const lastIndex = closes.length - 1;
  const close = safeNumber(closes[lastIndex]);
  const open = safeNumber(opens[lastIndex]);
  const low = safeNumber(lows[lastIndex]);
  const high = safeNumber(highs[lastIndex]);
  const volume = safeNumber(volumes[lastIndex]);
  const barsUsed = closes.length;
  const date = dates[lastIndex] || null;

  const series = computeSeries(data);
  const sma200 = safeNumber(series.sma200[lastIndex]);
  const vol20 = safeNumber(series.vol20[lastIndex]);
  const vol50 = safeNumber(series.vol50[lastIndex]);
  const dollarVol50 = safeNumber(series.dollarVol50[lastIndex]);
  const bbw = safeNumber(series.bbwSeries[lastIndex]);
  const bbUpper = safeNumber(series.bbUpper[lastIndex]);
  const bbPctB = safeNumber(series.bbPctB[lastIndex]);
  const atr14 = safeNumber(series.atr14[lastIndex]);
  const natr = safeNumber(series.natr[lastIndex]);
  const trueRange = safeNumber(series.tr[lastIndex]);

  if (close === null) missingFields.push("close");
  if (sma200 === null) missingFields.push("sma200");
  if (bbw === null) missingFields.push("bbw");
  if (natr === null) missingFields.push("natr");
  if (vol20 === null) missingFields.push("vol20");
  if (vol50 === null) missingFields.push("vol50");
  if (atr14 === null) missingFields.push("atr14");

  const bbwWindow = series.bbwSeries.filter((value) => Number.isFinite(value)).slice(-252);
  const natrWindow = series.natr.filter((value) => Number.isFinite(value)).slice(-252);
  const bbw_q20 = bbwWindow.length >= 60 ? quantile(bbwWindow, 0.2) : null;
  const natr_q20 = natrWindow.length >= 60 ? quantile(natrWindow, 0.2) : null;

  const distSma200 =
    close !== null && sma200 !== null && close !== 0
      ? Math.abs(close - sma200) / close
      : null;
  const rvol = vol20 ? safeNumber(volume / vol20) : null;
  const volDry = vol50 ? safeNumber(volume / vol50) : null;

  const minPrice = DOW_SYMBOLS.has(symbol) ? 20 : 10;
  const minDollarVol50 = DOW_SYMBOLS.has(symbol) ? 100_000_000 : 50_000_000;
  const liquidityGate =
    close !== null &&
    dollarVol50 !== null &&
    close >= minPrice &&
    dollarVol50 >= minDollarVol50;

  let setupScore = 0;
  const setupSignals = [];
  if (bbw !== null && bbw_q20 !== null && bbw < bbw_q20) {
    setupScore += 20;
    setupSignals.push("BBW_COMPRESSION");
  }
  if (natr !== null && natr_q20 !== null && natr < natr_q20) {
    setupScore += 15;
    setupSignals.push("NATR_COMPRESSION");
  }
  if (volDry !== null && volDry < 0.6) {
    setupScore += 10;
    setupSignals.push("VOLUME_DRY");
  }
  if (close !== null && sma200 !== null && close > sma200) {
    setupScore += 5;
    setupSignals.push("ABOVE_SMA200");
  }

  if (!liquidityGate || (close !== null && sma200 !== null && close <= sma200)) {
    setupScore = 0;
    if (!liquidityGate) setupSignals.push("LIQUIDITY_FAIL");
  }

  const rsi14 = computeRsiLast(closes, 14);
  const setupGate =
    (rsi14 !== null && rsi14 < 35) ||
    (bbPctB !== null && bbPctB < 0.15) ||
    (distSma200 !== null && distSma200 <= 0.02);
  if (!setupGate) {
    setupScore = 0;
    setupSignals.push("NO_EXTREME_FOUND");
  }

  const lookback = Math.min(60, highs.length);
  const rangeHigh =
    lookback >= 20 ? Math.max(...highs.slice(highs.length - lookback)) : null;
  const distance =
    rangeHigh !== null && close !== null && close !== 0
      ? (rangeHigh - close) / close
      : null;
  const breakoutLevel = distance !== null && distance <= 0.1 ? rangeHigh : null;

  let triggerScore = 0;
  const triggerSignals = [];
  if (setupScore >= 25 && breakoutLevel !== null) {
    if (close !== null && close > breakoutLevel) {
      triggerScore += 12;
      triggerSignals.push("BREAKOUT_CLOSE");
    }
    if (rvol !== null && rvol > 2) {
      triggerScore += 10;
      triggerSignals.push("RVOL_SPIKE");
    } else if (rvol !== null && rvol > 1.5) {
      triggerScore += 5;
      triggerSignals.push("RVOL_RISE");
    }
    if (trueRange !== null && atr14 !== null && trueRange > 1.5 * atr14) {
      triggerScore += 8;
      triggerSignals.push("TRUE_RANGE_SPIKE");
    }
    if (bbUpper !== null && close !== null && close > bbUpper) {
      triggerScore += 5;
      triggerSignals.push("BB_UPPER_BREAK");
    }
  }

  let confirmScore = 0;
  const confirmSignals = [];
  let breakoutIndex = -1;
  if (triggerScore >= 15 && breakoutLevel !== null) {
    const start = Math.max(0, lastIndex - 15);
    for (let i = start; i <= lastIndex; i += 1) {
      if (closes[i] > breakoutLevel) breakoutIndex = i;
    }
  }

  if (breakoutIndex >= 0 && atr14 !== null) {
    const triggerClose = closes[breakoutIndex];
    let retestLow = lows[breakoutIndex];
    let retestIndex = breakoutIndex;
    for (let i = breakoutIndex + 1; i <= lastIndex; i += 1) {
      if (lows[i] < retestLow) {
        retestLow = lows[i];
        retestIndex = i;
      }
    }
    const pullbackAtr = (triggerClose - retestLow) / atr14;
    if (pullbackAtr < 1.5) {
      confirmScore += 8;
      confirmSignals.push("PULLBACK_ATR_OK");
    }
    const volWindow = volumes
      .slice(Math.max(0, lastIndex - 19), lastIndex + 1)
      .filter((value) => Number.isFinite(value));
    const medianVol20 = median(volWindow);
    const retestVol = volumes[retestIndex];
    if (
      medianVol20 !== null &&
      retestVol !== null &&
      retestVol >= 0.5 * medianVol20 &&
      retestVol <= 1.2 * medianVol20
    ) {
      confirmScore += 6;
      confirmSignals.push("RETEST_VOL_OK");
    }
    const daysSince = lastIndex - breakoutIndex;
    if (daysSince >= 3 && daysSince <= 10) {
      confirmScore += 6;
      confirmSignals.push("TIMING_3_10");
    } else if (daysSince > 10 && daysSince <= 15) {
      confirmScore += 2;
      confirmSignals.push("TIMING_10_15");
    }
  }

  let candidateState = STATES.IGNORE;
  if (setupScore >= 25) candidateState = STATES.SETUP;
  if (triggerScore >= 15) candidateState = STATES.TRIGGER;
  if (confirmScore >= 12) candidateState = STATES.CONFIRMED;

  const prev = prevState || {};
  let cooldownStart = prev.cooldownStart || null;
  let cooldownEntry = prev.cooldownEntry || null;
  let cooldownDaysLeft = null;
  const prevStateValue = prev.state || null;
  const breakoutLevelForCooldown = breakoutLevel ?? prev.breakoutLevel ?? null;

  if (prevStateValue === STATES.CONFIRMED || prevStateValue === STATES.COOLDOWN) {
    const idx = cooldownStart ? dates.lastIndexOf(cooldownStart) : -1;
    const daysSince = idx >= 0 ? lastIndex - idx : null;
    if (breakoutLevelForCooldown !== null && close !== null && close < breakoutLevelForCooldown) {
      candidateState = STATES.IGNORE;
      cooldownDaysLeft = 0;
      cooldownStart = null;
    } else if (cooldownEntry !== null && close !== null && close >= cooldownEntry * 1.2) {
      candidateState = setupScore >= 25 ? STATES.SETUP : STATES.IGNORE;
      cooldownDaysLeft = 0;
      cooldownStart = null;
    } else if (daysSince !== null && daysSince < 15) {
      candidateState = STATES.COOLDOWN;
      cooldownDaysLeft = 15 - daysSince;
    } else {
      candidateState = setupScore >= 25 ? STATES.SETUP : STATES.IGNORE;
      cooldownDaysLeft = 0;
      cooldownStart = null;
    }
  }

  candidateState = applyTransition(prevStateValue, candidateState, setupScore);
  if (candidateState === STATES.CONFIRMED) {
    cooldownStart = date;
    cooldownEntry = close;
    cooldownDaysLeft = 15;
  }
  if (candidateState === STATES.COOLDOWN && cooldownDaysLeft === null) {
    cooldownDaysLeft = 15;
  }

  const baseScore = setupScore + triggerScore + confirmScore;
  const score = safeNumber(Math.round(baseScore * regimeFactor)) ?? 0;
  const dataQuality = missingFields.length || barsUsed < 60 ? "PARTIAL" : "LIVE";

  return {
    symbol,
    date,
    state: candidateState,
    score: clamp(score, 0, 100),
    stageScores: { setup: setupScore, trigger: triggerScore, confirm: confirmScore },
    signals: [...setupSignals, ...triggerSignals, ...confirmSignals],
    meta: {
      universe,
      regime_factor: regimeFactor,
      cooldown_days_left: cooldownDaysLeft,
      cooldown_start: cooldownStart,
      cooldown_entry: cooldownEntry,
      data_quality: dataQuality
    },
    metrics: {
      bbw,
      bbw_q20,
      natr,
      rvol,
      vol_dry: volDry,
      dist_sma200: distSma200,
      breakout_level: breakoutLevel
    },
    debug: {
      barsUsed,
      missingFields
    }
  };
}

async function loadPrevStateMap(env) {
  const cached = await kvGetJson(env, LAST_GOOD_V1_KEY);
  const fallback = cached?.value ? null : await kvGetJson(env, LAST_GOOD_KEY);
  const items =
    cached?.value?.data?.data?.items ||
    cached?.value?.data?.items ||
    cached?.value?.items ||
    fallback?.value?.data?.data?.items ||
    fallback?.value?.data?.items ||
    fallback?.value?.items ||
    [];
  const map = new Map();
  if (Array.isArray(items)) {
    items.forEach((item) => {
      if (!item?.symbol) return;
      map.set(item.symbol, {
        state: item.state,
        cooldownStart: item?.meta?.cooldown_start || null,
        cooldownEntry: item?.meta?.cooldown_entry || null,
        breakoutLevel: item?.metrics?.breakout_level ?? null
      });
    });
  }
  return map;
}

async function fetchBreakoutEnergy(env, symbolParam, options = {}) {
  const budget = options.budget || null;
  const safeLimit = Number.isFinite(options.safeLimit) ? options.safeLimit : SAFE_LIMIT;
  const symbols = symbolParam
    ? [symbolParam]
    : US_TOP_100.map((item) => item.s).filter(Boolean);
  const limited = symbols.slice(0, safeLimit);
  const budgetLimited = symbols.length > safeLimit;
  const prevStateMap = await loadPrevStateMap(env);
  let budgetExceeded = false;
  let budgetError = null;

  const fetchDaily = async (symbol) => {
    try {
      return await fetchStooqDaily(
        symbol,
        env,
        budget ? budget.fetch.bind(budget) : undefined
      );
    } catch (error) {
      budgetExceeded = true;
      budgetError = error;
      return { ok: false, error: error?.code || "LIMIT_SUBREQUESTS", data: null, budgetError: error };
    }
  };

  const spyRes = await fetchDaily("SPY");
  if (spyRes?.budgetError) {
    budgetExceeded = true;
    budgetError = spyRes.budgetError;
  }
  const regimeFactor = spyRes.ok ? computeRegimeFactor(spyRes.data) : 1;

  const items = [];
  let liveCount = 0;
  let missingCount = 0;

  const batchSize = 5;
  for (let i = 0; i < limited.length; i += batchSize) {
    if (budgetExceeded) break;
    const batch = limited.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((symbol) => fetchDaily(symbol)));
    results.forEach((result, index) => {
      const symbol = batch[index];
      if (result?.budgetError) {
        budgetExceeded = true;
        budgetError = result.budgetError;
      }
      if (!result?.ok || !result?.data) {
        missingCount += 1;
        items.push(
          computeSymbol({
            symbol,
            data: null,
            universe: DOW_SYMBOLS.has(symbol) ? "dow" : "sp500",
            prevState: prevStateMap.get(symbol) || null,
            regimeFactor
          })
        );
        return;
      }
      const item = computeSymbol({
        symbol,
        data: result.data,
        universe: DOW_SYMBOLS.has(symbol) ? "dow" : "sp500",
        prevState: prevStateMap.get(symbol) || null,
        regimeFactor
      });
      if (item.meta?.data_quality === "LIVE") liveCount += 1;
      items.push(item);
    });
  }

  const hasData = items.length > 0;
  const partial = budgetLimited || missingCount > 0 || budgetExceeded;
  const dataQuality = budgetExceeded
    ? { status: "PARTIAL", reason: "LIMIT_SUBREQUESTS" }
    : resolveDataQuality({
        ok: hasData || budgetExceeded,
        isStale: false,
        partial,
        hasData
      });
  const reasons = [];
  if (budgetLimited) reasons.push("BUDGET_LIMIT");
  if (budgetExceeded) reasons.push("LIMIT_SUBREQUESTS");
  const budgetInfo = budget ? { used: budget.used, max: budget.max } : null;

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality,
    confidence: calculateConfidence(liveCount, items.length || 1),
    definitions: DEFINITIONS,
    reasons,
    data: {
      items,
      universe: symbolParam ? "custom" : "sp500",
      regime_factor: regimeFactor,
      universeSizeTotal: symbols.length,
      universeSizeProcessed: items.length,
      budget: budgetInfo
    }
  });

  if (!hasData && !budgetExceeded) {
    return {
      ok: false,
      data: payload,
      error: { code: "UPSTREAM_5XX", message: "No upstream data", details: {} }
    };
  }

  if (budgetExceeded) {
    const error = normalizeError(
      budgetError || {
        code: "LIMIT_SUBREQUESTS",
        message: "Budget exceeded",
        details: budgetInfo || {}
      }
    );
    return {
      ok: true,
      data: payload,
      error
    };
  }

  return { ok: true, data: payload };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const url = new URL(request.url);
  const symbolParam = url.searchParams.get("symbol");
  const forceLive = url.searchParams.get("forceLive") === "1";
  let symbol = null;
  if (symbolParam) {
    const normalized = symbolParam.trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,10}$/.test(normalized)) {
      const responsePayload = normalizeResponse(
        {
          ok: false,
          feature: FEATURE_ID,
          traceId,
          cache: { hit: false, ttl: 0, layer: "none" },
          upstream: { url: "", status: null, snippet: "" },
          data: {},
          error: {
            code: "BAD_REQUEST",
            message: "symbol parameter invalid",
            details: { symbol: symbolParam }
          }
        },
        { feature: FEATURE_ID }
      );
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return jsonResponse(responsePayload, { status: 200, cacheStatus: "ERROR" });
    }
    symbol = normalized;
  }

  const allowLive = Boolean(symbol) || forceLive;

  if (!allowLive) {
    const mirror = await loadMirrorPayload(env, request);
    if (mirror?.payload) {
      const mirrorPayload = mirror.payload;
      mirrorPayload.traceId = traceId;
      const mirrorItems = mirrorPayload?.data?.items || mirrorPayload?.data?.data?.items || [];
      const mirrorHasData = Array.isArray(mirrorItems) && mirrorItems.length > 0;
      const mirrorStatus = mirrorHasData ? "OK" : "PARTIAL";
      mirrorPayload.dataQuality = {
        ...(mirrorPayload.dataQuality || {}),
        status: mirrorStatus,
        reason: "MIRROR"
      };
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "mirror",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: mirrorPayload,
        cache: { hit: true, ttl: KV_TTL, layer: "mirror" },
        upstream: { url: "mirror", status: null, snippet: "" },
        isStale: false,
        freshness: "fresh",
        cacheStatus: "HIT",
        status: 200
      });
      const normalized = normalizeResponse(await response.clone().json(), { feature: FEATURE_ID });
      normalized.cacheStatus = "HIT";
      normalized.isStale = false;
      normalized.freshness = "fresh";
      return jsonResponse(normalized, { status: 200, cacheStatus: "HIT" });
    }
  }

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) return bindingResponse;

  if (!symbol) {
    const cached = await kvGetJson(env, LAST_GOOD_V1_KEY);
    const cachedPayload = cached?.value?.data || cached?.value || null;
    const ts = extractTimestamp(cached?.value || cachedPayload);
    const ageMs = ts ? Date.now() - ts : null;
    if (!forceLive && cachedPayload && typeof ageMs === "number" && ageMs <= LAST_GOOD_MAX_AGE_MS) {
      cachedPayload.traceId = traceId;
      cachedPayload.dataQuality =
        cachedPayload.dataQuality ||
        resolveDataQuality({
          ok: true,
          isStale: false,
          partial: false,
          hasData: hasItems(cachedPayload)
        });
      attachCacheMeta(cachedPayload, Math.round(ageMs / 1000));
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      const normalized = normalizeResponse(
        {
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cachedPayload,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: "stooq", status: null, snippet: "" }
        },
        { feature: FEATURE_ID }
      );
      normalized.cacheStatus = "HIT";
      return jsonResponse(normalized, { status: 200, cacheStatus: "HIT" });
    }
    if (!allowLive) {
      const lastGood = await kvGetJson(env, LAST_GOOD_V1_KEY);
      const lastGoodFallback = lastGood?.value ? null : await kvGetJson(env, LAST_GOOD_KEY);
      const lastGoodPayload = lastGood?.value?.data || lastGoodFallback?.value?.data || null;
      if (lastGoodPayload) {
        lastGoodPayload.traceId = traceId;
        lastGoodPayload.dataQuality =
          lastGoodPayload.dataQuality ||
          resolveDataQuality({
            ok: true,
            isStale: true,
            partial: false,
            hasData: hasItems(lastGoodPayload)
          });
        logServer({
          feature: FEATURE_ID,
          traceId,
          cacheLayer: "kv",
          upstreamStatus: null,
          durationMs: Date.now() - started
        });
        const normalized = normalizeResponse(
          {
            ok: true,
            feature: FEATURE_ID,
            traceId,
            data: lastGoodPayload,
            cache: { hit: true, ttl: KV_TTL, layer: "kv" },
            upstream: { url: "stooq", status: null, snippet: "" }
          },
          { feature: FEATURE_ID }
        );
        normalized.cacheStatus = "STALE";
        normalized.isStale = true;
        normalized.freshness = "stale";
        return jsonResponse(normalized, { status: 200, cacheStatus: "STALE" });
      }
    }
  }

  if (!allowLive) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: { items: [], universe: symbol ? "custom" : "sp500", regime_factor: null }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    const normalized = normalizeResponse(
      {
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: emptyPayload,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "mirror", status: null, snippet: "" }
      },
      { feature: FEATURE_ID }
    );
    normalized.cacheStatus = "ERROR";
    return jsonResponse(normalized, { status: 200, cacheStatus: "ERROR" });
  }

  const budget = new RequestBudget(REQUEST_BUDGET_MAX);
  const swr = forceLive
    ? (() => fetchBreakoutEnergy(env, symbol, { budget, safeLimit: SAFE_LIMIT })
        .then((live) => ({
          value: live?.data || live || null,
          cacheStatus: live?.ok ? "MISS" : "ERROR",
          isStale: false,
          ageSeconds: 0,
          error: live?.error || null
        })))()
    : await swrGetOrRefresh(context, {
        key: symbol ? `${CACHE_KEY}:${symbol}` : CACHE_KEY,
        ttlSeconds: KV_TTL,
        staleMaxSeconds: STALE_MAX,
        fetcher: () => fetchBreakoutEnergy(env, symbol, { budget, safeLimit: SAFE_LIMIT }),
        featureName: FEATURE_ID
      });

  const lastGood = await kvGetJson(env, LAST_GOOD_V1_KEY);
  const lastGoodFallback = lastGood?.value ? null : await kvGetJson(env, LAST_GOOD_KEY);
  const lastGoodPayload = lastGood?.value?.data || lastGoodFallback?.value?.data || null;

  let payload = swr.value?.data || swr.value || null;
  let cacheStatus = swr.cacheStatus;
  let isStale = swr.isStale;
  let upstreamStatus = swr.cacheStatus === "ERROR" ? null : 200;
  let error = swr.error || null;

  if (!forceLive && !payload && lastGoodPayload) {
    payload = lastGoodPayload;
    cacheStatus = "STALE";
    isStale = true;
    upstreamStatus = null;
    error = { code: "STALE_FALLBACK", message: "Using last good data", details: {} };
  }

  if (!payload) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: { items: [], universe: symbol ? "custom" : "sp500", regime_factor: null }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    const normalized = normalizeResponse(
      {
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: emptyPayload,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "stooq", status: null, snippet: "" },
        error: error || { code: "UPSTREAM_5XX", message: "No data", details: {} }
      },
      { feature: FEATURE_ID }
    );
    normalized.cacheStatus = "ERROR";
    return jsonResponse(normalized, { status: 200, cacheStatus: "ERROR" });
  }

  payload.traceId = traceId;
  payload.dataQuality = payload.dataQuality || resolveDataQuality({
    ok: true,
    isStale,
    partial: false,
    hasData: Boolean(payload?.data?.items?.length)
  });

  if (!isStale && hasItems(payload)) {
    await kvPutJson(
      env,
      LAST_GOOD_V1_KEY,
      { ts: new Date().toISOString(), data: payload },
      7 * 24 * 60 * 60
    );
  }

  const cacheHit = cacheStatus === "HIT" || cacheStatus === "STALE";
  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: cacheHit, ttl: KV_TTL, layer: cacheHit ? "kv" : "none" },
    upstream: { url: "stooq", status: upstreamStatus, snippet: "" },
    isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus,
    error: error || undefined,
    status: 200
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus,
    durationMs: Date.now() - started
  });

  const normalized = normalizeResponse(await response.clone().json(), { feature: FEATURE_ID });
  normalized.cacheStatus = cacheStatus;
  normalized.isStale = isStale;
  normalized.freshness = normalizeFreshness(swr.ageSeconds);
  const itemsCount = normalized?.data?.data?.items?.length || 0;
  if (itemsCount > 0 && normalized?.dataQuality) {
    const reason = normalized.dataQuality.reason || "";
    const status = normalized.dataQuality.status || "";
    if (reason === "NO_DATA") {
      normalized.dataQuality.reason = status === "PARTIAL" ? "PARTIAL_UNIVERSE" : "";
    }
    if (status === "PARTIAL" && !normalized.dataQuality.reason) {
      const reasons = normalized?.data?.reasons || normalized?.data?.data?.reasons || [];
      normalized.dataQuality.reason = Array.isArray(reasons) && reasons.includes("LIMIT_SUBREQUESTS")
        ? "LIMIT_SUBREQUESTS"
        : "PARTIAL_UNIVERSE";
    }
  }
  return jsonResponse(normalized, { status: 200, cacheStatus });
}
