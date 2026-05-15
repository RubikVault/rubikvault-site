import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SRC = fs.readFileSync(path.join(ROOT, 'scripts/validate/stock-analyzer-ui-random50-proof.mjs'), 'utf8');

test('stock analyzer UI proof has deterministic regional100 coverage across regions and asset classes', () => {
  assert.match(SRC, /const REGIONAL100_REQUIRED = Object\.freeze/);
  assert.match(SRC, /US:\s*Object\.freeze\(\{\s*INDEX:\s*2,\s*ETF:\s*9,\s*STOCK:\s*23\s*\}\)/);
  assert.match(SRC, /EU:\s*Object\.freeze\(\{\s*INDEX:\s*10,\s*ETF:\s*3,\s*STOCK:\s*20\s*\}\)/);
  assert.match(SRC, /ASIA:\s*Object\.freeze\(\{\s*INDEX:\s*5,\s*ETF:\s*10,\s*STOCK:\s*18\s*\}\)/);
  assert.match(SRC, /buildRegional100Sample/);
  assert.match(SRC, /rv\.stock_analyzer_ui_regional100_proof\.v1/);
});

test('stock analyzer UI proof can accept typed degraded states without weakening strict default', () => {
  assert.match(SRC, /const ACCEPT_TYPED_DEGRADED = cliBool\('accept-typed-degraded', false\)/);
  assert.match(SRC, /acceptance_mode: ACCEPT_TYPED_DEGRADED \? 'typed_degraded_ok' : 'strict_operational'/);
  assert.match(SRC, /typed_degraded_accepted/);
  assert.match(SRC, /typed_reason_visible_when_degraded/);
  assert.match(SRC, /Quality Guardrail Active/);
  assert.match(SRC, /oversized_row_quarantined/);
});
