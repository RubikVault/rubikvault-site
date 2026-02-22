#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const SSOT_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const REGISTRY_GZ_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const HISTORY_ROOT = path.join(REPO_ROOT, 'mirrors/universe-v7');
const HISTORY_INDEX_GZ_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/history_pack_canonical_index.json.gz');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_coverage.json');
const OUT_MISSING_LIST_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_missing_canonical_ids.json');

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function toFinite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readGzipJsonSafe(filePath) {
  try {
    const gz = await fsp.readFile(filePath);
    const raw = zlib.gunzipSync(gz).toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, filePath);
}

async function loadBestRegistryRowsForUniverse(universeSet) {
  const bestByTicker = new Map();
  if (!fs.existsSync(REGISTRY_GZ_PATH)) return bestByTicker;

  const stream = fs.createReadStream(REGISTRY_GZ_PATH).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (normalize(row?.type_norm) !== 'STOCK') continue;
    const ticker = normalize(row?.symbol);
    if (!ticker || !universeSet.has(ticker)) continue;

    const canonicalId = String(row?.canonical_id || '').trim();
    const historyPack = String(row?.pointers?.history_pack || '').trim();
    if (!canonicalId || !historyPack) continue;

    const bars = toFinite(row?.bars_count, 0) || 0;
    const quality = String(row?._quality_basis || '').toLowerCase();
    const rank = (quality === 'backfill_real' ? 1 : 0) * 1_000_000 + bars;

    const prev = bestByTicker.get(ticker);
    if (!prev || rank > prev.rank) {
      bestByTicker.set(ticker, {
        ticker,
        canonical_id: canonicalId,
        history_pack: historyPack,
        bars_count: bars,
        quality_basis: quality,
        rank
      });
    }
  }

  return bestByTicker;
}

async function computePackMatch(bestByTicker) {
  const byPack = new Map();
  for (const row of bestByTicker.values()) {
    const rel = row.history_pack;
    if (!byPack.has(rel)) byPack.set(rel, []);
    byPack.get(rel).push(row);
  }

  let totalCandidates = 0;
  let foundInPack = 0;
  let missingPackFile = 0;
  let scannedPacks = 0;
  const missingSample = [];
  const missingCanonicalIds = new Set();

  for (const [relPack, rows] of byPack.entries()) {
    scannedPacks += 1;
    totalCandidates += rows.length;
    const absPack = path.join(HISTORY_ROOT, relPack);
    if (!fs.existsSync(absPack)) {
      missingPackFile += rows.length;
      if (missingSample.length < 50) {
        for (const row of rows) {
          missingCanonicalIds.add(String(row.canonical_id || '').trim());
          missingSample.push({
            ticker: row.ticker,
            canonical_id: row.canonical_id,
            history_pack: relPack,
            reason: 'pack_file_missing'
          });
          if (missingSample.length >= 50) break;
        }
      }
      continue;
    }

    const wanted = new Map(rows.map((row) => [row.canonical_id, row]));
    const stream = fs.createReadStream(absPack).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line) continue;
      let packRow;
      try {
        packRow = JSON.parse(line);
      } catch {
        continue;
      }
      const canonicalId = String(packRow?.canonical_id || '').trim();
      if (!canonicalId || !wanted.has(canonicalId)) continue;
      foundInPack += 1;
      wanted.delete(canonicalId);
      if (wanted.size === 0) break;
    }

    if (wanted.size > 0 && missingSample.length < 50) {
      for (const row of wanted.values()) {
        missingCanonicalIds.add(String(row.canonical_id || '').trim());
        missingSample.push({
          ticker: row.ticker,
          canonical_id: row.canonical_id,
          history_pack: relPack,
          reason: 'canonical_missing_in_pack'
        });
        if (missingSample.length >= 50) break;
      }
    }
    if (wanted.size > 0) {
      for (const row of wanted.values()) {
        missingCanonicalIds.add(String(row.canonical_id || '').trim());
      }
    }
  }

  return {
    scanned_packs: scannedPacks,
    total_candidates: totalCandidates,
    found_in_pack: foundInPack,
    missing_in_pack: Math.max(0, totalCandidates - foundInPack),
    missing_pack_file: missingPackFile,
    found_ratio_pct: totalCandidates > 0 ? Number(((foundInPack / totalCandidates) * 100).toFixed(2)) : 0,
    missing_ratio_pct: totalCandidates > 0 ? Number((((totalCandidates - foundInPack) / totalCandidates) * 100).toFixed(2)) : 0,
    missing_sample: missingSample,
    missing_canonical_ids: [...missingCanonicalIds].filter(Boolean).sort((a, b) => a.localeCompare(b))
  };
}

async function main() {
  const ssotDoc = await readJsonSafe(SSOT_SYMBOLS_PATH);
  const universeSymbols = Array.isArray(ssotDoc?.symbols) ? ssotDoc.symbols.map(normalize).filter(Boolean) : [];
  const universeSet = new Set(universeSymbols);

  const bestByTicker = await loadBestRegistryRowsForUniverse(universeSet);
  const match = await computePackMatch(bestByTicker);

  const missingCanonicalIds = Array.isArray(match.missing_canonical_ids) ? match.missing_canonical_ids : [];
  const historyIndexDoc = await readGzipJsonSafe(HISTORY_INDEX_GZ_PATH);
  const historyIndex = historyIndexDoc?.by_canonical_id && typeof historyIndexDoc.by_canonical_id === 'object'
    ? historyIndexDoc.by_canonical_id
    : null;

  let resolvedInAnyPack = 0;
  if (historyIndex) {
    for (const canonicalId of missingCanonicalIds) {
      const packs = Array.isArray(historyIndex[canonicalId]) ? historyIndex[canonicalId] : [];
      if (packs.length > 0) {
        resolvedInAnyPack += 1;
      }
    }
  }

  const resolvedFound = match.found_in_pack + resolvedInAnyPack;
  const resolvedMissing = Math.max(0, match.total_candidates - resolvedFound);

  const packMatch = {
    ...match,
    missing_canonical_ids_count: missingCanonicalIds.length,
    resolved_in_any_pack: resolvedInAnyPack,
    resolved_found_in_pack: resolvedFound,
    resolved_missing_in_pack: resolvedMissing,
    resolved_ratio_pct: match.total_candidates > 0
      ? Number(((resolvedFound / match.total_candidates) * 100).toFixed(2))
      : 0
  };
  delete packMatch.missing_canonical_ids;
  const report = {
    schema: 'rv_v7_forecast_pack_coverage_v1',
    generated_at: nowIso(),
    sources: {
      ssot_symbols: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      registry: 'public/data/universe/v7/registry/registry.ndjson.gz',
      history_root: 'mirrors/universe-v7',
      history_pack_index: fs.existsSync(HISTORY_INDEX_GZ_PATH)
        ? 'public/data/universe/v7/reports/history_pack_canonical_index.json.gz'
        : null
    },
    universe: {
      symbols_total: universeSet.size,
      registry_best_rows: bestByTicker.size
    },
    pack_match: packMatch,
    notes: [
      'This report measures whether the best registry canonical row per symbol is physically present in the referenced history pack.',
      'Low found_ratio_pct explains forecast history shortfall even when registry bars_count is high.',
      'resolved_ratio_pct additionally counts canonical IDs found in any indexed pack (useful when pointers drift but data exists).'
    ]
  };

  const missingListDoc = {
    schema: 'rv_v7_forecast_pack_missing_canonical_ids_v1',
    generated_at: report.generated_at,
    source_report: 'public/data/universe/v7/reports/forecast_pack_coverage.json',
    canonical_ids: missingCanonicalIds
  };

  await writeJsonAtomic(OUT_PATH, report);
  await writeJsonAtomic(OUT_MISSING_LIST_PATH, missingListDoc);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out: path.relative(REPO_ROOT, OUT_PATH),
    missing_list_out: path.relative(REPO_ROOT, OUT_MISSING_LIST_PATH),
    universe_symbols: report.universe.symbols_total,
    registry_best_rows: report.universe.registry_best_rows,
    found_in_pack: match.found_in_pack,
    missing_in_pack: match.missing_in_pack,
    found_ratio_pct: match.found_ratio_pct,
    resolved_found_in_pack: resolvedFound,
    resolved_missing_in_pack: resolvedMissing,
    resolved_ratio_pct: packMatch.resolved_ratio_pct
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    message: error?.message || String(error)
  })}\n`);
  process.exit(1);
});
