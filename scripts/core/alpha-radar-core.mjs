export const SCHEMA_VERSION = "rv-mirror-v1";

function normalizeBool(value) {
  return value === true;
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizePick(pick = {}) {
  const reasons = Array.isArray(pick.reasons) ? pick.reasons : [];
  const setup = pick.setup && typeof pick.setup === "object" && !Array.isArray(pick.setup) ? pick.setup : {};
  const trigger = pick.trigger && typeof pick.trigger === "object" && !Array.isArray(pick.trigger) ? pick.trigger : {};
  const tags = Array.isArray(pick.tags)
    ? pick.tags
    : pick.state
      ? [String(pick.state)]
      : [];
  const notes = pick.notes ?? pick.note ?? null;
  const symbol = pick.symbol ?? null;
  const name = pick.name ?? symbol ?? null;
  const totalScore = parseNumber(pick.totalScore ?? pick.score);
  // CRITICAL FIX: Only derive setupScore/triggerScore if they are NOT already present
  // If they are already calculated (from alphaScore), use them directly
  let setupScore = parseNumber(pick.setupScore);
  let triggerScore = parseNumber(pick.triggerScore);
  // Only derive if both are missing AND totalScore exists
  if (setupScore === null && triggerScore === null && totalScore !== null) {
    setupScore = Math.min(40, Math.round(totalScore * 0.4));
    triggerScore = Math.max(0, Math.round(totalScore - setupScore));
  } else if (setupScore === null && totalScore !== null) {
    // If only setupScore is missing, derive it but keep triggerScore
    setupScore = Math.min(40, Math.round(totalScore * 0.4));
    if (triggerScore === null) {
      triggerScore = Math.max(0, Math.round(totalScore - setupScore));
    }
  } else if (triggerScore === null && totalScore !== null && setupScore !== null) {
    // If only triggerScore is missing, derive it from totalScore - setupScore
    triggerScore = Math.max(0, Math.round(totalScore - setupScore));
  }

  return {
    symbol,
    name,
    close: parseNumber(pick.close),
    changePct: parseNumber(pick.changePct ?? pick.changePercent),
    stop: parseNumber(pick.stop),
    setupScore,
    triggerScore,
    totalScore,
    setup: {
      rsiExtreme: normalizeBool(setup.rsiExtreme || reasons.some((r) => /^RSI_/.test(r))),
      bbExtreme: normalizeBool(setup.bbExtreme || reasons.some((r) => /^BBPCTB_/.test(r))),
      nearSma200: normalizeBool(setup.nearSma200 || reasons.some((r) => /^NEAR_SMA200/.test(r))),
      rvolGte15: normalizeBool(setup.rvolGte15 || reasons.includes("RVOL_GE_15")),
      extremeGate: normalizeBool(setup.extremeGate || reasons.includes("EXTREME_GATE"))
    },
    trigger: {
      ema21Reclaim: normalizeBool(trigger.ema21Reclaim || reasons.includes("EMA21_RECLAIM")),
      higherLowFt: normalizeBool(trigger.higherLowFt || reasons.includes("HIGHER_LOW_FT")),
      bosBreak: normalizeBool(trigger.bosBreak || reasons.includes("BOS_BREAK")),
      volumeConfirm: normalizeBool(trigger.volumeConfirm || reasons.includes("VOL_CONFIRM_12x")),
      rsiUpturn: normalizeBool(trigger.rsiUpturn || reasons.includes("RSI_UPTURN"))
    },
    tags,
    notes
  };
}

export function computeAlphaRadarPicks(input = {}) {
  if (input.picks && typeof input.picks === "object") {
    const picks = input.picks;
    return {
      top: Array.isArray(picks.top) ? picks.top.map(normalizePick) : [],
      shortterm: Array.isArray(picks.shortterm) ? picks.shortterm.map(normalizePick) : [],
      longterm: Array.isArray(picks.longterm) ? picks.longterm.map(normalizePick) : []
    };
  }

  const itemsAlpha = Array.isArray(input.itemsAlpha)
    ? input.itemsAlpha
    : Array.isArray(input.candidates)
      ? input.candidates
      : [];
  if (!itemsAlpha.length) {
    return { top: [], shortterm: [], longterm: [] };
  }
  const sorted = [...itemsAlpha].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = sorted.slice(0, 3).map(normalizePick);
  const shortterm = sorted.slice(0, 3).map(normalizePick);
  const longterm = sorted.slice(3, 6).map(normalizePick);
  return { top, shortterm, longterm };
}
