#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { computeScoresForStats } from '../scripts/providers/market-score-v3.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function loadFixture() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'market-stats-latest.sample.json'), 'utf-8')
  );
}

function assertScore(score) {
  ['score_short', 'score_mid', 'score_long'].forEach((field) => {
    assert(typeof score[field] === 'number', `${field} missing`);
    assert(score[field] >= 0 && score[field] <= 100, `${field} out of range`);
  });
  assert(typeof score.confidence === 'number', 'confidence missing');
  assert(score.confidence >= 0 && score.confidence <= 1, 'confidence out of bounds');
  ['short', 'mid', 'long'].forEach((horizon) => {
    assert(Array.isArray(score.reasons_top?.[horizon]), `reasons_top.${horizon} not array`);
  });
}

async function main() {
  const fixture = loadFixture();
  const statsEntry = fixture.data[0];
  const score = computeScoresForStats('SPY', statsEntry);
  assertScore(score);
  console.log('✅ deterministic scoring for full data');

  const partialStats = JSON.parse(JSON.stringify(statsEntry));
  delete partialStats.stats.distance_to_sma_20;
  delete partialStats.stats.rsi_14;
  const degraded = computeScoresForStats('SPY', partialStats);
  assert(degraded.confidence < score.confidence, 'confidence should drop when inputs missing');
  console.log('✅ missing inputs lower confidence');

  console.log('✅ market-score metrics smoke tests passed');
}

main().catch((err) => {
  console.error('❌ market-score metrics smoke tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
