#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const FORECAST_PACK_COVERAGE_CANDIDATES = [
  path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_coverage.json'),
  path.join(REPO_ROOT, 'mirrors/universe-v7/state/forecast_pack_coverage.json')
];
const FORECAST_PACK_MISSING_IDS_CANDIDATES = [
  path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_missing_canonical_ids.json'),
  path.join(REPO_ROOT, 'mirrors/universe-v7/state/forecast_pack_missing_canonical_ids.json')
];
const SSOT_SYMBOLS_PATH = path.join(
  REPO_ROOT,
  'public/data/universe/v7/ssot/stocks.max.symbols.json'
);
const REGISTRY_GZ_PATH = path.join(
  REPO_ROOT,
  'public/data/universe/v7/registry/registry.ndjson.gz'
);
const HISTORY_BASE = path.join(REPO_ROOT, 'mirrors/universe-v7');
const HISTORY_ROOT = path.join(REPO_ROOT, 'mirrors/universe-v7/history');
const OUT_REPORT_PATH = path.join(
  REPO_ROOT,
  'public/data/universe/v7/reports/forecast_missing_in_pack_found_elsewhere_report.json'
);

function nowIso() {
  return new Date().toISOString();
}

function normalizeCanonicalId(value) {
  return String(value || '').trim().toUpperCase();
}

function prefixFromFile(absPath) {
  const base = path.basename(absPath);
  if (/^pack_/i.test(base)) return 'pack';
  if (/^run_v7_/i.test(base)) return 'run_v7';
  if (/^inc_/i.test(base)) return 'inc';
  return 'other';
}

async function readJson(absPath) {
  const raw = await fsp.readFile(absPath, 'utf8');
  return JSON.parse(raw);
}

async function readJsonMaybe(absPath) {
  try {
    return await readJson(absPath);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(absPath, payload) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, absPath);
}

async function listHistoryNdjsonGz(rootDir) {
  const files = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (entry.isFile() && /\.ndjson\.gz$/i.test(entry.name)) {
        files.push(abs);
      }
    }
  }
  await walk(rootDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function firstExistingPath(paths = []) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function rankRegistryRow(row) {
  const bars = Number(row?.bars_count || 0) || 0;
  const quality = String(row?._quality_basis || '').toLowerCase();
  const qualityBonus = quality === 'backfill_real' ? 1_000_000 : 0;
  return qualityBonus + bars;
}

async function reconstructMissingCanonicalIds() {
  const ssot = await readJson(SSOT_SYMBOLS_PATH);
  const symbols = Array.isArray(ssot?.symbols) ? ssot.symbols : [];
  const symbolSet = new Set(
    symbols.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
  );
  const bestByTicker = new Map();

  if (!fs.existsSync(REGISTRY_GZ_PATH)) {
    return [];
  }

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
    if (String(row?.type_norm || '').toUpperCase() !== 'STOCK') continue;
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol || !symbolSet.has(symbol)) continue;

    const canonicalId = normalizeCanonicalId(row?.canonical_id);
    const historyPack = String(row?.pointers?.history_pack || '').trim();
    if (!canonicalId || !historyPack) continue;

    const rank = rankRegistryRow(row);
    const prev = bestByTicker.get(symbol);
    if (!prev || rank > prev.rank) {
      bestByTicker.set(symbol, { canonical_id: canonicalId, history_pack: historyPack, rank });
    }
  }

  const byPack = new Map();
  for (const row of bestByTicker.values()) {
    if (!byPack.has(row.history_pack)) byPack.set(row.history_pack, []);
    byPack.get(row.history_pack).push(row.canonical_id);
  }

  const missing = new Set();
  for (const [relPack, ids] of byPack.entries()) {
    const absPack = path.join(HISTORY_BASE, relPack);
    if (!fs.existsSync(absPack)) {
      for (const id of ids) missing.add(id);
      continue;
    }
    const wanted = new Set(ids);
    const packStream = fs.createReadStream(absPack).pipe(zlib.createGunzip());
    const packRl = readline.createInterface({ input: packStream, crlfDelay: Infinity });
    for await (const line of packRl) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const id = normalizeCanonicalId(row?.canonical_id);
      if (!id || !wanted.has(id)) continue;
      wanted.delete(id);
      if (wanted.size === 0) break;
    }
    for (const id of wanted) missing.add(id);
  }

  return [...missing].sort((a, b) => a.localeCompare(b));
}

async function loadMissingCanonicalIds(coverageDoc, missingIdsPath) {
  const fromCoverage = Array.isArray(coverageDoc?.pack_match?.missing_canonical_ids)
    ? coverageDoc.pack_match.missing_canonical_ids
    : null;
  if (fromCoverage && fromCoverage.length > 0) {
    return {
      ids: [...new Set(fromCoverage.map(normalizeCanonicalId).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      source: 'report.pack_match.missing_canonical_ids'
    };
  }

  const companion = missingIdsPath ? await readJsonMaybe(missingIdsPath) : null;
  const fromCompanion = Array.isArray(companion?.canonical_ids) ? companion.canonical_ids : [];
  if (fromCompanion.length > 0) {
    return {
      ids: [...new Set(fromCompanion.map(normalizeCanonicalId).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
      source: 'reconstructed'
    };
  }

  const reconstructed = await reconstructMissingCanonicalIds();
  return {
    ids: reconstructed,
    source: 'reconstructed'
  };
}

function extractCanonicalIdCandidates(row) {
  const candidates = [];
  const push = (value) => {
    const normalized = normalizeCanonicalId(value);
    if (normalized) candidates.push(normalized);
  };

  if (row && typeof row === 'object') {
    push(row.canonical_id);
    push(row.canonicalId);
    push(row.cid);
    push(row.id);
    if (row.meta && typeof row.meta === 'object') push(row.meta.canonical_id);
    if (row.payload && typeof row.payload === 'object') push(row.payload.canonical_id);
    if (row.data && typeof row.data === 'object') push(row.data.canonical_id);
  }

  return candidates;
}

async function main() {
  if (!fs.existsSync(HISTORY_ROOT)) {
    throw new Error(`Missing history root: ${HISTORY_ROOT}`);
  }

  const coveragePath = firstExistingPath(FORECAST_PACK_COVERAGE_CANDIDATES);
  const missingIdsPath = firstExistingPath(FORECAST_PACK_MISSING_IDS_CANDIDATES);
  const coverageDoc = coveragePath ? await readJsonMaybe(coveragePath) : null;
  const missingDoc = missingIdsPath ? await readJsonMaybe(missingIdsPath) : null;
  const reportedMissingCount = Number(coverageDoc?.pack_match?.missing_in_pack || missingDoc?.canonical_ids?.length || 0) || 0;

  if (reportedMissingCount === 0) {
    const idSource = Array.isArray(coverageDoc?.pack_match?.missing_canonical_ids)
      ? 'report.pack_match.missing_canonical_ids'
      : (missingIdsPath ? 'companion_missing_ids_artifact' : 'short_circuit_report_missing_in_pack_zero');
    const zeroReport = {
      asOf: nowIso(),
      repoRoot: REPO_ROOT,
      historyRoot: HISTORY_ROOT,
      inputs: {
        forecast_pack_coverage: (
          coveragePath
            ? path.relative(REPO_ROOT, coveragePath).replaceAll('\\', '/')
            : 'public/data/universe/v7/reports/forecast_pack_coverage.json'
        ),
        missing_in_pack_count_reported: 0,
        missing_in_pack_ids_source: idSource
      },
      scan: {
        files_total: null,
        files_by_prefix: null,
        bytes_total: null,
        strategy: 'short-circuit-zero-missing',
        notes: [
          'Short-circuit: forecast_pack_coverage reports missing_in_pack=0, so no canonical ID search is required.',
          'History-root scan skipped intentionally for fast report-only/phase0 runs.'
        ]
      },
      results: {
        missing_in_pack_ids_total: 0,
        found_elsewhere_total: 0,
        truly_missing_total: 0,
        found_elsewhere_pct: 0,
        truly_missing_pct: 0
      },
      breakdown: {
        found_elsewhere_by_file_prefix: { pack: 0, run_v7: 0, inc: 0, other: 0 }
      },
      samples: {
        found_elsewhere: [],
        truly_missing: []
      }
    };

    await writeJsonAtomic(OUT_REPORT_PATH, zeroReport);
    console.log('=== Missing-In-Pack Found-Elsewhere Check ===');
    console.log('missing_in_pack_ids_total: 0');
    console.log('found_elsewhere_total: 0 (0%)');
    console.log('truly_missing_total: 0 (0%)');
    console.log('breakdown by prefix: pack=0, run_v7=0, inc=0, other=0 (scan skipped)');
    console.log('Interpretation: no missing_in_pack IDs; pack coverage is already complete.');
    console.log(`report: ${path.relative(REPO_ROOT, OUT_REPORT_PATH).replaceAll('\\', '/')}`);
    return;
  }

  const { ids: missingCanonicalIds, source: idSource } = await loadMissingCanonicalIds(coverageDoc, missingIdsPath);

  if (missingCanonicalIds.length === 0) {
    throw new Error('Unable to load missing_in_pack canonical IDs from report or reconstruction.');
  }
  const missingSet = new Set(missingCanonicalIds);
  const remaining = new Set(missingCanonicalIds);
  const foundById = new Map();

  const historyFiles = await listHistoryNdjsonGz(HISTORY_ROOT);
  let bytesTotal = 0;
  const filesByPrefix = { pack: 0, run_v7: 0, inc: 0, other: 0 };
  const foundByPrefix = { pack: 0, run_v7: 0, inc: 0, other: 0 };

  for (const absFile of historyFiles) {
    const prefix = prefixFromFile(absFile);
    filesByPrefix[prefix] += 1;

    let stat;
    try {
      stat = await fsp.stat(absFile);
      bytesTotal += Number(stat.size || 0);
    } catch {
      // keep running even if one stat fails
    }

    if (remaining.size === 0) continue;

    const relForReport = path
      .relative(HISTORY_BASE, absFile)
      .replaceAll('\\', '/');

    const stream = fs.createReadStream(absFile).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line || remaining.size === 0) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const candidates = extractCanonicalIdCandidates(row);
      if (!candidates.length) continue;

      for (const canonicalId of candidates) {
        if (!missingSet.has(canonicalId)) continue;
        if (foundById.has(canonicalId)) break;
        foundById.set(canonicalId, {
          canonical_id: canonicalId,
          found_in_file: relForReport,
          file_prefix: prefix
        });
        foundByPrefix[prefix] += 1;
        remaining.delete(canonicalId);
        break;
      }
    }
  }

  const foundElsewhere = [...foundById.values()].sort((a, b) => {
    if (a.canonical_id !== b.canonical_id) return a.canonical_id.localeCompare(b.canonical_id);
    return a.found_in_file.localeCompare(b.found_in_file);
  });
  const trulyMissing = [...remaining].sort((a, b) => a.localeCompare(b));

  const total = missingCanonicalIds.length;
  const foundCount = foundElsewhere.length;
  const trulyMissingCount = trulyMissing.length;
  const foundPct = total > 0 ? Number(((foundCount / total) * 100).toFixed(2)) : 0;
  const missingPct = total > 0 ? Number(((trulyMissingCount / total) * 100).toFixed(2)) : 0;

  const report = {
    asOf: nowIso(),
    repoRoot: REPO_ROOT,
    historyRoot: HISTORY_ROOT,
    inputs: {
      forecast_pack_coverage: (
        coveragePath
          ? path.relative(REPO_ROOT, coveragePath).replaceAll('\\', '/')
          : String(missingDoc?.source_report || 'public/data/universe/v7/reports/forecast_pack_coverage.json')
      ),
      missing_in_pack_count_reported: reportedMissingCount,
      missing_in_pack_ids_source: idSource
    },
    scan: {
      files_total: historyFiles.length,
      files_by_prefix: filesByPrefix,
      bytes_total: bytesTotal,
      strategy: 'single-pass-stream',
      notes: [
        'Scans every mirrors/universe-v7/history/**/*.ndjson.gz file in deterministic lexical order.',
        'Canonical ID match uses exact normalized string set from missing_in_pack IDs.',
        'Early-exit occurs only when all target IDs are found.',
        coveragePath ? 'forecast_pack_coverage.json loaded from existing path.' : 'forecast_pack_coverage.json missing; using companion missing-id artifact/reconstruction.'
      ]
    },
    results: {
      missing_in_pack_ids_total: total,
      found_elsewhere_total: foundCount,
      truly_missing_total: trulyMissingCount,
      found_elsewhere_pct: foundPct,
      truly_missing_pct: missingPct
    },
    breakdown: {
      found_elsewhere_by_file_prefix: foundByPrefix
    },
    samples: {
      found_elsewhere: foundElsewhere.slice(0, 25),
      truly_missing: trulyMissing.slice(0, 25).map((canonicalId) => ({ canonical_id: canonicalId }))
    }
  };

  await writeJsonAtomic(OUT_REPORT_PATH, report);

  console.log('=== Missing-In-Pack Found-Elsewhere Check ===');
  console.log(`missing_in_pack_ids_total: ${report.results.missing_in_pack_ids_total}`);
  console.log(
    `found_elsewhere_total: ${report.results.found_elsewhere_total} (${report.results.found_elsewhere_pct}%)`
  );
  console.log(
    `truly_missing_total: ${report.results.truly_missing_total} (${report.results.truly_missing_pct}%)`
  );
  console.log(
    `breakdown by prefix: pack=${foundByPrefix.pack}, run_v7=${foundByPrefix.run_v7}, inc=${foundByPrefix.inc}, other=${foundByPrefix.other}`
  );

  if (foundPct >= 20) {
    console.log('Interpretation: indexer/regex coverage problem is material (found_elsewhere_pct >= 20%).');
  } else if (foundPct < 5) {
    console.log('Interpretation: core issue is pack pointer/content/ingestion (found_elsewhere_pct < 5%).');
  } else {
    console.log('Interpretation: mixed causes (neither purely index coverage nor purely pack content).');
  }

  console.log(`report: ${path.relative(REPO_ROOT, OUT_REPORT_PATH).replaceAll('\\', '/')}`);
}

main().catch((error) => {
  console.error('[check-missing-in-pack-found-elsewhere] failed:', error?.message || error);
  process.exit(1);
});
