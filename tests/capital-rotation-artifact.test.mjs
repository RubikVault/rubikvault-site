import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStaleness, checkCoverage, validateOutputDoc } from '../scripts/lib/capital-rotation/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('capital-rotation artifact validation', () => {
  let sample;

  it('loads sample fixture', async () => {
    const raw = await readFile(join(__dirname, 'fixtures/capital-rotation-sample.json'), 'utf8');
    sample = JSON.parse(raw);
    assert.ok(sample);
  });

  it('validates output document structure', () => {
    const result = validateOutputDoc(sample);
    assert.ok(result.valid, `Validation errors: ${result.errors.join(', ')}`);
  });

  it('globalScore in 0-100', () => {
    const gs = sample.data.globalScore;
    assert.ok(gs.value >= 0 && gs.value <= 100);
  });

  it('regime is valid label', () => {
    const valid = ['Deep Risk-Off', 'Cautious', 'Neutral', 'Risk-On', 'Extreme Risk-On'];
    assert.ok(valid.includes(sample.data.globalScore.regime));
  });

  it('confidenceLabel is valid', () => {
    const valid = ['High', 'Medium', 'Mixed', 'Low'];
    assert.ok(valid.includes(sample.data.globalScore.confidenceLabel));
  });

  it('blocks have required structure', () => {
    for (const [key, block] of Object.entries(sample.data.blocks)) {
      assert.ok(typeof block.score === 'number', `${key} missing score`);
      assert.ok(block.score >= 0 && block.score <= 100, `${key} score out of range`);
    }
  });

  it('narrative has headline and blocks', () => {
    assert.ok(sample.data.narrative.headline.length > 0);
    assert.ok(Array.isArray(sample.data.narrative.blocks));
    assert.ok(sample.data.narrative.blocks.length >= 1);
  });

  it('ratios have valid composites', () => {
    for (const [id, r] of Object.entries(sample.data.ratios)) {
      if (r.composite != null) {
        assert.ok(r.composite >= 0 && r.composite <= 100, `${id} composite out of range: ${r.composite}`);
      }
    }
  });

  it('meta has required fields', () => {
    const meta = sample.data.meta;
    assert.ok(meta.status);
    assert.ok(typeof meta.coverage === 'number');
    assert.ok(meta.staleStatus);
    assert.ok(meta.asOfDate);
  });

  it('staleStatus is valid', () => {
    const valid = ['fresh', 'stale', 'critical_stale'];
    assert.ok(valid.includes(sample.data.meta.staleStatus));
  });

  it('schema_version is present', () => {
    assert.equal(sample.schema_version, '3.0');
  });

  it('metadata module is capital-rotation', () => {
    assert.equal(sample.metadata.module, 'capital-rotation');
  });
});

describe('staleness detection', () => {
  it('today is fresh', () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(checkStaleness(today), 'fresh');
  });

  it('null date is critical_stale', () => {
    assert.equal(checkStaleness(null), 'critical_stale');
  });
});

describe('coverage check', () => {
  it('full coverage returns 1', () => {
    const results = { A: { composite: 50 }, B: { composite: 60 } };
    assert.equal(checkCoverage(results, 2), 1);
  });

  it('partial coverage returns fraction', () => {
    const results = { A: { composite: 50 }, B: { composite: null } };
    assert.equal(checkCoverage(results, 2), 0.5);
  });

  it('zero expected returns 0', () => {
    assert.equal(checkCoverage({}, 0), 0);
  });
});
