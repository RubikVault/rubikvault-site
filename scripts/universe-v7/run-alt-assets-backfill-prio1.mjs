#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    maxRunsPerBucket: '80',
    maxNoProgressRuns: '3',
    maxThrottleStops: '3',
    throttleCooldownMs: '120000',
    backfillMax: '1500',
    sleepMs: '2000',
    skipArcheology: true,
    allowNextBucketOnIncomplete: true,
    reportOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--max-runs-per-bucket') out.maxRunsPerBucket = String(argv[++i] || out.maxRunsPerBucket);
    else if (t === '--max-no-progress-runs') out.maxNoProgressRuns = String(argv[++i] || out.maxNoProgressRuns);
    else if (t === '--max-throttle-stops') out.maxThrottleStops = String(argv[++i] || out.maxThrottleStops);
    else if (t === '--throttle-cooldown-ms') out.throttleCooldownMs = String(argv[++i] || out.throttleCooldownMs);
    else if (t === '--backfill-max') out.backfillMax = String(argv[++i] || out.backfillMax);
    else if (t === '--sleep-ms') out.sleepMs = String(argv[++i] || out.sleepMs);
    else if (t === '--no-skip-archeology') out.skipArcheology = false;
    else if (t === '--strict-bucket-order') out.allowNextBucketOnIncomplete = false;
    else if (t === '--report-only') out.reportOnly = true;
  }
  return out;
}

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: false });
  return r.status ?? 1;
}

function main() {
  const args = parseArgs();
  if (args.reportOnly) {
    console.log('[AltAssets] report-only mode: no API backfill run executed');
    console.log('[AltAssets] intended command: node scripts/universe-v7/run-backfill-loop.mjs --buckets rest ...');
    process.exit(0);
  }
  const loopArgs = [
    'scripts/universe-v7/run-backfill-loop.mjs',
    '--buckets', 'rest',
    '--max-runs-per-bucket', args.maxRunsPerBucket,
    '--max-no-progress-runs', args.maxNoProgressRuns,
    '--max-throttle-stops', args.maxThrottleStops,
    '--throttle-cooldown-ms', args.throttleCooldownMs,
    '--backfill-max', args.backfillMax,
    '--sleep-ms', args.sleepMs,
    ...(args.skipArcheology ? ['--skip-archeology'] : []),
    ...(args.allowNextBucketOnIncomplete ? ['--allow-next-bucket-on-incomplete'] : []),
  ];
  console.log('[AltAssets] >>> Backfill rest bucket (crypto/forex/bond/index etc.)');
  const code = run('node', loopArgs);
  if (code !== 0 && code !== 40) {
    console.error(`[AltAssets] backfill loop failed code=${code}`);
    process.exit(code);
  }
  console.log(`[AltAssets] backfill loop finished code=${code}`);
}

main();
