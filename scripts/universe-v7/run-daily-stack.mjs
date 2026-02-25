#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';


const REPO_ROOT = process.cwd();
const REGISTRY_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    skipBackfill: false,
    skipForecast: false,
    skipCoverage: false,
    skipArcheology: false,
    buckets: 'stocks,etfs,rest',
    maxRunsPerBucket: '50',
    maxNoProgressRuns: '3',
    maxThrottleStops: '3',
    throttleCooldownMs: '120000',
    backfillMax: '1500',
    sleepMs: '2000',
    minBars: '200',
    feature: 'marketphase',
    enforceFeatureParity: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--skip-backfill') out.skipBackfill = true;
    else if (token === '--skip-forecast') out.skipForecast = true;
    else if (token === '--skip-coverage') out.skipCoverage = true;
    else if (token === '--skip-archeology') out.skipArcheology = true;
    else if (token === '--buckets') out.buckets = String(argv[++i] || out.buckets);
    else if (token === '--max-runs-per-bucket') out.maxRunsPerBucket = String(argv[++i] || out.maxRunsPerBucket);
    else if (token === '--max-no-progress-runs') out.maxNoProgressRuns = String(argv[++i] || out.maxNoProgressRuns);
    else if (token === '--max-throttle-stops') out.maxThrottleStops = String(argv[++i] || out.maxThrottleStops);
    else if (token === '--throttle-cooldown-ms') out.throttleCooldownMs = String(argv[++i] || out.throttleCooldownMs);
    else if (token === '--backfill-max') out.backfillMax = String(argv[++i] || out.backfillMax);
    else if (token === '--sleep-ms') out.sleepMs = String(argv[++i] || out.sleepMs);
    else if (token === '--min-bars') out.minBars = String(argv[++i] || out.minBars);
    else if (token === '--feature') out.feature = String(argv[++i] || out.feature);
    else if (token === '--enforce-feature-parity') out.enforceFeatureParity = true;
  }

  return out;
}

function runStep(name, cmd, args, env = process.env) {
  console.log(`\n[DailyStack] >>> ${name}`);
  const started = Date.now();
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    shell: false
  });
  const durationMs = Date.now() - started;
  if (result.status !== 0) {
    console.error(`[DailyStack] !!! ${name} failed (code=${result.status}, duration_ms=${durationMs})`);
    process.exit(result.status || 1);
  }
  console.log(`[DailyStack] <<< ${name} done (duration_ms=${durationMs})`);
}

function main() {
  const args = parseArgs();

  if (!args.skipBackfill) {
    runStep(
      'Backfill Buckets (stocks -> etfs -> rest)',
      'node',
      [
        'scripts/universe-v7/run-backfill-loop.mjs',
        ...(args.skipArcheology ? ['--skip-archeology'] : []),
        '--buckets', args.buckets,
        '--max-runs-per-bucket', args.maxRunsPerBucket,
        '--max-no-progress-runs', args.maxNoProgressRuns,
        '--max-throttle-stops', args.maxThrottleStops,
        '--throttle-cooldown-ms', args.throttleCooldownMs,
        '--backfill-max', args.backfillMax,
        '--sleep-ms', args.sleepMs
      ]
    );
  }

  if (!fs.existsSync(REGISTRY_GZ)) {
    runStep(
      'Bootstrap v7 Publish (registry missing)',
      'node',
      ['scripts/universe-v7/run-v7.mjs'],
      {
        ...process.env,
        RV_V7_BACKFILL_FAST_MODE: process.env.RV_V7_BACKFILL_FAST_MODE || 'true',
        RV_V7_SKIP_SSOT_BUILD: 'true'
      }
    );
  }

  runStep('Build v7 Stock SSOT', 'node', ['scripts/universe-v7/build-stock-ssot.mjs']);

  runStep(
    'Build Marketphase Deep Summary',
    'node',
    [
      'scripts/universe-v7/build-marketphase-deep-summary.mjs',
      '--min-bars', args.minBars,
      '--feature', args.feature
    ]
  );

  if (!args.skipForecast) {
    runStep('Run Forecast Daily', 'node', ['scripts/forecast/run_daily.mjs']);
  }

  runStep('Report Feature Stock Universe', 'node', ['scripts/universe-v7/report-feature-stock-universe.mjs']);

  if (!args.skipCoverage) {
    runStep('Report Coverage Progress', 'node', ['scripts/universe-v7/report-coverage-progress.mjs']);
  }

  runStep(
    'Feature Universe Parity Gate',
    'node',
    [
      'scripts/universe-v7/gates/feature-universe-parity.mjs',
      ...(args.enforceFeatureParity ? ['--enforce'] : [])
    ]
  );

  console.log('\n[DailyStack] ✅ complete');
}

main();
