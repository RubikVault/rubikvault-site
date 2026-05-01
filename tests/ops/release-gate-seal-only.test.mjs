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

test('release gate hard-blocks stale Stock Analyzer UI truth before main deploy', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.match(content, /checkStockAnalyzerUiState\(seal\)/);
  assert.match(content, /ui_operational_ratio/);
  assert.match(content, /release_eligible !== true/);
  assert.match(content, /checkLocalPublicStatus\(seal\)/);
  assert.match(content, /overall_ui_ready/);
  assert.match(content, /api\/universe\?q=ford/);
});

test('public status can use release-matching page-core candidate before promotion', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-public-status.mjs'), 'utf8');
  assert.match(content, /PAGE_CORE_CANDIDATE_LATEST_PATH/);
  assert.match(content, /candidateMatchesRelease/);
  assert.match(content, /pageCoreSource/);
});

test('runtime manifest allowlists public breakout v12 artifacts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/runtime-manifest.json'), 'utf8'));
  const patterns = new Set((manifest.allow || []).map((rule) => rule.pattern));
  assert.equal(patterns.has('data/breakout/status.json'), true);
  assert.equal(patterns.has('data/breakout/manifests/*.json'), true);
  assert.equal(patterns.has('data/breakout/runs/**/top500.json'), true);
  assert.equal(patterns.has('data/breakout/runs/**/shards/**/*.json'), true);
});

test('release gate captures large wrangler output and falls back to branch URL', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.match(content, /WRANGLER_DEPLOY_MAX_BUFFER/);
  assert.match(content, /maxBuffer: WRANGLER_DEPLOY_MAX_BUFFER/);
  assert.match(content, /wrangler pages deploy error/);
  assert.match(content, /using fallback/);
});
