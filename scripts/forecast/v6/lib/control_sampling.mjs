import crypto from 'node:crypto';

function deterministicScore(seedText) {
  const digest = crypto.createHash('sha256').update(seedText).digest('hex').slice(0, 8);
  return parseInt(digest, 16) / 0xffffffff;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function liquidityBucketForBars(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const recent = rows.slice(-20);
  const vols = recent.map((r) => Number(r.volume || 0));
  const med = median(vols);
  if (med <= 0) return 0;
  if (med < 2e6) return 1;
  if (med < 8e6) return 2;
  return 3;
}

export function buildCandidatesWithControl({
  asofDate,
  symbols,
  barsBySymbol,
  regimeBucket,
  baseSeed,
  featurePolicy,
  controlRatio = 0.2
}) {
  const weights = featurePolicy?.control_weights || {};
  const expertLoss = Number(weights.experts_loss_weight ?? 0.05);
  const routerLoss = Number(weights.router_loss_weight ?? 1.0);
  const calibrationLoss = Number(weights.calibration_loss_weight ?? 1.0);

  const bucketMap = new Map();
  for (const symbol of symbols) {
    const liquidityBucket = liquidityBucketForBars(barsBySymbol[symbol]);
    const key = `${liquidityBucket}|${regimeBucket}`;
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key).push({ symbol, liquidityBucket, regimeBucket });
  }

  const rows = [];
  const warnings = [];

  for (const [bucketKey, bucketRows] of bucketMap.entries()) {
    const target = Math.floor(bucketRows.length * controlRatio);
    const desired = Math.max(0, target);

    const scored = bucketRows
      .map((row) => ({
        ...row,
        _score: deterministicScore(`${baseSeed}:${asofDate}:${bucketKey}:${row.symbol}`)
      }))
      .sort((a, b) => a._score - b._score || a.symbol.localeCompare(b.symbol));

    const controlSet = new Set(scored.slice(0, desired).map((row) => row.symbol));

    if (bucketRows.length < 3 && desired > 0) {
      warnings.push({
        bucket: bucketKey,
        warning: 'UNDERFLOW_BUCKET',
        action: 'control_ratio_reduced_to_0'
      });
      controlSet.clear();
    }

    for (const row of scored) {
      const isControl = controlSet.has(row.symbol);
      rows.push({
        symbol: row.symbol,
        asof_date: asofDate,
        liquidity_bucket: row.liquidityBucket,
        regime_bucket: row.regimeBucket,
        is_control: isControl,
        sample_weight: 1.0,
        expert_loss_weight: isControl ? expertLoss : 1.0,
        router_loss_weight: isControl ? routerLoss : 1.0,
        calibration_loss_weight: isControl ? calibrationLoss : 1.0
      });
    }
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { rows, warnings };
}

export default { buildCandidatesWithControl };
