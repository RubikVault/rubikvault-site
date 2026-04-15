import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('release gate no longer treats DONE or QUANTLAB as deploy-ready', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.equal(content.includes("'DONE'"), false);
  assert.equal(content.includes("'QUANTLAB'"), false);
  assert.match(content, /seal\?\.release_ready !== true/);
});

test('release gate does not mutate release state phases anymore', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.equal(content.includes('DEPLOY_VERIFIED'), false);
  assert.equal(content.includes('updateReleaseState('), false);
});

test('release gate can verify signed final integrity seals', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.match(content, /verifySealPayload/);
  assert.match(content, /RV_FINAL_SEAL_VERIFY_REQUIRED/);
  assert.match(content, /signature_invalid|signature_missing|public_key_missing/);
});
