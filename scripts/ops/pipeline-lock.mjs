import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function psIdentity(pid) {
  try {
    const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart=,command='], {
      encoding: 'utf8',
      timeout: 4000,
    });
    const output = String(result.stdout || '').trim();
    if (!output) return null;
    const match = output.match(/^([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.*)$/);
    if (!match) return { start_time: null, command: output };
    return { start_time: match[1].replace(/\s+/g, ' ').trim(), command: match[2].trim() };
  } catch {
    return null;
  }
}

export function buildCommandFingerprint({ ownerStep = null, command = null, args = [], cwd = null } = {}) {
  const payload = JSON.stringify({
    owner_step: ownerStep || null,
    command: command || null,
    args: Array.isArray(args) ? args : [],
    cwd: cwd || null,
  });
  return crypto.createHash('sha1').update(payload).digest('hex');
}

export function validatePipelineLock(lockDoc, { commandFingerprint = null, now = Date.now() } = {}) {
  if (!lockDoc || typeof lockDoc !== 'object') return { ok: false, reason: 'lock_missing' };
  const startedAtMs = Date.parse(lockDoc.started_at || '');
  const ttlSeconds = Math.max(1, Number(lockDoc.ttl_seconds || 0));
  if (!Number.isFinite(startedAtMs) || !ttlSeconds) return { ok: false, reason: 'lock_missing_started_at' };
  if ((startedAtMs + ttlSeconds * 1000) < now) return { ok: false, reason: 'lock_ttl_expired' };
  if (commandFingerprint && lockDoc.command_fingerprint && lockDoc.command_fingerprint !== commandFingerprint) {
    return { ok: false, reason: 'lock_command_fingerprint_mismatch' };
  }
  const identity = psIdentity(lockDoc.pid);
  if (!identity) return { ok: false, reason: 'lock_pid_not_running' };
  if (lockDoc.pid_start_time && identity.start_time && lockDoc.pid_start_time !== identity.start_time) {
    return { ok: false, reason: 'lock_pid_recycled' };
  }
  if (lockDoc.command_fingerprint && commandFingerprint && lockDoc.command_fingerprint !== commandFingerprint) {
    return { ok: false, reason: 'lock_command_fingerprint_mismatch' };
  }
  return { ok: true, reason: 'lock_valid', identity };
}

export function reapInvalidPipelineLock(lockPath, options = {}) {
  const current = readJson(lockPath);
  const validation = validatePipelineLock(current, options);
  if (!validation.ok && current) {
    try { fs.rmSync(lockPath, { force: true }); } catch {}
  }
  return { lock: current, validation };
}

export function acquirePipelineLock(lockPath, {
  runId,
  targetMarketDate,
  ownerStep,
  command,
  args = [],
  cwd = process.cwd(),
  ttlSeconds = 900,
} = {}) {
  const commandFingerprint = buildCommandFingerprint({ ownerStep, command, args, cwd });
  const existing = reapInvalidPipelineLock(lockPath, { commandFingerprint });
  if (existing.validation.ok) {
    return {
      acquired: false,
      reason: existing.validation.reason,
      lock: existing.lock,
      command_fingerprint: commandFingerprint,
    };
  }
  const identity = psIdentity(process.pid);
  const lockDoc = {
    schema: 'rv.pipeline_lock.v1',
    lock_id: crypto.randomUUID(),
    run_id: runId || null,
    target_market_date: targetMarketDate || null,
    owner_step: ownerStep || null,
    pid: process.pid,
    host: os.hostname(),
    started_at: new Date().toISOString(),
    ttl_seconds: ttlSeconds,
    command_fingerprint: commandFingerprint,
    pid_start_time: identity?.start_time || null,
    command: identity?.command || command || null,
  };
  writeJsonAtomic(lockPath, lockDoc);
  return { acquired: true, reason: 'lock_acquired', lock: lockDoc, command_fingerprint: commandFingerprint };
}

export function refreshPipelineLock(lockPath, lockDoc, ttlSeconds = null) {
  if (!lockDoc?.lock_id) return null;
  const next = {
    ...lockDoc,
    ttl_seconds: ttlSeconds ?? lockDoc.ttl_seconds,
    started_at: lockDoc.started_at || new Date().toISOString(),
    refreshed_at: new Date().toISOString(),
  };
  writeJsonAtomic(lockPath, next);
  return next;
}

export function releasePipelineLock(lockPath, lockDoc = null) {
  const current = readJson(lockPath);
  if (lockDoc?.lock_id && current?.lock_id && lockDoc.lock_id !== current.lock_id) return false;
  try {
    fs.rmSync(lockPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

