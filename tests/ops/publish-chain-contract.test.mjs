import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('productive publish-chain callers no longer use skip flags', () => {
  const files = [
    '.github/workflows/learning-daily.yml',
    '.github/workflows/universe-v7-daily.yml',
    'scripts/quantlab/run_quantlab_v4_daily_report.sh',
  ];
  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.equal(/run-stock-analyzer-publish-chain\.mjs .*--skip-/.test(content), false, relativePath);
  }
});

test('publish-chain runtime rejects skip flags unless explicit override is set', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-stock-analyzer-publish-chain.mjs'), 'utf8');
  assert.match(content, /publish_chain_skip_flags_forbidden/);
  assert.match(content, /RV_ALLOW_SKIP_PUBLISH_CHAIN/);
});
