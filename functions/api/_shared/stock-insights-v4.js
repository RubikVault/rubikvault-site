const REASON_CODES = Object.freeze({
  OK: "OK",
  NO_DATA: "NO_DATA",
  INSUFFICIENT_BARS: "INSUFFICIENT_BARS",
  INVALID_OHLCV: "INVALID_OHLCV",
  NON_CHRONOLOGICAL_DATA: "NON_CHRONOLOGICAL_DATA",
  FUTURE_TIMESTAMP: "FUTURE_TIMESTAMP",
  DUPLICATE_BAR: "DUPLICATE_BAR",
  CORPORATE_ACTION_MISMATCH: "CORPORATE_ACTION_MISMATCH",
  MISSING_FORECAST_ENTRY: "MISSING_FORECAST_ENTRY",
  MISSING_SCIENTIFIC_ENTRY: "MISSING_SCIENTIFIC_ENTRY",
  MISSING_ELLIOTT_ENTRY: "MISSING_ELLIOTT_ENTRY",
  LOW_EVIDENCE: "LOW_EVIDENCE",
  DRIFT_YELLOW: "DRIFT_YELLOW",
  DRIFT_ORANGE: "DRIFT_ORANGE",
  DRIFT_RED: "DRIFT_RED",
  FALLBACK_ACTIVE: "FALLBACK_ACTIVE",
});

const HORIZON_SPECS = Object.freeze({
  "1d": { days: 1, threshold: 0.0 },
  "5d": { days: 5, threshold: 0.01 },
  "20d": { days: 20, threshold: 0.02 },
});

function toFinite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function adjustClose(bar) {
  const adj = toFinite(bar?.adjClose);
  if (adj != null && adj > 0) return adj;
  const close = toFinite(bar?.close);
  return close != null && close > 0 ? close : null;
}

function midpoint(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentile(arr, p) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))));
  return s[idx];
}

function bool(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

export function makeContractState(value, meta = {}) {
  const hasValue = value !== null && value !== undefined;
  const status = String(meta.status || (hasValue ? "ok" : "unavailable")).toLowerCase();
  const reason = String(meta.reason || (hasValue ? REASON_CODES.OK : REASON_CODES.NO_DATA)).trim();
  return {
    value: hasValue ? value : null,
    as_of: meta.as_of || null,
    source: String(meta.source || "unknown"),
    status,
    reason: reason || null,
  };
}

function validateRawOHLCV(bars) {
  if (!Array.isArray(bars) || bars.length < 2) {
    return {
      valid: false,
      code: REASON_CODES.INSUFFICIENT_BARS,
      checks: { bars: Array.isArray(bars) ? bars.length : 0, invalid_rows: 0 },
    };
  }

  const seenDates = new Set();
  let prevTs = null;
  let invalidRows = 0;
  const nowMs = Date.now() + 24 * 60 * 60 * 1000;
  let hasAdjWithoutBase = false;
  let hasBaseWithoutAdj = false;

  for (const bar of bars) {
    const date = String(bar?.date || "").trim();
    if (!date) {
      invalidRows += 1;
      continue;
    }
    if (seenDates.has(date)) {
      return {
        valid: false,
        code: REASON_CODES.DUPLICATE_BAR,
        checks: { bars: bars.length, invalid_rows: invalidRows + 1, duplicate_date: date },
      };
    }
    seenDates.add(date);

    const ts = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(ts)) {
      invalidRows += 1;
      continue;
    }
    if (ts > nowMs) {
      return {
        valid: false,
        code: REASON_CODES.FUTURE_TIMESTAMP,
        checks: { bars: bars.length, invalid_rows: invalidRows, future_date: date },
      };
    }
    if (prevTs != null && ts <= prevTs) {
      return {
        valid: false,
        code: REASON_CODES.NON_CHRONOLOGICAL_DATA,
        checks: { bars: bars.length, invalid_rows: invalidRows, failing_date: date },
      };
    }
    prevTs = ts;

    const open = toFinite(bar?.open);
    const high = toFinite(bar?.high);
    const low = toFinite(bar?.low);
    const close = toFinite(bar?.close);
    const adj = toFinite(bar?.adjClose);
    if ([open, high, low, close].some((v) => v == null || v <= 0)) {
      invalidRows += 1;
      continue;
    }
    if (!(low <= open && low <= close && high >= open && high >= close && high >= low)) {
      return {
        valid: false,
        code: REASON_CODES.INVALID_OHLCV,
        checks: { bars: bars.length, invalid_rows: invalidRows + 1, failing_date: date },
      };
    }
    if (adj != null && adj > 0) hasAdjWithoutBase = true;
    if (adj == null && close != null && close > 0) hasBaseWithoutAdj = true;
  }

  if (invalidRows > 0) {
    return {
      valid: false,
      code: REASON_CODES.INVALID_OHLCV,
      checks: { bars: bars.length, invalid_rows: invalidRows },
    };
  }

  if (hasAdjWithoutBase && hasBaseWithoutAdj) {
    return {
      valid: false,
      code: REASON_CODES.CORPORATE_ACTION_MISMATCH,
      checks: { bars: bars.length, invalid_rows: 0 },
    };
  }

  return {
    valid: true,
    code: REASON_CODES.OK,
    checks: { bars: bars.length, invalid_rows: 0 },
  };
}

function buildOutcomeLabels(bars) {
  const out = {};
  const latestDate = bars?.[bars.length - 1]?.date || null;
  for (const [horizon, spec] of Object.entries(HORIZON_SPECS)) {
    const needed = spec.days + 1;
    if (!Array.isArray(bars) || bars.length < needed + 1) {
      out[horizon] = makeContractState(null, {
        as_of: latestDate,
        source: "bars.adjusted",
        status: "unavailable",
        reason: REASON_CODES.INSUFFICIENT_BARS,
      });
      continue;
    }

    const entryIdx = bars.length - needed;
    const entryBar = bars[entryIdx];
    const exitBar = bars[bars.length - 1];
    const entry = toFinite(entryBar?.open) || adjustClose(entryBar);
    const exit = adjustClose(exitBar);
    if (entry == null || exit == null || entry <= 0) {
      out[horizon] = makeContractState(null, {
        as_of: latestDate,
        source: "bars.adjusted",
        status: "unavailable",
        reason: REASON_CODES.INVALID_OHLCV,
      });
      continue;
    }
    const grossReturn = exit / entry - 1;
    let label = "NEUTRAL";
    if (grossReturn > spec.threshold) label = "BULLISH";
    else if (grossReturn < -spec.threshold) label = "BEARISH";
    out[horizon] = makeContractState(
      {
        label,
        gross_return: Number(grossReturn.toFixed(6)),
        threshold: spec.threshold,
        entry_date: entryBar?.date || null,
        exit_date: exitBar?.date || null,
        entry_price: Number(entry.toFixed(6)),
        exit_price: Number(exit.toFixed(6)),
      },
      {
        as_of: latestDate,
        source: "bars.adjusted",
        status: "ok",
        reason: REASON_CODES.OK,
      }
    );
  }
  return out;
}

function buildMaeMfeSummary(bars, horizonDays = 20) {
  if (!Array.isArray(bars) || bars.length < horizonDays + 10) {
    return {
      sample_count: 0,
      mae_median: null,
      mfe_median: null,
      mae_p90: null,
      mfe_p90: null,
      time_to_mae_median: null,
      time_to_mfe_median: null,
      resolution_median: null,
      trigger_score_adjustment: 0,
    };
  }
  const maes = [];
  const mfes = [];
  const tMae = [];
  const tMfe = [];
  const tResolve = [];
  for (let i = 0; i + horizonDays < bars.length; i += 1) {
    const entry = adjustClose(bars[i]);
    if (entry == null || entry <= 0) continue;
    let mae = Number.POSITIVE_INFINITY;
    let mfe = Number.NEGATIVE_INFINITY;
    let maeDay = 0;
    let mfeDay = 0;
    let resolved = 0;
    for (let j = 1; j <= horizonDays; j += 1) {
      const px = adjustClose(bars[i + j]);
      if (px == null) continue;
      const r = px / entry - 1;
      if (r < mae) {
        mae = r;
        maeDay = j;
      }
      if (r > mfe) {
        mfe = r;
        mfeDay = j;
      }
      if (!resolved && Math.abs(r) >= 0.01) resolved = j;
    }
    if (!Number.isFinite(mae) || !Number.isFinite(mfe)) continue;
    maes.push(mae);
    mfes.push(mfe);
    tMae.push(maeDay);
    tMfe.push(mfeDay);
    if (resolved) tResolve.push(resolved);
  }

  const maeMedian = midpoint(maes);
  const mfeMedian = midpoint(mfes);
  const maeP90 = percentile(maes, 0.9);
  const mfeP90 = percentile(mfes, 0.9);
  let adj = 0;
  if (maeP90 != null && maeP90 < -0.12) adj -= 20;
  else if (maeP90 != null && maeP90 < -0.08) adj -= 12;
  if (mfeMedian != null && mfeMedian > 0.06) adj += 8;
  if (mfeMedian != null && mfeMedian < 0.02) adj -= 8;
  return {
    sample_count: maes.length,
    mae_median: maeMedian != null ? Number(maeMedian.toFixed(6)) : null,
    mfe_median: mfeMedian != null ? Number(mfeMedian.toFixed(6)) : null,
    mae_p90: maeP90 != null ? Number(maeP90.toFixed(6)) : null,
    mfe_p90: mfeP90 != null ? Number(mfeP90.toFixed(6)) : null,
    time_to_mae_median: midpoint(tMae),
    time_to_mfe_median: midpoint(tMfe),
    resolution_median: midpoint(tResolve),
    trigger_score_adjustment: adj,
  };
}

function evidenceState(samples, display, weighted, strong) {
  if (samples < display) return "DISABLED_INSUFFICIENT_DATA";
  if (samples < weighted) return "LOW_EVIDENCE";
  if (samples < strong) return "MODERATE_EVIDENCE";
  return "STRONG_EVIDENCE";
}

function buildScientificEligibility(scientific, bars, maeMfeSummary) {
  const patternSamples = Math.max(0, toFinite(scientific?.metadata?.sample_count) || bars.length || 0);
  const setupSamples = Math.max(0, toFinite(scientific?.setup?.sample_count) || Math.floor(patternSamples * 0.7));
  const triggerSamples = Math.max(0, toFinite(scientific?.trigger?.sample_count) || Math.floor(patternSamples * 0.6));

  let patternState = evidenceState(patternSamples, 30, 50, 100);
  let setupState = evidenceState(setupSamples, 25, 50, 100);
  let triggerState = evidenceState(triggerSamples, 20, 40, 80);
  const reasons = [];

  const maeBad = maeMfeSummary.mae_p90 != null && maeMfeSummary.mae_p90 < -0.12;
  const mfeWeak = maeMfeSummary.mfe_median != null && maeMfeSummary.mfe_median < 0.015;
  if (maeBad && mfeWeak) {
    triggerState = "DISABLED_NEGATIVE_EDGE";
    reasons.push("NEGATIVE_EDGE_MAE_MFE");
  }

  return {
    pattern: { samples: patternSamples, state: patternState },
    setup: { samples: setupSamples, state: setupState },
    trigger: { samples: triggerSamples, state: triggerState },
    reasons,
  };
}

function buildTimeframeConfluence(forecast, stats = {}, universe = {}) {
  const horizons = forecast?.horizons || {};
  const short = horizons?.["1d"]?.direction || null;
  const mid = horizons?.["5d"]?.direction || null;
  const long = horizons?.["20d"]?.direction || null;
  const vals = [short, mid, long].filter(Boolean);
  let status = "MIXED";
  if (vals.length === 3 && short === mid && mid === long) status = "HIGH_ALIGNMENT";
  else if (
    (short && mid && short === mid) ||
    (short && long && short === long) ||
    (mid && long && mid === long)
  ) status = "MODERATE_ALIGNMENT";

  const volPct = toFinite(stats?.volatility_percentile);
  const isBiotech = String(universe?.sector || "").toLowerCase().includes("biotech");
  if (isBiotech && volPct != null && volPct > 95) status = "NOISY";

  return { status, short: short || "N/A", mid: mid || "N/A", long: long || "N/A" };
}

function buildDriftState(forecastMeta = {}, forecastState = null) {
  const directional = toFinite(forecastMeta?.accuracy?.directional);
  const brier = toFinite(forecastMeta?.accuracy?.brier);
  let tier = "GREEN";
  let reason = REASON_CODES.OK;
  if (forecastState?.status !== "ok") {
    tier = "YELLOW";
    reason = REASON_CODES.MISSING_FORECAST_ENTRY;
  }
  if (directional != null && directional < 0.52) {
    tier = "YELLOW";
    reason = REASON_CODES.DRIFT_YELLOW;
  }
  if (directional != null && directional < 0.49) {
    tier = "ORANGE";
    reason = REASON_CODES.DRIFT_ORANGE;
  }
  if ((directional != null && directional < 0.46) || (brier != null && brier > 0.30)) {
    tier = "RED";
    reason = REASON_CODES.DRIFT_RED;
  }
  return {
    tier,
    reason,
    directional_accuracy: directional,
    brier,
  };
}

function scoreFromStats(stats = {}, close = null, scientific = null, maeMfe = null) {
  const sma20 = toFinite(stats?.sma20);
  const sma50 = toFinite(stats?.sma50);
  const sma200 = toFinite(stats?.sma200);
  const rsi = toFinite(stats?.rsi14);
  const macdHist = toFinite(stats?.macd_hist);
  const volPct = toFinite(stats?.volatility_percentile);

  let trend = 50;
  if (close != null && sma50 != null && sma200 != null) {
    if (close > sma50 && sma50 > sma200) trend = 72;
    else if (close < sma50 && sma50 < sma200) trend = 32;
    else trend = 50;
  }

  let entry = 50;
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 65) entry += 8;
    if (rsi > 75) entry -= 10;
    if (rsi < 25) entry += 4;
  }
  if (macdHist != null) entry += macdHist > 0 ? 8 : -8;
  if (close != null && sma20 != null) entry += close > sma20 ? 6 : -6;
  if (maeMfe?.trigger_score_adjustment) entry += maeMfe.trigger_score_adjustment * 0.4;

  let risk = 60;
  if (volPct != null) {
    if (volPct > 90) risk = 35;
    else if (volPct > 75) risk = 45;
    else if (volPct < 35) risk = 70;
  }

  let context = 50;
  const setupScore = toFinite(scientific?.setup?.score);
  const triggerScore = toFinite(scientific?.trigger?.score);
  if (setupScore != null) context += (setupScore - 50) * 0.3;
  if (triggerScore != null) context += (triggerScore - 50) * 0.2;

  return {
    trend: Math.max(0, Math.min(100, Math.round(trend))),
    entry: Math.max(0, Math.min(100, Math.round(entry))),
    risk: Math.max(0, Math.min(100, Math.round(risk))),
    context: Math.max(0, Math.min(100, Math.round(context))),
  };
}

function buildFallbackState({
  rawValidation,
  driftState,
  forecastState,
  close,
  stats,
  scientific,
  maeMfe,
}) {
  const scores = scoreFromStats(stats, close, scientific, maeMfe);
  const hardBlocked = !rawValidation.valid;
  const driftBlocked = driftState.tier === "RED";
  const missingForecast = forecastState.status !== "ok";
  const active = hardBlocked || driftBlocked || missingForecast;

  let verdict = "WAIT";
  if (scores.trend >= 68 && scores.entry >= 60 && scores.risk >= 45 && scores.context >= 55) verdict = "BUY";
  else if (scores.trend <= 35 && scores.entry <= 40 && scores.risk <= 45) verdict = "SELL";

  return {
    active,
    verdict,
    confidence: active ? "MEDIUM" : "LOW",
    max_confidence: "MEDIUM",
    reason: active
      ? hardBlocked
        ? rawValidation.code
        : driftBlocked
          ? REASON_CODES.DRIFT_RED
          : REASON_CODES.FALLBACK_ACTIVE
      : REASON_CODES.OK,
    scores,
  };
}

function buildDecisionTrace({
  ticker,
  asOf,
  rawValidation,
  driftState,
  confluence,
  fallback,
  scientificEligibility,
  featureStates,
  outcomes,
}) {
  const gates = [];
  if (!rawValidation.valid) gates.push(rawValidation.code);
  if (driftState.tier !== "GREEN") gates.push(driftState.reason);
  if (scientificEligibility.trigger.state.startsWith("DISABLED")) gates.push("SCIENTIFIC_TRIGGER_DISABLED");
  if (featureStates.forecast.status !== "ok") gates.push("FORECAST_UNAVAILABLE");
  const reasonChain = [
    `RAW=${rawValidation.code}`,
    `DRIFT=${driftState.tier}`,
    `CONFLUENCE=${confluence.status}`,
    `FALLBACK=${fallback.active ? "ON" : "OFF"}`,
  ];
  return {
    ticker,
    as_of: asOf,
    integrity: rawValidation.valid ? "clean" : "suppressed",
    gates_fired: gates,
    scores: fallback.scores,
    fallback_active: fallback.active,
    reason_chain: reasonChain,
    outcomes: {
      "1d": outcomes?.["1d"]?.value?.label || null,
      "5d": outcomes?.["5d"]?.value?.label || null,
      "20d": outcomes?.["20d"]?.value?.label || null,
    },
  };
}

function summarizeStatus(states) {
  const vals = Object.values(states || {});
  if (!vals.length) return "unavailable";
  if (vals.some((s) => s?.status === "blocked" || s?.status === "suppressed")) return "blocked";
  if (vals.every((s) => s?.status === "ok")) return "ok";
  if (vals.some((s) => s?.status === "stale")) return "stale";
  if (vals.some((s) => s?.status === "unavailable")) return "partial";
  return "partial";
}

export function buildStockInsightsV4Evaluation({
  ticker,
  bars = [],
  stats = {},
  universe = {},
  scientificState,
  forecastState,
  elliottState,
  forecastMeta = null,
}) {
  const safeBars = Array.isArray(bars) ? bars : [];
  const asOf = safeBars[safeBars.length - 1]?.date || scientificState?.as_of || forecastState?.as_of || elliottState?.as_of || null;
  const close = adjustClose(safeBars[safeBars.length - 1]);
  const rawValidation = validateRawOHLCV(safeBars);
  const outcomes = buildOutcomeLabels(safeBars);
  const maeMfe = buildMaeMfeSummary(safeBars, 20);
  const scientificEligibility = buildScientificEligibility(scientificState?.value, safeBars, maeMfe);
  const confluence = buildTimeframeConfluence(forecastState?.value, stats, universe);
  const driftState = buildDriftState(forecastMeta, forecastState);
  const fallback = buildFallbackState({
    rawValidation,
    driftState,
    forecastState,
    close,
    stats,
    scientific: scientificState?.value,
    maeMfe,
  });
  const trace = buildDecisionTrace({
    ticker,
    asOf,
    rawValidation,
    driftState,
    confluence,
    fallback,
    scientificEligibility,
    featureStates: { scientific: scientificState, forecast: forecastState, elliott: elliottState },
    outcomes,
  });

  const v4Contract = {
    scientific: scientificState,
    forecast: forecastState,
    elliott: elliottState,
    raw_validation: makeContractState(rawValidation, {
      as_of: asOf,
      source: "bars.raw_validation",
      status: rawValidation.valid ? "ok" : "suppressed",
      reason: rawValidation.code,
    }),
    outcome_labels: makeContractState(
      {
        "1d": outcomes?.["1d"]?.value || null,
        "5d": outcomes?.["5d"]?.value || null,
        "20d": outcomes?.["20d"]?.value || null,
      },
      {
        as_of: asOf,
        source: "bars.adjusted.outcomes",
        status: rawValidation.valid ? "ok" : "suppressed",
        reason: rawValidation.valid ? REASON_CODES.OK : rawValidation.code,
      }
    ),
    scientific_eligibility: makeContractState(scientificEligibility, {
      as_of: asOf,
      source: "scientific.evidence",
      status: "ok",
      reason: scientificEligibility.reasons[0] || REASON_CODES.OK,
    }),
    context_setup_trigger: makeContractState(
      {
        context: { score: fallback.scores.context, drivers: [] },
        setup: {
          score: toFinite(scientificState?.value?.setup?.score) ?? null,
          drivers: Array.isArray(scientificState?.value?.setup?.proof_points)
            ? scientificState.value.setup.proof_points.slice(0, 6)
            : [],
        },
        trigger: {
          score: Math.max(0, Math.min(100, (toFinite(scientificState?.value?.trigger?.score) ?? 50) + maeMfe.trigger_score_adjustment)),
          drivers: Array.isArray(scientificState?.value?.trigger?.proof_points)
            ? scientificState.value.trigger.proof_points.slice(0, 6)
            : [],
        },
      },
      {
        as_of: asOf,
        source: "stock-insights-v4.context-setup-trigger",
        status: "ok",
        reason: REASON_CODES.OK,
      }
    ),
    fallback_state: makeContractState(fallback, {
      as_of: asOf,
      source: "stock-insights-v4.fallback",
      status: fallback.active ? "blocked" : "ok",
      reason: fallback.reason,
    }),
    timeframe_confluence: makeContractState(confluence, {
      as_of: asOf,
      source: "stock-insights-v4.confluence",
      status: "ok",
      reason: REASON_CODES.OK,
    }),
    drift_state: makeContractState(driftState, {
      as_of: asOf,
      source: "stock-insights-v4.drift",
      status: driftState.tier === "RED" ? "blocked" : "ok",
      reason: driftState.reason,
    }),
    mae_mfe_summary: makeContractState(maeMfe, {
      as_of: asOf,
      source: "bars.adjusted.mae-mfe",
      status: maeMfe.sample_count > 0 ? "ok" : "unavailable",
      reason: maeMfe.sample_count > 0 ? REASON_CODES.OK : REASON_CODES.INSUFFICIENT_BARS,
    }),
    decision_trace: makeContractState(trace, {
      as_of: asOf,
      source: "stock-insights-v4.decision-trace",
      status: "ok",
      reason: REASON_CODES.OK,
    }),
  };

  return {
    ticker,
    schema_version: "rv.stock-insights.v4",
    generated_at: new Date().toISOString(),
    status: summarizeStatus(v4Contract),
    reason_codes: REASON_CODES,
    label_spec: {
      entry_reference: "next_regular_session_open_after_prediction_timestamp",
      exit_reference: "close_after_horizon_trading_days",
      thresholds: {
        "1d": HORIZON_SPECS["1d"].threshold,
        "5d": HORIZON_SPECS["5d"].threshold,
        "20d": HORIZON_SPECS["20d"].threshold,
      },
      adjusted_policy: "adjusted_only",
    },
    feature_states: v4Contract,
    v4_contract: v4Contract,
    scientific: scientificState?.value || null,
    forecast: forecastState?.value || null,
    elliott: elliottState?.value || null,
    forecast_meta: forecastMeta || null,
    evaluation_v4: {
      fallback_active: fallback.active,
      fallback_reason: fallback.reason,
      confluence: confluence.status,
      drift_tier: driftState.tier,
      verdict: fallback.verdict,
      confidence: fallback.confidence,
    },
  };
}

export function isV4FlagEnabled(value) {
  return bool(value);
}

export { REASON_CODES };
