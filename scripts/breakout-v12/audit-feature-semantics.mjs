#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ALLOWED_CLASSES = new Set(['asset_local_rolling', 'cross_sectional_daily', 'global_regime_daily']);
const CLASS_ENGINES = {
  asset_local_rolling: 'polars',
  cross_sectional_daily: 'duckdb',
  global_regime_daily: 'duckdb',
};

function parseArgs(argv) {
  const args = {
    config: path.join(REPO_ROOT, 'config/breakout-v12/features.json'),
    out: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--config=')) args.config = path.resolve(arg.split('=')[1] || '');
    else if (arg.startsWith('--out=')) args.out = path.resolve(arg.split('=')[1] || '');
  }
  return args;
}

function writeJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(args.config)) {
    errors.push(`FEATURE_CONFIG_MISSING:${args.config}`);
  }
  const cfg = errors.length ? {} : JSON.parse(fs.readFileSync(args.config, 'utf8'));
  const features = Array.isArray(cfg.features) ? cfg.features : [];
  if (!features.length) errors.push('FEATURES_EMPTY');
  const seen = new Set();
  for (const feature of features) {
    const name = String(feature.name || '');
    const klass = String(feature.class || '');
    const engine = String(feature.engine || '');
    if (!name) errors.push('FEATURE_NAME_MISSING');
    if (seen.has(name)) errors.push(`FEATURE_DUPLICATE:${name}`);
    seen.add(name);
    if (!ALLOWED_CLASSES.has(klass)) errors.push(`FEATURE_CLASS_UNKNOWN:${name}:${klass || 'missing'}`);
    if (feature.point_in_time_safe !== true) errors.push(`FEATURE_PIT_FLAG_MISSING:${name}`);
    if (klass === 'asset_local_rolling' && !(Number(feature.lookback_bars) > 0)) {
      errors.push(`FEATURE_LOOKBACK_MISSING:${name}`);
    }
    if (klass === 'asset_local_rolling' && engine !== 'polars') {
      errors.push(`LOCAL_FEATURE_ENGINE_INVALID:${name}:${engine || 'missing'}`);
    }
    if ((klass === 'cross_sectional_daily' || klass === 'global_regime_daily') && engine !== 'duckdb') {
      errors.push(`GLOBAL_FEATURE_ENGINE_INVALID:${name}:${engine || 'missing'}`);
    }
    if (CLASS_ENGINES[klass] && engine !== CLASS_ENGINES[klass]) {
      warnings.push(`FEATURE_ENGINE_EXPECTED_${CLASS_ENGINES[klass].toUpperCase()}:${name}`);
    }
  }
  const payload = {
    schema_version: 'breakout_v12_feature_semantics_audit_v1',
    generated_at: new Date().toISOString(),
    ok: errors.length === 0,
    config: args.config,
    feature_count: features.length,
    errors,
    warnings,
  };
  writeJson(args.out, payload);
  console.log(JSON.stringify(payload));
  return payload.ok ? 0 : 76;
}

process.exitCode = main();
