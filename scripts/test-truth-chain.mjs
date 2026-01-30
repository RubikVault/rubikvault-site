import path from 'node:path';
import fs from 'node:fs/promises';
import { onRequestGet } from '../functions/api/mission-control/summary.js';

const ROOT = process.cwd();

function fail(message) {
  throw new Error(message);
}

function pickBlocker(steps) {
  const firstFail = steps.find((step) => step?.status === 'FAIL');
  if (firstFail?.id) return firstFail.id;
  const firstWarn = steps.find((step) => step?.status === 'WARN');
  return firstWarn?.id || null;
}

const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === 'string' ? new URL(input) : new URL(input.url);
  if (url.pathname.startsWith('/data/')) {
    const rel = url.pathname.replace(/^\/+/, '');
    const abs = path.join(ROOT, 'public', rel);
    try {
      const raw = await fs.readFile(abs, 'utf8');
      return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }
  if (typeof originalFetch === 'function') {
    return originalFetch(input, init);
  }
  return new Response('fetch not available', { status: 500 });
};

const request = new Request('http://localhost/api/mission-control/summary?debug=1');
const context = { request, env: {}, waitUntil() {} };

const response = await onRequestGet(context);
const payload = await response.json();

const truthChain = payload?.data?.opsBaseline?.truthChain?.nasdaq100;
if (!truthChain || typeof truthChain !== 'object') {
  fail('Missing opsBaseline.truthChain.nasdaq100');
}

const steps = truthChain.steps;
if (!Array.isArray(steps)) {
  fail('Truth chain steps missing or not an array');
}
if (steps.length !== 8) {
  fail(`Truth chain steps length expected 8, got ${steps.length}`);
}

for (const step of steps) {
  if (!step?.id || !step?.title) {
    fail('Truth chain step missing id/title');
  }
  if (!['OK', 'WARN', 'FAIL', 'UNKNOWN'].includes(step.status)) {
    fail(`Truth chain step ${step.id} has invalid status ${step.status}`);
  }
  if (!step.evidence || typeof step.evidence !== 'object') {
    fail(`Truth chain step ${step.id} missing evidence object`);
  }
}

const expectedBlocker = pickBlocker(steps);
const actualBlocker = typeof truthChain.first_blocker === 'string'
  ? truthChain.first_blocker
  : truthChain.first_blocker?.id || null;
if (actualBlocker !== expectedBlocker) {
  fail(`Truth chain first_blocker expected ${expectedBlocker}, got ${actualBlocker}`);
}

console.log('Truth chain test OK');
