#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { pageShardName } from '../lib/page-core-contract.mjs';
import { loadLocalBars, REPO_ROOT, setLocalBarsRuntimeOverrides } from '../lib/best-setups-local-loader.mjs';
import { evaluateHistoricalPattern } from './rule-evaluator.mjs';

const OUT_PATH = path.join(REPO_ROOT, 'public/data/historical-setups/latest.json');
const INSIGHTS_ROOT = path.join(REPO_ROOT, 'public/data/historical-insights');
const PAGE_CORE_LATEST = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
// NAS_OPS_ROOT must be supplied by the supervisor / .env.local on NAS. Hardcoding
// the operator-machine path here would leak a private NAS layout into MAIN and
// would silently mask a missing env on local dev runs. Fail fast instead so the
// missing env is obvious.
const NAS_OPS_ROOT = process.env.NAS_OPS_ROOT || '';
const DEFAULT_PRIVATE_STATS = NAS_OPS_ROOT
  ? path.join(NAS_OPS_ROOT, 'external-analysis/historical-research/last-good/private/validated_rules.parquet')
  : '';
const PRIVATE_STATS_PATH = process.env.RV_HISTORICAL_RESEARCH_STATS || DEFAULT_PRIVATE_STATS;
if (!PRIVATE_STATS_PATH) {
  throw new Error('build-active-setups: RV_HISTORICAL_RESEARCH_STATS or NAS_OPS_ROOT must point at the last-good validated_rules.parquet.');
}
const MAX_BAR_STALE_DAYS = Math.max(1, Number(process.env.RV_HISTORICAL_SETUPS_MAX_BAR_STALE_DAYS || '7'));
const EU_EXCHANGES = new Set(['EUFUND','AS','AT','BA','BC','BE','BR','BUD','CO','DE','DU','F','HA','HE','HM','IR','LSE','LU','LS','MC','MI','MU','OL','PA','RO','ST','STU','SW','VI','WAR','XETRA']);
const ASIA_EXCHANGES = new Set(['AU','BK','JK','KAR','KLSE','KO','KQ','PSE','SHE','SHG','TA','TO','TW','TWO','VN','XNAI','XNSA']);
const LEADERBOARD_REGIONS = Object.freeze(['ALL', 'US', 'EU', 'ASIA']);
const LEADERBOARD_ASSET_CLASSES = Object.freeze(['ALL', 'STOCK', 'ETF', 'INDEX']);
const LEADERBOARD_TOP = Math.max(1, Number(process.env.RV_HISTORICAL_RESEARCH_LEADERBOARD_TOP || '20'));

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  fs.renameSync(tmp, filePath);
}

function cleanNum(value, digits = 6) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function sqlString(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function runDuckJson(sql) {
  const bin = process.env.DUCKDB_BIN || 'duckdb';
  const out = execFileSync(bin, ['-json', '-c', sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });
  return JSON.parse(out || '[]');
}

function parquetColumns(filePath) {
  const rows = runDuckJson(`DESCRIBE SELECT * FROM read_parquet(${sqlString(filePath)}) LIMIT 1;`);
  return new Set(rows.map((row) => String(row.column_name || '').trim()).filter(Boolean));
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function daysOld(dateValue) {
  const date = String(dateValue || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Infinity;
  const [year, month, day] = date.split('-').map(Number);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const barUtc = Date.UTC(year, month - 1, day);
  return Math.floor((todayUtc - barUtc) / 86400000);
}

function regionFromAssetId(assetId) {
  const ex = String(assetId || '').split(':')[0].toUpperCase();
  if (ex === 'US') return 'US';
  if (EU_EXCHANGES.has(ex)) return 'EU';
  if (ASIA_EXCHANGES.has(ex)) return 'ASIA';
  return 'OTHER';
}

function normalizeAssetClass(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'ETF') return 'ETF';
  if (raw === 'INDEX') return 'INDEX';
  return 'STOCK';
}

function scoreRule(rule) {
  const n = Number(rule.sample_size ?? rule.n ?? 0);
  const wl = Number(rule.wilson_low ?? Math.max(0, Number(rule.win_rate ?? 0) - 0.05));
  const wr = Number(rule.win_rate ?? 0);
  const avg = Number(rule.avg_signed_return ?? rule.avg_return ?? 0);
  const ev = Number(rule.evidence_score ?? 0);
  const avgScore = Math.max(0, Math.min(1, avg / 0.1));
  return cleanNum(100 * ((0.45 * wl) + (0.20 * wr) + (0.15 * Math.min(n, 500) / 500) + (0.10 * avgScore) + (0.10 * ev / 100)), 4);
}

function includeRule(rule) {
  const n = Number(rule.sample_size ?? rule.n ?? 0);
  const wl = Number(rule.wilson_low ?? Math.max(0, Number(rule.win_rate ?? 0) - 0.05));
  const avg = Number(rule.avg_signed_return ?? rule.avg_return ?? 0);
  return n >= 30 && wl >= 0.50 && avg > 0;
}

function rankProbability(rule) {
  const wl = Number(rule.wilson_low ?? Math.max(0, Number(rule.win_rate ?? 0) - 0.05));
  return cleanNum(wl);
}

function expectedGainPct(rule) {
  const avg = Number(rule.avg_signed_return ?? rule.avg_return ?? 0);
  return Number.isFinite(avg) ? cleanNum(avg * 100, 2) : null;
}

function sortHistoricalRows(rows) {
  return [...rows].sort((a, b) => {
    if (Number(b.rank_probability || 0) !== Number(a.rank_probability || 0)) {
      return Number(b.rank_probability || 0) - Number(a.rank_probability || 0);
    }
    if (Number(b.expected_gain_pct || 0) !== Number(a.expected_gain_pct || 0)) {
      return Number(b.expected_gain_pct || 0) - Number(a.expected_gain_pct || 0);
    }
    if (Number(b.n || 0) !== Number(a.n || 0)) return Number(b.n || 0) - Number(a.n || 0);
    if (Number(b.rank_score || 0) !== Number(a.rank_score || 0)) return Number(b.rank_score || 0) - Number(a.rank_score || 0);
    return String(a.ticker || '').localeCompare(String(b.ticker || ''));
  });
}

function routeFor(assetId, ticker) {
  return `/analyze/${encodeURIComponent(assetId || ticker || '').replace(/%3A/gi, ':')}`;
}

function labelForPattern(patternId) {
  return String(patternId || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function activePageCoreAssets() {
  const latest = readJson(PAGE_CORE_LATEST);
  const snapshotPath = String(latest?.snapshot_path || '').replace(/^\/+/, '');
  if (!snapshotPath) return null;
  const root = path.join(REPO_ROOT, 'public', snapshotPath.replace(/^data\//, 'data/'));
  const pageDir = path.join(root, 'page-shards');
  if (!fs.existsSync(pageDir)) return null;
  const assets = new Map();
  for (let i = 0; i < Number(latest.page_shard_count || 1024); i += 1) {
    const filePath = path.join(pageDir, pageShardName(i, Number(latest.page_shard_count || 1024)));
    try {
      const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
      const rows = Array.isArray(doc?.rows) ? doc.rows : Array.isArray(doc) ? doc : [];
      for (const row of rows) {
        const id = String(row?.canonical_asset_id || row?.canonical_id || row?.asset_id || '').toUpperCase();
        if (!id) continue;
        assets.set(id, {
          asset_id: id,
          ticker: String(row?.ticker || row?.symbol || row?.display_ticker || id.split(':').pop() || '').toUpperCase(),
          exchange: String(row?.exchange || row?.identity?.exchange || id.split(':')[0] || '').toUpperCase(),
          asset_class: normalizeAssetClass(row?.identity?.asset_class || row?.meta?.asset_type || row?.asset_class),
          history_pack: row?.history_pack || row?.historyPack || null,
        });
      }
    } catch {
      continue;
    }
  }
  return assets.size ? assets : null;
}

async function loadInsightRows(scopeIds) {
  const latest = readJson(path.join(INSIGHTS_ROOT, 'latest.json'));
  const rows = [];
  for (const rel of Object.values(latest?.shards || {})) {
    const shard = readJson(path.join(INSIGHTS_ROOT, rel));
    for (const row of Object.values(shard?.by_asset || {})) {
      const assetId = String(row?.asset_id || '').toUpperCase();
      if (!assetId) continue;
      if (scopeIds && !scopeIds.has(assetId)) continue;
      rows.push({ ...row, __shard_rel: rel });
    }
  }
  return { latest, rows };
}

function assetRowsFrom(scopeAssets, insightRows) {
  if (scopeAssets?.size) return [...scopeAssets.values()];
  return insightRows.map((row) => ({
    asset_id: String(row.asset_id || '').toUpperCase(),
    ticker: String(row.ticker || String(row.asset_id || '').split(':').pop() || '').toUpperCase(),
    exchange: String(row.exchange || String(row.asset_id || '').split(':')[0] || '').toUpperCase(),
    asset_class: normalizeAssetClass(row.asset_class || row.asset_type),
    history_pack: row.history_pack || null,
  })).filter((row) => row.asset_id && row.ticker);
}

function distinctPatternIdsFromStats(statsPath) {
  const rows = runDuckJson(`
    SELECT DISTINCT lower(pattern_id) AS pattern_id
    FROM read_parquet(${sqlString(statsPath)})
    WHERE pattern_id IS NOT NULL
    ORDER BY 1;
  `);
  return rows.map((row) => String(row.pattern_id || '').trim()).filter(Boolean);
}

async function findActivePatternPairs(assetRows, patternIds, telemetry) {
  const pairs = [];
  const seen = new Set();
  const barsByAsset = new Map();
  telemetry.rules_seen = assetRows.length * patternIds.length;
  for (const asset of assetRows) {
    const assetId = String(asset.asset_id || '').toUpperCase();
    const ticker = String(asset.ticker || assetId.split(':').pop() || '').toUpperCase();
    if (!assetId || !ticker) continue;
    let bars = [];
    try {
      bars = await loadLocalBars(ticker, {
        canonicalId: assetId,
        preferredCanonicalId: assetId,
        preferredHistoryPack: asset.history_pack || null,
        allowRemoteBarFetch: false,
      });
    } catch {
      bars = [];
    }
    if (!Array.isArray(bars) || bars.length < 60) {
      telemetry.bars_missing += 1;
      continue;
    }
    const latestBarDate = bars[bars.length - 1]?.date || null;
    if (daysOld(latestBarDate) > MAX_BAR_STALE_DAYS) {
      telemetry.bars_stale += 1;
      continue;
    }
    let assetHadActive = false;
    for (const patternId of patternIds) {
      if (!evaluateHistoricalPattern(patternId, bars)) continue;
      const key = `${assetId}|${patternId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ asset_id: assetId, pattern_id: patternId, latest_bar_date: latestBarDate });
      assetHadActive = true;
    }
    if (assetHadActive) telemetry.assets_with_active_patterns += 1;
    barsByAsset.set(assetId, { latest_bar_date: latestBarDate });
  }
  telemetry.patterns_active_raw = pairs.length;
  return { pairs, barsByAsset };
}

function queryPrivateStats(statsPath, activePairs) {
  if (!activePairs.length) return [];
  const cols = parquetColumns(statsPath);
  const expr = (name, fallbackSql) => cols.has(name) ? `r.${name}` : fallbackSql;
  const wilsonExpr = cols.has('wilson_low') ? 'COALESCE(r.wilson_low, GREATEST(0, r.win_rate - 0.05))' : 'GREATEST(0, r.win_rate - 0.05)';
  const signedReturnExpr = expr('avg_signed_return', 'r.avg_return');
  const tmpDir = path.join(REPO_ROOT, 'runtime/historical-setups');
  fs.mkdirSync(tmpDir, { recursive: true });
  const csvPath = path.join(tmpDir, `active-patterns-${process.pid}.csv`);
  fs.writeFileSync(csvPath, [
    'asset_id,pattern_id',
    ...activePairs.map((row) => `${csvCell(row.asset_id)},${csvCell(row.pattern_id)}`),
  ].join('\n') + '\n');
  try {
    return runDuckJson(`
      WITH active AS (
        SELECT upper(asset_id) AS asset_id, lower(pattern_id) AS pattern_id
        FROM read_csv_auto(${sqlString(csvPath)}, header=true)
      ),
      matched AS (
        SELECT
          upper(r.asset_id) AS asset_id,
          r.ticker,
          r.rule_id,
          lower(r.pattern_id) AS pattern_id,
          r.pattern_family,
          ${expr('direction', "'LONG'")} AS direction,
          r.target_horizon,
          r.n,
          r.win_rate,
          ${wilsonExpr} AS wilson_low,
          ${expr('wilson_high', 'NULL')} AS wilson_high,
          r.avg_return,
          ${signedReturnExpr} AS avg_signed_return,
          ${expr('raw_avg_return', 'r.avg_return')} AS raw_avg_return,
          r.edge_vs_baseline,
          r.evidence_score
        FROM read_parquet(${sqlString(statsPath)}) r
        INNER JOIN active a
          ON upper(r.asset_id) = a.asset_id
         AND lower(r.pattern_id) = a.pattern_id
        WHERE r.n >= 30
          AND ${wilsonExpr} >= 0.50
          AND ${signedReturnExpr} > 0
      )
      SELECT * FROM matched
      ORDER BY asset_id, pattern_id, direction, target_horizon;
    `);
  } finally {
    fs.rmSync(csvPath, { force: true });
  }
}

function activeKey(assetId, rule) {
  return [
    String(assetId || '').toUpperCase(),
    String(rule?.pattern_id || '').toLowerCase(),
    String(rule?.direction || 'LONG').toUpperCase(),
    String(rule?.target_horizon || rule?.horizon || ''),
  ].join('|');
}

function annotateInsightShards(activeKeys) {
  const latest = readJson(path.join(INSIGHTS_ROOT, 'latest.json'));
  for (const rel of Object.values(latest?.shards || {})) {
    const filePath = path.join(INSIGHTS_ROOT, rel);
    const shard = readJson(filePath);
    if (!shard?.by_asset) continue;
    for (const row of Object.values(shard.by_asset)) {
      const assetId = String(row?.asset_id || '').toUpperCase();
      if (!Array.isArray(row?.top_rules)) continue;
      row.top_rules = row.top_rules.map((rule) => ({
        ...rule,
        active_today: activeKeys.has(activeKey(assetId, rule)),
      }));
    }
    atomicWriteJson(filePath, shard);
  }
}

async function main() {
  const top = Math.max(1, Number(process.argv.find((arg) => arg.startsWith('--top='))?.split('=')[1] || '30'));
  setLocalBarsRuntimeOverrides({ allowRemoteBarFetch: false, localBarStaleDays: 3650 });
  const generatedAt = new Date().toISOString();
  const scopeAssets = await activePageCoreAssets();
  const scopeIds = scopeAssets?.size ? new Set(scopeAssets.keys()) : null;
  const { latest, rows } = await loadInsightRows(scopeIds);
  const best = new Map();
  const activeKeys = new Set();
  const telemetry = {
    assets_seen: scopeAssets?.size || rows.length,
    public_projection_assets_seen: rows.length,
    rules_seen: 0,
    rules_active: 0,
    assets_with_active_rules: 0,
    assets_with_active_patterns: 0,
    patterns_active_raw: 0,
    bars_missing: 0,
    bars_stale: 0,
    max_bar_stale_days: MAX_BAR_STALE_DAYS,
  };
  const assetRows = assetRowsFrom(scopeAssets, rows);
  const assetMeta = new Map(assetRows.map((row) => [String(row.asset_id || '').toUpperCase(), row]));
  let statsSource = 'public_projection';

  if (fs.existsSync(PRIVATE_STATS_PATH)) {
    try {
      const patternIds = distinctPatternIdsFromStats(PRIVATE_STATS_PATH);
      telemetry.pattern_catalog_size = patternIds.length;
      const { pairs, barsByAsset } = await findActivePatternPairs(assetRows, patternIds, telemetry);
      const privateRows = queryPrivateStats(PRIVATE_STATS_PATH, pairs);
      statsSource = 'private_last_good';
      const assetsWithRules = new Set();
      for (const row of privateRows) {
        const assetId = String(row.asset_id || '').toUpperCase();
        const meta = assetMeta.get(assetId) || {};
        const ticker = String(row.ticker || meta.ticker || assetId.split(':').pop() || '').toUpperCase();
        const direction = String(row.direction || 'LONG').toUpperCase() === 'SHORT' ? 'short' : 'long';
        const rule = {
          pattern_id: row.pattern_id,
          label: labelForPattern(row.pattern_id),
          pattern_family: row.pattern_family || null,
          direction: direction.toUpperCase(),
          target_horizon: row.target_horizon || null,
          sample_size: Number(row.n || 0),
          win_rate: cleanNum(row.win_rate),
          wilson_low: cleanNum(row.wilson_low),
          avg_signed_return: cleanNum(row.avg_signed_return ?? row.avg_return),
          evidence_score: Number(row.evidence_score || 0),
        };
        activeKeys.add(activeKey(assetId, rule));
        telemetry.rules_active += 1;
        assetsWithRules.add(assetId);
        const region = regionFromAssetId(assetId);
        if (!['US', 'EU', 'ASIA'].includes(region)) continue;
        const rankScore = scoreRule(rule);
        const key = `${region}:${direction}:${assetId}`;
        const candidate = {
          asset_id: assetId,
          ticker,
          exchange: meta.exchange || assetId.split(':')[0],
          region,
          direction: direction.toUpperCase(),
          pattern_id: rule.pattern_id,
          label: rule.label,
          family: rule.pattern_family,
          horizon: rule.target_horizon,
          win_rate: rule.win_rate,
          wilson_low: rule.wilson_low,
          n: rule.sample_size,
          sample_size: rule.sample_size,
          avg_signed_return: rule.avg_signed_return,
          evidence_score: rule.evidence_score,
          rank_score: rankScore,
          latest_bar_date: barsByAsset.get(assetId)?.latest_bar_date || null,
          asset_class: normalizeAssetClass(meta.asset_class),
          rank_probability: rankProbability(rule),
          expected_gain_pct: expectedGainPct(rule),
          route: routeFor(assetId, ticker),
          explanation: `${rule.label} is active today. Historical ${direction.toUpperCase()} edge at ${rule.target_horizon || 'tested horizon'}.`,
        };
        const prev = best.get(key);
        if (!prev || Number(candidate.rank_score) > Number(prev.rank_score)) best.set(key, candidate);
      }
      telemetry.assets_with_active_rules = assetsWithRules.size;
    } catch (error) {
      best.clear();
      activeKeys.clear();
      telemetry.private_stats_error = String(error?.message || error).slice(0, 240);
      statsSource = 'public_projection';
    }
  }

  if (statsSource === 'public_projection') {
    telemetry.rules_seen = 0;
    telemetry.rules_active = 0;
    telemetry.assets_with_active_rules = 0;
    telemetry.assets_with_active_patterns = 0;
    telemetry.patterns_active_raw = 0;
    telemetry.bars_missing = 0;
    telemetry.bars_stale = 0;
    for (const row of rows) {
      const assetId = String(row.asset_id || '').toUpperCase();
      const ticker = String(row.ticker || assetId.split(':').pop() || '').toUpperCase();
      const rules = Array.isArray(row.top_rules) ? row.top_rules : [];
      if (!rules.length) continue;
      let bars = [];
      try {
        bars = await loadLocalBars(ticker, { canonicalId: assetId, preferredCanonicalId: assetId, allowRemoteBarFetch: false });
      } catch {
        bars = [];
      }
      if (!Array.isArray(bars) || bars.length < 60) {
        telemetry.bars_missing += 1;
        continue;
      }
      const latestBarDate = bars[bars.length - 1]?.date || null;
      if (daysOld(latestBarDate) > MAX_BAR_STALE_DAYS) {
        telemetry.bars_stale += 1;
        continue;
      }
      let assetHadActive = false;
      for (const rule of rules) {
        telemetry.rules_seen += 1;
        const direction = String(rule.direction || 'LONG').toUpperCase() === 'SHORT' ? 'short' : 'long';
        if (!evaluateHistoricalPattern(rule.pattern_id, bars)) continue;
        telemetry.patterns_active_raw += 1;
        activeKeys.add(activeKey(assetId, rule));
        if (!includeRule(rule)) continue;
        telemetry.rules_active += 1;
        assetHadActive = true;
        const region = regionFromAssetId(assetId);
        if (!['US', 'EU', 'ASIA'].includes(region)) continue;
        const rankScore = scoreRule(rule);
        const key = `${region}:${direction}:${assetId}`;
        const candidate = {
          asset_id: assetId,
          ticker,
          exchange: row.exchange || assetId.split(':')[0],
          region,
          direction: direction.toUpperCase(),
          pattern_id: rule.pattern_id,
          label: rule.label || rule.pattern_id,
          family: rule.pattern_family || null,
          horizon: rule.target_horizon || null,
          win_rate: cleanNum(rule.win_rate),
          wilson_low: cleanNum(rule.wilson_low),
          n: Number(rule.sample_size ?? rule.n ?? 0),
          sample_size: Number(rule.sample_size ?? rule.n ?? 0),
          avg_signed_return: cleanNum(rule.avg_signed_return ?? rule.avg_return),
          evidence_score: Number(rule.evidence_score || 0),
          rank_score: rankScore,
          latest_bar_date: latestBarDate,
          asset_class: normalizeAssetClass(row.asset_class || row.asset_type),
          rank_probability: rankProbability(rule),
          expected_gain_pct: expectedGainPct(rule),
          route: routeFor(assetId, ticker),
          explanation: `${rule.label || rule.pattern_id} is active today. Historical ${direction.toUpperCase()} edge at ${rule.target_horizon || 'tested horizon'}.`,
        };
        const prev = best.get(key);
        if (!prev || Number(candidate.rank_score) > Number(prev.rank_score)) best.set(key, candidate);
      }
      if (assetHadActive) {
        telemetry.assets_with_active_rules += 1;
        telemetry.assets_with_active_patterns += 1;
      }
    }
  }

  const regions = {};
  for (const region of ['US', 'EU', 'ASIA']) {
    regions[region] = { long: [], short: [] };
    for (const side of ['long', 'short']) {
      regions[region][side] = sortHistoricalRows([...best.values()]
        .filter((row) => row.region === region && row.direction.toLowerCase() === side)
      )
        .slice(0, top);
    }
  }

  const leaderboards = {};
  for (const region of LEADERBOARD_REGIONS) {
    leaderboards[region] = {};
    for (const assetClass of LEADERBOARD_ASSET_CLASSES) {
      leaderboards[region][assetClass] = { long: [], short: [] };
      for (const side of ['long', 'short']) {
        leaderboards[region][assetClass][side] = sortHistoricalRows([...best.values()]
          .filter((row) => (region === 'ALL' || row.region === region)
            && (assetClass === 'ALL' || normalizeAssetClass(row.asset_class) === assetClass)
            && row.direction.toLowerCase() === side)
        ).slice(0, LEADERBOARD_TOP);
      }
    }
  }

  atomicWriteJson(OUT_PATH, {
    schema: 'rv.historical_setups_today.v1',
    generated_at: generatedAt,
    source: {
      historical_insights_generated_at: latest?.generated_at || null,
      page_core_scope_limited: Boolean(scopeIds),
      stats_source: statsSource,
    },
    thresholds: { min_n: 30, min_wilson_low: 0.50, require_positive_avg_signed_return: true, top, leaderboard_top: LEADERBOARD_TOP },
    telemetry,
    regions,
    leaderboards,
  });
  annotateInsightShards(activeKeys);
  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  console.log(`[historical-setups] wrote ${path.relative(REPO_ROOT, OUT_PATH)} assets=${rows.length} active_rules=${telemetry.rules_active}`);
}

main().catch((error) => {
  console.error(`[historical-setups] failed: ${error?.stack || error?.message || String(error)}`);
  process.exit(1);
});
