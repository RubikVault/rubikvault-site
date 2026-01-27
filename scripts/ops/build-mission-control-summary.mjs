import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

function isoNow() {
  return new Date().toISOString();
}

async function readJson(relPath) {
  try {
    const abs = path.join(REPO_ROOT, relPath);
    const raw = await fs.readFile(abs, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function atomicWriteJson(relPath, value) {
  const full = path.join(REPO_ROOT, relPath);
  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${full}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, full);
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function main() {
  const asOf = isoNow();

  const [fetchedDoc, validatedDoc, computedDoc, staticReadyDoc, usageReport] = await Promise.all([
    readJson('public/data/pipeline/nasdaq100.fetched.json'),
    readJson('public/data/pipeline/nasdaq100.validated.json'),
    readJson('public/data/pipeline/nasdaq100.computed.json'),
    readJson('public/data/pipeline/nasdaq100.static-ready.json'),
    readJson('public/data/usage-report.json')
  ]);

  if (!fetchedDoc || !validatedDoc || !computedDoc || !staticReadyDoc) {
    throw new Error('PIPELINE_TRUTH_ARTIFACTS_MISSING: Cannot build summary without pipeline truth files');
  }

  const expected = staticReadyDoc.expected || 100;
  const fetched = toIntOrNull(fetchedDoc.count);
  const validated = toIntOrNull(validatedDoc.count);
  const computed = toIntOrNull(computedDoc.count);
  const staticReady = toIntOrNull(staticReadyDoc.count);

  const pipelineOk = staticReady !== null && staticReady >= expected;
  const overallStatus = pipelineOk ? 'HEALTHY' : 'RISK';
  const overallReason = pipelineOk ? 'OK' : `PIPELINE_STATIC_READY=${staticReady}/${expected}`;

  const providers = {};
  if (usageReport && usageReport.providers && typeof usageReport.providers === 'object') {
    for (const [name, entry] of Object.entries(usageReport.providers)) {
      const monthly = entry?.monthly || {};
      providers[name] = {
        name,
        usedMonth: toIntOrNull(monthly.used),
        limitMonth: toIntOrNull(monthly.limit),
        remainingMonth: toIntOrNull(monthly.remaining),
        remainingPct: toIntOrNull(monthly.pctRemaining)
      };
    }
  }

  const summary = {
    schema_version: '1.0',
    generated_at: asOf,
    overall: {
      status: overallStatus,
      reason: overallReason
    },
    universes: [
      {
        name: 'nasdaq100',
        expected,
        fetched,
        validated,
        computed,
        staticReady,
        missing: Array.isArray(staticReadyDoc.missing) ? staticReadyDoc.missing.length : 0
      }
    ],
    providers
  };

  await atomicWriteJson('public/data/ops/summary.latest.json', summary);
  process.stdout.write(`OK: mission-control summary artifact generated (status=${overallStatus})\n`);
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
