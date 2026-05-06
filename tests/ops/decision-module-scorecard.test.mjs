import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('decision module scorecard exposes module horizons and monitor-only adaptive weights', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-module-scorecard-'));
  const learningReport = path.join(tmp, 'learning.json');
  const out = path.join(tmp, 'scorecard.json');
  fs.writeFileSync(learningReport, `${JSON.stringify({
    generated_at: '2026-05-06T00:00:00.000Z',
    target_market_date: '2026-05-05',
    features: {
      forecast: {
        name: 'Forecast',
        type: 'forecast',
        by_horizon: {
          '1d': { outcomes_resolved: 200, hit_rate_all: 0.61, precision_50: 0.62, brier_all: 0.22 },
          '5d': { outcomes_resolved: 150, hit_rate_all: 0.55, precision_50: 0.57, brier_all: 0.28 },
        },
      },
      scientific: {
        name: 'Scientific',
        type: 'setup',
        by_horizon: {
          '5d': { outcomes_resolved: 50, hit_rate_all: 0.52, precision_50: 0.5, brier_all: 0.3 },
        },
      },
    },
  })}\n`);
  const res = spawnSync('node', [
    'scripts/ops/build-decision-module-scorecard.mjs',
    `--learning-report=${learningReport}`,
    `--monthly-report=${path.join(tmp, 'missing-monthly.json')}`,
    `--out=${out}`,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(doc.schema, 'rv.decision_module_scorecard.v1');
  assert.equal(doc.modules.forecast.horizons['1d'].status, 'available');
  assert.equal(doc.modules.forecast.horizons['5d'].sample_n, 150);
  assert.equal(doc.modules.scientific.horizons['5d'].status, 'low_sample');
  assert.equal(doc.modules.hist_probs.status, 'not_available');
  assert.equal(doc.adaptive_aggregation.runtime_active, false);
  assert.equal(doc.acceptance.stale_actionable_policy.includes('stale module data'), true);
});
