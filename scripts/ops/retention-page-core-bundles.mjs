#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PAGE_CORE_ROOT = path.join(ROOT, 'public/data/page-core');
const SNAPSHOTS_ROOT = path.join(PAGE_CORE_ROOT, 'snapshots');
const DEFAULT_KEEP_DAILY = 7;

function parseArgs(argv) {
  const get = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
  return {
    keepDaily: Math.max(1, Number(get('keep-daily') || process.env.RV_PAGE_CORE_KEEP_DAILY || DEFAULT_KEEP_DAILY)),
    dryRun: argv.includes('--dry-run'),
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listSnapshots() {
  if (!fs.existsSync(SNAPSHOTS_ROOT)) return [];
  const out = [];
  for (const dateDir of fs.readdirSync(SNAPSHOTS_ROOT)) {
    const fullDateDir = path.join(SNAPSHOTS_ROOT, dateDir);
    if (!fs.statSync(fullDateDir).isDirectory()) continue;
    for (const snapshotId of fs.readdirSync(fullDateDir)) {
      const full = path.join(fullDateDir, snapshotId);
      if (!fs.statSync(full).isDirectory()) continue;
      const manifest = readJson(path.join(full, 'manifest.json')) || {};
      out.push({
        date: dateDir,
        snapshot_id: snapshotId,
        path: full,
        generated_at: manifest.generated_at || null,
      });
    }
  }
  out.sort((a, b) => String(b.generated_at || b.date).localeCompare(String(a.generated_at || a.date)));
  return out;
}

function activeSnapshotIds() {
  const ids = new Set();
  for (const rel of ['latest.json', 'candidates/latest.candidate.json']) {
    const doc = readJson(path.join(PAGE_CORE_ROOT, rel));
    if (doc?.snapshot_id) ids.add(String(doc.snapshot_id));
  }
  return ids;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const active = activeSnapshotIds();
  const snapshots = listSnapshots();
  const newest = new Set(snapshots.slice(0, opts.keepDaily).map((item) => item.snapshot_id));
  const removals = snapshots.filter((item) => !active.has(item.snapshot_id) && !newest.has(item.snapshot_id));
  for (const item of removals) {
    const rel = path.relative(ROOT, item.path);
    if (opts.dryRun) {
      console.log(`[page-core-retention] would remove ${rel}`);
    } else {
      fs.rmSync(item.path, { recursive: true, force: true });
      console.log(`[page-core-retention] removed ${rel}`);
    }
  }
  console.log(JSON.stringify({
    ok: true,
    snapshots_total: snapshots.length,
    retained_active: active.size,
    retained_newest: newest.size,
    removed: removals.length,
    dry_run: opts.dryRun,
  }));
}

main();
