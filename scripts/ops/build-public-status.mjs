#!/usr/bin/env node
/**
 * Build a minimal public status artifact from private/local release evidence.
 *
 * Source artifacts stay local/NAS-only. This file is safe for Cloudflare because it
 * exposes only visitor-facing availability state, not pipeline internals.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const FINAL_SEAL_PATH = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const PAGE_CORE_LATEST_PATH = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
const HIST_PROBS_STATUS_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/status-summary.json');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/public-status.json');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

const seal = readJson(FINAL_SEAL_PATH);
const releaseState = readJson(RELEASE_STATE_PATH);
const pageCoreLatest = readJson(PAGE_CORE_LATEST_PATH);
const histStatus = readJson(HIST_PROBS_STATUS_PATH);
const ready = seal?.release_ready === true || releaseState?.phase === 'RELEASE_READY';
const targetDate = seal?.target_market_date || seal?.target_date || releaseState?.target_market_date || releaseState?.target_date || null;
const pageCoreManifestPath = pageCoreLatest?.snapshot_path
  ? path.join(REPO_ROOT, 'public', String(pageCoreLatest.snapshot_path).replace(/^\/+/, ''), 'manifest.json')
  : null;
const pageCoreGreen = Boolean(
  pageCoreLatest?.schema === 'rv.page_core_latest.v1'
  && pageCoreLatest?.snapshot_id
  && Number(pageCoreLatest?.alias_shard_count) === 64
  && Number(pageCoreLatest?.page_shard_count) === 256
  && pageCoreManifestPath
  && fs.existsSync(pageCoreManifestPath)
);
const dataPlaneGreen = seal?.data_plane_green !== false;
const decisionPublicGreen = seal?.decision_public_green === true;
const histProbsMode = histStatus?.hist_probs_mode
  || seal?.hist_probs_mode
  || releaseState?.hist_probs_mode
  || seal?.page_core_smokes?.hist_probs_mode
  || 'unknown';
const catchupStatus = histStatus?.catchup_status
  || seal?.catchup_status
  || releaseState?.catchup_status
  || 'unknown';
const histCoverageRatio = Number(histStatus?.coverage_ratio ?? seal?.hist_probs_coverage_ratio ?? 0);
const histStatusKnown = histProbsMode !== 'unknown' && catchupStatus !== 'unknown';
const histGreen = histStatusKnown
  && histCoverageRatio >= 0.90
  && !['failed', 'unknown'].includes(String(catchupStatus).toLowerCase());
const uiGreen = Boolean(ready && pageCoreGreen && decisionPublicGreen && dataPlaneGreen && histGreen);

const doc = {
  schema: 'rv_public_status_v1',
  generated_at: new Date().toISOString(),
  status: uiGreen ? 'OK' : (ready ? 'DEGRADED' : 'LIMITED'),
  ui_green: uiGreen,
  release_ready: Boolean(ready),
  target_market_date: targetDate,
  page_core_green: pageCoreGreen,
  decision_public_green: decisionPublicGreen,
  data_plane_green: dataPlaneGreen,
  hist_probs_green: histGreen,
  hist_probs_mode: histProbsMode,
  catchup_status: catchupStatus,
  retry_remaining: histStatus?.retry_remaining ?? seal?.retry_remaining ?? null,
  tier_a_count: histStatus?.tier_a_count ?? seal?.tier_a_count ?? null,
  tier_b_pending: histStatus?.tier_b_pending ?? seal?.tier_b_pending ?? null,
  freshness_budget_days: histStatus?.freshness_budget_days ?? seal?.freshness_budget_days ?? null,
  hist_probs_coverage_ratio: histCoverageRatio,
  signal_quality: seal?.signal_quality || (decisionPublicGreen ? 'degraded' : 'suppressed'),
  stock_analyzer: {
    available: uiGreen,
    page_core_snapshot_id: pageCoreLatest?.snapshot_id || null,
  },
};

writeJsonAtomic(OUT_PATH, doc);
console.log(`[build-public-status] wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
