#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from '../../scripts/universe-v7/lib/env-loader.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert_failed');
}

(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-v7-env-loader-'));
  const rtfPath = path.join(base, 'EODHD.env');
  const rawPath = path.join(base, 'EODHD.raw.env');
  fs.writeFileSync(
    rtfPath,
    '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Courier;}}\\f0\\fs24 EODHD_API_TOKEN=test_token_123\\par}'
  );
  fs.writeFileSync(rawPath, 'test_token_only_456789');

  const before = process.env.EODHD_API_KEY;
  delete process.env.EODHD_API_KEY;
  delete process.env.EODHD_API_TOKEN;

  const loaded = await loadEnvFile(rtfPath);
  assert(loaded.loaded === true, 'expected env file loaded');
  assert(loaded.vars.EODHD_API_TOKEN === 'test_token_123', 'token parse failed');
  assert(loaded.vars.EODHD_API_KEY === 'test_token_123', 'alias map failed');
  assert(process.env.EODHD_API_KEY === 'test_token_123', 'env assignment failed');

  process.env.EODHD_API_KEY = 'DEIN_KEY';
  process.env.EODHD_API_TOKEN = 'DEIN_KEY';
  const loadedRaw = await loadEnvFile(rawPath);
  assert(loadedRaw.loaded === true, 'expected raw token file loaded');
  assert(process.env.EODHD_API_KEY === 'test_token_only_456789', 'raw token override failed');

  if (before) process.env.EODHD_API_KEY = before;

  console.log('✅ v7 env-loader test passed');
})();
