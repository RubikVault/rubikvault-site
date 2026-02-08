import path from 'node:path';
import { writeJsonAtomic } from './io.mjs';

export function evaluateFeasibility({ repoRoot, asofDate, policy, metrics }) {
  const maxTime = Number(policy?.training_time_max_minutes ?? 30);
  const maxRollback = Number(policy?.rollback_rate_max_per_week ?? 2);
  const maxBacklog = Number(policy?.backlog_days_max ?? 7);
  const maxMem = Number(policy?.memory_peak_mb_max ?? 20000);

  const result = {
    training_time_minutes: Number(metrics.training_time_minutes ?? 0),
    rollback_rate_week: Number(metrics.rollback_rate_week ?? 0),
    backlog_days: Number(metrics.backlog_days ?? 0),
    memory_peak_mb: Number(metrics.memory_peak_mb ?? 0)
  };

  let action = 'KEEP_A';
  const reasons = [];

  if (result.memory_peak_mb > maxMem) {
    action = 'REQUIRE_B';
    reasons.push('memory_peak_mb_exceeded');
  } else if (result.training_time_minutes > maxTime || result.backlog_days > maxBacklog || result.rollback_rate_week > maxRollback) {
    action = 'CONSIDER_B';
    reasons.push('operational_threshold_exceeded');
  }

  const out = {
    schema: 'forecast_feasibility_v6',
    asof_date: asofDate,
    metrics: result,
    thresholds: {
      training_time_max_minutes: maxTime,
      rollback_rate_max_per_week: maxRollback,
      backlog_days_max: maxBacklog,
      memory_peak_mb_max: maxMem
    },
    action,
    reasons
  };

  const outPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/feasibility', `${asofDate}.json`);
  writeJsonAtomic(outPath, out);

  return {
    ...out,
    output_path: path.relative(repoRoot, outPath)
  };
}

export default { evaluateFeasibility };
