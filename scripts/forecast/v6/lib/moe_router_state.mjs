import path from 'node:path';
import { readJson, writeJsonAtomic } from './io.mjs';
import { sha256Json } from './hashing.mjs';
import { previousTradingDay } from './trading_date.mjs';

function statePath(repoRoot, dateStr) {
  return path.join(repoRoot, 'mirrors/forecast/ledgers/moe_state', `${dateStr}.json`);
}

export function readMoeState(repoRoot, dateStr) {
  return readJson(statePath(repoRoot, dateStr), null);
}

function decideHardExpert(softWeights) {
  const entries = Object.entries(softWeights || {});
  if (!entries.length) return 'NEUTRAL';
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0][0];
}

export function updateMoeState({
  repoRoot,
  asofDate,
  calendar,
  softWeights,
  confidence,
  policyHash,
  inputHashes,
  hysteresisPolicy
}) {
  const prevDate = previousTradingDay(asofDate, calendar);
  const prev = readMoeState(repoRoot, prevDate);

  const minConf = Number(hysteresisPolicy?.min_confidence_threshold ?? 0.6);
  const logged = decideHardExpert(softWeights);

  let loggedExpert = logged;
  if (confidence < minConf && prev?.logged_expert) {
    loggedExpert = prev.logged_expert;
  }

  const streak = prev?.logged_expert === loggedExpert ? Number(prev?.streak_trading_days || 0) + 1 : 1;

  const state = {
    asof_date: asofDate,
    logged_expert: loggedExpert,
    soft_weights: softWeights,
    confidence,
    streak_trading_days: streak,
    policy_hash: policyHash,
    input_hashes: inputHashes,
    state_hash: sha256Json({ asofDate, loggedExpert, softWeights, confidence, streak, inputHashes })
  };

  writeJsonAtomic(statePath(repoRoot, asofDate), state);
  return state;
}

export default {
  readMoeState,
  updateMoeState
};
