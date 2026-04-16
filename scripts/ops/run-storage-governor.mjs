#!/usr/bin/env node
/**
 * Storage Governor
 *
 * Enforces policies/quality-locality.v1.json + policies/storage-budget.v1.json.
 * Never degrades quality for space. Archives only archive-eligible data.
 * NAS is SSH-remote (neonas). No local mount required.
 *
 * Lessons learned aus Incidents an diesem Skript: docs/ops/lessons-learned.md
 *
 * Usage:
 *   node scripts/ops/run-storage-governor.mjs report [--json]
 *   node scripts/ops/run-storage-governor.mjs enforce
 *   node scripts/ops/run-storage-governor.mjs archive --class <class> [--dry-run]
 *   node scripts/ops/run-storage-governor.mjs hydrate --dataset-id <id>
 *
 * Exit codes:
 *   0  = ok / storage healthy
 *   20 = storage_blocked (below block_heavy_jobs threshold)
 *   21 = nas_unreachable
 *   22 = verify_failed
 *   23 = hydrate_required
 *
 * NAS config (env vars, or from policies/storage-budget.v1.json):
 *   QUANT_NAS_SSH_HOST  (default: neonas)
 *   QUANT_NAS_SSH_BASE  (default: /volume1/homes/neoboy/RepoOps/rubikvault-site)
 *   QUANT_NAS_ARCHIVE_SUBDIR (default: QuantLabColdArchive)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QUANT_ROOT = process.env.QUANT_ROOT || (process.platform === 'linux'
  ? '/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab'
  : '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab');
const HOME = os.homedir();

const QUALITY_POLICY_PATH  = path.join(REPO_ROOT, 'policies/quality-locality.v1.json');
const BUDGET_POLICY_PATH   = path.join(REPO_ROOT, 'policies/storage-budget.v1.json');
const CATALOG_PATH         = path.join(QUANT_ROOT, 'ops/storage-catalog.json');
const GOVERNOR_STATE_PATH  = path.join(QUANT_ROOT, 'ops/storage-governor.latest.json');
const REPORT_OUT_PATH      = path.join(REPO_ROOT, 'public/data/reports/storage-budget-latest.json');
const GOVERNOR_ARCHIVE_LOCK = path.join(QUANT_ROOT, 'ops/governor-archive.lock');

// ─── Archive Lock (prevents concurrent archive runs from housekeeping + manual) ─

function acquireArchiveLock() {
  try {
    const existing = readJson(GOVERNOR_ARCHIVE_LOCK);
    if (existing?.pid) {
      try {
        process.kill(Number(existing.pid), 0); // throws if not alive
        const startLine = (spawnSync('/bin/ps', ['-p', String(existing.pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
        if (startLine && existing.pid_start_time
            && startLine.replace(/\s+/g, ' ').trim() === existing.pid_start_time.replace(/\s+/g, ' ').trim()) {
          log(`[LOCK] Another governor archive running (pid=${existing.pid}). Exiting.`);
          process.exit(0);
        }
      } catch {}
    }
  } catch {}
  const startTime = (spawnSync('/bin/ps', ['-p', String(process.pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 3000 }).stdout || '').trim();
  writeJsonAtomic(GOVERNOR_ARCHIVE_LOCK, { pid: process.pid, pid_start_time: startTime, started_at: new Date().toISOString() });
}

function releaseArchiveLock() {
  try { fs.rmSync(GOVERNOR_ARCHIVE_LOCK, { force: true }); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

function log(msg) {
  console.error(`[governor] ${msg}`);
}

function duKbLocal(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const r = spawnSync('du', ['-sk', targetPath], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) return null;
  const v = Number((r.stdout || '').trim().split(/\s+/)[0]);
  return Number.isFinite(v) ? v : null;
}

function dfFreeGb(targetPath) {
  const p = fs.existsSync(targetPath) ? targetPath : HOME;
  const r = spawnSync('df', ['-k', p], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) return null;
  const lines = (r.stdout || '').trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[lines.length - 1].trim().split(/\s+/);
  if (cols.length < 4) return null;
  const availKb = Number(cols[3]);
  return Number.isFinite(availKb) ? Math.round((availKb / 1024 / 1024) * 10) / 10 : null;
}

function sizeGb(kb) {
  if (kb == null) return null;
  return Math.round((kb / 1024 / 1024) * 100) / 100;
}

// ─── SSH NAS ──────────────────────────────────────────────────────────────────

function sshConfigFor(alias) {
  // Extract connection details from ~/.ssh/config for a given host alias
  const r = spawnSync('ssh', ['-G', alias], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) return {};
  const lines = (r.stdout || '').split('\n');
  const get = (key) => {
    const line = lines.find(l => l.startsWith(key + ' '));
    return line ? line.slice(key.length + 1).trim() : null;
  };
  return {
    hostname:     get('hostname'),
    port:         get('port'),
    user:         get('user'),
    identity_file: get('identityfile'),
  };
}

function nasConfig(budgetPolicy) {
  const nc = budgetPolicy.nas_config || {};
  const alias = process.env.QUANT_NAS_SSH_HOST || nc.ssh_host || 'neonas';
  // Extract real connection details from SSH config so rsync can connect without SSH agent
  const cfg = sshConfigFor(alias);
  return {
    ssh_host:       alias,
    ssh_real_host:  process.env.QUANT_NAS_SSH_REAL_HOST  || cfg.hostname     || alias,
    ssh_port:       process.env.QUANT_NAS_SSH_PORT        || cfg.port         || '22',
    ssh_user:       process.env.QUANT_NAS_SSH_USER        || cfg.user         || null,
    ssh_identity:   process.env.QUANT_NAS_SSH_IDENTITY    || cfg.identity_file || null,
    ssh_base:       process.env.QUANT_NAS_SSH_BASE        || nc.ssh_base      || '/volume1/homes/neoboy/RepoOps/rubikvault-site',
    archive_subdir: process.env.QUANT_NAS_ARCHIVE_SUBDIR  || nc.archive_subdir || 'QuantLabColdArchive',
  };
}

/** Build the -e ssh argument for rsync, including key + port if known. */
function rsyncSshArg(nc) {
  const parts = ['ssh'];
  if (nc.ssh_identity) parts.push('-i', nc.ssh_identity);
  if (nc.ssh_port && nc.ssh_port !== '22') parts.push('-p', nc.ssh_port);
  parts.push('-o', 'StrictHostKeyChecking=accept-new');
  parts.push('-o', 'BatchMode=yes');
  return parts.join(' ');
}

/** Build rsync remote target string: user@host:path */
function rsyncRemote(nc, remotePath) {
  const user = nc.ssh_user ? `${nc.ssh_user}@` : '';
  return `${user}${nc.ssh_real_host}:${remotePath}`;
}

function nasArchivePath(nc) {
  return `${nc.ssh_base}/${nc.archive_subdir}`;
}

/** Build SSH args array for subprocess use (no agent needed). */
function sshArgs(nc) {
  const args = [];
  if (nc.ssh_identity) args.push('-i', nc.ssh_identity);
  if (nc.ssh_port && nc.ssh_port !== '22') args.push('-p', nc.ssh_port);
  args.push('-o', 'StrictHostKeyChecking=accept-new');
  args.push('-o', 'BatchMode=yes');
  args.push('-o', 'ConnectTimeout=10');
  const target = nc.ssh_user ? `${nc.ssh_user}@${nc.ssh_real_host}` : nc.ssh_real_host;
  args.push(target);
  return args;
}

/** Run a command on the NAS via SSH. Returns { ok, stdout, stderr }. */
function sshExec(nc, cmd, { timeout = 30000 } = {}) {
  const args = [...sshArgs(nc), cmd];
  const r = spawnSync('ssh', args, { encoding: 'utf8', timeout });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function nasIsReachable(nc) {
  const { ok } = sshExec(nc, 'echo ping', { timeout: 10000 });
  return ok;
}

function nasDuKb(nc, remotePath) {
  const { ok, stdout } = sshExec(nc, `du -sk '${remotePath}'`, { timeout: 60000 });
  if (!ok) return null;
  const v = Number(stdout.split(/\s+/)[0]);
  return Number.isFinite(v) ? v : null;
}

function nasMkdir(nc, remotePath) {
  sshExec(nc, `mkdir -p '${remotePath}'`, { timeout: 10000 });
}

function nasFreeGb(nc) {
  const { ok, stdout } = sshExec(nc, `df -k '${nc.ssh_base}' | tail -1`, { timeout: 10000 });
  if (!ok) return null;
  const cols = stdout.trim().split(/\s+/);
  if (cols.length < 4) return null;
  const availKb = Number(cols[3]);
  return Number.isFinite(availKb) ? Math.round((availKb / 1024 / 1024) * 10) / 10 : null;
}

// ─── Policy Loading ───────────────────────────────────────────────────────────

function loadBudgetPolicy() {
  const p = readJson(BUDGET_POLICY_PATH);
  if (!p) throw new Error(`Cannot read storage budget policy: ${BUDGET_POLICY_PATH}`);
  return p;
}

function loadQualityPolicy() {
  const p = readJson(QUALITY_POLICY_PATH);
  if (!p) throw new Error(`Cannot read quality locality policy: ${QUALITY_POLICY_PATH}`);
  return p;
}

// ─── Snapshot Scanning ────────────────────────────────────────────────────────

function scanSnapshots() {
  const snapshotsDir = path.join(QUANT_ROOT, 'data/snapshots');
  if (!fs.existsSync(snapshotsDir)) return { step2bars: [], step1: [] };

  const entries = fs.readdirSync(snapshotsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const full = path.join(snapshotsDir, e.name);
      const mtime = (() => { try { return fs.statSync(full).mtimeMs; } catch { return 0; } })();
      const dateMatch = e.name.match(/snapshot_id=(\d{4}-\d{2}-\d{2})_/);
      const date = dateMatch ? dateMatch[1] : null;
      return {
        name: e.name,
        full,
        date,
        mtime,
        isStep2bars: /_q1step2bars(?:_|$)/.test(e.name),
        isStep1:     /_q1step1(?:_|$)/.test(e.name),
      };
    })
    .filter(e => e.date !== null && (e.isStep2bars || e.isStep1));

  const step2bars = entries.filter(e => e.isStep2bars)
    .sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);
  const step1 = entries.filter(e => e.isStep1)
    .sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);

  step2bars.forEach((e, i) => { e.rank = i + 1; });
  step1.forEach((e, i)    => { e.rank = i + 1; });

  return { step2bars, step1 };
}

// ─── Feature Store Scanning ───────────────────────────────────────────────────

function scanFeatureStore(qualityPolicy) {
  const storeDir = path.join(QUANT_ROOT, 'features/store');
  if (!fs.existsSync(storeDir)) return { old_versions: [], old_partitions: [] };

  const productionVersions = qualityPolicy.production_feature_store_versions || ['v4_q1panel_overnight'];
  const entries = fs.readdirSync(storeDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('feature_store_version='));

  const old_versions = entries
    .filter(e => !productionVersions.includes(e.name.replace('feature_store_version=', '')))
    .map(e => ({ name: e.name, full: path.join(storeDir, e.name), version: e.name.replace('feature_store_version=', '') }));

  const latestRun = latestStageBRunDate();
  const old_partitions = [];
  for (const ver of productionVersions) {
    const verDir = path.join(storeDir, `feature_store_version=${ver}`);
    if (!fs.existsSync(verDir)) continue;
    for (const p of fs.readdirSync(verDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('asof_date='))) {
      const dateStr = p.name.replace('asof_date=', '');
      if (!latestRun || !dateStr) continue;
      const diffDays = calendarDaysBetween(dateStr, latestRun);
      if (diffDays > 90) {
        old_partitions.push({ name: p.name, full: path.join(verDir, p.name), asof_date: dateStr, days_old: diffDays });
      }
    }
  }

  return { old_versions, old_partitions };
}

function latestStageBRunDate() {
  try {
    const runsDir = path.join(QUANT_ROOT, 'runs');
    const dates = fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('run_id=q1stageb_'))
      .map(e => { const m = e.name.match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; })
      .filter(Boolean).sort().reverse();
    return dates[0] || null;
  } catch { return null; }
}

function calendarDaysBetween(isoA, isoB) {
  return Math.round(Math.abs(new Date(isoB) - new Date(isoA)) / 86400000);
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

function loadCatalog() {
  return readJson(CATALOG_PATH) || { schema_version: 'v1', entries: [], generated_at: null };
}

function saveCatalog(catalog) {
  catalog.generated_at = new Date().toISOString();
  writeJsonAtomic(CATALOG_PATH, catalog);
}

function upsertCatalog(catalog, entry) {
  const idx = catalog.entries.findIndex(e => e.local_path === entry.local_path);
  if (idx >= 0) catalog.entries[idx] = entry;
  else catalog.entries.push(entry);
}

// ─── Report ───────────────────────────────────────────────────────────────────

function cmdReport(args) {
  const jsonMode = args.includes('--json');
  const budget = loadBudgetPolicy();
  const quality = loadQualityPolicy();
  const nc = nasConfig(budget);

  const freeGb = dfFreeGb(QUANT_ROOT);
  const thresholds = budget.thresholds_gb;
  const { step2bars, step1 } = scanSnapshots();
  const { old_versions, old_partitions } = scanFeatureStore(quality);

  const nasReachable = nasIsReachable(nc);
  const nasFree = nasReachable ? nasFreeGb(nc) : null;

  const archivableStep2bars = step2bars.filter(e => e.rank > 2);
  const archivableStep1     = step1.filter(e => e.rank > 2);
  const estRecoverable = (archivableStep2bars.length * 6.7)
    + (old_versions.length * 1.0)
    + (old_partitions.length * 0.5)
    + (archivableStep1.length * 0.018);

  let severity = 'ok';
  let exitCode = 0;
  if (freeGb != null) {
    if (freeGb < thresholds.emergency)             { severity = 'emergency'; exitCode = 20; }
    else if (freeGb < thresholds.block_heavy_jobs) { severity = 'blocked';   exitCode = 20; }
    else if (freeGb < thresholds.warn_free)        { severity = 'warn'; }
    else if (freeGb < thresholds.target_free)      { severity = 'below_target'; }
  }

  const report = {
    schema_version: 'v1',
    generated_at: new Date().toISOString(),
    disk: {
      free_gb: freeGb,
      target_free_gb: thresholds.target_free,
      warn_free_gb: thresholds.warn_free,
      block_heavy_jobs_free_gb: thresholds.block_heavy_jobs,
      emergency_free_gb: thresholds.emergency,
      severity,
      heavy_jobs_allowed: exitCode === 0,
    },
    nas: {
      ssh_host: nc.ssh_host,
      ssh_base: nc.ssh_base,
      archive_path: nasArchivePath(nc),
      reachable: nasReachable,
      free_gb: nasFree,
    },
    snapshots: {
      step2bars_total: step2bars.length,
      step2bars_protected: step2bars.filter(e => e.rank <= 2).length,
      step2bars_archivable: archivableStep2bars.length,
      step2bars_archivable_estimate_gb: Math.round(archivableStep2bars.length * 6.7 * 10) / 10,
      step1_total: step1.length,
      step1_protected: step1.filter(e => e.rank <= 2).length,
      step1_archivable: archivableStep1.length,
    },
    feature_store: {
      old_versions_archivable: old_versions.length,
      old_versions: old_versions.map(v => v.version),
      old_partitions_archivable: old_partitions.length,
    },
    recoverable_estimate_gb: Math.round(estRecoverable * 10) / 10,
    after_archive_estimate_gb: freeGb != null ? Math.round((freeGb + estRecoverable) * 10) / 10 : null,
    latest_stageb_run_date: latestStageBRunDate(),
  };

  writeJsonAtomic(GOVERNOR_STATE_PATH, report);
  writeJsonAtomic(REPORT_OUT_PATH, report);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`\nStorage Governor Report — ${report.generated_at}`);
    console.log(`  Mac free:    ${freeGb ?? '?'} GB  [target=${thresholds.target_free}, warn=${thresholds.warn_free}, block=${thresholds.block_heavy_jobs}, emergency=${thresholds.emergency}]`);
    console.log(`  Severity:    ${severity.toUpperCase()}`);
    console.log(`  NAS (SSH):   ${nc.ssh_host}:${nasArchivePath(nc)}  reachable=${nasReachable}  free=${nasFree ?? '?'} GB`);
    console.log(`  Archivable:  ${archivableStep2bars.length} step2bars (~${Math.round(archivableStep2bars.length * 6.7 * 10) / 10} GB) + ${old_versions.length} old feat-versions + ${old_partitions.length} old partitions + ${archivableStep1.length} step1`);
    console.log(`  Est. recov:  ${report.recoverable_estimate_gb} GB → after archive: ~${report.after_archive_estimate_gb ?? '?'} GB free`);
    if (exitCode === 20) {
      console.log(`\n  ⛔  STORAGE_BLOCKED: heavy jobs must not start (${freeGb} GB < ${thresholds.block_heavy_jobs} GB threshold)\n`);
    }
    console.log('');
  }

  process.exit(exitCode);
}

// ─── Enforce ──────────────────────────────────────────────────────────────────

function cmdEnforce() {
  cmdReport(['--json']);
}

// ─── Archive ──────────────────────────────────────────────────────────────────

function archiveItemSsh(localPath, nc, catalog, dryRun) {
  const snapshotsBase = path.join(QUANT_ROOT, 'data/snapshots');
  const featStoreBase = path.join(QUANT_ROOT, 'features/store');
  const archiveBase   = nasArchivePath(nc);

  // Compute relative path inside the archive
  let rel;
  if (localPath.startsWith(snapshotsBase)) {
    rel = 'data/snapshots/' + path.relative(snapshotsBase, localPath);
  } else if (localPath.startsWith(featStoreBase)) {
    rel = 'features/store/' + path.relative(featStoreBase, localPath);
  } else {
    rel = path.basename(localPath);
  }

  const remoteDestDir = `${archiveBase}/${path.dirname(rel)}`.replace(/\/$/, '');
  const remoteDest    = `${archiveBase}/${rel}`;

  const existing = catalog.entries.find(e => e.local_path === localPath);
  if (existing?.archive_state === 'archived') {
    log(`[SKIP] Already archived: ${rel}`);
    return { ok: true, skipped: true };
  }

  const kb = duKbLocal(localPath);

  if (dryRun) {
    log(`[DRY-RUN] Would archive: ${path.basename(localPath)} (~${sizeGb(kb)} GB) → ${nc.ssh_host}:${remoteDest}`);
    return { ok: true, dry_run: true, local_path: localPath, remote_dest: remoteDest };
  }

  log(`[ARCHIVE] ${path.basename(localPath)} → ${nc.ssh_host}:${remoteDest} ...`);

  // Step 1: mkdir on NAS
  nasMkdir(nc, remoteDestDir);

  // Step 2: rsync local → NAS via SSH
  const isDir = fs.statSync(localPath).isDirectory();
  const src   = localPath + (isDir ? '/' : '');

  const rsyncResult = spawnSync(
    'rsync',
    ['-az', '--checksum', '--stats', '--rsync-path=/usr/bin/rsync', '-e', rsyncSshArg(nc), src, rsyncRemote(nc, remoteDest + (isDir ? '/' : ''))],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 7200000 }
  );

  if (rsyncResult.status !== 0) {
    const errMsg = (rsyncResult.stderr || '').toString().slice(0, 300);
    log(`[ERR] rsync failed for ${path.basename(localPath)}: ${errMsg}`);
    return { ok: false, error: 'rsync_failed', details: errMsg };
  }

  // Step 3: Verify size on NAS
  const dstKb = nasDuKb(nc, remoteDest);
  if (kb != null && dstKb != null && Math.abs(kb - dstKb) > 2048) {
    log(`[ERR] Size mismatch after copy: local=${kb}k nas=${dstKb}k`);
    return { ok: false, error: 'verify_size_mismatch' };
  }

  // Step 4: Update catalog
  const entry = {
    dataset_type: localPath.includes('q1step2bars') ? 'q1step2bars_snapshot'
                : localPath.includes('q1step1')    ? 'q1step1_snapshot'
                : localPath.includes('feature_store') ? 'feature_store'
                : 'unknown',
    local_path:   localPath,
    archive_path: `ssh://${nc.ssh_host}${remoteDest}`,
    size_bytes:   kb != null ? kb * 1024 : null,
    archived_at:  new Date().toISOString(),
    archive_state: 'archived',
    rehydrate_command: `QUANT_NAS_SSH_HOST=${nc.ssh_host} QUANT_NAS_SSH_BASE=${nc.ssh_base} node ${path.join(REPO_ROOT, 'scripts/ops/run-storage-governor.mjs')} hydrate --dataset-id "${path.basename(localPath)}"`,
  };
  upsertCatalog(catalog, entry);
  saveCatalog(catalog);

  // Step 5: Delete local
  try {
    if (isDir) fs.rmSync(localPath, { recursive: true, force: true });
    else fs.unlinkSync(localPath);
    log(`[OK] Archived and removed local: ${path.basename(localPath)} (freed ~${sizeGb(kb)} GB)`);
  } catch (err) {
    log(`[ERR] Failed to delete local after archive: ${err.message}`);
    return { ok: false, error: 'delete_local_failed' };
  }

  return { ok: true, archived: true, freed_gb: sizeGb(kb) };
}

function cmdArchive(args) {
  const classIdx = args.indexOf('--class');
  const archiveClass = classIdx >= 0 ? args[classIdx + 1] : null;
  const dryRun = args.includes('--dry-run');

  if (!archiveClass) {
    console.error('Usage: run-storage-governor.mjs archive --class <class> [--dry-run]');
    console.error('Classes: q1step2bars_snapshot | feature_store_old_version | feature_store_old_partition | q1step1_snapshot');
    process.exit(1);
  }

  if (!dryRun) {
    acquireArchiveLock();
    process.on('exit', releaseArchiveLock);
    process.on('SIGTERM', () => { releaseArchiveLock(); process.exit(0); });
    process.on('SIGINT',  () => { releaseArchiveLock(); process.exit(0); });
  }

  const budget = loadBudgetPolicy();
  const quality = loadQualityPolicy();
  const nc = nasConfig(budget);

  if (!nasIsReachable(nc)) {
    log(`NAS not reachable: ssh ${nc.ssh_host}. Archive aborted. Local data preserved.`);
    process.exit(21);
  }

  if (!dryRun) {
    nasMkdir(nc, nasArchivePath(nc));
  }

  const catalog = loadCatalog();
  const results = [];

  if (archiveClass === 'q1step2bars_snapshot') {
    const { step2bars } = scanSnapshots();
    const archivable = step2bars.filter(e => e.rank > 2);
    log(`${dryRun ? '[DRY-RUN] ' : ''}Archiving ${archivable.length} q1step2bars snapshots (rank > 2, ~${Math.round(archivable.length * 6.7 * 10) / 10} GB)...`);
    for (const snap of archivable) {
      const r = archiveItemSsh(snap.full, nc, catalog, dryRun);
      results.push({ item: snap.name, ...r });
    }
  } else if (archiveClass === 'feature_store_old_version') {
    const { old_versions } = scanFeatureStore(quality);
    log(`${dryRun ? '[DRY-RUN] ' : ''}Archiving ${old_versions.length} old feature store versions...`);
    for (const v of old_versions) {
      const r = archiveItemSsh(v.full, nc, catalog, dryRun);
      results.push({ item: v.name, ...r });
    }
  } else if (archiveClass === 'feature_store_old_partition') {
    const { old_partitions } = scanFeatureStore(quality);
    log(`${dryRun ? '[DRY-RUN] ' : ''}Archiving ${old_partitions.length} old feature store partitions (> 90 calendar days old)...`);
    for (const p of old_partitions) {
      const r = archiveItemSsh(p.full, nc, catalog, dryRun);
      results.push({ item: p.name, ...r });
    }
  } else if (archiveClass === 'q1step1_snapshot') {
    const { step1 } = scanSnapshots();
    const archivable = step1.filter(e => e.rank > 2);
    log(`${dryRun ? '[DRY-RUN] ' : ''}Archiving ${archivable.length} q1step1 snapshots (rank > 2)...`);
    for (const snap of archivable) {
      const r = archiveItemSsh(snap.full, nc, catalog, dryRun);
      results.push({ item: snap.name, ...r });
    }
  } else {
    log(`Unknown archive class: ${archiveClass}`);
    process.exit(1);
  }

  const ok      = results.filter(r => r.ok && !r.skipped && !r.dry_run).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed  = results.filter(r => !r.ok).length;
  const totalFreed = results.reduce((sum, r) => sum + (r.freed_gb || 0), 0);

  if (dryRun) {
    log(`[DRY-RUN] Would archive ${results.length} items (~${Math.round(results.length * 6.7 * 10) / 10} GB). Re-run without --dry-run to execute.`);
  } else {
    log(`Archive complete: ${ok} archived (freed ~${Math.round(totalFreed * 10) / 10} GB), ${skipped} skipped, ${failed} failed`);
  }

  if (failed > 0) process.exit(22);
  process.exit(0);
}

// ─── Hydrate ──────────────────────────────────────────────────────────────────

function cmdHydrate(args) {
  const idIdx = args.indexOf('--dataset-id');
  const datasetId = idIdx >= 0 ? args[idIdx + 1] : null;
  if (!datasetId) {
    console.error('Usage: run-storage-governor.mjs hydrate --dataset-id <id>');
    process.exit(1);
  }

  const budget = loadBudgetPolicy();
  const nc = nasConfig(budget);

  if (!nasIsReachable(nc)) {
    log(`NAS not reachable: ssh ${nc.ssh_host}. Cannot hydrate. Hard block.`);
    process.exit(21);
  }

  const catalog = loadCatalog();
  const entry = catalog.entries.find(e =>
    e.local_path?.includes(datasetId) || e.archive_path?.includes(datasetId)
  );

  if (!entry) {
    log(`Dataset not found in catalog: ${datasetId}`);
    process.exit(23);
  }

  if (fs.existsSync(entry.local_path)) {
    log(`Dataset already local: ${entry.local_path}`);
    process.exit(0);
  }

  // Parse ssh://host/path from archive_path
  const sshMatch = entry.archive_path?.match(/^ssh:\/\/([^/]+)(\/.*)/);
  if (!sshMatch) {
    log(`Cannot parse archive_path: ${entry.archive_path}`);
    process.exit(23);
  }
  const [, , remotePath] = sshMatch;

  log(`Hydrating ${datasetId} from ${nc.ssh_host}:${remotePath} → ${entry.local_path}`);

  fs.mkdirSync(path.dirname(entry.local_path), { recursive: true });
  const isDir = sshExec(nc, `test -d '${remotePath}' && echo dir || echo file`).stdout === 'dir';

  const r = spawnSync(
    'rsync',
    ['-az', '--checksum', '--rsync-path=/usr/bin/rsync', '-e', rsyncSshArg(nc), rsyncRemote(nc, remotePath + (isDir ? '/' : '')), entry.local_path + (isDir ? '/' : '')],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 7200000 }
  );

  if (r.status !== 0) {
    log(`Hydrate failed: ${(r.stderr || '').toString().slice(0, 200)}`);
    process.exit(22);
  }

  entry.archive_state = 'local';
  entry.hydrated_at = new Date().toISOString();
  upsertCatalog(catalog, entry);
  saveCatalog(catalog);

  log(`Hydrated OK: ${entry.local_path}`);
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [,, cmd = 'report', ...rest] = process.argv;

try {
  switch (cmd) {
    case 'report':   cmdReport(rest);  break;
    case 'enforce':  cmdEnforce();     break;
    case 'archive':  cmdArchive(rest); break;
    case 'hydrate':  cmdHydrate(rest); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: run-storage-governor.mjs <report|enforce|archive|hydrate> [options]');
      process.exit(1);
  }
} catch (err) {
  log(`FATAL: ${err.message}`);
  process.exit(1);
}
