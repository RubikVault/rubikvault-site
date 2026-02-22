#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    envFile: process.env.EODHD_ENV_FILE || '/Users/michaelpuchowezki/Desktop/EODHD.env',
    maxRunsPerBucket: '120',
    maxNoProgressRuns: '3',
    maxThrottleStops: '3',
    throttleCooldownMs: '120000',
    backfillMax: '1500',
    sleepMs: '2000',
    skipArcheology: true,
    enforceReadiness: true,
    enforceCompletion: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--env-file') out.envFile = String(argv[++i] || out.envFile);
    else if (token === '--max-runs-per-bucket') out.maxRunsPerBucket = String(argv[++i] || out.maxRunsPerBucket);
    else if (token === '--max-no-progress-runs') out.maxNoProgressRuns = String(argv[++i] || out.maxNoProgressRuns);
    else if (token === '--max-throttle-stops') out.maxThrottleStops = String(argv[++i] || out.maxThrottleStops);
    else if (token === '--throttle-cooldown-ms') out.throttleCooldownMs = String(argv[++i] || out.throttleCooldownMs);
    else if (token === '--backfill-max') out.backfillMax = String(argv[++i] || out.backfillMax);
    else if (token === '--sleep-ms') out.sleepMs = String(argv[++i] || out.sleepMs);
    else if (token === '--no-skip-archeology') out.skipArcheology = false;
    else if (token === '--no-enforce-readiness') out.enforceReadiness = false;
    else if (token === '--no-enforce-completion') out.enforceCompletion = false;
  }

  return out;
}

function runStep(name, cmd, args, env = process.env) {
  process.stdout.write(`\n[StocksPrio1] >>> ${name}\n`);
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: false
  });
  const durationMs = Date.now() - started;
  if (result.status !== 0) {
    process.stderr.write(`[StocksPrio1] !!! ${name} failed (code=${result.status}, duration_ms=${durationMs})\n`);
    process.exit(result.status || 1);
  }
  process.stdout.write(`[StocksPrio1] <<< ${name} done (duration_ms=${durationMs})\n`);
}

function main() {
  const args = parseArgs();

  runStep(
    'Stocks Readiness Gate',
    'node',
    [
      'scripts/universe-v7/gates/stocks-history-completion-gate.mjs',
      '--mode', 'readiness',
      ...(args.enforceReadiness ? ['--enforce', 'readiness'] : [])
    ]
  );

  runStep(
    'Stocks Backfill Loop',
    'node',
    [
      'scripts/universe-v7/run-backfill-loop.mjs',
      '--env-file', args.envFile,
      '--buckets', 'stocks',
      '--max-runs-per-bucket', args.maxRunsPerBucket,
      '--max-no-progress-runs', args.maxNoProgressRuns,
      '--max-throttle-stops', args.maxThrottleStops,
      '--throttle-cooldown-ms', args.throttleCooldownMs,
      '--backfill-max', args.backfillMax,
      '--sleep-ms', args.sleepMs,
      ...(args.skipArcheology ? ['--skip-archeology'] : [])
    ]
  );

  runStep(
    'Build History Pack Canonical Index',
    'node',
    ['scripts/universe-v7/build-history-pack-canonical-index.mjs']
  );

  runStep(
    'Report Forecast Pack Coverage',
    'node',
    ['scripts/universe-v7/report-forecast-pack-coverage.mjs']
  );

  runStep(
    'Stocks History Completion Gate',
    'node',
    [
      'scripts/universe-v7/gates/stocks-history-completion-gate.mjs',
      '--mode', 'completion',
      ...(args.enforceCompletion ? ['--enforce', 'completion'] : [])
    ]
  );

  process.stdout.write('\n[StocksPrio1] ✅ complete\n');
}

main();
