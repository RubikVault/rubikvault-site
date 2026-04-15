import fs from 'node:fs';
import path from 'node:path';
import { countTradingDays } from './trading_date.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const EPOCH_PATH = path.join(ROOT, 'public/data/pipeline/epoch.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function readPipelineEpoch(repoRoot = ROOT) {
  const epochPath = path.join(repoRoot, 'public/data/pipeline/epoch.json');
  return readJson(epochPath);
}

export function canEvaluateOutcomeDate(repoRoot, outcomeDate, nowDate = new Date().toISOString().slice(0, 10)) {
  const normalizedOutcomeDate = normalizeDate(outcomeDate);
  const normalizedNowDate = normalizeDate(nowDate);
  if (!normalizedOutcomeDate || !normalizedNowDate) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (normalizedOutcomeDate < normalizedNowDate) {
    const ageTradingDays = countTradingDays(normalizedOutcomeDate, normalizedNowDate);
    if (ageTradingDays >= 3) {
      return { ok: true, reason: 'implicit_finality_age_gte_3t' };
    }
  }

  const epoch = readPipelineEpoch(repoRoot);
  if (!epoch) {
    return normalizedOutcomeDate === normalizedNowDate
      ? { ok: false, reason: 'missing_epoch_same_day' }
      : { ok: false, reason: 'missing_epoch' };
  }

  const targetMarketDate = normalizeDate(epoch.target_market_date);
  const marketAsOf = normalizeDate(epoch?.modules?.market_data_refresh?.as_of);
  const deltaAsOf = normalizeDate(epoch?.modules?.q1_delta_ingest?.as_of);
  if (!targetMarketDate || !marketAsOf || !deltaAsOf) {
    return { ok: false, reason: 'epoch_missing_price_modules' };
  }
  if (targetMarketDate < normalizedOutcomeDate) {
    return { ok: false, reason: 'epoch_target_before_outcome' };
  }
  if (marketAsOf < normalizedOutcomeDate || deltaAsOf < normalizedOutcomeDate) {
    return { ok: false, reason: 'epoch_price_modules_not_final' };
  }
  return { ok: true, reason: 'epoch_price_modules_final' };
}
