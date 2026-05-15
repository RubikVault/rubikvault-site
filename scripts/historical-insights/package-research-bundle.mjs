#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function shaFile(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function main() {
  // Source root must be supplied explicitly via --source-root, RV_HISTORICAL_RESEARCH_SOURCE_ROOT,
  // or the legacy script env. No hardcoded operator path so this runs from any machine.
  const sourceRootArg = argValue('source-root', process.env.RV_HISTORICAL_RESEARCH_SOURCE_ROOT || '');
  if (!sourceRootArg) {
    throw new Error('package-research-bundle: --source-root or RV_HISTORICAL_RESEARCH_SOURCE_ROOT required (path to Historical-Analyses repo).');
  }
  const sourceRoot = path.resolve(sourceRootArg);
  const projectionRoot = path.resolve(argValue('projection-root', path.join(REPO_ROOT, 'public/data/historical-insights')));
  const bundleRoot = path.resolve(argValue('bundle-root', path.join(process.env.HOME || '.', 'RubikData/historical-research-bundle/current')));
  const pageCoreLatestPath = path.resolve(argValue('page-core-latest', path.join(REPO_ROOT, 'public/data/page-core/latest.json')));
  const statsPath = path.join(sourceRoot, 'outputs/universe/validated_rules.parquet');
  const profilePath = path.join(sourceRoot, 'outputs/universe/asset_signal_profiles.parquet');
  const latest = readJson(path.join(projectionRoot, 'latest.json'));
  if (!latest || latest.schema !== 'rv.historical_insights.latest.v1') throw new Error(`invalid projection latest: ${projectionRoot}`);
  const pageCore = readJson(pageCoreLatestPath) || {};

  copyDir(projectionRoot, path.join(bundleRoot, 'public/historical-insights'));
  fs.mkdirSync(path.join(bundleRoot, 'private'), { recursive: true });
  if (fs.existsSync(statsPath)) fs.copyFileSync(statsPath, path.join(bundleRoot, 'private/validated_rules.parquet'));
  if (fs.existsSync(profilePath)) fs.copyFileSync(profilePath, path.join(bundleRoot, 'private/asset_signal_profiles.parquet'));

  const coverage = {
    schema: 'rv.historical_research_coverage.v1',
    generated_at: new Date().toISOString(),
    page_core_snapshot_id: pageCore.snapshot_id || null,
    page_core_asset_count: Number(pageCore.asset_count || 0),
    historical_asset_count: Number(latest.asset_count || 0),
    coverage_pct: Number(pageCore.asset_count || 0) > 0 ? Number(((Math.min(Number(latest.asset_count || 0), Number(pageCore.asset_count)) / Number(pageCore.asset_count)) * 100).toFixed(2)) : null,
    status: Number(latest.asset_count || 0) > 0 ? 'ready' : 'empty',
  };
  atomicWriteJson(path.join(bundleRoot, 'public/historical-insights/coverage-latest.json'), coverage);

  const manifest = {
    schema: 'rv.historical_research_bundle.v2',
    generated_at: new Date().toISOString(),
    producer: 'rubik-historical-research-run',
    source_root_redacted: true,
    page_core_snapshot_id: pageCore.snapshot_id || null,
    page_core_target_market_date: pageCore.target_market_date || null,
    historical_insights_generated_at: latest.generated_at || null,
    public_paths: {
      latest: 'public/historical-insights/latest.json',
      shards: 'public/historical-insights/shards',
      coverage: 'public/historical-insights/coverage-latest.json',
    },
    private_paths: {
      validated_rules: fs.existsSync(path.join(bundleRoot, 'private/validated_rules.parquet')) ? 'private/validated_rules.parquet' : null,
      asset_signal_profiles: fs.existsSync(path.join(bundleRoot, 'private/asset_signal_profiles.parquet')) ? 'private/asset_signal_profiles.parquet' : null,
    },
    hashes: {
      validated_rules_sha256: shaFile(path.join(bundleRoot, 'private/validated_rules.parquet')),
      patterns_py_sha256: shaFile(path.join(sourceRoot, 'scripts/audit_lib/patterns.py')),
      features_py_sha256: shaFile(path.join(sourceRoot, 'scripts/audit_lib/features.py')),
    },
    counts: {
      historical_assets: latest.asset_count || 0,
      historical_rules: latest.rule_count || 0,
      shard_count: latest.shard_count || 0,
    },
  };
  atomicWriteJson(path.join(bundleRoot, 'manifest.json'), manifest);
  console.log(`[historical-bundle] wrote ${bundleRoot}`);
}

main();
