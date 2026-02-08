import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, writeJsonAtomic, atomicPublishDir, readJson, listFilesRecursive } from './io.mjs';

const FILES = ['hotset.json', 'watchlist.json', 'triggers.json', 'scorecard.json', 'model_card.json', 'diagnostics_summary.json'];

function baseMeta({
  asofDate,
  mode,
  policyHashes,
  modelIds,
  barsManifestHash,
  outcomeRevision,
  circuitOpen,
  reason,
  lastGoodDateUsed,
  generatedAt
}) {
  return {
    asof_date: asofDate,
    mode,
    policy_hashes: policyHashes,
    model_ids: modelIds,
    bars_manifest_hash: barsManifestHash,
    outcome_revision: outcomeRevision,
    circuitOpen: Boolean(circuitOpen),
    reason: reason || null,
    last_good_date_used: lastGoodDateUsed || null,
    generated_at: generatedAt
  };
}

export function buildPublishArtifacts({
  asofDate,
  mode,
  policyHashes,
  modelIds,
  barsManifestHash,
  outcomeRevision,
  circuitOpen,
  reason,
  lastGoodDateUsed,
  generatedAt,
  hotset = [],
  watchlist = [],
  triggers = [],
  scorecard = {},
  modelCard = {},
  diagnosticsSummary = {}
}) {
  const meta = baseMeta({
    asofDate,
    mode,
    policyHashes,
    modelIds,
    barsManifestHash,
    outcomeRevision,
    circuitOpen,
    reason,
    lastGoodDateUsed,
    generatedAt
  });

  return {
    'hotset.json': {
      schema: 'forecast_hotset_v6',
      meta,
      data: { items: hotset }
    },
    'watchlist.json': {
      schema: 'forecast_watchlist_v6',
      meta,
      data: { items: watchlist }
    },
    'triggers.json': {
      schema: 'forecast_triggers_v6',
      meta,
      data: { items: triggers }
    },
    'scorecard.json': {
      schema: 'forecast_scorecard_v6',
      meta,
      data: scorecard
    },
    'model_card.json': {
      schema: 'forecast_model_card_publish_v6',
      meta,
      data: modelCard
    },
    'diagnostics_summary.json': {
      schema: 'forecast_diagnostics_summary_v6',
      meta,
      checks: diagnosticsSummary.checks || {},
      data: diagnosticsSummary.data || {}
    }
  };
}

export function publishArtifactsAtomic({ repoRoot, asofDate, artifacts }) {
  const baseDir = path.join(repoRoot, 'public/data/forecast/v6/daily');
  const targetDir = path.join(baseDir, asofDate);
  const tmpDir = createTempDir(baseDir, '.tmp-v6');

  for (const [name, doc] of Object.entries(artifacts)) {
    const full = path.join(tmpDir, name);
    writeJsonAtomic(full, doc);
  }

  atomicPublishDir(tmpDir, targetDir);
  return {
    target_dir: path.relative(repoRoot, targetDir),
    files: FILES.filter((name) => fs.existsSync(path.join(targetDir, name)))
  };
}

export function readPublishedArtifactsForDate({ repoRoot, date }) {
  const base = path.join(repoRoot, 'public/data/forecast/v6/daily', date);
  if (!fs.existsSync(base)) return null;
  const out = {};
  for (const name of FILES) {
    const filePath = path.join(base, name);
    if (!fs.existsSync(filePath)) return null;
    out[name] = readJson(filePath, null);
  }
  return out;
}

export function listPublishedDates(repoRoot) {
  const base = path.join(repoRoot, 'public/data/forecast/v6/daily');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((ent) => ent.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(ent.name))
    .map((ent) => ent.name)
    .sort();
}

export function collectPublishedFilePaths(repoRoot, asofDate) {
  const dir = path.join(repoRoot, 'public/data/forecast/v6/daily', asofDate);
  return listFilesRecursive(dir).map((p) => path.relative(repoRoot, p));
}

export default {
  buildPublishArtifacts,
  publishArtifactsAtomic,
  readPublishedArtifactsForDate,
  listPublishedDates,
  collectPublishedFilePaths
};
