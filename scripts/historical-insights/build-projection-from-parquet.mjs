#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
// Source root must be supplied via --source-root or RV_HISTORICAL_RESEARCH_SOURCE_ROOT;
// the operator-machine path that previously hardcoded here moved to env-only.
const DEFAULT_SOURCE = process.env.RV_HISTORICAL_RESEARCH_SOURCE_ROOT || '';
const DEFAULT_OUT = path.join(ROOT, 'public/data/historical-insights');
const MAX_SHARD_BYTES = 1800 * 1024;

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function emptyDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function atomicWriteJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  fs.renameSync(tmp, filePath);
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runDuckJson(sql) {
  const out = execFileSync('duckdb', ['-json', '-c', sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  return JSON.parse(out || '[]');
}

function parquetColumns(filePath) {
  const rows = runDuckJson(`DESCRIBE SELECT * FROM read_parquet('${filePath.replaceAll("'", "''")}') LIMIT 1;`);
  return new Set(rows.map((row) => String(row.column_name || '').trim()).filter(Boolean));
}

function cleanNumber(value, digits = 6) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function humanizePattern(patternId) {
  return String(patternId || '')
    .replace(/^month_/, 'Calendar month: ')
    .replace(/^seq_/, 'Recent sequence: ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function exitRule(horizon) {
  const raw = String(horizon || '').toLowerCase();
  const match = raw.match(/t(\d+)/);
  return match ? `Exit after ${match[1]} trading days.` : 'Exit at the tested historical horizon.';
}

function entryCondition(patternId, family) {
  const pattern = String(patternId || '').toLowerCase();
  if (pattern.startsWith('month_')) return `Calendar condition: ${humanizePattern(patternId)}.`;
  if (pattern.startsWith('green_streak_')) return `Current chart shows ${pattern.split('_').pop()} consecutive green daily closes.`;
  if (pattern.startsWith('seq_')) return `Recent daily close sequence matches ${pattern.replace('seq_', '').toUpperCase()}.`;
  if (pattern === 'inside_day') return 'Latest daily candle is fully inside the prior daily range.';
  if (pattern.startsWith('new_')) return `Price is testing ${humanizePattern(patternId).toLowerCase()}.`;
  if (pattern.includes('gap')) return `Latest daily open/close structure matches ${humanizePattern(patternId).toLowerCase()}.`;
  return `Chart condition matches ${humanizePattern(patternId)} (${family || 'historical pattern'}).`;
}

function strength(row, highlightWinRate) {
  const wr = Number(row.win_rate);
  if (wr >= highlightWinRate) return 'highlight';
  if (wr > 0.5) return 'weak_edge';
  return 'background';
}

function main() {
  const sourceRootArg = argValue('source-root', DEFAULT_SOURCE);
  if (!sourceRootArg) {
    throw new Error('build-projection-from-parquet: --source-root or RV_HISTORICAL_RESEARCH_SOURCE_ROOT required (path to Historical-Analyses repo).');
  }
  const sourceRoot = path.resolve(sourceRootArg);
  const outRoot = path.resolve(argValue('out-root', DEFAULT_OUT));
  const pageCoreLatestPath = path.resolve(argValue('page-core-latest', path.join(ROOT, 'public/data/page-core/latest.json')));
  const minSample = Number(argValue('min-sample', '30'));
  const weakWinRate = Number(argValue('weak-win-rate', '0.50'));
  const highlightWinRate = Number(argValue('highlight-win-rate', '0.55'));
  const rulesPath = path.join(sourceRoot, 'outputs/universe/validated_rules.parquet');
  const profilesPath = path.join(sourceRoot, 'outputs/universe/asset_signal_profiles.parquet');
  if (!fs.existsSync(rulesPath)) throw new Error(`validated rules parquet missing: ${rulesPath}`);
  if (!fs.existsSync(profilesPath)) throw new Error(`signal profiles parquet missing: ${profilesPath}`);
  emptyDir(path.join(outRoot, 'shards'));
  const ruleCols = parquetColumns(rulesPath);
  const expr = (name, fallbackSql) => ruleCols.has(name) ? `r.${name}` : fallbackSql;

  const rulesSql = `
    WITH base AS (
      SELECT
        r.asset_id,
        r.ticker,
        r.rule_id,
        r.pattern_id,
        r.pattern_family,
        ${expr('direction', "'LONG'")} AS direction,
        r.target_horizon,
        r.n,
        r.win_rate,
        ${expr('wilson_low', 'NULL')} AS wilson_low,
        ${expr('wilson_high', 'NULL')} AS wilson_high,
        r.avg_return,
        ${expr('avg_signed_return', 'r.avg_return')} AS avg_signed_return,
        ${expr('raw_avg_return', 'r.avg_return')} AS raw_avg_return,
        r.edge_vs_baseline,
        r.evidence_score,
        r.status,
        p.exchange,
        p.last_date,
        p.bars_count,
        p.dominant_style,
        p.pattern_count_validated,
        p.research_status,
        ROW_NUMBER() OVER (
          PARTITION BY r.asset_id
          ORDER BY
            CASE WHEN r.win_rate >= ${highlightWinRate} THEN 0 ELSE 1 END,
            r.evidence_score DESC NULLS LAST,
            r.edge_vs_baseline DESC NULLS LAST,
            r.win_rate DESC NULLS LAST,
            r.n DESC NULLS LAST
        ) AS rn
      FROM read_parquet('${rulesPath.replaceAll("'", "''")}') r
      LEFT JOIN read_parquet('${profilesPath.replaceAll("'", "''")}') p ON p.asset_id = r.asset_id
      WHERE r.n >= ${minSample}
        AND r.win_rate > ${weakWinRate}
        AND ${expr('avg_signed_return', 'r.avg_return')} > 0
    )
    SELECT * FROM base WHERE rn <= 5 ORDER BY asset_id, rn;
  `;
  const rows = runDuckJson(rulesSql);
  const generatedAt = nowIso();
  const byPrefix = new Map();
  for (const row of rows) {
    const assetId = String(row.asset_id || '').toUpperCase();
    if (!assetId || !assetId.includes(':')) continue;
    const exchange = assetId.split(':')[0].replace(/[^A-Z0-9_-]/g, '_') || 'OTHER';
    const symbol = assetId.split(':').pop().replace(/[^A-Z0-9]/g, '').toUpperCase() || '0';
    const prefix = `${exchange}-${symbol.slice(0, 1) || '0'}`;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Map());
    const shard = byPrefix.get(prefix);
    if (!shard.has(assetId)) {
      shard.set(assetId, {
        asset_id: assetId,
        ticker: row.ticker || assetId.split(':').pop(),
        exchange: row.exchange || prefix,
        availability: {
          status: row.research_status === 'complete' ? 'ready' : 'degraded',
          reason: row.research_status === 'complete' ? null : 'historical_research_projection_incomplete',
        },
        last_research_date: row.last_date || null,
        bars_count: Number(row.bars_count || 0),
        dominant_style: row.dominant_style || null,
        pattern_count_validated: Number(row.pattern_count_validated || 0),
        top_rules: [],
      });
    }
    shard.get(assetId).top_rules.push({
      rule_id: row.rule_id || `${assetId}_${row.pattern_id}_${row.target_horizon}`,
      pattern_id: row.pattern_id || null,
      pattern_family: row.pattern_family || null,
      label: humanizePattern(row.pattern_id),
      target_horizon: row.target_horizon || null,
      direction: row.direction || 'LONG',
      sample_size: Number(row.n || 0),
      win_rate: cleanNumber(row.win_rate),
      wilson_low: cleanNumber(row.wilson_low),
      wilson_high: cleanNumber(row.wilson_high),
      avg_return: cleanNumber(row.avg_return),
      avg_signed_return: cleanNumber(row.avg_signed_return),
      raw_avg_return: cleanNumber(row.raw_avg_return),
      edge_vs_baseline: cleanNumber(row.edge_vs_baseline),
      evidence_score: Number(row.evidence_score || 0),
      strength: strength(row, highlightWinRate),
      entry_condition: entryCondition(row.pattern_id, row.pattern_family),
      exit_rule: exitRule(row.target_horizon),
      active_today: false,
    });
  }

  const shards = {};
  let assetCount = 0;
  let ruleCount = 0;
  const finalShards = new Map();
  for (const [prefix, map] of byPrefix.entries()) {
    const payloadSize = Buffer.byteLength(JSON.stringify({ by_asset: Object.fromEntries(map) }));
    if (payloadSize <= MAX_SHARD_BYTES) {
      finalShards.set(prefix, map);
      continue;
    }
    for (const [assetId, row] of map.entries()) {
      const exchange = assetId.split(':')[0].replace(/[^A-Z0-9_-]/g, '_') || 'OTHER';
      const symbol = assetId.split(':').pop().replace(/[^A-Z0-9]/g, '').toUpperCase() || '0';
      const splitPrefix = `${exchange}-${symbol.slice(0, 2) || '0'}`;
      if (!finalShards.has(splitPrefix)) finalShards.set(splitPrefix, new Map());
      finalShards.get(splitPrefix).set(assetId, row);
    }
  }
  for (const [prefix, map] of [...finalShards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rel = `shards/${prefix}.json`;
    const byAsset = Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    assetCount += map.size;
    ruleCount += Object.values(byAsset).reduce((sum, row) => sum + row.top_rules.length, 0);
    atomicWriteJson(path.join(outRoot, rel), {
      schema: 'rv.historical_insights.shard.v1',
      generated_at: generatedAt,
      prefix,
      asset_count: map.size,
      by_asset: byAsset,
    });
    shards[prefix] = rel;
  }

  atomicWriteJson(path.join(outRoot, 'latest.json'), {
    schema: 'rv.historical_insights.latest.v1',
    generated_at: generatedAt,
    projection_id: sha(`${generatedAt}|${assetCount}|${ruleCount}`),
    source: {
      kind: 'historical_analyses_projection',
      local_paths_redacted: true,
    },
    thresholds: {
      min_sample: minSample,
      weak_win_rate: weakWinRate,
      highlight_win_rate: highlightWinRate,
      require_positive_avg_return: true,
    },
    asset_count: assetCount,
    rule_count: ruleCount,
    shard_count: Object.keys(shards).length,
    shards,
  });
  const pageCoreLatest = readJsonMaybe(pageCoreLatestPath) || {};
  atomicWriteJson(path.join(outRoot, 'coverage-latest.json'), {
    schema: 'rv.historical_research_coverage.v1',
    generated_at: generatedAt,
    page_core_snapshot_id: pageCoreLatest.snapshot_id || null,
    page_core_asset_count: Number(pageCoreLatest.asset_count || 0),
    historical_asset_count: assetCount,
    coverage_pct: Number(pageCoreLatest.asset_count || 0) > 0 ? Number(((Math.min(assetCount, Number(pageCoreLatest.asset_count)) / Number(pageCoreLatest.asset_count)) * 100).toFixed(2)) : null,
    status: assetCount > 0 ? 'ready' : 'empty',
  });
  console.log(`[historical-insights] wrote ${assetCount} assets, ${ruleCount} rules to ${path.relative(ROOT, outRoot)}`);
}

main();
