import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SUMMARY_SCHEMA = 'ops.summary.v1';
const UNIVERSE_ID = 'nasdaq100';

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

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeCounts(pipelineDoc) {
  const counts = pipelineDoc?.counts || {};
  return {
    expected: toInt(counts.expected ?? pipelineDoc?.expected ?? 0, 0),
    fetched: toInt(counts.fetched ?? pipelineDoc?.fetched ?? 0, 0),
    validated: toInt(counts.validated ?? pipelineDoc?.validated ?? 0, 0),
    computed: toInt(counts.computed ?? pipelineDoc?.computed ?? 0, 0),
    static_ready: toInt(counts.static_ready ?? pipelineDoc?.static_ready ?? 0, 0)
  };
}

function computeStatus(counts) {
  if (counts.expected > 0 && counts.static_ready >= counts.expected) return 'OK';
  if (counts.expected > 0 && counts.fetched > 0) return 'WARN';
  return 'UNKNOWN';
}

function buildProviders(opsDaily) {
  const providers = Array.isArray(opsDaily?.baseline?.providers) ? opsDaily.baseline.providers : [];
  const out = {};
  for (const entry of providers) {
    const name = String(entry?.name || '').trim();
    if (!name) continue;
    out[name] = {
      configured: true,
      mode: 'unknown',
      note: null,
      budget: {
        usedMonth: entry?.usedMonth ?? null,
        limitMonth: entry?.limitMonth ?? null,
        remainingMonth: entry?.remainingMonth ?? null,
        remainingPct: entry?.remainingPct ?? null,
        resetDate: entry?.resetDate ?? null,
        runtimeCallsToday: entry?.runtimeCallsToday ?? null
      }
    };
  }
  return out;
}

function buildCosts(opsDaily) {
  const cloudflare = opsDaily?.baseline?.cloudflare || null;
  return {
    workers: {
      requests_today: cloudflare?.requestsToday ?? null,
      requests_last_24h: cloudflare?.requestsLast24h ?? null
    }
  };
}

function buildSafety(opsDaily) {
  const safety = opsDaily?.baseline?.safety || null;
  const kvWritesToday = safety?.kvWritesToday ?? null;
  const computedNote = kvWritesToday === null
    ? 'KV tracking not configured'
    : kvWritesToday === 0
      ? 'No KV writes today (read-only mode)'
      : `${kvWritesToday} KV writes today`;
  const note = safety?.note || computedNote;
  return {
    kv_writes_today: kvWritesToday,
    note
  };
}

async function main() {
  const generatedAt = isoNow();

  const pipelineLatest = await readJson(`public/data/pipeline/${UNIVERSE_ID}.latest.json`);
  if (!pipelineLatest) {
    throw new Error(`PIPELINE_LATEST_MISSING: public/data/pipeline/${UNIVERSE_ID}.latest.json`);
  }

  const opsDaily = await readJson('public/data/ops-daily.json');
  const eodManifest = await readJson('public/data/eod/manifest.latest.json');

  const counts = normalizeCounts(pipelineLatest);
  const status = computeStatus(counts);

  const reasons = [];
  if (pipelineLatest?.root_failure?.class) {
    reasons.push(`ROOT_FAILURE:${pipelineLatest.root_failure.class}`);
  }

  const manifestRef = pipelineLatest?.refs?.eod_manifest_ref || '/data/eod/manifest.latest.json';
  const batch0Ref = (() => {
    if (Array.isArray(eodManifest?.chunks) && eodManifest.chunks.length) {
      const first = eodManifest.chunks.find((chunk) => chunk?.chunk_id === '000') || eodManifest.chunks[0];
      if (first?.file) return `/data/${String(first.file).replace(/^\/+/, '')}`;
    }
    return '/data/eod/batches/eod.latest.000.json';
  })();

  const universe = {
    id: UNIVERSE_ID,
    generated_at: pipelineLatest.generated_at || generatedAt,
    asof: pipelineLatest.generated_at || generatedAt,
    expected: counts.expected,
    fetched: counts.fetched,
    validated: counts.validated,
    computed: counts.computed,
    static_ready: counts.static_ready,
    status,
    refs: {
      pipeline: `/data/pipeline/${UNIVERSE_ID}.latest.json`,
      manifest: manifestRef,
      batch0: batch0Ref
    }
  };

  const overallStatus = status === 'OK' ? 'OK' : status;

  const freshness = opsDaily?.baseline?.freshness || {};
  const expectedTradingDay = typeof freshness.expectedTradingDay === 'string' ? freshness.expectedTradingDay : null;
  const staleSymbolsCount = Number.isFinite(Number(freshness.staleCount)) ? Number(freshness.staleCount) : 0;

  const summary = {
    schema_version: SUMMARY_SCHEMA,
    generated_at: generatedAt,
    asof: opsDaily?.generated_at || opsDaily?.asOf || generatedAt,
    overall: {
      status: overallStatus,
      reasons,
      stale_universes: [],
      stale_symbols_count: staleSymbolsCount,
      expected_trading_day: expectedTradingDay
    },
    universes: [universe],
    providers: buildProviders(opsDaily),
    ops_daily: {
      generated_at: opsDaily?.generated_at || opsDaily?.asOf || null,
      ref: '/data/ops-daily.json'
    },
    costs: buildCosts(opsDaily),
    safety: buildSafety(opsDaily)
  };

  await atomicWriteJson('public/data/ops/summary.latest.json', summary);
  process.stdout.write(`OK: ops summary generated (status=${overallStatus})\n`);
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
