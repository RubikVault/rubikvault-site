#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import {
  REPO_ROOT,
  ensureDir,
  parseArgs,
  readJson,
  sha256File,
  stableContentHash,
  writeJsonAtomic,
  walkFiles,
  nowIso
} from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { EXIT } from './lib/exit-codes.mjs';

const LEGACY_PATHS = {
  universe: 'public/data/universe/all.json',
  market_prices: 'public/data/snapshots/market-prices/latest.json',
  forecast_latest: 'public/data/forecast/latest.json',
  marketphase_index: 'public/data/marketphase/index.json'
};

function normalizeTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  return ticker || null;
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function readLegacyContractInputs(repoRoot) {
  const universeDoc = await readJson(path.join(repoRoot, LEGACY_PATHS.universe));
  const marketPricesDoc = await readJson(path.join(repoRoot, LEGACY_PATHS.market_prices));
  const forecastDoc = await readJson(path.join(repoRoot, LEGACY_PATHS.forecast_latest));
  const marketphaseDoc = await readJson(path.join(repoRoot, LEGACY_PATHS.marketphase_index));

  const universeTickers = sortedUnique(
    Array.isArray(universeDoc)
      ? universeDoc.map((row) => normalizeTicker(row?.ticker || row?.symbol || row))
      : []
  );

  const forecastTickers = sortedUnique(
    Array.isArray(forecastDoc?.data?.forecasts)
      ? forecastDoc.data.forecasts.map((row) => normalizeTicker(row?.symbol || row?.ticker))
      : []
  );

  const marketphaseTickers = sortedUnique(
    Array.isArray(marketphaseDoc?.data?.symbols)
      ? marketphaseDoc.data.symbols.map((row) => normalizeTicker(row?.symbol || row?.ticker || row))
      : Array.isArray(marketphaseDoc)
        ? marketphaseDoc.map((row) => normalizeTicker(row?.symbol || row?.ticker || row))
        : []
  );

  const marketPriceCount = Array.isArray(marketPricesDoc?.data)
    ? marketPricesDoc.data.length
    : Number.isFinite(Number(marketPricesDoc?.metadata?.record_count))
      ? Number(marketPricesDoc.metadata.record_count)
      : 0;

  const legacyArtifacts = {};
  for (const [key, relPath] of Object.entries(LEGACY_PATHS)) {
    const absPath = path.join(repoRoot, relPath);
    legacyArtifacts[key] = {
      path: relPath,
      sha256: await sha256File(absPath)
    };
  }

  return {
    schema: 'rv_legacy_ssot_contract_v1',
    generated_at: nowIso(),
    legacy_counts: {
      universe_count: universeTickers.length,
      market_prices_count: marketPriceCount,
      forecast_count: forecastTickers.length,
      marketphase_count: marketphaseTickers.length
    },
    legacy_sets: {
      universe_tickers: universeTickers,
      forecast_tickers: forecastTickers,
      marketphase_tickers: marketphaseTickers
    },
    legacy_artifacts: legacyArtifacts,
    feature_contract_refs: {
      scientific_snapshot: 'public/data/snapshots/stock-analysis.json',
      forecast_latest: LEGACY_PATHS.forecast_latest,
      marketphase_index: LEGACY_PATHS.marketphase_index,
      market_prices_latest: LEGACY_PATHS.market_prices
    }
  };
}

function computeFileStats(entries) {
  const out = {
    total_files: entries.length,
    by_extension: {}
  };
  for (const entry of entries) {
    const ext = path.extname(entry.rel).toLowerCase() || '<none>';
    out.by_extension[ext] = (out.by_extension[ext] || 0) + 1;
  }
  return out;
}

async function buildArchitectureSnapshot(repoRoot, legacyContract) {
  const publicDataFiles = await walkFiles(path.join(repoRoot, 'public', 'data'), {
    ignore: new Set(['.DS_Store'])
  });
  const mirrorsFiles = await walkFiles(path.join(repoRoot, 'mirrors'), {
    ignore: new Set(['.DS_Store', '.locks'])
  }).catch(() => []);

  let gitSha = null;
  let gitBranch = null;
  try {
    gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // ignore
  }

  return {
    schema: 'rv_v7_baseline_architecture_snapshot_v1',
    generated_at: nowIso(),
    git: {
      branch: gitBranch,
      sha: gitSha
    },
    legacy_contract_hash: stableContentHash({
      legacy_counts: legacyContract.legacy_counts,
      legacy_artifacts: legacyContract.legacy_artifacts,
      legacy_sets: legacyContract.legacy_sets
    }),
    legacy_counts: legacyContract.legacy_counts,
    paths: {
      repo_root: repoRoot,
      public_data_root: 'public/data',
      mirrors_root: 'mirrors'
    },
    inventory: {
      public_data: computeFileStats(publicDataFiles),
      mirrors: computeFileStats(mirrorsFiles)
    }
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const refreshLegacy = Boolean(args['refresh-legacy-contract']);
  const { cfg } = await loadV7Config();

  const contractPath = resolvePathMaybe(cfg?.legacy_core?.contract_path)
    || path.join(REPO_ROOT, 'policies/universe/core_legacy_contract.json');
  const baselinePath = path.join(REPO_ROOT, 'mirrors/universe-v7/baseline/baseline_architecture_snapshot.json');

  const contract = await readLegacyContractInputs(REPO_ROOT);
  const contractHash = stableContentHash({
    legacy_counts: contract.legacy_counts,
    legacy_artifacts: contract.legacy_artifacts,
    legacy_sets: contract.legacy_sets
  });

  const contractExists = await fs.access(contractPath).then(() => true).catch(() => false);
  if (contractExists && !refreshLegacy) {
    const existing = await readJson(contractPath);
    const existingHash = stableContentHash({
      legacy_counts: existing.legacy_counts,
      legacy_artifacts: existing.legacy_artifacts,
      legacy_sets: existing.legacy_sets
    });
    if (existingHash !== contractHash) {
      process.stderr.write(JSON.stringify({
        status: 'FAIL',
        code: EXIT.HARD_FAIL_LEGACY_CORE,
        reason: 'LEGACY_CONTRACT_MISMATCH',
        existing_hash: existingHash,
        current_hash: contractHash
      }) + '\n');
      process.exit(EXIT.HARD_FAIL_LEGACY_CORE);
    }
  } else {
    await ensureDir(path.dirname(contractPath));
    await writeJsonAtomic(contractPath, {
      ...contract,
      contract_hash: contractHash,
      locked: true
    });
  }

  const baseline = await buildArchitectureSnapshot(REPO_ROOT, contract);
  await ensureDir(path.dirname(baselinePath));
  await writeJsonAtomic(baselinePath, baseline);

  process.stdout.write(JSON.stringify({
    status: 'OK',
    phase: 'phase0_archeology',
    contract_path: path.relative(REPO_ROOT, contractPath),
    baseline_path: path.relative(REPO_ROOT, baselinePath),
    legacy_counts: contract.legacy_counts,
    contract_hash: contractHash
  }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: 1, reason: err?.message || 'phase0_failed' }) + '\n');
  process.exit(1);
});
