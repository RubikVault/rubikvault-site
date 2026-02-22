#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEEP_SUMMARY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
const LEGACY_DIR = path.join(REPO_ROOT, 'public/data/marketphase');
const LEGACY_INDEX_PATH = path.join(LEGACY_DIR, 'index.json');
const REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/marketphase_legacy_bridge_report.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function toFinite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    overwriteExisting: argv.includes('--overwrite-existing')
  };
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function isUnsafeSymbol(symbol) {
  return symbol.includes('/') || symbol.includes('\\') || symbol.includes('..');
}

function buildLegacyMarketphasePayload(item, generatedAt) {
  const symbol = normalizeSymbol(item?.symbol);
  const confidence = toFinite(item?.confidence);
  const fibConformance = toFinite(item?.fibConformance);
  const direction = String(item?.direction || 'neutral');
  const wave = String(item?.wavePosition || 'unknown');
  const featuresIn = item?.features && typeof item.features === 'object' ? item.features : {};

  const features = {
    RSI: toFinite(featuresIn.RSI),
    MACDHist: toFinite(featuresIn.MACDHist),
    'ATR%': toFinite(featuresIn['ATR%']),
    SMA50: toFinite(featuresIn.SMA50),
    SMA200: toFinite(featuresIn.SMA200),
    SMATrend: typeof featuresIn.SMATrend === 'string' ? featuresIn.SMATrend : 'unknown',
    lastClose: toFinite(featuresIn.lastClose)
  };

  return {
    ok: true,
    meta: {
      symbol,
      generatedAt,
      fetchedAt: generatedAt,
      version: 'rv_marketphase_bridge_from_v7_deep_v1',
      source: 'marketphase_deep_summary',
      provider: 'rubikvault-v7',
      status: 'ok',
      methodologyVersion: 'bridge_v1',
      precision: '6dp',
      ttlSeconds: 86400,
      url: `/data/marketphase/${symbol}.json`
    },
    data: {
      features,
      elliott: {
        completedPattern: {
          valid: Boolean(item?.validPattern),
          direction,
          confidence0_100: confidence ?? 0
        },
        developingPattern: {
          possibleWave: wave,
          confidence: confidence ?? 0,
          fibLevels: { support: [], resistance: [] },
          disclaimer: 'Derived from marketphase_deep_summary bridge'
        },
        uncertainty: {
          lastSwingConfirmed: null,
          alternativeCounts: null,
          confidenceDecay: { base: confidence ?? 0, adjusted: confidence ?? 0 }
        }
      },
      fib: {
        conformanceScore: fibConformance
      },
      swings: { raw: [], confirmed: [] },
      multiTimeframeAgreement: null,
      disclaimer: 'Bridge payload from v7 marketphase deep summary (summary-level data)',
      debug: {
        bridge: true,
        source_summary_generated_at: item?.generated_at || null,
        bars_count: Number(item?.bars_count || 0),
        last_bar_date: item?.last_bar_date || null,
        key_id: item?.key_id || null,
        canonical_id: item?.canonical_id || null
      }
    }
  };
}

async function main() {
  const args = parseArgs();
  const startedAt = nowIso();
  const deep = await readJson(DEEP_SUMMARY_PATH, null);
  const items = Array.isArray(deep?.items) ? deep.items : [];

  if (items.length === 0) {
    throw new Error('MARKETPHASE_DEEP_SUMMARY_EMPTY_OR_MISSING');
  }

  await fs.mkdir(LEGACY_DIR, { recursive: true });

  const generatedAt = nowIso();
  const symbols = [];
  const stats = {
    source_items: items.length,
    index_entries: 0,
    files_written: 0,
    files_preserved_existing: 0,
    files_overwritten: 0,
    skipped_unsafe_symbol: 0,
    skipped_missing_features: 0
  };
  const samples = {
    skipped_unsafe_symbol: [],
    skipped_missing_features: []
  };

  const sortedItems = [...items].sort((a, b) => normalizeSymbol(a?.symbol).localeCompare(normalizeSymbol(b?.symbol)));
  for (const item of sortedItems) {
    const symbol = normalizeSymbol(item?.symbol);
    if (!symbol || isUnsafeSymbol(symbol)) {
      stats.skipped_unsafe_symbol += 1;
      if (samples.skipped_unsafe_symbol.length < 20) {
        samples.skipped_unsafe_symbol.push({ symbol: item?.symbol ?? null, canonical_id: item?.canonical_id ?? null });
      }
      continue;
    }

    const f = item?.features && typeof item.features === 'object' ? item.features : null;
    const hasCoreFeatures =
      f && Number.isFinite(Number(f.SMA50)) && Number.isFinite(Number(f.SMA200)) &&
      Number.isFinite(Number(f.RSI)) && Number.isFinite(Number(f.MACDHist));
    if (!hasCoreFeatures) {
      stats.skipped_missing_features += 1;
      if (samples.skipped_missing_features.length < 20) {
        samples.skipped_missing_features.push({ symbol, canonical_id: item?.canonical_id ?? null });
      }
      continue;
    }

    const relPath = `/data/marketphase/${symbol}.json`;
    symbols.push({
      symbol,
      path: relPath,
      updatedAt: generatedAt,
      source: 'v7_deep_bridge'
    });

    const absPath = path.join(LEGACY_DIR, `${symbol}.json`);
    const alreadyExists = await exists(absPath);
    if (alreadyExists && !args.overwriteExisting) {
      stats.files_preserved_existing += 1;
      continue;
    }

    const payload = buildLegacyMarketphasePayload(item, generatedAt);
    await writeJsonAtomic(absPath, payload);
    stats.files_written += 1;
    if (alreadyExists) stats.files_overwritten += 1;
  }

  const indexPayload = {
    ok: true,
    meta: {
      generatedAt,
      source: 'marketphase_deep_summary_bridge',
      status: 'ok',
      version: 'rv_marketphase_index_bridge_v1',
      totalSymbols: symbols.length,
      notes: [
        'Bridge from v7 marketphase_deep_summary',
        'Symbol payloads are summary-level for missing legacy files',
        'Existing legacy symbol files were preserved unless --overwrite-existing is used'
      ]
    },
    data: {
      symbols
    }
  };

  stats.index_entries = symbols.length;
  await writeJsonAtomic(LEGACY_INDEX_PATH, indexPayload);

  const report = {
    schema: 'rv_v7_marketphase_legacy_bridge_report_v1',
    started_at: startedAt,
    finished_at: nowIso(),
    args,
    inputs: {
      deep_summary: path.relative(REPO_ROOT, DEEP_SUMMARY_PATH),
      deep_summary_generated_at: deep?.generated_at || null,
      deep_count: items.length
    },
    outputs: {
      legacy_index: path.relative(REPO_ROOT, LEGACY_INDEX_PATH),
      legacy_dir: path.relative(REPO_ROOT, LEGACY_DIR)
    },
    stats,
    samples
  };

  await writeJsonAtomic(REPORT_PATH, report);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    index_symbols: symbols.length,
    files_written: stats.files_written,
    files_preserved_existing: stats.files_preserved_existing,
    skipped_missing_features: stats.skipped_missing_features,
    report: path.relative(REPO_ROOT, REPORT_PATH)
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    reason: error?.message || 'marketphase_legacy_bridge_failed'
  })}\n`);
  process.exit(1);
});
