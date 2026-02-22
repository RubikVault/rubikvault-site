#!/usr/bin/env node

import path from 'node:path';
import {
  REPO_ROOT,
  ensureDir,
  nowIso,
  parseArgs,
  pathExists,
  readJson,
  stableContentHash,
  writeJsonAtomic
} from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { loadEnvFile } from './lib/env-loader.mjs';
import { acquireRunLock, releaseRunLock } from './lib/run-lock.mjs';
import { EXIT } from './lib/exit-codes.mjs';

function makeRunId() {
  const ts = nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 8);
  return `v7_${ts}_${rand}`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args['run-id'] || makeRunId());
  const holdLock = Boolean(args['hold-lock']);
  const { configPath, cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);

  const lawRegistryPath = resolvePathMaybe(cfg?.laws?.registry_path);
  const coreContractPath = resolvePathMaybe(cfg?.legacy_core?.contract_path);
  const tmpRoot = resolvePathMaybe(cfg?.run?.tmp_dir) || path.join(REPO_ROOT, 'tmp/v7-build');
  const tmpRunDir = path.join(tmpRoot, runId);
  const runRoot = path.join(REPO_ROOT, 'mirrors/universe-v7/runs', runId);
  const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
  const apiLimitLockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json');

  const checkpointStorage = String(cfg?.resume?.checkpoint_storage || '').trim();
  const allowedCheckpointBackends = new Set(['github_artifact', 'github_release', 'r2', 'local_file']);

  const envCandidates = [
    String(args['env-file'] || '').trim(),
    process.env.EODHD_ENV_FILE || '',
    '/Users/michaelpuchowezki/Desktop/EODHD.env',
    path.join(REPO_ROOT, '.env.local')
  ].filter(Boolean);

  let envLoadResult = { loaded: false, vars: {}, reason: 'no_file' };
  for (const candidate of envCandidates) {
    envLoadResult = await loadEnvFile(candidate);
    if (envLoadResult.loaded && Object.keys(envLoadResult.vars).length > 0) {
      break;
    }
  }

  const hasEodhd = Boolean(String(process.env.EODHD_API_KEY || '').trim());

  const preflightIssues = [];
  const requiredPaths = [
    { key: 'config', abs: configPath },
    { key: 'law_registry', abs: lawRegistryPath },
    { key: 'legacy_contract', abs: coreContractPath }
  ];

  for (const item of requiredPaths) {
    if (!item.abs || !(await pathExists(item.abs))) {
      preflightIssues.push({ code: 'MISSING_REQUIRED_FILE', key: item.key, path: item.abs || null });
    }
  }

  if (!allowedCheckpointBackends.has(checkpointStorage)) {
    preflightIssues.push({
      code: 'INVALID_CHECKPOINT_STORAGE',
      value: checkpointStorage,
      allowed: [...allowedCheckpointBackends]
    });
  }

  if (!hasEodhd) {
    preflightIssues.push({
      code: 'MISSING_SECRET:EODHD_API_KEY',
      hint: 'Provide EODHD_API_KEY or EODHD_API_TOKEN in EODHD.env'
    });
  }

  const ignoreApiLimitLock = String(process.env.RV_V7_IGNORE_API_LIMIT_LOCK || '').toLowerCase() === 'true';
  if (!ignoreApiLimitLock && (await pathExists(apiLimitLockPath))) {
    const lockDoc = await readJson(apiLimitLockPath).catch(() => null);
    const lockDay = String(lockDoc?.generated_at || '').slice(0, 10);
    const today = nowIso().slice(0, 10);
    if (lockDay === today) {
      preflightIssues.push({
        code: 'API_LIMIT_LOCK_ACTIVE',
        hint: 'Daily API limit lock is active for today. Retry tomorrow or set RV_V7_IGNORE_API_LIMIT_LOCK=true.',
        lock_path: path.relative(REPO_ROOT, apiLimitLockPath),
        lock_status: Number(lockDoc?.status || 402),
        lock_reason: String(lockDoc?.reason || 'api_limit_reached')
      });
    }
  }

  if (preflightIssues.length > 0) {
    const preflightCode = preflightIssues.some((it) => String(it.code).startsWith('MISSING_SECRET'))
      ? EXIT.MISSING_SECRETS
      : preflightIssues.some((it) => String(it.code) === 'API_LIMIT_LOCK_ACTIVE')
        ? EXIT.BUDGET_STOP
        : EXIT.NEEDS_DECISION;
    process.stderr.write(JSON.stringify({
      status: 'FAIL',
      code: preflightCode,
      run_id: runId,
      issues: preflightIssues
    }) + '\n');
    process.exit(preflightCode);
  }

  const lock = await acquireRunLock(lockPath, runId, 6 * 60 * 60);
  if (!lock.ok) {
    process.stderr.write(JSON.stringify({
      status: 'FAIL',
      code: lock.code,
      run_id: runId,
      reason: lock.reason,
      details: lock.details
    }) + '\n');
    process.exit(lock.code);
  }

  const laws = await readJson(lawRegistryPath);
  const lawList = Array.isArray(laws?.laws) ? laws.laws : [];
  const appliedLaws = lawList.map((law) => ({
    law_id: law.law_id,
    status: 'declared',
    enforced_by_checks: Array.isArray(law.enforced_by_checks) ? law.enforced_by_checks : []
  }));

  const preflight = {
    schema: 'rv_v7_preflight_v1',
    generated_at: nowIso(),
    run_id: runId,
    git_sha: process.env.GITHUB_SHA || null,
    config_path: path.relative(REPO_ROOT, configPath),
    config_hash: stableContentHash(cfg),
    law_registry_path: path.relative(REPO_ROOT, lawRegistryPath),
    law_registry_hash: stableContentHash(laws),
    lock_path: path.relative(REPO_ROOT, lockPath),
    env: {
      loaded: envLoadResult.loaded,
      has_eodhd_api_key: hasEodhd,
      source_hint: envCandidates
    },
    checkpoint: {
      storage: checkpointStorage,
      path: cfg?.resume?.checkpoint_path || null
    },
    locks: {
      api_limit_lock: path.relative(REPO_ROOT, apiLimitLockPath),
      ignore_api_limit_lock: ignoreApiLimitLock
    }
  };

  await ensureDir(tmpRunDir);
  await ensureDir(path.join(runRoot, 'audit'));
  await writeJsonAtomic(path.join(tmpRunDir, 'preflight.json'), preflight);
  await writeJsonAtomic(path.join(runRoot, 'audit', 'applied_laws.json'), {
    schema: 'rv_v7_applied_laws_v1',
    generated_at: nowIso(),
    run_id: runId,
    law_registry_hash: preflight.law_registry_hash,
    applied_laws: appliedLaws,
    skipped_laws: []
  });

  if (!holdLock) {
    await releaseRunLock(lockPath, runId);
  }

  process.stdout.write(JSON.stringify({
    status: 'OK',
    code: EXIT.SUCCESS,
    phase: 'preflight',
    run_id: runId,
    tmp_dir: path.relative(REPO_ROOT, tmpRunDir),
    run_dir: path.relative(REPO_ROOT, runRoot),
    lock_path: path.relative(REPO_ROOT, lockPath),
    lock_held: holdLock
  }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: 1, reason: err?.message || 'preflight_failed' }) + '\n');
  process.exit(1);
});
