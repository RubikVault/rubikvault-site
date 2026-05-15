import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('provider exceptions artifact stays compact for public runtime manifest', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-stock-analyzer-provider-exceptions.mjs'), 'utf8');
  assert.match(source, /JSON\.stringify\(doc\)/);
  assert.doesNotMatch(source, /symbol: row\?\.symbol/);
  assert.doesNotMatch(source, /asset_class: assetClass/);
  assert.doesNotMatch(source, /evidence: 'full_universe_eodhd_refresh_ok_no_target_row'/);
});
