#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { iterateGzipNdjson } from '../lib/io/gzip-ndjson.mjs';
import { readErrors } from '../lib/hist-probs/error-ledger.mjs';
import { normalizeDate, readJson, resolveReleaseTargetMarketDate } from './pipeline-artifact-contract.mjs';
import { buildHistProbsCandidatePaths } from '../../functions/api/_shared/hist-probs-paths.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  allowlist: path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json'),
  registry: path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz'),
  output: path.join(ROOT, 'public/data/universe/v7/ssot/provider-no-data-candidates.json'),
};

function readAllowlist(filePath) {
  const doc = readJson(filePath);
  if (!doc || typeof doc !== 'object') return { symbols: new Set(), canonicalIds: new Set() };
  const rawSymbols = Array.isArray(doc.symbols) ? doc.symbols : [];
  const rawCanonicalIds = Array.isArray(doc.canonical_ids)
    ? doc.canonical_ids
    : Array.isArray(doc.canonicalIds)
      ? doc.canonicalIds
      : [];
  return {
    symbols: new Set(rawSymbols.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)),
    canonicalIds: new Set(rawCanonicalIds.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)),
  };
}

function readHistProbsArtifact(ticker) {
  for (const candidate of buildHistProbsCandidatePaths(ticker)) {
    const relativePath = String(candidate || '').replace(/^\/+/, '');
    if (!relativePath) continue;
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      return {
        path: relativePath,
        latest_date: normalizeDate(doc?.latest_date),
      };
    } catch {
      return {
        path: relativePath,
        latest_date: null,
      };
    }
  }
  return null;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function buildArtifactHash(payload) {
  return createHash('sha256')
    .update(JSON.stringify({ ...payload, artifact_hash: null }))
    .digest('hex');
}

async function main() {
  const release = readJson(PATHS.release) || null;
  const runtime = readJson(PATHS.runtime) || null;
  const targetMarketDate = normalizeDate(
    process.env.TARGET_MARKET_DATE
    || process.env.RV_TARGET_MARKET_DATE
    || resolveReleaseTargetMarketDate(release)
    || runtime?.target_market_date
    || null
  );
  const runId = String(
    process.env.RUN_ID
    || process.env.RV_RUN_ID
    || release?.run_id
    || runtime?.run_id
    || `run-provider-no-data-${targetMarketDate || new Date().toISOString().slice(0, 10)}`
  ).trim();

  const allowlist = readAllowlist(PATHS.allowlist);
  const recentNoDataEntries = readErrors({ maxAgeDays: 7 })
    .filter((entry) => String(entry?.error || '').toUpperCase() === 'NO_DATA');
  const noDataBySymbol = new Map();
  for (const entry of recentNoDataEntries) {
    const ticker = String(entry?.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    const bucket = noDataBySymbol.get(ticker) || {
      symbol: ticker,
      count: 0,
      latest_ts: null,
      latest_run_id: null,
      run_ids: new Set(),
    };
    bucket.count += 1;
    if (!bucket.latest_ts || String(entry.ts || '') > bucket.latest_ts) {
      bucket.latest_ts = String(entry.ts || '') || null;
      bucket.latest_run_id = String(entry.run_id || '').trim() || null;
    }
    if (entry.run_id) bucket.run_ids.add(String(entry.run_id).trim());
    noDataBySymbol.set(ticker, bucket);
  }

  const releaseUniverse = [];
  for await (const row of iterateGzipNdjson(PATHS.registry)) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    const canonicalId = String(row?.canonical_id || '').trim().toUpperCase();
    const typeNorm = String(row?.type_norm || row?.type || '').trim().toUpperCase();
    if (!symbol || !canonicalId) continue;
    if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
    if (!allowlist.symbols.has(symbol) && !allowlist.canonicalIds.has(canonicalId)) continue;
    releaseUniverse.push({
      symbol,
      canonical_id: canonicalId,
      asset_class: typeNorm,
      exchange: String(row?.exchange_norm || row?.exchange || '').trim().toUpperCase() || null,
      name: row?.name || row?.description || null,
      market_cap: Number.isFinite(Number(row?.market_cap)) ? Number(row.market_cap) : null,
      last_trade_date: normalizeDate(row?.last_trade_date),
    });
  }

  const symbolCounts = new Map();
  for (const entry of releaseUniverse) {
    symbolCounts.set(entry.symbol, (symbolCounts.get(entry.symbol) || 0) + 1);
  }

  const candidates = [];
  for (const entry of releaseUniverse) {
    const histArtifact = readHistProbsArtifact(entry.symbol);
    const noData = noDataBySymbol.get(entry.symbol) || null;
    const symbolUnique = (symbolCounts.get(entry.symbol) || 0) === 1;
    const histMissing = !histArtifact;
    const latestRunMatchesTarget = Boolean(targetMarketDate && noData?.latest_run_id === targetMarketDate);
    const repeatedNoData = Number(noData?.count || 0) >= 2;
    const safeForManualExclusion = symbolUnique && histMissing && latestRunMatchesTarget && repeatedNoData;
    if (!noData || !histMissing) continue;
    candidates.push({
      symbol: entry.symbol,
      canonical_id: entry.canonical_id,
      asset_class: entry.asset_class,
      exchange: entry.exchange,
      name: entry.name,
      last_trade_date: entry.last_trade_date,
      market_cap: entry.market_cap,
      hist_probs_artifact_missing: histMissing,
      no_data_count_7d: noData.count,
      latest_no_data_run_id: noData.latest_run_id,
      latest_no_data_at: noData.latest_ts,
      symbol_unique_in_release_universe: symbolUnique,
      safe_for_manual_exclusion: safeForManualExclusion,
      reason: safeForManualExclusion
        ? 'manual_verified_provider_no_data_candidate'
        : 'insufficient_evidence_for_auto_exclusion',
    });
  }

  candidates.sort((a, b) => {
    if (Number(b.safe_for_manual_exclusion) !== Number(a.safe_for_manual_exclusion)) {
      return Number(b.safe_for_manual_exclusion) - Number(a.safe_for_manual_exclusion);
    }
    return (b.no_data_count_7d || 0) - (a.no_data_count_7d || 0) || a.symbol.localeCompare(b.symbol);
  });

  const payload = {
    schema: 'rv.provider_no_data_candidates.v1',
    schema_version: 'rv.provider_no_data_candidates.v1',
    generator_id: 'scripts/ops/build-provider-no-data-candidates.mjs',
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: new Date().toISOString(),
    artifact_hash: null,
    criteria: {
      release_universe_only: true,
      hist_probs_artifact_missing_required: true,
      recent_no_data_ledger_required: true,
      safe_for_manual_exclusion_requires: [
        'symbol_unique_in_release_universe',
        'latest_no_data_run_id_matches_target_market_date',
        'no_data_count_7d >= 2',
      ],
    },
    summary: {
      release_universe_assets: releaseUniverse.length,
      candidate_count: candidates.length,
      safe_for_manual_exclusion_count: candidates.filter((entry) => entry.safe_for_manual_exclusion).length,
      ambiguous_symbol_count: candidates.filter((entry) => !entry.symbol_unique_in_release_universe).length,
    },
    candidates,
  };
  payload.artifact_hash = buildArtifactHash(payload);
  writeJsonAtomic(PATHS.output, payload);
  process.stdout.write(`${JSON.stringify(payload.summary)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
