import fs from 'node:fs';
import path from 'node:path';

export function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function evaluateBreakoutReadiness({
  repoRoot = process.cwd(),
  targetMarketDate = null,
  publicRoot = path.join(repoRoot, 'public/data/breakout'),
} = {}) {
  const manifestPath = path.join(publicRoot, 'manifests/latest.json');
  const manifest = readJsonMaybe(manifestPath);
  const reasons = [];
  if (!manifest) {
    reasons.push('breakout_manifest_missing');
    return { ready: false, reasons, manifest: null, stateSummary: null };
  }
  if (targetMarketDate && manifest.as_of !== targetMarketDate) {
    reasons.push(`breakout_as_of_mismatch:${manifest.as_of || 'missing'}!=${targetMarketDate}`);
  }
  if (manifest.validation?.publishable !== true) reasons.push('breakout_manifest_not_publishable');
  if (!manifest.files?.all_scored) reasons.push('breakout_all_scored_missing');
  if (!manifest.files?.state_summary) reasons.push('breakout_state_summary_missing');

  const allScoredPath = manifest.files?.all_scored ? path.join(publicRoot, manifest.files.all_scored) : null;
  const stateSummaryPath = manifest.files?.state_summary ? path.join(publicRoot, manifest.files.state_summary) : null;
  const allScored = allScoredPath ? readJsonMaybe(allScoredPath) : null;
  const stateSummary = stateSummaryPath ? readJsonMaybe(stateSummaryPath) : null;
  if (allScoredPath && !allScored) reasons.push('breakout_all_scored_unreadable');
  if (stateSummaryPath && !stateSummary) reasons.push('breakout_state_summary_unreadable');
  if (stateSummary) {
    if (stateSummary.contract_mode !== 'full_state_distribution') reasons.push('breakout_contract_not_full_state');
    if (stateSummary.full_state_distribution_available !== true) reasons.push('breakout_full_state_unavailable');
    if (stateSummary.candidate_rank_only === true) reasons.push('breakout_candidate_rank_only');
    if (manifest.as_of && stateSummary.as_of !== manifest.as_of) reasons.push('breakout_state_summary_as_of_mismatch');
  }
  const allCount = Array.isArray(allScored?.items) ? allScored.items.length : Number(allScored?.count || 0);
  if (allCount <= 0) reasons.push('breakout_all_scored_empty');
  const firstItem = Array.isArray(allScored?.items) ? allScored.items[0] : null;
  for (const key of ['asset_id', 'display_ticker', 'breakout_status', 'legacy_state', 'support_zone', 'invalidation']) {
    if (!firstItem || !Object.hasOwn(firstItem, key)) reasons.push(`breakout_item_field_missing:${key}`);
  }
  if (stateSummary && Number(stateSummary?.counts?.ALL || 0) !== allCount) reasons.push('breakout_state_count_mismatch');
  for (const key of ['SCANNED', 'SETUP', 'ARMED', 'TRIGGERED', 'CONFIRMED', 'FAILED']) {
    if (!Number.isFinite(Number(stateSummary?.counts?.[key]))) reasons.push(`breakout_state_count_missing:${key}`);
  }
  return {
    ready: reasons.length === 0,
    reasons,
    manifest,
    stateSummary,
    allScoredCount: allCount,
  };
}
