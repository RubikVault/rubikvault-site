#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(await walk(full));
    else files.push(full);
  }
  return files;
}

async function removeOlderThan(dir, maxAgeDays) {
  const now = Date.now();
  const files = await walk(dir);
  let removed = 0;
  for (const file of files) {
    if (file.includes('last_good')) continue;
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) continue;
    const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      await fs.unlink(file).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}

async function removeFileOlderThan(filePath, maxAgeDays) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return 0;
  const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  if (ageDays <= maxAgeDays) return 0;
  await fs.unlink(filePath).catch(() => {});
  return 1;
}

async function trimNdjsonHistoryLike(filePath, maxAgeDays) {
  let raw;
  try { raw = await fs.readFile(filePath, 'utf8'); } catch { return { before: 0, after: 0, trimmed: 0 }; }
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const lines = raw.split('\n').filter((line) => line.trim());
  const kept = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.ts && new Date(entry.ts).getTime() >= cutoff) kept.push(line);
    } catch {
      // drop malformed lines
    }
  }
  const trimmed = lines.length - kept.length;
  if (trimmed > 0) {
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, kept.length > 0 ? kept.join('\n') + '\n' : '', 'utf8');
    await fs.rename(tmpPath, filePath);
  }
  return { before: lines.length, after: kept.length, trimmed };
}

function parsePartitionTimestamp(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const match = normalized.match(/\/(\d{4})\/(\d{2})\.ndjson\.gz$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return Date.UTC(year, month - 1, 1);
}

async function removeMonthlyPartitionsOlderThan(dir, maxAgeDays) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const files = await walk(dir);
  let removed = 0;
  for (const file of files) {
    if (file.includes('last_good')) continue;
    const partitionTs = parsePartitionTimestamp(file);
    if (partitionTs == null) continue;
    if (partitionTs < cutoff) {
      await fs.unlink(file).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}

/**
 * Trim NDJSON history file — keep only entries within retention window.
 * Atomic: writes to .tmp then renames.
 */
async function trimNdjsonHistory(filePath, maxAgeDays) {
  let raw;
  try { raw = await fs.readFile(filePath, 'utf8'); } catch { return { before: 0, after: 0, trimmed: 0 }; }
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const lines = raw.split('\n').filter(l => l.trim());
  const kept = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.ts && new Date(entry.ts).getTime() >= cutoff) kept.push(line);
    } catch { /* skip malformed lines */ }
  }
  const trimmed = lines.length - kept.length;
  if (trimmed > 0) {
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
    await fs.rename(tmpPath, filePath);
  }
  return { before: lines.length, after: kept.length, trimmed };
}

async function main() {
  const policy = JSON.parse(await fs.readFile(path.join(ROOT, 'policies/retention.v3.json'), 'utf8'));
  const mirrorsDays = Number(policy.mirrors_retention_days || 180);
  const outcomesDays = Number(policy.forecast_outcomes_retention_days || mirrorsDays);
  const forecastsDays = Number(policy.forecast_forecasts_retention_days || Math.min(mirrorsDays, 90));
  const opsDays = Number(policy.ops_ledger_retention_days || 365);
  const histCheckpointDays = Number(policy.hist_probs_checkpoint_retention_days || 30);
  const pendingMaturityDays = Number(policy.pending_maturity_retention_days || 30);
  const dlqDays = Number(policy.dlq_retention_days || 7);

  const forecastOutcomesDir = path.join(ROOT, 'mirrors/forecast/ledger/outcomes');
  const forecastForecastsDir = path.join(ROOT, 'mirrors/forecast/ledger/forecasts');
  const removedForecastOutcomes = (await removeMonthlyPartitionsOlderThan(forecastOutcomesDir, outcomesDays))
    + (await removeOlderThan(forecastOutcomesDir, outcomesDays));
  const removedForecastForecasts = (await removeMonthlyPartitionsOlderThan(forecastForecastsDir, forecastsDays))
    + (await removeOlderThan(forecastForecastsDir, forecastsDays));
  const removedMirrors = await removeOlderThan(path.join(ROOT, 'mirrors'), mirrorsDays);
  const removedLedgers = await removeOlderThan(path.join(ROOT, 'public/data/v3/system/drift'), opsDays);
  const removedHistSnapshots = await removeOlderThan(path.join(ROOT, 'public/data/hist-probs/snapshots'), histCheckpointDays);
  const removedHistCheckpoints = await removeFileOlderThan(path.join(ROOT, 'public/data/hist-probs/checkpoints.json'), histCheckpointDays);
  const histErrorLedgerTrim = await trimNdjsonHistoryLike(
    path.join(ROOT, 'public/data/hist-probs/error-ledger.ndjson'),
    dlqDays
  );
  const removedPendingStore = await removeOlderThan(path.join(ROOT, 'mirrors/forecast/system'), pendingMaturityDays);
  const historyTrim = await trimNdjsonHistory(
    path.join(ROOT, 'public/data/v3/system/ops-history.ndjson'), opsDays
  );

  const report = {
    meta: {
      schema: 'rv.retention.cleanup.v1',
      generated_at: new Date().toISOString()
    },
    policy: {
      strategy: policy.active_strategy,
      mirrors_retention_days: mirrorsDays,
      forecast_outcomes_retention_days: outcomesDays,
      forecast_forecasts_retention_days: forecastsDays,
      ops_ledger_retention_days: opsDays,
      hist_probs_checkpoint_retention_days: histCheckpointDays,
      pending_maturity_retention_days: pendingMaturityDays,
      dlq_retention_days: dlqDays,
    },
    removed: {
      forecast_outcomes: removedForecastOutcomes,
      forecast_forecasts: removedForecastForecasts,
      mirrors: removedMirrors,
      drift_reports: removedLedgers,
      hist_probs_snapshots: removedHistSnapshots,
      hist_probs_checkpoints: removedHistCheckpoints,
      hist_probs_error_ledger: histErrorLedgerTrim,
      pending_maturity_store: removedPendingStore,
      ops_history: historyTrim
    }
  };

  await fs.mkdir(path.join(ROOT, 'public/data/v3/system'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'public/data/v3/system/retention-cleanup.latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const healthPath = path.join(ROOT, 'public/data/v3/system/health.json');
  const health = JSON.parse(await fs.readFile(healthPath, 'utf8').catch(() => '{}'));
  health.system = health.system || {};
  health.system.retention = {
    ...(health.system.retention || {}),
    strategy: policy.active_strategy,
    last_cleanup: report.meta.generated_at
  };
  await fs.writeFile(healthPath, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
  console.log(`RETENTION_CLEANUP_OK forecast_outcomes=${removedForecastOutcomes} forecast_forecasts=${removedForecastForecasts} mirrors=${removedMirrors} drift=${removedLedgers} history_trimmed=${historyTrim.trimmed}`);
}

main().catch((error) => {
  console.error(`RETENTION_CLEANUP_FAILED:${error.message}`);
  process.exitCode = 1;
});
