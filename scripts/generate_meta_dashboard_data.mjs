import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const LEARNING_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/learning/reports/latest.json');
const QUANTLAB_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json');
const DECISION_LOGIC_PATH = path.join(REPO_ROOT, 'functions/api/_shared/stock-decisions-v1.js');
const V1_AUDIT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json');
const V1_WEIGHTS_PATH = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights/latest.json');
const V1_WEIGHTS_DIR = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights');
const DIAGNOSTIC_PATH = path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json');
const REGIME_DAILY_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json');
const V5_AUTOPILOT_PATH = path.join(REPO_ROOT, 'public/data/reports/v5-autopilot-status.json');
const BEST_SETUPS_PATH = path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/dashboard_v6_meta_data.json');

const DEFAULT_V1_WEIGHTS = {
  forecast: 0.20, scientific: 0.20, elliott: 0.15,
  quantlab: 0.15, breakout_v2: 0.15, hist_probs: 0.15,
};

async function readJsonSafely(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fileAge(filePath) {
  try {
    const stat = fsSync.statSync(filePath);
    return (Date.now() - stat.mtimeMs) / 3600000;
  } catch { return null; }
}

function roundedAgeHours(filePath) {
  const age = fileAge(filePath);
  return age == null ? null : Math.round(age * 10) / 10;
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 86400000));
}

function stalenessLevel(staleDays) {
  if (staleDays == null) return 'unknown';
  if (staleDays <= 1) return 'fresh';
  if (staleDays <= 3) return 'acceptable';
  if (staleDays <= 7) return 'stale';
  return 'critical';
}

async function extractLegacyWeights(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const weights = {};
    const matches = content.matchAll(/(\w+)\s*:\s*\{\s*key\s*:\s*'\w+'\s*,\s*weights\s*:\s*\{([^}]+)\}/g);
    for (const match of matches) {
      const horizon = match[1];
      const weightStr = match[2];
      const weightObj = {};
      for (const pair of weightStr.split(',').map(p => p.trim())) {
        const [k, v] = pair.split(':').map(p => p.trim().replace(/'/g, ''));
        if (k && v) weightObj[k] = parseFloat(v);
      }
      weights[horizon] = weightObj;
    }
    if (Object.keys(weights).length > 0) return weights;
    return {
      short: { trend: 0.24, entry: 0.42, risk: 0.18, context: 0.16 },
      medium: { trend: 0.30, entry: 0.30, risk: 0.20, context: 0.20 },
      long: { trend: 0.36, entry: 0.18, risk: 0.16, context: 0.30 },
    };
  } catch { return null; }
}

function loadWeightHistory() {
  try {
    if (!fsSync.existsSync(V1_WEIGHTS_DIR)) return [];
    const files = fsSync.readdirSync(V1_WEIGHTS_DIR)
      .filter(f => f.endsWith('.json') && f !== 'latest.json')
      .sort()
      .slice(-10);
    return files.map(f => {
      try { return JSON.parse(fsSync.readFileSync(path.join(V1_WEIGHTS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function generateRecommendations(models) {
  const recs = [];
  for (const [key, m] of Object.entries(models)) {
    if (m.accuracy_7d != null && m.accuracy_7d < 0.50) {
      recs.push({ level: 'critical', model: key, text: `${m.name}: accuracy below coin-flip (${(m.accuracy_7d * 100).toFixed(1)}%). Recalibration recommended.` });
    } else if (m.accuracy_7d != null && m.accuracy_7d < 0.53 && m.accuracy_7d >= 0.50) {
      recs.push({ level: 'warning', model: key, text: `${m.name}: marginal accuracy (${(m.accuracy_7d * 100).toFixed(1)}%). Monitor closely.` });
    }
    if (m.stale_days != null && m.stale_days > 7) {
      recs.push({ level: 'critical', model: key, text: `${m.name}: data ${m.stale_days} days stale. Pipeline may be broken.` });
    } else if (m.stale_days != null && m.stale_days > 3 && m.stale_days <= 7) {
      recs.push({ level: 'warning', model: key, text: `${m.name}: data ${m.stale_days} days behind. Check ingest pipeline.` });
    }
    if (m.asof === null || m.asof === 'N/A') {
      recs.push({ level: 'warning', model: key, text: `${m.name}: no source timestamp. Model may be inactive.` });
    }
  }
  return recs;
}

function maxSeverity(a, b) {
  const weight = { ok: 0, warning: 1, critical: 2 };
  return (weight[b] || 0) > (weight[a] || 0) ? b : a;
}

function summarizeSystemStatus(models, pipelineDiagnostic, v1Report, learningStatus) {
  let severity = 'ok';
  const reasons = [];

  for (const model of Object.values(models || {})) {
    if (model.staleness_level === 'critical') {
      severity = maxSeverity(severity, 'critical');
      reasons.push(`${model.name}: data ${model.stale_days}d stale`);
    } else if (model.staleness_level === 'stale') {
      severity = maxSeverity(severity, 'warning');
      reasons.push(`${model.name}: data ${model.stale_days}d behind`);
    } else if (model.asof == null && model.predictions_today === 0) {
      severity = maxSeverity(severity, 'warning');
      reasons.push(`${model.name}: no current source timestamp`);
    }
  }

  if (v1Report && (v1Report.signals_today || 0) === 0) {
    severity = maxSeverity(severity, 'warning');
    reasons.push('V1 audit published 0 signals today');
  }

  if (pipelineDiagnostic?.severity === 'high') {
    severity = maxSeverity(severity, 'critical');
    reasons.push(`Pipeline diagnostic: ${pipelineDiagnostic.diagnosis_code}`);
  } else if (pipelineDiagnostic?.severity === 'medium') {
    severity = maxSeverity(severity, 'warning');
    reasons.push(`Pipeline diagnostic: ${pipelineDiagnostic.diagnosis_code}`);
  }

  const label = severity === 'critical'
    ? 'CRITICAL'
    : severity === 'warning'
      ? 'WARNING'
      : 'OK';

  return {
    severity,
    label,
    detail: reasons.slice(0, 4),
    learning_status: learningStatus || 'UNKNOWN',
  };
}

async function main() {
  const [learning, quantlab, legacyWeights, v1AuditReport, v1WeightsLatest, diagnostic, regimeDaily, autopilot, bestSetups] = await Promise.all([
    readJsonSafely(LEARNING_REPORT_PATH),
    readJsonSafely(QUANTLAB_REPORT_PATH),
    extractLegacyWeights(DECISION_LOGIC_PATH),
    readJsonSafely(V1_AUDIT_REPORT_PATH),
    readJsonSafely(V1_WEIGHTS_PATH),
    readJsonSafely(DIAGNOSTIC_PATH),
    readJsonSafely(REGIME_DAILY_PATH),
    readJsonSafely(V5_AUTOPILOT_PATH),
    readJsonSafely(BEST_SETUPS_PATH),
  ]);

  const v1WeightHistory = loadWeightHistory();

  const output = {
    generated_at: new Date().toISOString(),
    models: {},
    legacy_weights: legacyWeights || {},
    v1_weights: null,
    v1_weight_history: [],
    v1_report: null,
    pipeline_diagnostic: null,
    recommendations: [],
    history: [],
    system: {},
    meta: {
      generated_at: new Date().toISOString(),
      source_files: {
        learning_report: { exists: !!learning, date: learning?.date || null, age_hours: roundedAgeHours(LEARNING_REPORT_PATH) ?? -1 },
        quantlab_report: { exists: !!quantlab, date: quantlab?.reportDate || null, age_hours: roundedAgeHours(QUANTLAB_REPORT_PATH) ?? -1 },
        v1_audit_report: { exists: !!v1AuditReport, date: v1AuditReport?.date || null, age_hours: roundedAgeHours(V1_AUDIT_REPORT_PATH) ?? -1 },
        v1_weights: { exists: !!v1WeightsLatest, version: v1WeightsLatest?.version || null, age_hours: roundedAgeHours(V1_WEIGHTS_PATH) ?? -1 },
        diagnostic: { exists: !!diagnostic, date: diagnostic?.generated_at || null, age_hours: roundedAgeHours(DIAGNOSTIC_PATH) ?? -1 },
        regime_daily: { exists: !!regimeDaily, date: regimeDaily?.date || null, age_hours: roundedAgeHours(REGIME_DAILY_PATH) ?? -1 },
        best_setups_snapshot: { exists: !!bestSetups, date: bestSetups?.meta?.generated_at || null, age_hours: roundedAgeHours(BEST_SETUPS_PATH) ?? -1 },
      },
    },
  };

  // 1. Learning report models (Forecast, Scientific, Elliott)
  if (learning?.features) {
    for (const [key, feat] of Object.entries(learning.features)) {
      if (key === 'stock_analyzer') continue;
      const dataAsof = feat.source_meta?.asof || null;
      const staleDaysNow = dataAsof ? daysSince(dataAsof) : null;
      output.models[key] = {
        name: feat.name,
        type: feat.type,
        universe_size: feat.predictions_total || 0,
        accuracy: feat.accuracy_all || 0,
        accuracy_7d: feat.accuracy_7d || 0,
        hit_rate_all: feat.hit_rate_all || 0,
        trend: feat.trend_accuracy || 'stable',
        stale_days: staleDaysNow,
        staleness_level: stalenessLevel(staleDaysNow),
        asof: dataAsof,
        predictions_today: feat.predictions_today || 0,
        report_age_hours: roundedAgeHours(LEARNING_REPORT_PATH),
        report_date: learning?.date || null,
        stale_reason: dataAsof
          ? `Learning source ${feat.source_meta?.source || key} last as-of ${dataAsof}`
          : `Learning source ${feat.source_meta?.source || key} has no current timestamp`,
      };
    }
    output.history = learning.history || [];
  }

  // 2. QuantLab card
  if (quantlab) {
    const ag = quantlab.agentReadiness?.summary || {};
    const rawFreshness = quantlab.currentState?.preflight?.rawFreshness || {};
    const rawAsof = rawFreshness.latest_required_ingest_date || rawFreshness.latest_any_ingest_date || null;
    const staleDays = rawFreshness.latest_required_age_calendar_days ?? daysSince(rawAsof);
    output.models.quantlab = {
      name: quantlab.objective?.title || 'Quant Lab System',
      type: 'Expert Swarm / Stability',
      universe_size: ag.universeSymbolsTotal || 71140,
      active_universe: ag.scoredTodayAssetsTotal || 0,
      accuracy: quantlab.currentState?.overnightStability?.task_success_rate || 0,
      accuracy_7d: quantlab.currentState?.overnightStability?.task_success_rate || 0,
      accuracy_label: 'Task Success Rate',
      stage_stability: quantlab.currentState?.stagebStability?.strict_positive_ratio_all || 0,
      trend: 'active',
      stale_days: staleDays,
      staleness_level: stalenessLevel(staleDays),
      asof: rawAsof,
      report_age_hours: roundedAgeHours(QUANTLAB_REPORT_PATH),
      report_date: quantlab.reportDate || null,
      stale_reason: rawFreshness.reason_codes?.join(' | ') || 'QuantLab raw bars are stale',
      details: {
        super_stark: ag.superStrongTotal,
        stark: ag.strongTotal,
        sehr_schwach: ag.veryWeakTotal,
        overnight_stability_score: quantlab.currentState?.overnightStability?.stability_score,
        overnight_completion: quantlab.currentState?.overnightStability?.completion_rate,
        jobs_total: quantlab.currentState?.overnightStability?.total_jobs,
        jobs_completed: quantlab.currentState?.overnightStability?.completed_jobs,
      },
    };
  }

  // 3. Breakout card — no hardcoded accuracy
  const breakoutDataAsof = bestSetups?.meta?.forecast_asof || bestSetups?.meta?.quantlab_asof || null;
  const breakoutStaleDays = breakoutDataAsof ? daysSince(breakoutDataAsof) : null;
  output.models.breakout_v2 = {
    name: 'Breakout V2',
    type: 'Momentum / Breakout Detection',
    universe_size: output.models.quantlab?.active_universe || 0,
    accuracy: null,
    accuracy_7d: null,
    accuracy_label: 'No independent metric',
    trend: 'stable',
    stale_days: breakoutStaleDays,
    staleness_level: stalenessLevel(breakoutStaleDays),
    asof: breakoutDataAsof,
    report_age_hours: roundedAgeHours(BEST_SETUPS_PATH),
    report_date: bestSetups?.meta?.generated_at || null,
    stale_reason: breakoutDataAsof
      ? `Best-setups snapshot depends on data as-of ${breakoutDataAsof}`
      : 'Best-setups snapshot has no data as-of timestamp',
  };

  // 4. hist_probs card
  const histProbStaleDays = daysSince(regimeDaily?.date);
  output.models.hist_probs = {
    name: 'Historical Probabilities',
    type: 'Event-Based Statistics',
    universe_size: output.models.quantlab?.active_universe || 0,
    accuracy: null,
    accuracy_7d: null,
    accuracy_label: 'Passive source — no accuracy metric',
    trend: regimeDaily ? 'active' : 'unknown',
    stale_days: histProbStaleDays,
    staleness_level: stalenessLevel(histProbStaleDays),
    asof: regimeDaily?.date || null,
    report_age_hours: roundedAgeHours(REGIME_DAILY_PATH),
    report_date: regimeDaily?.computed_at || null,
    stale_reason: regimeDaily?.date
      ? `Regime daily last market date ${regimeDaily.date}`
      : 'Regime daily file missing market date',
    regime: regimeDaily ? {
      market: regimeDaily.market_regime,
      volatility: regimeDaily.volatility_regime,
      breadth: regimeDaily.breadth_regime,
    } : null,
  };

  // 5. V1 fusion source weights
  if (v1WeightsLatest) {
    output.v1_weights = {
      version: v1WeightsLatest.version,
      timestamp: v1WeightsLatest.timestamp,
      fallback_level: v1WeightsLatest.fallback_level,
      trigger: v1WeightsLatest.trigger,
      weights: v1WeightsLatest.weights,
    };
  } else {
    output.v1_weights = {
      version: 'default-prior',
      timestamp: null,
      fallback_level: 'default_prior',
      trigger: 'no_snapshots',
      weights: { ...DEFAULT_V1_WEIGHTS },
    };
  }

  // 6. V1 weight history
  output.v1_weight_history = v1WeightHistory.map(s => ({
    version: s.version,
    timestamp: s.timestamp,
    weights: s.weights,
    fallback_level: s.fallback_level,
  }));

  // 7. V1 audit report data
  if (v1AuditReport) {
    output.v1_report = {
      mode: v1AuditReport.mode || null,
      signals_today: v1AuditReport.signals_today || 0,
      verdict_distribution: v1AuditReport.verdict_distribution || null,
      hit_rate: v1AuditReport.hit_rate_matured ?? null,
      matured_signals: v1AuditReport.matured_signals || 0,
      top_sources: v1AuditReport.top_sources || null,
      avg_evidence_quality: v1AuditReport.avg_evidence_quality ?? null,
      governance_warnings: v1AuditReport.governance_warnings || null,
      fallback_usage: v1AuditReport.fallback_usage || null,
      regime_transition_active: v1AuditReport.regime_transition_active || false,
      friction_impact_avg: v1AuditReport.friction_impact_avg || null,
      report_date: v1AuditReport.date || null,
      report_timestamp: v1AuditReport.timestamp || null,
      report_age_hours: roundedAgeHours(V1_AUDIT_REPORT_PATH),
    };
  }

  // 8. Pipeline diagnostic
  if (diagnostic?.diagnosis) {
    output.pipeline_diagnostic = {
      diagnosis_code: diagnostic.diagnosis.code,
      severity: diagnostic.diagnosis.severity,
      explanation: diagnostic.diagnosis.explanation,
      stage_counts: diagnostic.stage_counts || null,
      generated_at: diagnostic.generated_at || null,
      age_hours: roundedAgeHours(DIAGNOSTIC_PATH),
    };
  }

  // 9. Operations (from V5 sources)
  output.operations = {
    autopilot: autopilot || null,
    candidate_counts: bestSetups?.meta?.candidate_counts || null,
    setup_phases: bestSetups?.meta?.setup_phase_counts || null,
    snapshots_date: bestSetups?.meta?.generated_at || null,
    verified_counts: bestSetups?.meta?.verified_counts || null,
  };

  // 10. Deep diagnosis data (from learning report)
  output.deep_diagnosis = learning?.features || null;
  output.weekly_comparison = learning?.weekly_comparison ? {
    forecast: { metric_label: 'Accuracy', ...(learning.weekly_comparison.forecast || {}) },
    scientific: { metric_label: 'Hit Rate', ...(learning.weekly_comparison.scientific || {}) },
    elliott: { metric_label: 'Accuracy', ...(learning.weekly_comparison.elliott || {}) },
    quantlab: { metric_label: 'Task Success Rate', ...(learning.weekly_comparison.quantlab || {}) },
  } : null;
  output.improvements_active = learning?.improvements_active || [];

  // 11. Auto-recommendations
  output.recommendations = generateRecommendations(output.models);

  // 12. System status
  const systemStatus = summarizeSystemStatus(
    output.models,
    output.pipeline_diagnostic,
    output.v1_report,
    learning?.summary?.overall_status || 'UNKNOWN'
  );

  output.system = {
    overall_status: systemStatus.label,
    status_severity: systemStatus.severity,
    status_detail: systemStatus.detail,
    learning_status: systemStatus.learning_status,
    v1_mode: v1AuditReport?.mode || 'shadow_v1',
    quantlab_readiness: quantlab?.progress?.readiness?.pct ?? null,
    quantlab_implementation: quantlab?.progress?.implementation?.pct ?? null,
    regime: regimeDaily ? {
      market: regimeDaily.market_regime,
      volatility: regimeDaily.volatility_regime,
      breadth: regimeDaily.breadth_regime,
      date: regimeDaily.date,
    } : null,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
}

main().catch(console.error);
