import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDivergences } from '../scripts/lib/capital-rotation/divergences.js';

describe('capital-rotation divergences', () => {
  it('detects liquidity divergence', () => {
    const ctx = {
      ratioResults: {
        SPY_TLT: { returns: { 21: 0.03 } },
        HYG_LQD: { returns: { 21: -0.02 } }
      },
      globalScore: 60,
      blockScores: {},
      confirmations: {},
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    assert.ok(divs.some(d => d.id === 'liquidity-divergence'));
  });

  it('detects volatility contradiction', () => {
    const ctx = {
      ratioResults: {},
      globalScore: 75,
      blockScores: {},
      confirmations: { vix: { direction: 'elevated' } },
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    assert.ok(divs.some(d => d.id === 'vol-contradiction'));
  });

  it('detects regime conflict when macro vs sector disagree', () => {
    const ctx = {
      ratioResults: {},
      globalScore: 50,
      blockScores: {
        macroRegime: { score: 70 },
        sectorBreadth: { score: 30 }
      },
      confirmations: {},
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    assert.ok(divs.some(d => d.id === 'regime-conflict'));
  });

  it('detects breadth erosion', () => {
    const ctx = {
      ratioResults: {
        SPY_TLT: { returns: { 21: 0.02 } },
        SOXX_XLU: { returns: { 21: -0.03 } }
      },
      globalScore: 55,
      blockScores: {},
      confirmations: {},
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    assert.ok(divs.some(d => d.id === 'breadth-erosion'));
  });

  it('no divergences when signals align', () => {
    const ctx = {
      ratioResults: {
        SPY_TLT: { returns: { 21: 0.02 } },
        HYG_LQD: { returns: { 21: 0.01 } },
        SOXX_XLU: { returns: { 21: 0.02 } }
      },
      globalScore: 55,
      blockScores: { macroRegime: { score: 55 }, sectorBreadth: { score: 55 } },
      confirmations: { vix: { direction: 'normal' } },
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    assert.equal(divs.length, 0);
  });

  it('every divergence has required fields', () => {
    const ctx = {
      ratioResults: { SPY_TLT: { returns: { 21: 0.03 } }, HYG_LQD: { returns: { 21: -0.02 } } },
      globalScore: 75,
      blockScores: {},
      confirmations: { vix: { direction: 'elevated' } },
      asOfDate: '2026-03-17'
    };
    const divs = detectDivergences(ctx);
    for (const d of divs) {
      assert.ok(d.id, 'must have id');
      assert.ok(d.title, 'must have title');
      assert.ok(d.category, 'must have category');
      assert.ok(d.severity, 'must have severity');
      assert.ok(d.explanation, 'must have explanation');
      assert.ok(d.asOfDate, 'must have asOfDate');
    }
  });
});
