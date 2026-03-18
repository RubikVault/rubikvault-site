import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRAM, ramToScore, trendToScore, computeRatioComposite, computeBlockScore, computeGlobalScore, classifyRegime, computeConfidence, classifyConfidence, resolveNeutralMode } from '../scripts/lib/capital-rotation/scoring.js';
import { winsorize, rollingZScore, mapZScoreToScore, percentileRank } from '../scripts/lib/capital-rotation/standardize.js';

describe('capital-rotation scoring', () => {
  it('computeRAM produces composite from returns + vol', () => {
    const returns = { 21: 0.05, 63: 0.10, 126: 0.15, 252: 0.20 };
    const vol = 0.02;
    const result = computeRAM(returns, vol);
    assert.ok(Number.isFinite(result.composite));
    assert.ok(result.composite > 0, 'positive returns should give positive RAM');
  });

  it('computeRAM handles null returns gracefully', () => {
    const returns = { 21: null, 63: 0.05, 126: null, 252: 0.10 };
    const result = computeRAM(returns, 0.02);
    assert.ok(Number.isFinite(result.composite));
  });

  it('computeRAM with zero vol returns 0', () => {
    const result = computeRAM({ 21: 0.05, 63: 0.1, 126: 0.15, 252: 0.2 }, 0);
    assert.equal(result.composite, 0);
  });

  it('ramToScore maps to 0-100 range', () => {
    assert.equal(ramToScore(-5), 0);
    assert.equal(ramToScore(0), 50);
    assert.equal(ramToScore(5), 100);
    assert.ok(ramToScore(2.5) > 50);
    assert.ok(ramToScore(-2.5) < 50);
  });

  it('trendToScore maps slope to 0-100', () => {
    assert.equal(trendToScore(0), 50);
    assert.ok(trendToScore(0.01) > 50);
    assert.ok(trendToScore(-0.01) < 50);
    assert.equal(trendToScore(null), 50);
  });

  it('computeRatioComposite stays in 0-100', () => {
    const score = computeRatioComposite(80, 70, 65, 55);
    assert.ok(score >= 0 && score <= 100);
  });

  it('computeRatioComposite handles extremes', () => {
    assert.ok(computeRatioComposite(0, 0, 0, 0) >= 0);
    assert.ok(computeRatioComposite(100, 100, 100, 100) <= 100);
  });

  it('computeBlockScore averages available composites', () => {
    const ratios = {
      A: { composite: 60 },
      B: { composite: 80 },
      C: { composite: null }
    };
    const result = computeBlockScore(ratios, ['A', 'B', 'C']);
    assert.equal(result.score, 70);
    assert.equal(result.count, 2);
    assert.equal(result.available, 3);
  });

  it('computeBlockScore returns 50 for empty', () => {
    assert.equal(computeBlockScore({}, ['X']).score, 50);
  });

  it('computeGlobalScore weights correctly', () => {
    const blocks = {
      macroRegime: { score: 60 },
      riskAppetite: { score: 70 },
      sectorBreadth: { score: 50 },
      confirmationLiquidity: { score: 80 }
    };
    const score = computeGlobalScore(blocks);
    assert.ok(score >= 0 && score <= 100);
    assert.ok(score > 50, 'mostly above-50 blocks should yield above-50 global');
  });

  it('classifyRegime returns correct labels', () => {
    assert.equal(classifyRegime(10), 'Deep Risk-Off');
    assert.equal(classifyRegime(30), 'Cautious');
    assert.equal(classifyRegime(50), 'Neutral');
    assert.equal(classifyRegime(70), 'Risk-On');
    assert.equal(classifyRegime(90), 'Extreme Risk-On');
  });

  it('computeConfidence returns 0-1', () => {
    const blocks = { a: { score: 60 }, b: { score: 55 } };
    const conf = computeConfidence(blocks, 0.9, 0, 0);
    assert.ok(conf >= 0 && conf <= 1);
  });

  it('confidence decreases with staleness', () => {
    const blocks = { a: { score: 60 } };
    const fresh = computeConfidence(blocks, 1.0, 0, 0);
    const stale = computeConfidence(blocks, 1.0, 5, 0);
    assert.ok(stale < fresh);
  });

  it('classifyConfidence labels correctly', () => {
    assert.equal(classifyConfidence(0.8), 'High');
    assert.equal(classifyConfidence(0.6), 'Medium');
    assert.equal(classifyConfidence(0.4), 'Mixed');
    assert.equal(classifyConfidence(0.2), 'Low');
  });

  it('resolveNeutralMode detects conflicted', () => {
    const blocks = { a: { score: 75 }, b: { score: 30 } };
    assert.equal(resolveNeutralMode(50, blocks), 'conflicted');
  });

  it('resolveNeutralMode returns none outside neutral range', () => {
    assert.equal(resolveNeutralMode(80, {}), 'none');
    assert.equal(resolveNeutralMode(20, {}), 'none');
  });
});

describe('capital-rotation standardize', () => {
  it('winsorize clips extremes', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const result = winsorize(data, 0.1, 0.9);
    assert.ok(result[result.length - 1] < 100);
  });

  it('rollingZScore returns value within cap', () => {
    const values = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
    const z = rollingZScore(values, 252, 2.5);
    assert.ok(z !== null);
    assert.ok(z >= -2.5 && z <= 2.5);
  });

  it('rollingZScore returns null for short series', () => {
    assert.equal(rollingZScore([1, 2, 3], 252), null);
  });

  it('mapZScoreToScore maps correctly', () => {
    assert.equal(mapZScoreToScore(0), 50);
    assert.equal(mapZScoreToScore(-2.5), 0);
    assert.equal(mapZScoreToScore(2.5), 100);
    assert.equal(mapZScoreToScore(null), 50);
  });

  it('percentileRank gives 0-100', () => {
    const dist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const pct = percentileRank(5, dist);
    assert.ok(pct >= 0 && pct <= 100);
    assert.ok(pct > 20 && pct < 80); // 5 is roughly median
  });
});
