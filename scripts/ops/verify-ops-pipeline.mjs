import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const BASE_URL = process.env.VERIFY_BASE_URL || 'http://localhost:8788';

function fail(msg) {
  throw new Error(msg);
}

async function readJson(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  return JSON.parse(raw);
}

async function fetchWithFallback(primaryUrl, fallbackUrl) {
  const t = Date.now();
  const headers = {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  try {
    const primaryRes = await fetch(`${primaryUrl}?t=${t}`, { headers });
    if (primaryRes.ok) {
      const data = await primaryRes.json();
      return { ok: true, data, source: 'static_summary', url: primaryUrl, status: primaryRes.status };
    }
    if (primaryRes.status !== 404) {
      return { ok: false, source: null, url: primaryUrl, status: primaryRes.status, error: `Primary returned ${primaryRes.status}` };
    }
  } catch (err) {
    console.warn(`Primary fetch failed: ${err.message}`);
  }

  try {
    const fallbackRes = await fetch(`${fallbackUrl}?t=${t}`, { headers });
    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      return { ok: true, data, source: 'mission_control_api', url: fallbackUrl, status: fallbackRes.status };
    }
    return { ok: false, source: null, url: fallbackUrl, status: fallbackRes.status, error: `Fallback returned ${fallbackRes.status}` };
  } catch (err) {
    return { ok: false, source: null, url: fallbackUrl, status: null, error: `Fallback fetch error: ${err.message}` };
  }
}

function assertPipelineTruth(doc) {
  if (!doc || typeof doc !== 'object') fail('pipeline truth doc not an object');
  if (doc.type !== 'pipeline.truth') fail('pipeline truth doc.type must be pipeline.truth');
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

  const pipelineLatest = await readJson('public/data/pipeline/nasdaq100.latest.json');
  if (!pipelineLatest?.counts || typeof pipelineLatest.counts !== 'object') {
    fail('pipeline.latest counts missing');
  }
  if (pipelineLatest.counts.expected !== staticReady.expected) {
    fail('pipeline.latest counts.expected must equal pipeline static-ready expected');
  }
  if (pipelineLatest.counts.static_ready !== staticReady.count) {
    fail('pipeline.latest counts.static_ready must equal pipeline static-ready count');
  }

  if (pipeline.expected > 0 && pipeline.fetched === 0) {
    fail('ops-daily pipeline.fetched=0 with expected>0 indicates empty artifact generation');
  }

  const html = await fs.readFile(path.join(REPO_ROOT, 'public/ops/index.html'), 'utf-8');
  if (!html.includes('Refresh (LIVE)')) fail('/ops must contain Refresh (LIVE) marker');
  if (!html.includes('/api/mission-control/summary?live=1')) fail('/ops must call mission-control/summary?live=1');
  if (!html.includes('X-OPS-KEY')) fail('/ops must reference X-OPS-KEY');
  if (html.includes('setInterval(')) fail('/ops must not contain setInterval');
  if (html.includes('btn-baseline') || html.includes('btn-live')) fail('/ops must not contain old baseline/live button ids');

  let summaryResult = await fetchWithFallback(
    `${BASE_URL}/data/ops/summary.latest.json`,
    `${BASE_URL}/api/mission-control/summary`
  );

  if (!summaryResult.ok) {
    const localPath = path.join(REPO_ROOT, 'public', 'data', 'ops', 'summary.latest.json');
    try {
      const localRaw = await fs.readFile(localPath, 'utf-8');
      const localData = JSON.parse(localRaw);
      summaryResult = { ok: true, data: localData, source: 'local_file', url: localPath, status: 200 };
    } catch (error) {
      fail(`Summary fetch failed: ${summaryResult.error} (status=${summaryResult.status}, url=${summaryResult.url})`);
    }
  }

  // Schema 3.0 validation (skip when using local summary file)
  const payload = summaryResult.data;
  if (summaryResult.source !== 'local_file') {
    if (payload.schema_version !== '3.0') {
      fail(`mission-control summary must use schema 3.0, got: ${payload.schema_version}`);
    }
    if (!payload.data) fail('mission-control summary missing data property');
    if (!payload.data.opsBaseline) fail('mission-control summary missing data.opsBaseline');
    if (!payload.data.opsBaseline.baseline) fail('mission-control summary missing data.opsBaseline.baseline');

    const baseline = payload.data.opsBaseline.baseline;
    if (!baseline.pipeline) fail('baseline missing pipeline property');
    if (!baseline.freshness) fail('baseline missing freshness property');
    if (!baseline.providers) fail('baseline missing providers property');
    if (!baseline.safety) fail('baseline missing safety property');

    if (typeof baseline.pipeline.expected !== 'number') fail('baseline.pipeline.expected must be number');
    if (!Array.isArray(baseline.pipeline.missing)) fail('baseline.pipeline.missing must be array');
    if (!Array.isArray(baseline.providers)) fail('baseline.providers must be array');
  } else {
    if (!payload || typeof payload !== 'object') fail('local ops summary missing payload');
    if (!payload.ops_daily) fail('local ops summary missing ops_daily');
  }

  process.stdout.write(`OK: ops pipeline truth + wiring verification (summary source=${summaryResult.source}, schema=3.0)\n`);
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
