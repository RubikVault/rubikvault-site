import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('rv-v2 client no longer emits v1 fallback mode or legacy fallback notices', () => {
  const content = fs.readFileSync(path.join(ROOT, 'public/js/rv-v2-client.js'), 'utf8');
  assert.equal(content.includes('v1_fallback'), false);
  assert.equal(content.includes('fetchV1Stock('), false);
  assert.equal(content.includes('Showing legacy fallback data'), false);
  assert.match(content, /Legacy fallback is disabled/);
});

test('stock features prefer stock-insights-v4 ahead of legacy endpoints', () => {
  const content = fs.readFileSync(path.join(ROOT, 'public/js/stock-features.js'), 'utf8');
  assert.match(content, /return \['\/api\/stock-insights-v4', '\/api\/stock-insights'\];/);
  assert.equal(content.includes("return ['/api/stock-insights-v2', '/api/stock-insights-v4'"), false);
});

test('decision input assembly no longer reads features-v2 stock insights artifacts', () => {
  const content = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/decision-input-assembly.js'), 'utf8');
  assert.equal(content.includes('/data/features-v2/stock-insights/'), false);
  assert.match(content, /\/data\/features-v4\/stock-insights\/index\.json/);
  assert.match(content, /\/data\/forecast\/latest\.json/);
});
