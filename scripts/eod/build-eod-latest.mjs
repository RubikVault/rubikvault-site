import fs from 'node:fs/promises';
import path from 'node:path';

import { writeJsonAtomic } from '../lib/fs-atomic.mjs';
import { classifyError } from '../lib/error-classify.mjs';
import { validateEodRecord } from '../lib/validate-eod.mjs';

const REPO_ROOT = process.cwd();
const DEFAULT_CHUNK_SIZE = 500;
const CONCURRENCY = 5;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 8000;

function isoNow() {
  return new Date().toISOString();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function parseArgs(argv) {
  const out = {
    universe: null,
    chunkSize: DEFAULT_CHUNK_SIZE,
    outDir: 'public/data'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--universe') {
      out.universe = argv[i + 1] || null;
      i += 1;
    } else if (arg === '--chunk-size') {
      out.chunkSize = Number(argv[i + 1]) || DEFAULT_CHUNK_SIZE;
      i += 1;
    } else if (arg === '--out') {
      out.outDir = argv[i + 1] || out.outDir;
      i += 1;
    }
  }

  return out;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function readStaticReadyCount(outRoot, universe) {
  const filePath = path.join(outRoot, 'pipeline', `${universe}.static-ready.json`);
  try {
    const doc = await readJson(filePath);
    const count = Number(doc?.count);
    return Number.isInteger(count) ? count : null;
  } catch {
    return null;
  }
}

function extractUniverseSymbols(payload) {
  if (!Array.isArray(payload)) return [];
  const symbols = new Set();
  for (const row of payload) {
    if (typeof row === 'string') {
      const sym = normalizeSymbol(row);
      if (sym) symbols.add(sym);
      continue;
    }
    const sym = normalizeSymbol(row?.ticker ?? row?.symbol ?? row?.code ?? null);
    if (sym) symbols.add(sym);
  }
  return Array.from(symbols).sort();
}

function toIsoDate(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTiingoRow(symbol, row) {
  if (!row || typeof row !== 'object') return null;
  return {
    symbol,
    date: toIsoDate(row?.date),
    open: toNumber(row?.open),
    high: toNumber(row?.high),
    low: toNumber(row?.low),
    close: toNumber(row?.close),
    volume: toNumber(row?.volume)
  };
}

function pickLatestRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sorted = rows
    .filter((row) => row && row.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestEodOnce(symbol, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`);
  url.searchParams.set('token', token);
  url.searchParams.set('resampleFreq', 'daily');
  url.searchParams.set('startDate', startDate);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      return { ok: false, error, httpStatus: res.status };
    }

    const payload = await res.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      const error = new Error('empty_payload');
      error.status = res.status;
      return { ok: false, error, httpStatus: res.status };
    }

    const latest = pickLatestRow(payload);
    if (!latest) {
      const error = new Error('no_latest_row');
      error.status = res.status;
      return { ok: false, error, httpStatus: res.status };
    }

    const record = normalizeTiingoRow(symbol, latest);
    if (!record) {
      const error = new Error('normalize_failed');
      error.status = res.status;
      return { ok: false, error, httpStatus: res.status };
    }

    return { ok: true, record, httpStatus: res.status };
  } finally {
    clearTimeout(timer);
  }
}

function isTransientClass(cls) {
  return cls === 'UPSTREAM_TIMEOUT' || cls === 'UPSTREAM_5XX' || cls === 'RATE_LIMIT';
}

async function fetchLatestEodWithRetry(symbol, token) {
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await fetchLatestEodOnce(symbol, token);
      if (result.ok) return result;
      lastError = result.error;
      lastStatus = result.httpStatus;
      const classification = classifyError(result.error, { httpStatus: result.httpStatus });
      if (!isTransientClass(classification.class) || attempt >= MAX_RETRIES) {
        return { ok: false, error: result.error, httpStatus: result.httpStatus, classification };
      }
    } catch (error) {
      lastError = error;
      lastStatus = null;
      const classification = classifyError(error, {});
      if (!isTransientClass(classification.class) || attempt >= MAX_RETRIES) {
        return { ok: false, error, httpStatus: null, classification };
      }
    }

    const backoffMs = 500 * Math.pow(2, attempt);
    await sleep(backoffMs);
  }

  const fallback = classifyError(lastError || new Error('retry_exhausted'), { httpStatus: lastStatus });
  return { ok: false, error: lastError, httpStatus: lastStatus, classification: fallback };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function buildDegradedSample(failures) {
  const sorted = [...failures].sort((a, b) => {
    if (a.stage !== b.stage) return String(a.stage).localeCompare(String(b.stage));
    if (a.class !== b.class) return String(a.class).localeCompare(String(b.class));
    return String(a.symbol).localeCompare(String(b.symbol));
  });
  return sorted.slice(0, 25);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.universe) {
    throw new Error('Missing --universe');
  }

  const startedAt = isoNow();
  const outRoot = path.resolve(REPO_ROOT, args.outDir);
  const staticReadyTruthCount = await readStaticReadyCount(outRoot, args.universe);

  const universePath = path.join(outRoot, 'universe', `${args.universe}.json`);
  const universePayload = await readJson(universePath);
  const symbols = extractUniverseSymbols(universePayload);

  const token = process.env.TIINGO_API_KEY ?? process.env.TIIANGO_API_KEY;
  const failures = [];
  const errorsByClass = {};

  const bumpClass = (cls) => {
    errorsByClass[cls] = (errorsByClass[cls] || 0) + 1;
  };

  if (!token) {
    const classification = classifyError({ code: 'NO_API_KEY' }, { missingApiKey: true });
    const degraded = symbols.map((symbol) => ({
      symbol,
      stage: 'fetch',
      class: classification.class,
      hint: classification.hint,
      since: startedAt
    }));

    degraded.forEach((entry) => bumpClass(entry.class));

    const degradedSummary = {
      count: degraded.length,
      classes: errorsByClass,
      sample: buildDegradedSample(degraded)
    };

    const manifest = {
      schema_version: '1.0',
      type: 'eod.latest.manifest',
      generated_at: startedAt,
      universe: args.universe,
      total_symbols: symbols.length,
      chunk_size: args.chunkSize,
      chunks: [],
      errors_by_class: errorsByClass
    };

    const manifestPath = path.join(outRoot, 'eod', 'manifest.latest.json');
    await writeJsonAtomic(manifestPath, manifest);

    const staticReadyCount = Number.isInteger(staticReadyTruthCount) ? staticReadyTruthCount : 0;
    const pipelineTruth = {
      schema_version: '1.0',
      type: 'pipeline.truth',
      generated_at: startedAt,
      universe: args.universe,
      refs: {
        universe_ref: `/data/universe/${args.universe}.json`,
        eod_manifest_ref: '/data/eod/manifest.latest.json'
      },
      counts: {
        expected: symbols.length,
        fetched: 0,
        validated: 0,
        computed: 0,
        static_ready: staticReadyCount
      },
      root_failure: {
        class: classification.class,
        hint: classification.hint
      },
      degraded_summary: degradedSummary,
      metadata: {
        computed_not_applicable: true
      }
    };

    const pipelinePath = path.join(outRoot, 'pipeline', `${args.universe}.latest.json`);
    await writeJsonAtomic(pipelinePath, pipelineTruth);

    process.exitCode = 1;
    return;
  }

  const results = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
    const result = await fetchLatestEodWithRetry(symbol, token);
    if (!result.ok) {
      const classification = result.classification || classifyError(result.error, { httpStatus: result.httpStatus });
      failures.push({
        symbol,
        stage: 'fetch',
        class: classification.class,
        hint: classification.hint,
        since: startedAt
      });
      bumpClass(classification.class);
      return { symbol, fetchedOk: false, record: null };
    }

    const validation = validateEodRecord(result.record);
    if (!validation.ok) {
      const classification = classifyError({ message: validation.reason }, { stage: 'validate' });
      failures.push({
        symbol,
        stage: 'validate',
        class: classification.class,
        hint: validation.reason || classification.hint,
        since: startedAt
      });
      bumpClass(classification.class);
      return { symbol, fetchedOk: true, record: null };
    }

    return { symbol, fetchedOk: true, record: result.record };
  });

  const recordsBySymbol = {};
  let fetchedCount = 0;
  let validatedCount = 0;

  for (const entry of results) {
    if (entry.fetchedOk) fetchedCount += 1;
    if (entry.record) {
      recordsBySymbol[entry.symbol] = entry.record;
      validatedCount += 1;
    }
  }

  const chunkSize = Math.max(1, Math.trunc(args.chunkSize) || DEFAULT_CHUNK_SIZE);
  const chunks = [];
  let writeFailed = false;

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunkSymbols = symbols.slice(i, i + chunkSize);
    const chunkId = String(chunks.length).padStart(3, '0');
    const data = {};
    let okCount = 0;

    for (const symbol of chunkSymbols) {
      const record = recordsBySymbol[symbol];
      if (!record) continue;
      data[symbol] = record;
      okCount += 1;
    }

    const batch = {
      schema_version: '1.0',
      type: 'eod.latest.batch',
      generated_at: startedAt,
      universe: args.universe,
      chunk_id: chunkId,
      chunk_size: chunkSize,
      symbols: chunkSymbols,
      data
    };

    const batchRelPath = `eod/batches/eod.latest.${chunkId}.json`;
    const batchPath = path.join(outRoot, batchRelPath);

    try {
      await writeJsonAtomic(batchPath, batch);
    } catch (error) {
      writeFailed = true;
      const classification = classifyError(error, { stage: 'write' });
      failures.push({
        symbol: 'ALL',
        stage: 'write',
        class: classification.class,
        hint: classification.hint,
        since: startedAt
      });
      bumpClass(classification.class);
      break;
    }

    chunks.push({
      chunk_id: chunkId,
      file: batchRelPath,
      count: chunkSymbols.length,
      ok: okCount,
      errors: chunkSymbols.length - okCount
    });
  }

  const manifest = {
    schema_version: '1.0',
    type: 'eod.latest.manifest',
    generated_at: startedAt,
    universe: args.universe,
    total_symbols: symbols.length,
    chunk_size: chunkSize,
    chunks,
    errors_by_class: errorsByClass
  };

  const manifestPath = path.join(outRoot, 'eod', 'manifest.latest.json');

  try {
    await writeJsonAtomic(manifestPath, manifest);
  } catch (error) {
    writeFailed = true;
    const classification = classifyError(error, { stage: 'write' });
    failures.push({
      symbol: 'ALL',
      stage: 'write',
      class: classification.class,
      hint: classification.hint,
      since: startedAt
    });
    bumpClass(classification.class);
  }

  const degradedSummary = {
    count: failures.length,
    classes: errorsByClass,
    sample: buildDegradedSample(failures)
  };

  const staticReadyCount = Number.isInteger(staticReadyTruthCount)
    ? staticReadyTruthCount
    : writeFailed
      ? 0
      : validatedCount;
  const pipelineTruth = {
    schema_version: '1.0',
    type: 'pipeline.truth',
    generated_at: startedAt,
    universe: args.universe,
    refs: {
      universe_ref: `/data/universe/${args.universe}.json`,
      eod_manifest_ref: '/data/eod/manifest.latest.json'
    },
    counts: {
      expected: symbols.length,
      fetched: fetchedCount,
      validated: validatedCount,
      computed: validatedCount,
      static_ready: staticReadyCount
    },
    root_failure: writeFailed
      ? { class: 'WRITE_FAILED', hint: 'Failed to write one or more artifacts' }
      : null,
    degraded_summary: degradedSummary,
    metadata: {
      computed_not_applicable: true
    }
  };

  const pipelinePath = path.join(outRoot, 'pipeline', `${args.universe}.latest.json`);
  await writeJsonAtomic(pipelinePath, pipelineTruth);

  if (writeFailed) {
    process.stderr.write('FAIL: Write failed for one or more artifacts\n');
    process.exitCode = 1;
    return;
  }

  if (symbols.length > 0 && fetchedCount === 0) {
    process.stderr.write(`FAIL: expected=${symbols.length} but fetched=0 (empty artifact generation blocked)\n`);
    process.exitCode = 1;
    return;
  }

  const rateLimitErrors = errorsByClass['RATE_LIMIT'] || 0;
  if (rateLimitErrors > 0 && validatedCount === 0) {
    process.stderr.write(`FAIL: RATE_LIMIT errors=${rateLimitErrors} and validated=0 (empty artifact generation blocked)\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`OK: eod-latest artifacts generated (fetched=${fetchedCount}/${symbols.length})\n`);
}

await main();
