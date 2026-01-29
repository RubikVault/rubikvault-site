export const WARN_JUMP_PCT_DEFAULT = 20;
export const WARN_JUMP_PCT_MAX = 200;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeBars(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.bars)) return data.bars;
  if (data && Array.isArray(data.values)) return data.values;
  if (data && data.latest_bar) return [data.latest_bar];
  return [];
}

function clampNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveJumpThreshold(env) {
  const max = Math.max(1, clampNumber(env?.WARN_JUMP_PCT_MAX, WARN_JUMP_PCT_MAX));
  const base = clampNumber(env?.WARN_JUMP_PCT, clampNumber(env?.WARN_JUMP_PCT_DEFAULT, WARN_JUMP_PCT_DEFAULT));
  return Math.min(Math.max(1, base), max);
}

function makeReject(message) {
  const err = new Error(message);
  err.code = 'QUALITY_REJECT';
  return err;
}

export function hardReject(data) {
  const bars = normalizeBars(data);
  if (!bars.length) throw makeReject('Missing required bars');
  const today = isoToday();
  for (const bar of bars) {
    const date = typeof bar?.date === 'string' ? bar.date : null;
    if (!date) throw makeReject('Missing bar date');
    if (date > today) throw makeReject('Bar date is in the future');

    const open = toNumber(bar?.open);
    const high = toNumber(bar?.high);
    const low = toNumber(bar?.low);
    const close = toNumber(bar?.close);
    const volume = toNumber(bar?.volume);

    if (!Number.isFinite(open) || open <= 0) throw makeReject('Invalid open');
    if (!Number.isFinite(high) || high <= 0) throw makeReject('Invalid high');
    if (!Number.isFinite(low) || low <= 0) throw makeReject('Invalid low');
    if (!Number.isFinite(close) || close <= 0) throw makeReject('Invalid close');
    if (!Number.isFinite(volume) || volume < 0) throw makeReject('Invalid volume');
  }
}

export function softWarn(data, env) {
  const flags = [];
  const bars = normalizeBars(data);
  if (bars.length >= 2) {
    const prev = bars[bars.length - 2];
    const latest = bars[bars.length - 1];
    const prevClose = toNumber(prev?.close);
    const latestClose = toNumber(latest?.close);
    if (Number.isFinite(prevClose) && prevClose > 0 && Number.isFinite(latestClose)) {
      const changePct = Math.abs((latestClose - prevClose) / prevClose) * 100;
      const threshold = resolveJumpThreshold(env);
      if (changePct > threshold) {
        flags.push(`JUMP_GT_${Math.round(threshold)}PCT`);
      }
    }
  }

  const latest = bars[bars.length - 1];
  const latestVolume = toNumber(latest?.volume);
  if (latest && latestVolume === 0) {
    flags.push('ZERO_VOLUME_TRADING_DAY');
  }

  return flags;
}

export function evaluateQuality(data, env) {
  try {
    hardReject(data);
  } catch (error) {
    return {
      flags: [],
      reject: {
        code: error?.code || 'QUALITY_REJECT',
        message: error?.message || 'Quality gate rejected data'
      }
    };
  }

  return { flags: softWarn(data, env) };
}
