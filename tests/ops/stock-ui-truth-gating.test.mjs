import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('stock analyzer operational banner is gated by final seal and daily decision', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/stock.html'), 'utf8');
  assert.match(html, /public-status\.json/);
  assert.match(html, /fetchWithFallback\(ticker\)/);
  assert.match(html, /_assetDecisionOperational/);
  assert.match(html, /_bundleOperational/);
  assert.match(html, /_bundleStatus === 'DEGRADED' && _bundleBlockingReasons\.length === 0/);
  assert.match(html, /WAIT_PIPELINE_INCOMPLETE/);
  assert.match(html, /Pipeline truth not release-ready/);
});

test('v2 client preserves injected daily decision payload', () => {
  const client = fs.readFileSync(path.join(ROOT, 'public/js/rv-v2-client.js'), 'utf8');
  assert.match(client, /daily_decision: v2Data\.daily_decision/);
  assert.match(client, /analysis_readiness: v2Data\.analysis_readiness/);
});
