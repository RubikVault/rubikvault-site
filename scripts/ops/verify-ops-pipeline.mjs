import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

function fail(msg) {
  throw new Error(msg);
}

async function readJson(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  return JSON.parse(raw);
}

function assertPipelineTruth(doc) {
  if (!doc || typeof doc !== 'object') fail('pipeline truth doc not an object');
  if (typeof doc.asOf !== 'string' || !doc.asOf.includes('T')) fail('pipeline truth doc.asOf missing/invalid');
  if (typeof doc.universe !== 'string' || doc.universe !== 'nasdaq100') fail('pipeline truth doc.universe must be nasdaq100');
  if (!Number.isInteger(doc.expected) || doc.expected <= 0) fail('pipeline truth doc.expected must be positive int');
  if (!(doc.count === null || Number.isInteger(doc.count))) fail('pipeline truth doc.count must be int or null');
  if (!Array.isArray(doc.missing)) fail('pipeline truth doc.missing must be array');
  for (const m of doc.missing) {
    if (!m || typeof m !== 'object') fail('pipeline truth missing[] entry not object');
    if (typeof m.ticker !== 'string' || !m.ticker) fail('pipeline truth missing[].ticker invalid');
    if (typeof m.reason !== 'string' || !m.reason) fail('pipeline truth missing[].reason invalid');
  }
  if (doc.count === null) {
    if (!doc.reason || typeof doc.reason !== 'string') fail('pipeline truth count=null requires top-level reason');
    if (doc.missing.length !== 0) fail('pipeline truth count=null must have empty missing[]');
  }
}

async function main() {
  const required = [
    'public/data/pipeline/nasdaq100.fetched.json',
    'public/data/pipeline/nasdaq100.validated.json',
    'public/data/pipeline/nasdaq100.computed.json',
    'public/data/pipeline/nasdaq100.static-ready.json'
  ];

  for (const p of required) {
    const doc = await readJson(p);
    assertPipelineTruth(doc);
  }

  const opsDaily = await readJson('public/data/ops-daily.json');
  const pipeline = opsDaily?.baseline?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') fail('ops-daily baseline.pipeline missing');

  const staticReady = await readJson('public/data/pipeline/nasdaq100.static-ready.json');
  if (pipeline.expected !== staticReady.expected) fail('ops-daily pipeline.expected must equal pipeline truth expected');
  if (pipeline.staticReady !== staticReady.count) fail('ops-daily pipeline.staticReady must equal pipeline truth count');
  if (!Array.isArray(pipeline.missing)) fail('ops-daily pipeline.missing must be array');
  if (pipeline.missing.length !== staticReady.missing.length) fail('ops-daily pipeline.missing length mismatch');

  const html = await fs.readFile(path.join(REPO_ROOT, 'public/ops/index.html'), 'utf-8');
  if (!html.includes('Refresh (LIVE)')) fail('/ops must contain Refresh (LIVE) marker');
  if (!html.includes('/api/mission-control/summary?live=1')) fail('/ops must call mission-control/summary?live=1');
  if (!html.includes('X-OPS-KEY')) fail('/ops must reference X-OPS-KEY');
  if (html.includes('setInterval(')) fail('/ops must not contain setInterval');
  if (html.includes('btn-baseline') || html.includes('btn-live')) fail('/ops must not contain old baseline/live button ids');

  process.stdout.write('OK: ops pipeline truth + wiring verification\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
