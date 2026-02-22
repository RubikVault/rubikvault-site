#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT, nowIso, parseArgs, pathExists, writeJsonAtomic, stableContentHash } from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { EXIT } from './lib/exit-codes.mjs';

async function withLock(lockPath, fn) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const handle = await fs.open(lockPath, 'wx').catch(() => null);
  if (!handle) {
    const err = new Error('PUBLISH_LOCK_HELD');
    err.code = EXIT.HARD_FAIL_PARTIAL_PUBLISH;
    throw err;
  }

  try {
    await handle.writeFile(JSON.stringify({ locked_at: nowIso(), pid: process.pid }, null, 2));
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(lockPath).catch(() => {});
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args['run-id'] || '').trim();
  if (!runId) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.NEEDS_DECISION, reason: 'run-id required' }) + '\n');
    process.exit(EXIT.NEEDS_DECISION);
  }

  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);
  const publishDir = resolvePathMaybe(cfg?.run?.publish_dir) || path.join(REPO_ROOT, 'public/data/universe/v7');
  const tmpRoot = resolvePathMaybe(cfg?.run?.tmp_dir) || path.join(REPO_ROOT, 'tmp/v7-build');
  const sourceDir = args.source
    ? path.resolve(String(args.source))
    : path.join(tmpRoot, runId, 'publish_payload');

  if (!(await pathExists(sourceDir))) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_PARTIAL_PUBLISH, reason: 'publish source missing', source_dir: sourceDir }) + '\n');
    process.exit(EXIT.HARD_FAIL_PARTIAL_PUBLISH);
  }

  const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/publish.lock');
  const intentPath = path.join(path.dirname(sourceDir), 'publish_intent.json');

  await writeJsonAtomic(intentPath, {
    schema: 'rv_v7_publish_intent_v1',
    run_id: runId,
    generated_at: nowIso(),
    source_dir: path.relative(REPO_ROOT, sourceDir),
    target_dir: path.relative(REPO_ROOT, publishDir),
    intent_hash: stableContentHash({ runId, sourceDir, publishDir })
  });

  try {
    await withLock(lockPath, async () => {
      const backupDir = `${publishDir}.__prev`;
      await fs.rm(backupDir, { recursive: true, force: true });

      const targetExists = await pathExists(publishDir);
      if (targetExists) {
        await fs.rename(publishDir, backupDir);
      }

      try {
        await fs.rename(sourceDir, publishDir);
      } catch (err) {
        if (targetExists && (await pathExists(backupDir))) {
          await fs.rename(backupDir, publishDir).catch(() => {});
        }
        throw err;
      }

      await writeJsonAtomic(path.join(publishDir, 'publish_complete.json'), {
        schema: 'rv_v7_publish_complete_v1',
        run_id: runId,
        completed_at: nowIso(),
        publish_dir: path.relative(REPO_ROOT, publishDir),
        intent_ref: path.relative(REPO_ROOT, intentPath)
      });

      await fs.rm(backupDir, { recursive: true, force: true });
    });
  } catch (err) {
    process.stderr.write(JSON.stringify({
      status: 'FAIL',
      code: err?.code || EXIT.HARD_FAIL_PARTIAL_PUBLISH,
      reason: err?.message || 'publish_failed'
    }) + '\n');
    process.exit(err?.code || EXIT.HARD_FAIL_PARTIAL_PUBLISH);
  }

  process.stdout.write(JSON.stringify({ status: 'OK', code: EXIT.SUCCESS, run_id: runId, publish_dir: path.relative(REPO_ROOT, publishDir) }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_PARTIAL_PUBLISH, reason: err?.message || 'publish_two_phase_failed' }) + '\n');
  process.exit(EXIT.HARD_FAIL_PARTIAL_PUBLISH);
});
