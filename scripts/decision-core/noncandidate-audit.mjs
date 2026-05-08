import { classifyRegion, normalizeAssetType, normalizeId, sha256Hex } from './shared.mjs';

export function buildCandidateAudit({ rejected, policy, targetMarketDate }) {
  const rate = Number(policy?.candidate_selection_policy?.audit_sample_rate || 0.01);
  const grouped = new Map();
  for (const item of rejected) {
    const bucket = bucketFor(item.row);
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket).push(item);
  }
  const sample = [];
  for (const [bucket, rows] of grouped.entries()) {
    const sorted = rows.slice().sort((a, b) => sha256Hex(`${targetMarketDate}|${normalizeId(a.row?.canonical_id)}`).localeCompare(sha256Hex(`${targetMarketDate}|${normalizeId(b.row?.canonical_id)}`)));
    const count = Math.max(1, Math.floor(sorted.length * rate));
    for (const item of sorted.slice(0, count)) {
      sample.push({
        asset_id: normalizeId(item.row?.canonical_id),
        asset_type: normalizeAssetType(item.row?.type_norm || item.row?.asset_class || item.row?.type),
        bucket,
        rejected_reason: item.reason,
        eligibility_status: item.eligibility?.eligibility_status || null,
      });
    }
  }
  return sample;
}

export function buildUniverseSummary({ rows, rejected, candidateRows, policy }) {
  const rejectedByReason = {};
  const rejectedByAssetType = {};
  const rejectedByRegion = {};
  const rejectedByLiquidityBucket = {};
  for (const item of rejected) {
    increment(rejectedByReason, item.reason || 'unknown');
    increment(rejectedByAssetType, normalizeAssetType(item.row?.type_norm || item.row?.asset_class || item.row?.type));
    increment(rejectedByRegion, classifyRegion(item.row));
    increment(rejectedByLiquidityBucket, liquidityBucket(item.features?.liquidity_score));
  }
  const candidateRateByBucket = {};
  const totals = {};
  const candidates = {};
  for (const row of rows) increment(totals, bucketFor(row));
  for (const item of candidateRows) increment(candidates, bucketFor(item.row));
  for (const [bucket, total] of Object.entries(totals)) candidateRateByBucket[bucket] = total ? (candidates[bucket] || 0) / total : 0;
  const auditSampleAssets = Math.max(0, Math.ceil(rejected.length * Number(policy?.candidate_selection_policy?.audit_sample_rate || 0.01)));
  return {
    total_assets: rows.length,
    eligible_assets: rows.filter((row) => Number(row?.bars_count || 0) >= 252).length,
    candidate_assets: candidateRows.length,
    audit_sample_assets: auditSampleAssets,
    rejected_by_reason: rejectedByReason,
    rejected_by_asset_type: rejectedByAssetType,
    rejected_by_region: rejectedByRegion,
    rejected_by_sector: {},
    rejected_by_liquidity_bucket: rejectedByLiquidityBucket,
    candidate_rate_by_bucket: candidateRateByBucket,
    candidate_selection_policy_version: policy?.candidate_selection_policy?.version || 'candidate-selection-v1',
  };
}

function bucketFor(row) {
  return [
    normalizeAssetType(row?.type_norm || row?.asset_class || row?.type),
    classifyRegion(row),
    liquidityBucket(row?.computed?.score_0_100),
  ].join('|');
}

function liquidityBucket(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 80) return 'high';
  if (n >= 50) return 'medium';
  return 'low';
}

function increment(obj, key) {
  const clean = key || 'unknown';
  obj[clean] = (obj[clean] || 0) + 1;
}
