#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { sha256Prefix } from '../lib/decision-bundle-contract.mjs';
import { writeJsonDurableAtomicSync } from '../lib/durable-atomic-write.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DECISIONS_ROOT = path.join(ROOT, 'public/data/decisions');
const SNAPSHOTS_ROOT = path.join(DECISIONS_ROOT, 'snapshots');
const TMP_ROOT = path.join(DECISIONS_ROOT, '.tmp');
const ARCHIVE_ROOT = path.join(ROOT, 'mirrors/archive/decisions');
const CRASH_DIR = path.join(ROOT, 'mirrors/ops/pipeline-master/crashes');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileHash(filePath) {
  return sha256Prefix(fs.readFileSync(filePath));
}

function listDirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function removeTmpDirsOlderThan(cutoffMs) {
  const removed = [];
  for (const name of listDirs(TMP_ROOT)) {
    const dir = path.join(TMP_ROOT, name);
    const stat = fs.statSync(dir);
    if (stat.mtimeMs < cutoffMs) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(path.relative(ROOT, dir));
    }
  }
  return removed;
}

function archiveAndDeleteSnapshot(date, snapshotId) {
  const sourceDir = path.join(SNAPSHOTS_ROOT, date, snapshotId);
  let archiveDir = path.join(ARCHIVE_ROOT, date, snapshotId);
  fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
  if (fs.existsSync(archiveDir)) {
    archiveDir = `${archiveDir}.${Date.now()}`;
  }
  fs.renameSync(sourceDir, archiveDir);
  const archived = [];
  for (const name of ['manifest.json', 'summary.json']) {
    const target = path.join(archiveDir, name);
    if (!fs.existsSync(target)) continue;
    archived.push({ file: name, hash: fileHash(target) });
  }
  writeJsonDurableAtomicSync(path.join(archiveDir, 'archive-metadata.json'), {
    schema: 'rv.decision_bundle_archive_metadata.v1',
    generated_at: new Date().toISOString(),
    source_snapshot: path.relative(ROOT, sourceDir),
    archived,
  });
  return { source: path.relative(ROOT, sourceDir), archive: path.relative(ROOT, archiveDir), archived };
}

function pruneCrashSeals(cutoffMs) {
  const removed = [];
  for (const name of fs.existsSync(CRASH_DIR) ? fs.readdirSync(CRASH_DIR) : []) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(CRASH_DIR, name);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoffMs) {
      fs.rmSync(filePath, { force: true });
      removed.push(path.relative(ROOT, filePath));
    }
  }
  return removed;
}

export function runDecisionBundleRetention({
  keepMarketDays = 7,
  keepLatestOnly = false,
  now = Date.now(),
} = {}) {
  const latest = readJson(path.join(DECISIONS_ROOT, 'latest.json'));
  const keep = new Set();
  if (latest?.target_market_date && latest?.snapshot_id) {
    keep.add(`${latest.target_market_date}/${latest.snapshot_id}`);
  }
  const dates = listDirs(SNAPSHOTS_ROOT).sort().reverse();
  if (!keepLatestOnly || keep.size === 0) {
    for (const date of dates.slice(0, keepMarketDays)) {
      for (const snapshotId of listDirs(path.join(SNAPSHOTS_ROOT, date))) {
        keep.add(`${date}/${snapshotId}`);
      }
    }
  }

  const archivedSnapshots = [];
  for (const date of dates) {
    for (const snapshotId of listDirs(path.join(SNAPSHOTS_ROOT, date))) {
      if (keep.has(`${date}/${snapshotId}`)) continue;
      archivedSnapshots.push(archiveAndDeleteSnapshot(date, snapshotId));
    }
  }

  const tmpRemoved = removeTmpDirsOlderThan(now - 48 * 60 * 60 * 1000);
  const crashRemoved = pruneCrashSeals(now - 30 * 24 * 60 * 60 * 1000);
  return {
    schema: 'rv.decision_bundle_retention.v1',
    ok: true,
    generated_at: new Date(now).toISOString(),
    keep_market_days: keepMarketDays,
    keep_latest_only: keepLatestOnly,
    latest_kept: latest?.snapshot_id || null,
    archived_snapshots: archivedSnapshots,
    tmp_removed: tmpRemoved,
    crash_removed: crashRemoved,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const keepDaysArg = argv.find((arg) => arg.startsWith('--keep-market-days='));
  const keepMarketDays = keepDaysArg ? Number(keepDaysArg.split('=', 2)[1]) : Number(process.env.RV_DECISION_BUNDLE_KEEP_MARKET_DAYS || 7);
  const keepLatestOnly = argv.includes('--keep-latest-only') || process.env.RV_DECISION_BUNDLE_KEEP_LATEST_ONLY === '1';
  const report = runDecisionBundleRetention({
    keepMarketDays: Number.isFinite(keepMarketDays) ? keepMarketDays : 7,
    keepLatestOnly,
  });
  const reportPath = path.join(ROOT, 'public/data/reports/decision-bundle-retention-latest.json');
  writeJsonDurableAtomicSync(reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
