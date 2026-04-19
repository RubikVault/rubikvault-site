import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('pipeline master enforces readiness preflight and full-universe audit', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-pipeline-master-supervisor.mjs'), 'utf8');
  assert.match(content, /runReadinessProfile\('stock_analyzer_audit'/);
  assert.match(content, /--full-universe-audit/);
  assert.match(content, /RV_FULL_UNIVERSE_AUDIT: '1'/);
});

test('pipeline master launchd template uses the node20 wrapper', () => {
  const plist = fs.readFileSync(path.join(ROOT, 'scripts/launchd/com.rubikvault.pipeline.master.plist.template'), 'utf8');
  assert.match(plist, /run-pipeline-master-supervisor-node20\.sh/);
  assert.doesNotMatch(plist, /\/opt\/homebrew\/bin\/node/);
});
