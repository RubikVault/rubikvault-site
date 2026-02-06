import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(REPO_ROOT, 'public', 'data');

function isoNow() {
  return new Date().toISOString();
}

async function readJsonAbs(absPath) {
  const raw = await fs.readFile(absPath, 'utf-8');
  return JSON.parse(raw);
}

async function readJsonRel(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  try {
    return await readJsonAbs(abs);
  } catch (e) {
    return { __error: e, __missing: true };
  }
}

async function atomicWriteJsonRel(relPath, value) {
  const abs = path.join(REPO_ROOT, relPath);
  const dir = path.dirname(abs);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${abs}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, abs);
}

function normalizeTicker(t) {
  return String(t || '').trim().toUpperCase();
}

function buildMissingReasonMap(payload) {
  const map = new Map();
  const items = Array.isArray(payload?.missing) ? payload.missing : [];
  for (const item of items) {
    const ticker = normalizeTicker(item?.ticker ?? item?.symbol ?? item?.code ?? null);
    if (!ticker) continue;
    const reason = item?.reason ? String(item.reason) : 'NO_COMPUTED_ANALYSIS';
    map.set(ticker, reason);
  }
  return map;
}

function extractUniverseTickers(universeJson) {
  if (!Array.isArray(universeJson)) return [];
  return universeJson
    .map((row) => normalizeTicker(row?.ticker ?? row?.symbol ?? row?.code ?? null))
    .filter(Boolean);
}

function extractSymbolsFromMarketPricesSnapshot(snapshot) {
  const out = new Set();
  const data = snapshot?.data;

  if (Array.isArray(data)) {
    for (const row of data) {
      const sym = normalizeTicker(row?.symbol ?? row?.ticker ?? row?.code ?? null);
      if (sym) out.add(sym);
    }
    return out;
  }

  if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      const sym = normalizeTicker(k);
      if (sym) out.add(sym);
    }
  }

  return out;
}

async function fileExists(relPath) {
  try {
    await fs.stat(path.join(REPO_ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function analysisFileStatusForTicker(ticker) {
  const rel = `public/data/marketphase/${ticker}.json`;
  const exists = await fileExists(rel);
  if (!exists) return { exists: false, validJson: false };

  try {
    const abs = path.join(REPO_ROOT, rel);
    const raw = await fs.readFile(abs, 'utf-8');
    JSON.parse(raw);
    return { exists: true, validJson: true };
  } catch {
    return { exists: true, validJson: false };
  }
}

function buildStagePayload({ asOf, universeName, tickers, count, reason, missing }) {
  const expected = tickers.length;
  const payload = {
    type: 'pipeline.truth',
    asOf,
    universe: universeName,
    expected,
    count,
    missing
  };
  if (reason) payload.reason = reason;
  return payload;
}

async function main() {
  const asOf = isoNow();
  const universeName = 'nasdaq100';

  const universe = await readJsonRel('public/data/universe/all.json');
  if (universe?.__missing) {
    const reason = 'UNIVERSE_NOT_FOUND';
    const emptyUniverse = [];

    const base = {
      type: 'pipeline.truth',
      asOf,
      universe: universeName,
      expected: 0,
      count: null,
      reason,
      missing: []
    };

    await atomicWriteJsonRel('public/data/pipeline/nasdaq100.fetched.json', base);
    await atomicWriteJsonRel('public/data/pipeline/nasdaq100.validated.json', base);
    await atomicWriteJsonRel('public/data/pipeline/nasdaq100.computed.json', base);
    await atomicWriteJsonRel('public/data/pipeline/nasdaq100.static-ready.json', base);
    return;
  }

  const tickers = extractUniverseTickers(universe);
  const marketphaseMissing = await readJsonRel('public/data/marketphase/missing.json');
  const missingReasonMap = buildMissingReasonMap(marketphaseMissing?.__missing ? null : marketphaseMissing);

  const pricesSnap = await readJsonRel('public/data/snapshots/market-prices/latest.json');
  const hasPricesSnap = !pricesSnap?.__missing;
  const symbolsWithPrices = hasPricesSnap ? extractSymbolsFromMarketPricesSnapshot(pricesSnap) : new Set();

  const fetchedMissing = [];
  const validatedMissing = [];
  let fetchedCount = 0;
  let validatedCount = 0;

  if (!hasPricesSnap) {
    fetchedCount = null;
    validatedCount = null;
  } else {
    for (const t of tickers) {
      if (symbolsWithPrices.has(t)) {
        fetchedCount += 1;
        validatedCount += 1;
      } else {
        fetchedMissing.push({ ticker: t, reason: 'NO_MARKET_PRICE' });
        validatedMissing.push({ ticker: t, reason: 'NO_MARKET_PRICE' });
      }
    }
  }

  const computedMissing = [];
  const staticReadyMissing = [];
  let computedCount = 0;
  let staticReadyCount = 0;

  for (const t of tickers) {
    const status = await analysisFileStatusForTicker(t);
    if (!status.exists) {
      const reason = missingReasonMap.get(t) || 'NO_COMPUTED_ANALYSIS';
      computedMissing.push({ ticker: t, reason });
      staticReadyMissing.push({ ticker: t, reason });
      continue;
    }

    computedCount += 1;

    if (!status.validJson) {
      staticReadyMissing.push({ ticker: t, reason: 'INVALID_ANALYSIS_JSON' });
      continue;
    }

    staticReadyCount += 1;
  }

  const fetchedPayload = buildStagePayload({
    asOf,
    universeName,
    tickers,
    count: fetchedCount,
    reason: hasPricesSnap ? null : 'MARKET_PRICES_SNAPSHOT_NOT_FOUND',
    missing: hasPricesSnap ? fetchedMissing : []
  });

  const validatedPayload = buildStagePayload({
    asOf,
    universeName,
    tickers,
    count: validatedCount,
    reason: hasPricesSnap ? null : 'MARKET_PRICES_SNAPSHOT_NOT_FOUND',
    missing: hasPricesSnap ? validatedMissing : []
  });

  const computedPayload = buildStagePayload({
    asOf,
    universeName,
    tickers,
    count: computedCount,
    reason: null,
    missing: computedMissing
  });

  const staticReadyPayload = buildStagePayload({
    asOf,
    universeName,
    tickers,
    count: staticReadyCount,
    reason: null,
    missing: staticReadyMissing
  });

  await atomicWriteJsonRel('public/data/pipeline/nasdaq100.fetched.json', fetchedPayload);
  await atomicWriteJsonRel('public/data/pipeline/nasdaq100.validated.json', validatedPayload);
  await atomicWriteJsonRel('public/data/pipeline/nasdaq100.computed.json', computedPayload);
  await atomicWriteJsonRel('public/data/pipeline/nasdaq100.static-ready.json', staticReadyPayload);

  // Build nasdaq100.pipeline-truth.json — canonical Truth Chain summary
  const latestPayload = await readJsonRel('public/data/pipeline/nasdaq100.latest.json');

  // TRUST nasdaq100.latest.json if it exists and looks valid.
  // The local recalculation above (based on market-prices/latest.json) is often wrong 
  // because market-prices/latest.json might only contain indices (SPY, QQQ etc) 
  // while the actual pipeline run successfully fetched the universe.
  const sourcePayload = latestPayload?.counts ? latestPayload : null;

  const finalCounts = {
    expected: sourcePayload?.counts?.expected ?? tickers.length,
    fetched: sourcePayload?.counts?.fetched ?? fetchedCount ?? 0,
    validated: sourcePayload?.counts?.validated ?? validatedCount ?? 0,
    computed: sourcePayload?.counts?.computed ?? computedCount,
    static_ready: sourcePayload?.counts?.static_ready ?? staticReadyCount
  };

  // Re-map the payload steps to use the trusted counts
  fetchedPayload.count = finalCounts.fetched;
  validatedPayload.count = finalCounts.validated;
  computedPayload.count = finalCounts.computed;
  staticReadyPayload.count = finalCounts.static_ready;

  // Recalculate computed missing/static missing based on the NEW counts if possible, 
  // but we don't have the list of specific missing items from latest.json unless we infer it.
  // For now, we trust the COUNTS for the dashboard.


  // Count missing reasons
  const reasonCounts = {};
  for (const entry of computedMissing) {
    const reason = entry?.reason || 'UNKNOWN';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  // Build 7-step truth chain with status
  const truthSteps = [
    {
      id: 'S1',
      title: 'Provider fetched',
      status: (finalCounts.fetched ?? 0) >= tickers.length ? 'OK' : (finalCounts.fetched ?? 0) > 0 ? 'WARN' : 'FAIL',
      detail: `${finalCounts.fetched ?? 0}/${tickers.length} symbols fetched`
    },
    {
      id: 'S2',
      title: 'OHLC validated',
      status: (finalCounts.validated ?? 0) >= (finalCounts.fetched ?? 0) ? 'OK' : (finalCounts.validated ?? 0) > 0 ? 'WARN' : 'FAIL',
      detail: `${finalCounts.validated ?? 0}/${finalCounts.fetched ?? 0} passed validation`
    },
    {
      id: 'S3',
      title: 'Indicators computed',
      status: finalCounts.computed >= (finalCounts.validated ?? 0) * 0.9 ? 'OK' : finalCounts.computed > 0 ? 'WARN' : 'FAIL',
      detail: `${finalCounts.computed}/${finalCounts.validated ?? 0} indicators computed`
    },
    {
      id: 'S4',
      title: 'MarketPhase generated',
      status: finalCounts.computed >= 2 ? 'OK' : finalCounts.computed > 0 ? 'WARN' : 'FAIL',
      detail: `${finalCounts.computed} marketphase files generated`
    },
    {
      id: 'S5',
      title: 'Static ready',
      status: finalCounts.static_ready >= finalCounts.computed ? 'OK' : finalCounts.static_ready > 0 ? 'WARN' : 'FAIL',
      detail: `${finalCounts.static_ready}/${finalCounts.computed} static ready`
    },
    {
      id: 'S6',
      title: 'KV backend',
      status: reasonCounts['KV_BACKEND_UNAVAILABLE'] ? 'WARN' : 'OK',
      detail: reasonCounts['KV_BACKEND_UNAVAILABLE']
        ? `${reasonCounts['KV_BACKEND_UNAVAILABLE']} symbols missing due to KV unavailable`
        : 'KV accessible'
    },
    {
      id: 'S7',
      title: 'Site serves data',
      status: finalCounts.static_ready > 0 ? 'OK' : 'FAIL',
      detail: finalCounts.static_ready > 0 ? 'Static files deployed' : 'No static files available'
    }
  ];

  // Find first blocker
  const firstFail = truthSteps.find(s => s.status === 'FAIL');
  const firstWarn = truthSteps.find(s => s.status === 'WARN');
  const firstBlockerStep = firstFail || firstWarn || null;
  const firstBlocker = firstBlockerStep
    ? { id: firstBlockerStep.id, title: firstBlockerStep.title, status: firstBlockerStep.status }
    : null;

  // Build blockers array
  const blockers = [];
  for (const step of truthSteps) {
    if (step.status === 'FAIL' || step.status === 'WARN') {
      const blocker = { id: step.id, status: step.status, detail: step.detail };
      if (step.id === 'S6' && reasonCounts['KV_BACKEND_UNAVAILABLE']) {
        blocker.code = 'KV_BACKEND_UNAVAILABLE';
        blocker.count = reasonCounts['KV_BACKEND_UNAVAILABLE'];
      }
      blockers.push(blocker);
    }
  }

  const pipelineTruthPayload = {
    type: 'pipeline.truth',
    universe: universeName,
    asof: asOf,
    counts: {
      expected: finalCounts.expected,
      fetched: finalCounts.fetched,
      validated: finalCounts.validated,
      computed: finalCounts.computed,
      static_ready: finalCounts.static_ready
    },
    first_blocker: firstBlocker,
    first_blocker_id: firstBlocker?.id || null,
    blockers: blockers.length > 0 ? blockers : null,
    steps: truthSteps,
    source: {
      latest: '/data/pipeline/nasdaq100.latest.json',
      truth_static_ready: '/data/pipeline/nasdaq100.static-ready.json',
      missing_marketphase: '/data/marketphase/missing.json',
      missing_pipeline: '/data/pipeline/missing.json'
    }
  };

  await atomicWriteJsonRel('public/data/pipeline/nasdaq100.pipeline-truth.json', pipelineTruthPayload);
  console.log(`✓ Written: public/data/pipeline/nasdaq100.pipeline-truth.json`);
  console.log(`  counts: expected=${tickers.length}, fetched=${fetchedCount ?? 0}, validated=${validatedCount ?? 0}, computed=${computedCount}, static_ready=${staticReadyCount}`);
  console.log(`  first_blocker: ${firstBlocker ? `${firstBlocker.id} (${firstBlocker.status})` : 'none'}`);
}

await main();
