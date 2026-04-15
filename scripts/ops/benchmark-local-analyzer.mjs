#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/local-analyzer-benchmark-latest.json');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8788';

async function timed(url) {
  const started = Date.now();
  const response = await fetch(url);
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    duration_ms: Date.now() - started,
    bytes: body.length,
  };
}

async function main() {
  const html = await timed(`${BASE_URL}/analyze/AAPL`);
  const api = await timed(`${BASE_URL}/api/stock?ticker=AAPL`);
  const payload = {
    schema: 'rv.local_analyzer_benchmark.v1',
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    html,
    api,
    ok: html.ok && api.ok,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  if (!payload.ok) process.exit(1);
}

main().catch((error) => {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify({
    schema: 'rv.local_analyzer_benchmark.v1',
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    ok: false,
    error: String(error?.message || error),
  }, null, 2)}\n`, 'utf8');
  process.exit(1);
});
