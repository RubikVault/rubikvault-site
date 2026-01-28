import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SUMMARY_SCHEMA = 'ops.summary.v1';
const UNIVERSE_ID = 'nasdaq100';

function fail(message) {
  throw new Error(message);
}

async function readJson(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  return JSON.parse(raw);
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function compareCounts(summaryCounts, pipelineCounts) {
  const fields = ['expected', 'fetched', 'validated', 'computed', 'static_ready'];
  const mismatches = [];
  for (const field of fields) {
    const sVal = toInt(summaryCounts[field]);
    const pVal = toInt(pipelineCounts[field]);
    if (sVal !== pVal) {
      mismatches.push({ field, summary: sVal, pipeline: pVal });
    }
  }
  return mismatches;
}

async function main() {
  const summary = await readJson('public/data/ops/summary.latest.json');
  const pipeline = await readJson(`public/data/pipeline/${UNIVERSE_ID}.latest.json`);

  if (summary.schema_version !== SUMMARY_SCHEMA) {
    fail(`summary schema_version mismatch: expected ${SUMMARY_SCHEMA}, got ${summary.schema_version || 'null'}`);
  }

  const universes = Array.isArray(summary.universes) ? summary.universes : [];
  const universe = universes.find((u) => u && u.id === UNIVERSE_ID);
  if (!universe) {
    fail(`summary missing universe entry: ${UNIVERSE_ID}`);
  }

  const pipelineCounts = pipeline?.counts || {};
  const summaryCounts = {
    expected: universe.expected,
    fetched: universe.fetched,
    validated: universe.validated,
    computed: universe.computed,
    static_ready: universe.static_ready
  };

  const expected = toInt(summaryCounts.expected);
  if (!Number.isInteger(expected) || expected <= 0) {
    fail(`summary expected must be > 0 (got ${summaryCounts.expected})`);
  }

  for (const field of ['fetched', 'validated', 'computed', 'static_ready']) {
    const value = toInt(summaryCounts[field]);
    if (value === null || value < 0) {
      fail(`summary ${field} must be >= 0 (got ${summaryCounts[field]})`);
    }
  }

  const mismatches = compareCounts(summaryCounts, pipelineCounts);
  if (mismatches.length) {
    const details = mismatches.map((m) => `${m.field} summary=${m.summary} pipeline=${m.pipeline}`).join('; ');
    fail(`summary drift detected: ${details}`);
  }

  process.stdout.write('OK: ops summary matches pipeline.latest\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
