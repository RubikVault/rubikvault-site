#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

import { analyzeMarketPhase } from '../marketphase-core.mjs';

const REPO_ROOT = process.cwd();
const REGISTRY_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const BY_FEATURE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.by_feature.json');
const HISTORY_ROOT = path.join(REPO_ROOT, 'mirrors/universe-v7');
const OUT_SUMMARY = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
const OUT_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/reports/marketphase_deep_report.json');
const OUT_SUMMARY_CANONICAL = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_canonical_summary.json');
const OUT_REPORT_CANONICAL = path.join(REPO_ROOT, 'public/data/universe/v7/reports/marketphase_deep_canonical_report.json');

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function readJson(absPath) {
  try {
    const raw = await fsp.readFile(absPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(absPath, data) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, absPath);
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    minBars: 200,
    maxSymbols: Infinity,
    asOf: null,
    feature: 'marketphase',
    idMode: 'symbol'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--min-bars') out.minBars = Number(argv[++i] || out.minBars);
    else if (token === '--max-symbols') out.maxSymbols = Number(argv[++i] || out.maxSymbols);
    else if (token === '--as-of') out.asOf = String(argv[++i] || '').slice(0, 10) || null;
    else if (token === '--feature') out.feature = String(argv[++i] || out.feature).trim().toLowerCase() || out.feature;
    else if (token === '--id-mode') out.idMode = String(argv[++i] || out.idMode).trim().toLowerCase() || out.idMode;
  }
  if (!Number.isFinite(out.minBars) || out.minBars < 1) out.minBars = 200;
  if (!Number.isFinite(out.maxSymbols) || out.maxSymbols < 1) out.maxSymbols = Infinity;
  if (!['symbol', 'canonical'].includes(out.idMode)) out.idMode = 'symbol';
  return out;
}

function computeWavePosition(elliott) {
  const completed = elliott?.completedPattern || {};
  const developing = elliott?.developingPattern || {};
  const fib = elliott?.fib || {};

  let wavePosition = 'unknown';
  const possibleWave = String(developing?.possibleWave || '');

  if (possibleWave.includes('4') || possibleWave.includes('ABC')) {
    wavePosition = completed.valid ? 'pre-wave-5' : 'in-correction';
  } else if (completed.valid && Number(fib?.conformanceScore || 0) > 50) {
    wavePosition = 'wave-1-start';
  } else {
    wavePosition = 'pre-wave-3';
  }

  if (!completed?.rules?.r2) {
    wavePosition = 'pre-wave-3';
  }

  return wavePosition;
}

async function loadFeatureTargetSet(featureName) {
  const doc = await readJson(BY_FEATURE_PATH);
  const list = Array.isArray(doc?.symbols?.[featureName])
    ? doc.symbols[featureName]
    : Array.isArray(doc?.symbols?.marketphase)
      ? doc.symbols.marketphase
      : [];
  const set = new Set();
  for (const item of list) {
    const ticker = normalize(item);
    if (ticker) set.add(ticker);
  }
  return set;
}

async function buildCandidates({ minBars, maxSymbols, targetSet, idMode = 'symbol' }) {
  if (!fs.existsSync(REGISTRY_GZ)) return { byTicker: new Map(), scan: {} };

  const byKey = new Map();
  const scan = {
    rows_total: 0,
    stock_rows: 0,
    stock_rows_in_target: 0,
    stock_rows_with_pack: 0,
    stock_rows_with_min_bars: 0,
    selected_candidates: 0,
    selected_candidate_variants: 0
  };

  const stream = fs.createReadStream(REGISTRY_GZ).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    scan.rows_total += 1;

    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    if (normalize(row?.type_norm) !== 'STOCK') continue;
    scan.stock_rows += 1;

    const ticker = normalize(row?.symbol);
    if (!ticker || (targetSet.size > 0 && !targetSet.has(ticker))) continue;
    scan.stock_rows_in_target += 1;

    const barsCount = Number(row?.bars_count || 0);
    const relPack = String(row?.pointers?.history_pack || '').trim();
    if (!relPack) continue;
    scan.stock_rows_with_pack += 1;

    if (!Number.isFinite(barsCount) || barsCount < minBars) continue;
    scan.stock_rows_with_min_bars += 1;

    const qualityBonus = String(row?._quality_basis || '').toLowerCase() === 'backfill_real' ? 1_000_000 : 0;
    const rank = qualityBonus + barsCount;
    const candidate = {
      symbol: ticker,
      canonical_id: String(row?.canonical_id || '').trim(),
      name: String(row?.name || '').trim() || null,
      exchange: normalize(row?.exchange),
      bars_count: barsCount,
      history_pack: relPack,
      quality_basis: String(row?._quality_basis || '').trim().toLowerCase() || null,
      rank
    };

    if (!candidate.canonical_id) continue;

    const entryKey = idMode === 'canonical' ? candidate.canonical_id : ticker;
    const list = Array.isArray(byKey.get(entryKey)) ? byKey.get(entryKey) : [];
    if (!list.some((entry) => entry.canonical_id === candidate.canonical_id)) {
      list.push(candidate);
    }
    list.sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });
    byKey.set(entryKey, list.slice(0, 8));
  }

  let selected = [...byKey.entries()].map(([entryKey, list]) => ({
    entry_key: entryKey,
    candidates: list,
    rank: list[0]?.rank ?? 0
  })).sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.entry_key.localeCompare(b.entry_key);
  });

  if (Number.isFinite(maxSymbols)) {
    selected = selected.slice(0, maxSymbols);
  }

  const limited = new Map(selected.map((entry) => [entry.entry_key, entry.candidates]));
  scan.selected_candidates = limited.size;
  scan.selected_candidate_variants = [...limited.values()].reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);

  return { byKey: limited, scan };
}

async function loadPackRows(packPath) {
  const rows = [];
  const stream = fs.createReadStream(packPath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore invalid row
    }
  }
  return rows;
}

function normalizeBars(rawBars, asOfDate = null) {
  const out = [];
  for (const bar of Array.isArray(rawBars) ? rawBars : []) {
    const date = String(bar?.date || '').slice(0, 10);
    if (!date) continue;
    if (asOfDate && date > asOfDate) continue;

    const close = toFinite(bar?.adjusted_close ?? bar?.adj_close ?? bar?.close);
    const open = toFinite(bar?.open) ?? close;
    const high = toFinite(bar?.high) ?? close;
    const low = toFinite(bar?.low) ?? close;
    if (close === null || open === null || high === null || low === null) continue;
    // Drop non-positive OHLC rows (common zero-fill artifacts in some sources) so they don't poison recent regime features.
    if (close <= 0 || open <= 0 || high <= 0 || low <= 0) continue;

    out.push({ date, open, high, low, close });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function buildDeepItem(candidate, analysis, bars, generatedAt, idMode = 'symbol') {
  const completed = analysis?.elliott?.completedPattern || {};
  const uncertainty = analysis?.elliott?.uncertainty || {};
  const fib = analysis?.elliott?.fib || {};
  const rawFeatures = analysis?.features || {};
  const adjustedConfidence = Number(uncertainty?.confidenceDecay?.adjusted);
  const rawConfidence = Number(completed?.confidence0_100 || 0);
  const confidence = Number.isFinite(adjustedConfidence) ? adjustedConfidence : rawConfidence;
  const lastClose = toFinite(bars[bars.length - 1]?.close);

  const features = {
    RSI: toFinite(rawFeatures?.RSI),
    MACDHist: toFinite(rawFeatures?.MACDHist),
    'ATR%': toFinite(rawFeatures?.['ATR%']),
    SMA50: toFinite(rawFeatures?.SMA50),
    SMA200: toFinite(rawFeatures?.SMA200),
    SMATrend: typeof rawFeatures?.SMATrend === 'string' ? rawFeatures.SMATrend : 'unknown',
    lastClose
  };

  return {
    id_mode: idMode,
    key_id: idMode === 'canonical' ? candidate.canonical_id : candidate.symbol,
    symbol: candidate.symbol,
    canonical_id: candidate.canonical_id,
    name: candidate.name,
    exchange: candidate.exchange || null,
    source: 'marketphase_deep',
    generated_at: generatedAt,
    bars_count: bars.length,
    last_bar_date: bars[bars.length - 1]?.date || null,
    wavePosition: computeWavePosition(analysis?.elliott),
    confidence,
    direction: completed?.direction || 'neutral',
    fibConformance: Number.isFinite(Number(fib?.conformanceScore)) ? Number(fib.conformanceScore) : null,
    validPattern: Boolean(completed?.valid),
    features
  };
}

async function main() {
  const startedAt = nowIso();
  const args = parseArgs();
  const targetSet = await loadFeatureTargetSet(args.feature);

  const { byKey, scan } = await buildCandidates({
    minBars: args.minBars,
    maxSymbols: args.maxSymbols,
    targetSet,
    idMode: args.idMode
  });

  const byPack = new Map();
  const topRankByKey = new Map();
  for (const [entryKey, candidates] of byKey.entries()) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    if (!list.length) continue;
    topRankByKey.set(entryKey, list[0]?.rank ?? 0);
    for (const candidate of list) {
      const rel = candidate.history_pack;
      if (!byPack.has(rel)) byPack.set(rel, []);
      byPack.get(rel).push(candidate);
    }
  }

  const generatedAt = nowIso();
  const bestByKey = new Map();
  const errors = [];

  for (const [relPack, candidates] of [...byPack.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const absPack = path.join(HISTORY_ROOT, relPack);
    if (!fs.existsSync(absPack)) {
      for (const candidate of candidates) {
        errors.push({ symbol: candidate.symbol, canonical_id: candidate.canonical_id, reason: 'history_pack_missing', pack: relPack });
      }
      continue;
    }

    const rows = await loadPackRows(absPack);
    const wantedByCanonical = new Map(candidates.map((candidate) => [candidate.canonical_id, candidate]));

    for (const row of rows) {
      const canonical = String(row?.canonical_id || '').trim();
      if (!canonical) continue;
      const candidate = wantedByCanonical.get(canonical);
      if (!candidate) continue;

      const bars = normalizeBars(row?.bars, args.asOf);
      const keyId = args.idMode === 'canonical' ? candidate.canonical_id : candidate.symbol;
      if (bars.length < args.minBars) {
        if ((candidate.rank || 0) >= (topRankByKey.get(keyId) || 0)) {
          errors.push({ symbol: candidate.symbol, canonical_id: candidate.canonical_id, reason: 'bars_below_min_after_normalize', bars: bars.length });
        }
        continue;
      }

      try {
        const analysis = analyzeMarketPhase(candidate.symbol, bars);
        const deepItem = buildDeepItem(candidate, analysis, bars, generatedAt, args.idMode);
        const existing = bestByKey.get(keyId);
        const candidateRank = Number(candidate.rank || 0);
        const existingRank = Number(existing?.rank || 0);
        const existingBars = Number(existing?.bars_count || 0);
        if (!existing || candidateRank > existingRank || (candidateRank === existingRank && bars.length > existingBars)) {
          bestByKey.set(keyId, {
            item: deepItem,
            rank: candidateRank,
            bars_count: bars.length
          });
        }
      } catch (error) {
        if ((candidate.rank || 0) >= (topRankByKey.get(keyId) || 0)) {
          errors.push({ symbol: candidate.symbol, canonical_id: candidate.canonical_id, reason: 'analyze_failed', message: error?.message || String(error) });
        }
      }
    }
  }

  const items = [...bestByKey.values()].map((entry) => entry.item);
  if (args.idMode === 'canonical') {
    items.sort((a, b) => String(a.canonical_id).localeCompare(String(b.canonical_id)));
  } else {
    items.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  }

  const outSummary = args.idMode === 'canonical' ? OUT_SUMMARY_CANONICAL : OUT_SUMMARY;
  const outReport = args.idMode === 'canonical' ? OUT_REPORT_CANONICAL : OUT_REPORT;

  const summary = {
    schema: 'rv_v7_marketphase_deep_summary_v1',
    generated_at: generatedAt,
    as_of: args.asOf || null,
    min_bars: args.minBars,
    feature_scope: args.feature,
    id_mode: args.idMode,
    count: items.length,
    items
  };

  const report = {
    schema: 'rv_v7_marketphase_deep_report_v1',
    started_at: startedAt,
    finished_at: nowIso(),
    args,
    sources: {
      registry: 'public/data/universe/v7/registry/registry.ndjson.gz',
      by_feature: 'public/data/universe/v7/ssot/stocks.by_feature.json',
      history_root: 'mirrors/universe-v7'
    },
    scan,
    output: {
      summary_path: path.relative(REPO_ROOT, outSummary),
      count: items.length
    },
    errors: {
      count: errors.length,
      sample: errors.slice(0, 100)
    }
  };

  await writeJsonAtomic(outSummary, summary);
  await writeJsonAtomic(outReport, report);

  console.log(JSON.stringify({
    ok: true,
    out_summary: path.relative(REPO_ROOT, outSummary),
    out_report: path.relative(REPO_ROOT, outReport),
    items: items.length,
    scan,
    errors: { count: errors.length }
  }, null, 2));
}

main().catch((error) => {
  console.error('[build-marketphase-deep-summary] failed:', error?.message || error);
  process.exit(1);
});
