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

async function main() {
  const policy = JSON.parse(await fs.readFile(path.join(ROOT, 'policies/retention.v3.json'), 'utf8'));
  const mirrorsDays = Number(policy.mirrors_retention_days || 180);
  const opsDays = Number(policy.ops_ledger_retention_days || 365);

  const removedMirrors = await removeOlderThan(path.join(ROOT, 'mirrors'), mirrorsDays);
  const removedLedgers = await removeOlderThan(path.join(ROOT, 'public/data/v3/system/drift'), opsDays);

  const report = {
    meta: {
      schema: 'rv.retention.cleanup.v1',
      generated_at: new Date().toISOString()
    },
    policy: {
      strategy: policy.active_strategy,
      mirrors_retention_days: mirrorsDays,
      ops_ledger_retention_days: opsDays
    },
    removed: {
      mirrors: removedMirrors,
      drift_reports: removedLedgers
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
  console.log(`RETENTION_CLEANUP_OK mirrors=${removedMirrors} drift=${removedLedgers}`);
}

main().catch((error) => {
  console.error(`RETENTION_CLEANUP_FAILED:${error.message}`);
  process.exitCode = 1;
});
