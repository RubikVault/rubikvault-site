import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');

test('live control-plane readers do not depend on legacy v5 autopilot status', () => {
  const liveReaders = [
    'scripts/ops/build-system-status-report.mjs',
    'scripts/generate_meta_dashboard_data.mjs',
    'scripts/ops/build-pipeline-runtime-report.mjs',
    'scripts/ops/build-pipeline-epoch.mjs',
  ];
  for (const relativePath of liveReaders) {
    const filePath = path.join(ROOT, relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content.includes('v5-autopilot-status.json'), false, relativePath);
  }
});

test('system status advertises runtime, epoch, compute-audit and monitoring refs', () => {
  const filePath = path.join(ROOT, 'scripts/ops/build-system-status-report.mjs');
  const content = fs.readFileSync(filePath, 'utf8');
  for (const ref of [
    'public/data/pipeline/runtime/latest.json',
    'public/data/pipeline/epoch.json',
    'public/data/reports/pipeline-compute-audit-latest.json',
    'public/data/reports/pipeline-monitoring-latest.json',
  ]) {
    assert.equal(content.includes(ref), true, ref);
  }
});
