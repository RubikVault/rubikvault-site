import path from 'node:path';
import { readJson, writeJsonAtomic } from './io.mjs';

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function brierFromRows(rows) {
  const pairs = rows.filter((r) => Number.isFinite(r.p_up) && Number.isFinite(r.y_true));
  if (!pairs.length) return 0;
  return mean(pairs.map((r) => (r.p_up - r.y_true) ** 2));
}

function eceFromRows(rows, bins = 10) {
  const pairs = rows.filter((r) => Number.isFinite(r.p_up) && Number.isFinite(r.y_true));
  if (!pairs.length) return 0;
  let total = 0;
  for (let i = 0; i < bins; i++) {
    const lo = i / bins;
    const hi = (i + 1) / bins;
    const bucket = pairs.filter((r) => r.p_up >= lo && (i === bins - 1 ? r.p_up <= hi : r.p_up < hi));
    if (!bucket.length) continue;
    const conf = mean(bucket.map((r) => r.p_up));
    const acc = mean(bucket.map((r) => r.y_true));
    total += (bucket.length / pairs.length) * Math.abs(conf - acc);
  }
  return total;
}

function histogram(values, bins = 10) {
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor(v * bins);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    counts[idx] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((c) => c / total);
}

function psi(current, baseline, epsilon = 1e-9) {
  let score = 0;
  for (let i = 0; i < current.length; i++) {
    const c = current[i] + epsilon;
    const b = baseline[i] + epsilon;
    score += (c - b) * Math.log(c / b);
  }
  return score;
}

export function evaluateMonitoring({
  repoRoot,
  asofDate,
  predictions,
  candidates,
  thresholds,
  shadowMetrics = null,
  backlogDays = 0
}) {
  const coverage = candidates.length > 0 ? predictions.length / candidates.length : 0;
  const ece = eceFromRows(predictions);
  const brier = brierFromRows(predictions);

  const probs = predictions.map((r) => Number(r.p_up)).filter(Number.isFinite);
  const currentHist = histogram(probs);

  const baselinePath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/drift/baseline_distribution.json');
  const baselineDoc = readJson(baselinePath, null);
  const baselineHist = baselineDoc?.hist || currentHist;
  const psiValue = psi(currentHist, baselineHist);

  if (!baselineDoc) {
    writeJsonAtomic(baselinePath, {
      schema: 'forecast_monitoring_baseline_v6',
      created_at: new Date().toISOString(),
      hist: currentHist
    });
  }

  const shadowDelta = Number(shadowMetrics?.logloss_delta ?? 0);

  const breaches = [];
  if (coverage < Number(thresholds?.coverage_min ?? 0.95)) {
    breaches.push(`coverage<${thresholds.coverage_min}`);
  }
  if (ece > Number(thresholds?.ece_max ?? 0.15)) {
    breaches.push(`ece>${thresholds.ece_max}`);
  }
  if (psiValue > Number(thresholds?.psi_max ?? 0.25)) {
    breaches.push(`psi>${thresholds.psi_max}`);
  }
  if (shadowDelta > Number(thresholds?.shadow_logloss_degradation_max ?? 0.005)) {
    breaches.push(`shadow_logloss_delta>${thresholds.shadow_logloss_degradation_max}`);
  }

  const metrics = {
    coverage,
    ece,
    brier,
    psi: psiValue,
    shadow_logloss_degradation: shadowDelta,
    backlog_days: backlogDays
  };

  const monitoringPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/monitoring', `${asofDate}.json`);
  const driftPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/drift', `${asofDate}.json`);

  writeJsonAtomic(monitoringPath, {
    schema: 'forecast_monitoring_v6',
    asof_date: asofDate,
    metrics,
    thresholds,
    breaches,
    pass: breaches.length === 0
  });

  writeJsonAtomic(driftPath, {
    schema: 'forecast_drift_v6',
    asof_date: asofDate,
    current_hist: currentHist,
    baseline_hist: baselineHist,
    psi: psiValue
  });

  return {
    pass: breaches.length === 0,
    breaches,
    metrics,
    monitoring_path: path.relative(repoRoot, monitoringPath),
    drift_path: path.relative(repoRoot, driftPath)
  };
}

export default { evaluateMonitoring };
