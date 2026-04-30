#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_QUANT_ROOT = process.env.QUANT_ROOT
  || path.join(process.env.HOME || path.dirname(REPO_ROOT), 'QuantLabHot/rubikvault-quantlab');

function parseArgs(argv) {
  const args = {
    asOf: '',
    quantRoot: DEFAULT_QUANT_ROOT,
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3',
    allowFullScan: process.env.RV_BREAKOUT_OUTCOMES_ALLOW_FULL_SCAN === '1',
    replace: false,
  };
  for (const arg of argv) {
    if (arg === '--allow-full-scan') args.allowFullScan = true;
    else if (arg === '--replace') args.replace = true;
    else if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || args.quantRoot;
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || args.pythonBin;
  }
  args.quantRoot = path.resolve(args.quantRoot);
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.allowFullScan) {
    console.error('FATAL: outcomes require --allow-full-scan or RV_BREAKOUT_OUTCOMES_ALLOW_FULL_SCAN=1; do not run inside Nightly by default');
    return 2;
  }
  const pointer = readJson(path.join(args.quantRoot, 'breakout-v12/latest.json'));
  const asOf = args.asOf || String(pointer.as_of || '').slice(0, 10);
  if (!asOf) throw new Error('as-of missing and latest pointer has no as_of');
  if (String(pointer.as_of || '').slice(0, 10) !== asOf) {
    throw new Error(`latest pointer as_of ${pointer.as_of} does not match requested ${asOf}`);
  }
  const runRoot = String(pointer.run_root || '');
  const signalsParquet = path.join(runRoot, 'global', `date=${asOf}`, 'scores.parquet');
  if (!fs.existsSync(signalsParquet)) throw new Error(`promoted V12 scores parquet missing: ${signalsParquet}`);

  const runtimeRoot = path.join(REPO_ROOT, 'runtime/breakout-v12/outcomes');
  const inputManifest = path.join(runtimeRoot, `input-manifest-${asOf}.json`);
  writeJson(inputManifest, {
    schema_version: 'breakout_v12_outcome_input_manifest_v1',
    as_of: asOf,
    quant_root: args.quantRoot,
    source_run_root: runRoot,
    signals_parquet: signalsParquet,
    configs: {
      outcomes: {
        horizons: [10, 20],
        target_atr: 2.0,
        stop_atr: 1.0,
        gap_handling: { gap_event_threshold_atr: 2.0 },
      },
    },
  });

  const childArgs = [
    'scripts/breakout_compute/evaluate_outcomes.py',
    `--input-manifest=${inputManifest}`,
    `--signal-date=${asOf}`,
    `--signals-parquet=${signalsParquet}`,
  ];
  if (args.replace) childArgs.push('--replace');
  const res = spawnSync(args.pythonBin, childArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      POLARS_MAX_THREADS: process.env.POLARS_MAX_THREADS || '2',
      OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '2',
    },
  });
  return res.status ?? 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
