import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic, pathExists, toFinite } from './common.mjs';

function emptyState(day) {
  return {
    schema: 'rv_universe_v7_budget_state_v1',
    day,
    daily_calls: 0,
    history: [],
    last_updated_at: nowIso(),
    kill_switch: null
  };
}

export async function loadBudgetState(filePath) {
  const day = nowIso().slice(0, 10);
  if (!(await pathExists(filePath))) {
    const state = emptyState(day);
    await writeJsonAtomic(filePath, state);
    return state;
  }

  const state = await readJson(filePath).catch(() => emptyState(day));
  if (state.day !== day) {
    const rolled = {
      ...state,
      history: [
        ...(Array.isArray(state.history) ? state.history : []),
        { day: state.day, daily_calls: toFinite(state.daily_calls, 0), rolled_at: nowIso() }
      ].slice(-90),
      day,
      daily_calls: 0,
      kill_switch: null,
      last_updated_at: nowIso()
    };
    await writeJsonAtomic(filePath, rolled);
    return rolled;
  }

  return state;
}

export async function bumpDailyCalls(filePath, delta) {
  const state = await loadBudgetState(filePath);
  const next = {
    ...state,
    daily_calls: Math.max(0, toFinite(state.daily_calls, 0) + Math.max(0, toFinite(delta, 0))),
    last_updated_at: nowIso()
  };
  await writeJsonAtomic(filePath, next);
  return next;
}

function rollingAverage(values) {
  if (!values.length) return 0;
  return values.reduce((acc, x) => acc + x, 0) / values.length;
}

export function evaluateBudgetKillSwitch({ state, config, runStats }) {
  const history = Array.isArray(state.history) ? state.history : [];
  const recent = history.slice(-7).map((row) => toFinite(row.daily_calls, 0));
  const avg7 = rollingAverage(recent.length ? recent : [toFinite(state.daily_calls, 0)]);

  const trendBaseCalls = recent.length >= 2 ? recent[0] : 0;
  const slopePct = recent.length >= 2
    ? ((recent[recent.length - 1] - recent[0]) / Math.max(100, trendBaseCalls)) * 100
    : 0;

  const dailyCap = toFinite(config?.budget?.daily_cap_calls, 0);
  const runCalls = toFinite(runStats?.run_calls, 0);
  const ingestibleGain = toFinite(runStats?.ingestible_gain_ratio, 0);
  const eligibleGain = toFinite(runStats?.eligible_gain_ratio, 0);
  const deadRatio = toFinite(runStats?.dead_calls_ratio, 0);

  const kills = [];
  const switches = config?.budget?.kill_switches || {};

  if (switches?.trend_kill?.enabled) {
    const threshold = toFinite(switches.trend_kill.slope_pct_threshold, 0);
    const minHistoryDays = Math.max(2, Math.floor(toFinite(switches.trend_kill.min_history_days, 3)));
    const minBaselineCalls = Math.max(0, toFinite(switches.trend_kill.min_baseline_calls, 100));
    const trendEligible = recent.length >= minHistoryDays && trendBaseCalls >= minBaselineCalls;
    if (trendEligible && slopePct > threshold) {
      kills.push({
        type: 'trend_kill',
        slope_pct: Number(slopePct.toFixed(4)),
        threshold
      });
    }
  }

  if (switches?.burst_kill?.enabled && dailyCap > 0) {
    const runCapRatio = runCalls / dailyCap;
    const capThreshold = toFinite(switches.burst_kill.run_calls_cap_ratio_threshold, 1);
    const minIngest = toFinite(switches.burst_kill.min_ingestible_gain_ratio, 0);
    const minEligible = toFinite(switches.burst_kill.min_eligible_gain_ratio, 0);
    if (runCapRatio > capThreshold && ingestibleGain < minIngest && eligibleGain < minEligible) {
      kills.push({
        type: 'burst_kill',
        run_calls_ratio: Number(runCapRatio.toFixed(4)),
        threshold: capThreshold,
        ingestible_gain_ratio: ingestibleGain,
        eligible_gain_ratio: eligibleGain
      });
    }
  }

  if (switches?.waste_kill?.enabled) {
    const threshold = toFinite(switches.waste_kill.dead_calls_ratio_threshold, 1);
    if (deadRatio > threshold) {
      kills.push({
        type: 'waste_kill',
        dead_calls_ratio: Number(deadRatio.toFixed(4)),
        threshold
      });
    }
  }

  return {
    avg7_calls: Number(avg7.toFixed(2)),
    slope7_pct: Number(slopePct.toFixed(2)),
    kills
  };
}
