#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const root = path.resolve(process.cwd(), getArg('--root', process.env.NAS_LOCK_ROOT || process.env.RV_NAS_LOCK_ROOT || 'runtime/locks'));
const outputPath = getArg('--output', process.env.RV_LOCK_AUDIT_REPORT_PATH || 'var/private/ops/nas-lock-audit-latest.json');
const cleanupStale = args.includes('--cleanup-stale') || process.env.RV_LOCK_AUDIT_CLEANUP_STALE === '1';

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

function psCommand(pid) {
  if (!pidAlive(pid)) return null;
  const res = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (res.status !== 0) return null;
  return res.stdout.trim() || null;
}

function lockEntries(lockRoot) {
  if (!fs.existsSync(lockRoot)) return [];
  return fs.readdirSync(lockRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.lock'))
    .map((entry) => path.join(lockRoot, entry.name));
}

const locks = lockEntries(root).map((lockPath) => {
  const pid = readText(path.join(lockPath, 'pid'));
  const alive = pidAlive(pid);
  const state = alive ? 'active' : pid ? 'stale_dead_pid' : 'stale_missing_pid';
  const name = path.basename(lockPath).replace(/\.lock$/, '');
  return {
    name,
    path: lockPath,
    state,
    pid: pid ? Number(pid) : null,
    pid_alive: alive,
    owner: readText(path.join(lockPath, 'owner')) || name,
    command: readText(path.join(lockPath, 'command')) || psCommand(pid),
    created_at: readText(path.join(lockPath, 'created_at')),
    heartbeat: readText(path.join(lockPath, 'heartbeat')),
    stale_policy: readText(path.join(lockPath, 'stale_policy')) || 'dead_pid_cleanup_allowed',
  };
});

const stale = locks.filter((entry) => entry.state.startsWith('stale_'));
const cleaned = [];
if (cleanupStale) {
  for (const entry of stale) {
    if (!entry.path.startsWith(root) || !entry.path.endsWith('.lock')) continue;
    fs.rmSync(entry.path, { recursive: true, force: true });
    cleaned.push(entry.name);
  }
}

const report = {
  schema: 'rv.nas_lock_audit.v1',
  generated_at: new Date().toISOString(),
  root,
  ok: stale.length === 0,
  lock_total: locks.length,
  stale_total: stale.length,
  cleanup_stale: cleanupStale,
  cleaned,
  locks,
};

const resolvedOutput = path.resolve(process.cwd(), outputPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.ok && !cleanupStale && process.env.RV_LOCK_AUDIT_HARD_GATE === '1') {
  process.exit(1);
}
