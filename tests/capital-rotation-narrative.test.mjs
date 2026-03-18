import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateNarrative } from '../scripts/lib/capital-rotation/narrative.js';

const dict = JSON.parse(readFileSync(new URL('../config/market-hub/narrative-dictionary.json', import.meta.url), 'utf8'));

describe('capital-rotation narrative', () => {
  const baseCtx = {
    globalScore: 50,
    regime: 'Neutral',
    confidence: 0.7,
    confidenceLabel: 'Medium',
    neutralMode: 'none',
    blockScores: { macroRegime: { score: 50 }, riskAppetite: { score: 55 }, sectorBreadth: { score: 48 }, confirmationLiquidity: { score: 52 } },
    cycle: { positionPct: 50, state: 'Neutral / Undefined', confidence: 0.5, description: 'No clear signal.' },
    confirmations: {},
    divergences: []
  };

  it('headline is structured with primary_code and params', () => {
    const result = generateNarrative(baseCtx);
    assert.ok(result.headline.primary_code, 'headline must have primary_code');
    assert.ok(typeof result.headline.params === 'object', 'headline must have params');
    assert.ok(result.headline.severity, 'headline must have severity');
  });

  it('produces correct headline code for all score ranges', () => {
    const expected = [
      [10, 'DEEP_RISK_OFF'], [30, 'CAUTIOUS'], [50, 'NEUTRAL'],
      [70, 'RISK_ON'], [90, 'EXTREME_RISK_ON']
    ];
    for (const [score, code] of expected) {
      const result = generateNarrative({ ...baseCtx, globalScore: score });
      assert.equal(result.headline.primary_code, code, `Score ${score} → ${code}`);
      assert.equal(result.headline.params.score, score);
    }
  });

  it('produces 1-4 structured blocks', () => {
    const result = generateNarrative(baseCtx);
    assert.ok(result.blocks.length >= 1 && result.blocks.length <= 4);
    for (const b of result.blocks) {
      assert.ok(b.type, 'block must have type');
      assert.ok(b.primary_code, 'block must have primary_code');
      assert.ok(b.severity, 'block must have severity');
    }
  });

  it('includes watch block for divergence', () => {
    const ctx = { ...baseCtx, divergences: [{ title: 'Vol Contradiction', explanation: 'Test', severity: 'alert' }] };
    const result = generateNarrative(ctx);
    const watch = result.blocks.find(b => b.type === 'watch');
    assert.ok(watch, 'Should include watch block for divergences');
    assert.equal(watch.primary_code, 'DIVERGENCE');
    assert.equal(watch.params.divergence_title, 'Vol Contradiction');
  });

  it('handles conflicted neutral mode', () => {
    const result = generateNarrative({ ...baseCtx, neutralMode: 'conflicted' });
    assert.equal(result.headline.primary_code, 'NEUTRAL_CONFLICTED');
  });

  it('handles quiet neutral mode', () => {
    const result = generateNarrative({ ...baseCtx, neutralMode: 'quiet' });
    assert.equal(result.headline.primary_code, 'NEUTRAL_QUIET');
  });

  it('includes generatedAt timestamp', () => {
    const result = generateNarrative(baseCtx);
    assert.ok(result.generatedAt);
    assert.ok(result.generatedAt.includes('T'));
  });

  it('includes legacy_text as string fallback', () => {
    const result = generateNarrative(baseCtx);
    assert.equal(typeof result.legacy_text, 'string');
    assert.ok(result.legacy_text.length > 10);
  });

  it('handles missing blockScores', () => {
    const result = generateNarrative({ ...baseCtx, blockScores: null });
    assert.ok(result.headline.primary_code);
    const rot = result.blocks.find(b => b.type === 'rotation_focus');
    assert.equal(rot.primary_code, 'NO_BLOCK_DATA');
  });

  it('watch block aggregates multiple codes', () => {
    const ctx = {
      ...baseCtx,
      confidenceLabel: 'Low',
      divergences: [{ title: 'Test', severity: 'alert' }],
      confirmations: { src1: { source: 'src1', supportsRotation: 'no' } }
    };
    const result = generateNarrative(ctx);
    const watch = result.blocks.find(b => b.type === 'watch');
    assert.ok(watch);
    assert.ok(watch.secondary_codes.length >= 1, 'should have secondary codes');
  });
});

describe('narrative dictionary completeness', () => {
  const allHeadlineCodes = ['DEEP_RISK_OFF', 'CAUTIOUS', 'NEUTRAL', 'RISK_ON', 'EXTREME_RISK_ON'];
  const neutralCodes = ['conflicted', 'quiet'];
  const watchCodes = ['DIVERGENCE', 'CONTRADICTION', 'LOW_CONFIDENCE'];

  it('all headline codes exist in dictionary rotation.regime', () => {
    for (const code of allHeadlineCodes) {
      assert.ok(dict.rotation?.regime?.[code], `Missing rotation.regime.${code} in dictionary`);
      assert.ok(dict.rotation.regime[code].template, `Missing template for ${code}`);
    }
  });

  it('all neutral mode codes exist in dictionary rotation.neutral_mode', () => {
    for (const code of neutralCodes) {
      assert.ok(dict.rotation?.neutral_mode?.[code], `Missing rotation.neutral_mode.${code}`);
    }
  });

  it('all watch codes exist in dictionary rotation.watch_codes', () => {
    for (const code of watchCodes) {
      assert.ok(dict.rotation?.watch_codes?.[code], `Missing rotation.watch_codes.${code}`);
    }
  });

  it('all block keys have labels in dictionary', () => {
    for (const key of ['macroRegime', 'riskAppetite', 'sectorBreadth', 'confirmationLiquidity']) {
      assert.ok(dict.rotation?.blocks?.[key]?.label, `Missing label for block ${key}`);
    }
  });
});
