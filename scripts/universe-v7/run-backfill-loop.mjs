#!/usr/bin/env node

import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, readJson, REPO_ROOT, nowIso, writeJsonAtomic } from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { loadBackfillWaivers } from './lib/backfill-waivers.mjs';

const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/backfill_bucket_progress.json');

const DEFAULT_BUCKETS = [
  { id: 'stocks', allowlist: ['STOCK'], priority: 1 },
  { id: 'etfs', allowlist: ['ETF'], priority: 2 },
  { id: 'rest', allowlist: ['FUND', 'INDEX', 'FOREX', 'CRYPTO', 'BOND', 'OTHER'], priority: 3 }
];

function parseBucketOrder(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return DEFAULT_BUCKETS;
  const wanted = raw.split(',').map((x) => x.trim()).filter(Boolean);
  const byId = new Map(DEFAULT_BUCKETS.map((bucket) => [bucket.id, bucket]));
  const ordered = [];
  for (const id of wanted) {
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  return ordered.length ? ordered : DEFAULT_BUCKETS;
}

function runOnce({ envFile, allowlist, backfillMax, offline = false, publish = true, skipArcheology = false }) {
  const args = ['scripts/universe-v7/run-v7.mjs'];
  if (publish) args.push('--publish');
  if (offline) args.push('--offline');
  if (skipArcheology) args.push('--skip-archeology');
  if (envFile) args.push('--env-file', envFile);
  if (backfillMax) args.push('--backfill-max', String(backfillMax));
  const proc = spawnSync('node', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RV_V7_PIPELINE_NODE_OPTIONS: process.env.RV_V7_PIPELINE_NODE_OPTIONS || '--max-old-space-size=8192',
      RV_V7_BACKFILL_FAST_MODE: 'true',
      RV_V7_BACKFILL_TYPE_ALLOWLIST: allowlist.join(',')
    }
  });

  const out = `${proc.stdout || ''}${proc.stderr || ''}`.trim();
  let parsed = null;
  for (const line of out.split(/\n+/).reverse()) {
    try {
      parsed = JSON.parse(line);
      break;
    } catch {
      // ignore non-json lines
    }
  }

  return {
    status: proc.status ?? 1,
    parsed,
    output: out
  };
}

async function readBucketProgress(typeAllowlist, checkpointPath, waivedCanonicalIds = null) {
  const typeSet = new Set(typeAllowlist.map((x) => String(x).toUpperCase()));
  const waived = waivedCanonicalIds instanceof Set ? waivedCanonicalIds : null;
  const stats = {
    total: 0,
    backfill_real: 0,
    with_bars: 0,
    remaining: 0,
    checkpoint_done: 0,
    checkpoint_pending: 0,
    progress_units: 0
  };

  if (!fs.existsSync(REGISTRY_PATH)) return stats;
  const checkpoint = await readJson(checkpointPath).catch(() => null);
  const doneSet = new Set(Array.isArray(checkpoint?.symbols_done) ? checkpoint.symbols_done : []);
  const pendingSet = new Set(Array.isArray(checkpoint?.symbols_pending) ? checkpoint.symbols_pending : []);

  const stream = fs.createReadStream(REGISTRY_PATH).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const typeNorm = String(row?.type_norm || '').toUpperCase();
    if (!typeSet.has(typeNorm)) continue;
    const cid = String(row?.canonical_id || '').toUpperCase();
    if (waived && cid && waived.has(cid)) continue;
    stats.total += 1;
    const quality = String(row?._quality_basis || '').toLowerCase();
    if (quality === 'backfill_real') stats.backfill_real += 1;
    const bars = Number(row?.bars_count || 0);
    if (Number.isFinite(bars) && bars > 0) stats.with_bars += 1;
    if (doneSet.has(row?.canonical_id)) stats.checkpoint_done += 1;
    if (pendingSet.has(row?.canonical_id)) stats.checkpoint_pending += 1;
  }

  stats.remaining = Math.max(0, stats.total - stats.backfill_real);
  stats.progress_units = Math.max(stats.backfill_real, stats.checkpoint_done);
  return stats;
}

async function readRemaining() {
  const p = path.join(REPO_ROOT, 'public/data/universe/v7/reports/budget_report.json');
  const doc = await readJson(p).catch(() => null);
  return Number(doc?.backfill_remaining ?? NaN);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { cfg } = await loadV7Config(args.config ? path.resolve(String(args.config)) : undefined);
  const backfillWaivers = await loadBackfillWaivers({ repoRoot: REPO_ROOT, cfg, typeFilter: 'STOCK' });
  const checkpointPath = resolvePathMaybe(cfg?.resume?.checkpoint_path)
    || path.join(REPO_ROOT, 'mirrors/universe-v7/state/checkpoint.json');
  const strictBucketOrder = args['allow-next-bucket-on-incomplete'] === true
    ? false
    : String(args['strict-bucket-order'] ?? process.env.RV_V7_STRICT_BUCKET_ORDER ?? 'true').toLowerCase() !== 'false';
  const maxRunsPerBucket = Math.max(1, Number(args['max-runs-per-bucket'] || args['max-runs'] || 50));
  const maxNoProgress = Math.max(1, Number(args['max-no-progress-runs'] || 3));
  const maxThrottleStops = Math.max(1, Number(args['max-throttle-stops'] || 3));
  const throttleCooldownMs = Math.max(0, Number(args['throttle-cooldown-ms'] || 120000));
  const envFile = args['env-file']
    ? String(args['env-file'])
    : (process.env.EODHD_ENV_FILE ? String(process.env.EODHD_ENV_FILE) : null);
  const sleepMs = Math.max(0, Number(args['sleep-ms'] || 2000));
  const backfillMax = String(args['backfill-max'] || process.env.RV_V7_BACKFILL_MAX || '1500').trim();
  const offline = Boolean(args.offline);
  const publish = args.publish !== false && args['no-publish'] !== true;
  const skipArcheology = args['skip-archeology'] === true || String(process.env.RV_V7_SKIP_ARCHEOLOGY || '').toLowerCase() === 'true';
  const buckets = parseBucketOrder(args.buckets || process.env.RV_V7_BUCKET_ORDER || '');

  const bucketReports = [];
  let budgetStopped = false;
  let fatal = null;
  let blockedByIncompleteBucket = null;

  for (const bucket of buckets) {
    const bucketRuns = [];
    let before = await readBucketProgress(bucket.allowlist, checkpointPath, backfillWaivers.ids);
    let stagnation = 0;
    let throttledStops = 0;
    let completed = before.remaining <= 0;

    for (let i = 1; i <= maxRunsPerBucket; i += 1) {
      if (completed || budgetStopped || fatal) break;

      const result = runOnce({
        envFile,
        allowlist: bucket.allowlist,
        backfillMax,
        offline,
        publish,
        skipArcheology
      });
      const remainingGlobal = await readRemaining();
      const after = await readBucketProgress(bucket.allowlist, checkpointPath, backfillWaivers.ids);
      const code = result.parsed?.code ?? result.status;
      const ok = code === 0 || code === 30 || code === 40;
      const deltaReal = after.backfill_real - before.backfill_real;
      const deltaProgress = after.progress_units - before.progress_units;
      const deltaBars = after.with_bars - before.with_bars;

      bucketRuns.push({
        run: i,
        status: result.status,
        code,
        run_id: result.parsed?.run_id || null,
        reason: result.parsed?.reason || null,
        remaining_global: Number.isFinite(remainingGlobal) ? remainingGlobal : null,
        before,
        after,
        delta_backfill_real: deltaReal,
        delta_progress_units: deltaProgress,
        delta_with_bars: deltaBars
      });

      if (!ok) {
        fatal = {
          bucket: bucket.id,
          code,
          reason: result.parsed?.reason || 'pipeline_failed'
        };
        break;
      }

      if (code === 30 || code === 40) {
        if (code === 30) {
          budgetStopped = true;
        } else {
          throttledStops += 1;
          if (throttledStops >= maxThrottleStops) {
            budgetStopped = true;
          }
        }
      }

      completed = after.remaining <= 0;
      if (code !== 40) {
        if (deltaProgress <= 0) stagnation += 1;
        else stagnation = 0;
      }
      before = after;

      if (stagnation >= maxNoProgress) break;
      if (completed || budgetStopped) break;
      const waitMs = code === 40 ? Math.max(sleepMs, throttleCooldownMs) : sleepMs;
      if (i < maxRunsPerBucket && waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    }

    const last = bucketRuns[bucketRuns.length - 1] || null;
    bucketReports.push({
      id: bucket.id,
      priority: bucket.priority,
      allowlist: bucket.allowlist,
      runs: bucketRuns,
      throttled_stops: throttledStops,
      completed,
      last_progress: last?.after || before
    });

    if (!completed && strictBucketOrder && !budgetStopped && !fatal) {
      blockedByIncompleteBucket = {
        bucket: bucket.id,
        remaining: Number.isFinite(last?.after?.remaining) ? Number(last.after.remaining) : Number(before.remaining || 0),
        reason: 'bucket_incomplete_strict_order'
      };
      break;
    }

    if (budgetStopped || fatal) break;
  }

  const report = {
    schema: 'rv_v7_backfill_bucket_progress_v1',
    generated_at: nowIso(),
    env_file: envFile,
    skip_archeology: skipArcheology,
    backfill_max: backfillMax ? Number(backfillMax) : null,
    max_runs_per_bucket: maxRunsPerBucket,
    max_no_progress_runs: maxNoProgress,
    strict_bucket_order: strictBucketOrder,
    max_throttle_stops: maxThrottleStops,
    throttle_cooldown_ms: throttleCooldownMs,
    backfill_waivers: {
      path: path.relative(REPO_ROOT, backfillWaivers.path),
      exists: Boolean(backfillWaivers.exists),
      count: Number(backfillWaivers.ids?.size || 0)
    },
    budget_stopped: budgetStopped,
    fatal,
    blocked_by_incomplete_bucket: blockedByIncompleteBucket,
    buckets: bucketReports
  };

  await writeJsonAtomic(REPORT_PATH, report);

  const out = {
    status: fatal ? 'FAIL' : 'OK',
    budget_stopped: budgetStopped,
    blocked_by_incomplete_bucket: blockedByIncompleteBucket,
    buckets: bucketReports.map((bucket) => ({
      id: bucket.id,
      runs: bucket.runs.length,
      completed: bucket.completed,
      remaining: bucket.last_progress?.remaining ?? null
    })),
    fatal
  };

  process.stdout.write(`${JSON.stringify(out)}\n`);
  if (fatal) process.exit(Number(fatal.code) || 1);
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: 1, message: String(err?.message || err) })}\n`);
  process.exit(1);
});
