#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { REPO_ROOT } from '../../scripts/universe-v7/lib/common.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert_failed');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 45000) {
  const started = Date.now();
  let lastError = null;
  while ((Date.now() - started) < timeoutMs) {
    try {
      const res = await fetch(baseUrl, { method: 'GET' });
      if (res.ok) return;
      lastError = new Error(`server_not_ready:${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`server_start_timeout:${lastError?.message || 'unknown'}`);
}

function normalizeSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return s || null;
}

async function readExactIndex() {
  const abs = path.join(REPO_ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
  const gz = await fs.readFile(abs);
  const raw = zlib.gunzipSync(gz).toString('utf8');
  return JSON.parse(raw);
}

async function queryExact(baseUrl, symbol) {
  const url = new URL('/api/universe', baseUrl);
  url.searchParams.set('q', symbol);
  url.searchParams.set('exact', '1');
  url.searchParams.set('asset_class', 'stock');
  url.searchParams.set('limit', '5');
  const res = await fetch(url.toString());
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

async function main() {
  const exactDoc = await readExactIndex();
  const bySymbol = exactDoc?.by_symbol && typeof exactDoc.by_symbol === 'object' ? exactDoc.by_symbol : {};
  const candidatePool = ['A', 'C', 'F', 'V', 'O', 'L', 'DE', 'ES'];
  const oneLetterTargets = candidatePool.filter((sym) => bySymbol[sym]).slice(0, 6);
  assert(oneLetterTargets.length >= 2, `not_enough_single_letter_targets:${oneLetterTargets.length}`);
  assert(Boolean(bySymbol.AMZN), 'missing_AMZN_in_exact_index');

  const port = Number(process.env.RV_V7_SEARCH_TEST_PORT || (8790 + Math.floor(Math.random() * 50)));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('npm', ['run', 'dev:pages:port'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (d) => { logs += String(d || ''); });
  child.stderr.on('data', (d) => { logs += String(d || ''); });

  try {
    await waitForServer(baseUrl);
    const targets = [...oneLetterTargets, 'AMZN'];
    for (const symbol of targets) {
      const { status, payload } = await queryExact(baseUrl, symbol);
      assert(status === 200, `exact_query_http_${symbol}:${status}`);
      const items = Array.isArray(payload?.data?.symbols) ? payload.data.symbols : [];
      const hasExact = items.some((row) => normalizeSymbol(row?.symbol) === symbol);
      assert(hasExact, `exact_symbol_missing:${symbol}:count=${items.length}:source=${payload?.metadata?.source || 'n/a'}`);
    }

    const lowerA = await queryExact(baseUrl, 'a');
    assert(lowerA.status === 200, `exact_query_http_lower_a:${lowerA.status}`);
    const lowerItems = Array.isArray(lowerA?.payload?.data?.symbols) ? lowerA.payload.data.symbols : [];
    assert(lowerItems.some((row) => normalizeSymbol(row?.symbol) === 'A'), 'lowercase_exact_normalization_failed_for_A');
  } finally {
    child.kill('SIGTERM');
    await sleep(1000);
  }

  console.log(`✅ v7 universe exact single-letter test passed (port=${port})`);
}

main().catch((error) => {
  process.stderr.write(`❌ v7 universe exact single-letter test failed: ${error?.message || error}\n`);
  process.exit(1);
});

