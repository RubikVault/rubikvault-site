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

  const universe = await readJsonRel('public/data/universe/nasdaq100.json');
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
}

await main();
