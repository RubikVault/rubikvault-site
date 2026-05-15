#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { computeIndicators } from '../../functions/api/_shared/eod-indicators.mjs';
import { pageCoreStrictOperationalReasons } from '../../functions/api/_shared/page-core-operational-contract.js';
import { annotateFundamentalsForScope } from '../../functions/api/_shared/fundamentals-scope.mjs';
import { normalizeReturnDecimal } from '../../functions/api/_shared/return-units.js';
import {
  assessMarketDataConsistency,
  buildMarketPricesFromBar,
  buildMarketStatsFromIndicators,
} from '../../public/js/stock-ssot.js';
import {
  ALIAS_SHARD_COUNT,
  PAGE_CORE_HARD_BYTES,
  PAGE_CORE_SCHEMA,
  PAGE_CORE_TARGET_BYTES,
  PAGE_SHARD_COUNT,
  aliasShardIndex,
  aliasShardName,
  buildPageCoreSnapshotId,
  normalizeIsoDate,
  normalizePageCoreAlias,
  pageShardIndex,
  pageShardName,
  sha256Prefix,
  stableStringify,
} from '../lib/page-core-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DEFAULT_PAGE_CORE_ROOT = path.join(ROOT, 'public/data/page-core');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const SYMBOL_LOOKUP_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.lookup.json');
const SEARCH_EXACT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const GLOBAL_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DAILY_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json');
const COMPAT_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const SCOPE_ROWS_PATH = path.join(ROOT, 'mirrors/universe-v7/ssot/assets.global.rows.json');
const OPERABILITY_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json');
const OPERABILITY_FULL_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-latest.json');
const DECISIONS_LATEST_PATH = path.join(ROOT, 'public/data/decisions/latest.json');
const DECISION_CORE_ROOT = path.join(ROOT, 'public/data/decision-core');
const FUNDAMENTALS_SCOPE_PATH = path.join(ROOT, 'public/data/fundamentals/_scope.json');
const FORECAST_LATEST_PATH = path.join(ROOT, 'public/data/forecast/latest.json');
const HIST_PROBS_PUBLIC_ROOT = path.join(ROOT, 'public/data/hist-probs-public');
const SCIENTIFIC_PER_ASSET_LATEST_PATH = path.join(ROOT, 'public/data/supermodules/scientific-per-asset/latest.json');
const QUANTLAB_MODEL_COVERAGE_LATEST_PATH = path.join(ROOT, 'public/data/quantlab/model-coverage/latest.json');
const PROVIDER_EXCEPTIONS_LATEST_PATH = path.join(ROOT, 'public/data/runtime/stock-analyzer-provider-exceptions-latest.json');
const BREAKOUT_LATEST_MANIFEST_PATHS = [
  path.join(ROOT, 'public/data/breakout/manifests/latest.json'),
  path.join(ROOT, 'public/data/breakout/status.json'),
];
const BREAKOUT_PUBLIC_ROOT = path.join(ROOT, 'public/data/breakout');
const PAGE_CORE_SCHEMA_PATH = path.join(ROOT, 'schemas/stock-analyzer/page-core.v1.schema.json');
const HISTORY_MANIFEST_CANDIDATES = [
  process.env.RV_PAGE_CORE_HISTORY_MANIFEST_PATH,
  process.env.RV_GLOBAL_MANIFEST_DIR ? path.join(process.env.RV_GLOBAL_MANIFEST_DIR, 'pack-manifest.global.json') : null,
  path.join(ROOT, 'public/data/eod/history/pack-manifest.global.json'),
  path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.json'),
].filter(Boolean);
const HISTORY_LOOKUP_CANDIDATES = [
  process.env.RV_PAGE_CORE_HISTORY_LOOKUP_PATH,
  process.env.RV_GLOBAL_MANIFEST_DIR ? path.join(process.env.RV_GLOBAL_MANIFEST_DIR, 'pack-manifest.global.lookup.json') : null,
  path.join(ROOT, 'public/data/eod/history/pack-manifest.global.lookup.json'),
  path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.lookup.json'),
].filter(Boolean);
const HISTORY_PACK_ROOTS = [
  process.env.RV_HISTORY_PACK_ROOT,
  path.join(ROOT, 'public/data/eod/history/packs'),
  path.join(ROOT, 'mirrors/universe-v7/history'),
].filter(Boolean);
const HISTORY_INDICATOR_BARS = Number(process.env.RV_PAGE_CORE_INDICATOR_BARS || 320);
const HISTORY_PACK_CACHE_LIMIT = Math.max(0, Number(process.env.RV_PAGE_CORE_PACK_CACHE_LIMIT || 24));
const PROTECTED_ALIASES = new Map([
  ['AAPL', 'US:AAPL'],
  ['MSFT', 'US:MSFT'],
  ['F', 'US:F'],
  ['V', 'US:V'],
  ['TSLA', 'US:TSLA'],
  ['SPY', 'US:SPY'],
  ['QQQ', 'US:QQQ'],
  ['BRK-B', 'US:BRK-B'],
  ['BRK.B', 'US:BRK-B'],
  ['BF-B', 'US:BF-B'],
  ['BF.B', 'US:BF-B'],
]);
const ALIAS_SHARD_MAX_BYTES = 512 * 1024;
const PAGE_SHARD_MAX_BYTES = 1024 * 1024;
const OPERATIONAL_ASSET_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);
const MARKET_STATS_FIELDS = [
  'rsi14',
  'sma20',
  'sma50',
  'sma200',
  'atr14',
  'volatility_20d',
  'volatility_percentile',
  'bb_upper',
  'bb_lower',
  'high_52w',
  'low_52w',
  'range_52w_pct',
];
const historyJsonCache = new Map();
const historyPackCache = new Map();
const historyShardCache = new Map();

function parseArgs(argv) {
  const get = (name) => {
    const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
    if (inline) return inline.split('=').slice(1).join('=');
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] || null : null;
  };
  return {
    targetMarketDate: normalizeIsoDate(get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || new Date().toISOString().slice(0, 10)),
    runId: get('run-id') || process.env.RV_RUN_ID || process.env.RUN_ID || `page-core-${new Date().toISOString().replace(/[:.]/g, '')}`,
    manifestSeed: get('manifest-seed') || process.env.RV_MANIFEST_SEED || '',
    pageCoreRoot: path.resolve(ROOT, get('page-core-root') || DEFAULT_PAGE_CORE_ROOT),
    replace: argv.includes('--replace'),
    promote: argv.includes('--promote'),
    dryRun: argv.includes('--dry-run'),
    incremental: argv.includes('--incremental') || process.env.RV_PAGE_CORE_INCREMENTAL === '1',
    historyTouchReport: path.resolve(ROOT, get('history-touch-report') || process.env.RV_HISTORY_TOUCH_REPORT_PATH || 'mirrors/universe-v7/reports/history_touch_report.json'),
    maxAssets: Number.isFinite(Number(get('max-assets'))) ? Number(get('max-assets')) : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function readGzipText(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
}

function readGzipJson(filePath) {
  return JSON.parse(readGzipText(filePath));
}

function loadHistoryTouchIds(filePath) {
  const report = readJsonMaybe(filePath);
  const ids = new Set();
  if (!report) return { report, ids };
  if (Array.isArray(report.entries)) {
    for (const row of report.entries) {
      const canonical = normalizePageCoreAlias(row?.canonical_id);
      if (canonical) ids.add(canonical);
    }
  }
  if (Array.isArray(report.packs)) {
    for (const row of report.packs) {
      const rawTouched = row?.touched_assets;
      const values = Array.isArray(rawTouched)
        ? rawTouched
        : rawTouched && typeof rawTouched === 'object'
          ? Object.values(rawTouched).flat()
          : [];
      for (const value of values) {
        const canonical = normalizePageCoreAlias(value);
        if (canonical) ids.add(canonical);
      }
    }
  }
  return { report, ids };
}

function readPreviousPageCoreRows(pageCoreRoot) {
  const pointer = readJsonMaybe(path.join(pageCoreRoot, 'latest.json')) || readJsonMaybe(path.join(pageCoreRoot, 'candidates/latest.candidate.json'));
  const snapshotPath = pointer?.snapshot_path ? path.join(pageCoreRoot, pointer.snapshot_path.replace(/^\/?data\/page-core\/?/, '')) : null;
  const pageDir = snapshotPath ? path.join(snapshotPath, 'page-shards') : null;
  const rows = new Map();
  if (!pageDir || !fs.existsSync(pageDir)) return { pointer, rows };
  for (const name of fs.readdirSync(pageDir)) {
    if (!name.endsWith('.json.gz')) continue;
    const shard = readGzipJson(path.join(pageDir, name));
    for (const [canonical, row] of Object.entries(shard || {})) {
      const id = normalizePageCoreAlias(canonical);
      if (id) rows.set(id, row);
    }
  }
  return { pointer, rows };
}

function readScopeIds() {
  const scopePath = fs.existsSync(GLOBAL_SCOPE_PATH)
    ? GLOBAL_SCOPE_PATH
    : fs.existsSync(DAILY_SCOPE_PATH)
      ? DAILY_SCOPE_PATH
      : COMPAT_SCOPE_PATH;
  const doc = readJsonMaybe(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((id) => normalizePageCoreAlias(id)).filter(Boolean));
}

function readOperabilityIds() {
  const doc = readJsonMaybe(OPERABILITY_FULL_PATH) || readJsonMaybe(OPERABILITY_PATH);
  const records = Array.isArray(doc?.records) ? doc.records : [];
  return new Set(records.map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
}

function readRegistryRows() {
  const byId = new Map();
  const addRow = (row) => {
    const id = normalizePageCoreAlias(row?.canonical_id);
    const assetClass = normalizePageCoreAlias(row?.type_norm || row?.asset_class || row?.type);
    if (!id || !['STOCK', 'ETF', 'INDEX'].includes(assetClass)) return;
    const current = byId.get(id) || {};
    byId.set(id, {
      ...current,
      ...row,
      pointers: {
        ...(current.pointers || {}),
        ...(row.pointers || {}),
        history_pack: row?.pointers?.history_pack || row?.history_pack || current?.pointers?.history_pack || current?.history_pack || null,
      },
      history_pack: row?.history_pack || row?.pointers?.history_pack || current?.history_pack || current?.pointers?.history_pack || null,
    });
  };
  if (fs.existsSync(REGISTRY_PATH)) {
    const text = readGzipText(REGISTRY_PATH);
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        addRow(JSON.parse(line));
      } catch {
        // Skip malformed registry rows; bundle validation catches missing protected IDs.
      }
    }
  }
  const scopeRowsDoc = readJsonMaybe(SCOPE_ROWS_PATH);
  const scopeRows = Array.isArray(scopeRowsDoc?.items) ? scopeRowsDoc.items : [];
  for (const row of scopeRows) addRow(row);
  return [...byId.values()];
}

function readSearchExact() {
  if (!fs.existsSync(SEARCH_EXACT_PATH)) return { bySymbol: {}, canonicalIds: new Set() };
  const text = readGzipText(SEARCH_EXACT_PATH);
  try {
    const doc = JSON.parse(text);
    const bySymbol = doc?.by_symbol && typeof doc.by_symbol === 'object' ? doc.by_symbol : {};
    const canonicalIds = new Set(Object.values(bySymbol).map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
    return { bySymbol, canonicalIds };
  } catch {
    const bySymbol = {};
    const canonicalIds = new Set();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const alias = normalizePageCoreAlias(row?.symbol || row?.ticker || row?.key);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (alias && canonical) bySymbol[alias] = row;
        if (canonical) canonicalIds.add(canonical);
      } catch {
        // Best effort only.
      }
    }
    return { bySymbol, canonicalIds };
  }
}

function readSymbolLookup() {
  const doc = readJsonMaybe(SYMBOL_LOOKUP_PATH);
  return doc?.exact && typeof doc.exact === 'object' ? doc.exact : {};
}

function maybeCanonicalFromLookup(value) {
  if (Array.isArray(value)) return normalizePageCoreAlias(value[4]);
  if (value && typeof value === 'object') {
    return normalizePageCoreAlias(value.canonical_id || value.canonicalId);
  }
  if (typeof value === 'string') return normalizePageCoreAlias(value);
  return '';
}

function readDecisionCoreRows(source = process.env.RV_DECISION_CORE_SOURCE || 'core') {
  const normalizedSource = String(source || 'legacy').toLowerCase();
  if (!['core', 'shadow'].includes(normalizedSource)) return null;
  const root = path.join(DECISION_CORE_ROOT, normalizedSource);
  const manifest = readJsonMaybe(path.join(root, 'manifest.json'));
  const partsDir = path.join(root, 'parts');
  const out = new Map();
  if (!manifest || !fs.existsSync(partsDir)) return out;
  for (const name of fs.readdirSync(partsDir)) {
    if (!/^part-\d{3}\.ndjson\.gz$/.test(name)) continue;
    const text = readGzipText(path.join(partsDir, name));
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.meta?.asset_id);
        if (!canonical) continue;
        const action = String(row?.decision?.primary_action || 'UNAVAILABLE').toUpperCase();
        const blocking = [
          ...(Array.isArray(row?.eligibility?.vetos) ? row.eligibility.vetos : []),
          row?.decision?.main_blocker,
        ].filter(Boolean);
        out.set(canonical, {
          canonical_id: canonical,
          schema: 'rv.decision_core_public_bridge.v1',
          source: 'decision-core',
          pipeline_status: ['BUY', 'WAIT', 'AVOID'].includes(action) ? 'OK' : 'DEGRADED',
          verdict: action,
          confidence: row?.decision?.analysis_reliability || 'LOW',
          confidence_bucket: String(row?.decision?.analysis_reliability || 'LOW').toLowerCase(),
          wait_subtype: row?.decision?.wait_subtype || null,
          primary_setup: row?.decision?.primary_setup || 'none',
          evaluation_role: row?.meta?.asset_type === 'INDEX' ? 'macro' : 'tradable',
          blocking_reasons: blocking,
          warnings: Array.isArray(row?.eligibility?.warnings) ? row.eligibility.warnings : [],
          risk_assessment: {
            level: row?.evidence_summary?.tail_risk_bucket === 'HIGH' ? 'HIGH' : row?.evidence_summary?.tail_risk_bucket === 'UNKNOWN' ? 'UNKNOWN' : 'MODERATE',
            source: 'decision-core-tail-risk-bucket',
            score: null,
          },
          decision_core_min: compactDecisionCoreForPageCore(row),
        });
      } catch {
        // Keep page-core tolerant; decision core validation fails separately.
      }
    }
  }
  return out;
}

function compactDecisionCoreForPageCore(row) {
  if (!row || typeof row !== 'object') return null;
  const horizons = {};
  for (const key of ['short_term', 'mid_term', 'long_term']) {
    const horizon = row?.horizons?.[key];
    horizons[key] = horizon ? {
      horizon_action: horizon.horizon_action || null,
      horizon_reliability: horizon.horizon_reliability || null,
      horizon_setup: horizon.horizon_setup || null,
      horizon_blockers: Array.isArray(horizon.horizon_blockers) ? horizon.horizon_blockers.slice(0, 3) : [],
    } : null;
  }
  return {
    meta: {
      decision_id: row?.meta?.decision_id || null,
      asset_id: row?.meta?.asset_id || null,
      asset_type: row?.meta?.asset_type || null,
      as_of_date: row?.meta?.as_of_date || null,
      target_market_date: row?.meta?.target_market_date || null,
      policy_bundle_version: row?.meta?.policy_bundle_version || null,
      model_version: row?.meta?.model_version || null,
    },
    eligibility: {
      eligibility_status: row?.eligibility?.eligibility_status || null,
      decision_grade: row?.eligibility?.decision_grade === true,
      vetos: Array.isArray(row?.eligibility?.vetos) ? row.eligibility.vetos.slice(0, 5) : [],
      warnings: Array.isArray(row?.eligibility?.warnings) ? row.eligibility.warnings.slice(0, 5) : [],
    },
    decision: {
      primary_action: row?.decision?.primary_action || null,
      wait_subtype: row?.decision?.wait_subtype || null,
      bias: row?.decision?.bias || null,
      analysis_reliability: row?.decision?.analysis_reliability || null,
      primary_setup: row?.decision?.primary_setup || null,
      main_blocker: row?.decision?.main_blocker || null,
      next_trigger: row?.decision?.next_trigger || null,
      reason_codes: Array.isArray(row?.decision?.reason_codes) ? row.decision.reason_codes.slice(0, 5) : [],
    },
    evidence_summary: {
      evidence_raw_n: row?.evidence_summary?.evidence_raw_n ?? null,
      evidence_effective_n: row?.evidence_summary?.evidence_effective_n ?? null,
      evidence_scope: row?.evidence_summary?.evidence_scope || null,
      ev_proxy_bucket: row?.evidence_summary?.ev_proxy_bucket || null,
      tail_risk_bucket: row?.evidence_summary?.tail_risk_bucket || null,
    },
    trade_guard: {
      entry_policy: row?.trade_guard?.entry_policy || null,
      max_entry_price: row?.trade_guard?.max_entry_price ?? null,
      gap_tolerance_pct: row?.trade_guard?.gap_tolerance_pct ?? null,
      cancel_if_open_above: row?.trade_guard?.cancel_if_open_above ?? null,
      entry_valid_until: row?.trade_guard?.entry_valid_until || null,
      invalidation_level: row?.trade_guard?.invalidation_level ?? null,
      invalidation_reason: row?.trade_guard?.invalidation_reason || null,
      setup_failed_if: row?.trade_guard?.setup_failed_if || null,
    },
    evaluation: {
      evaluation_horizon_days: row?.evaluation?.evaluation_horizon_days ?? null,
      evaluation_policy: row?.evaluation?.evaluation_policy || null,
    },
    rank_summary: {
      rank_percentile: row?.rank_summary?.rank_percentile ?? null,
      rank_scope: row?.rank_summary?.rank_scope || null,
    },
    horizons,
    ui: {
      severity: row?.ui?.severity || null,
      show_override_banner: row?.ui?.show_override_banner === true,
      disclaimer_policy_version: row?.ui?.disclaimer_policy_version || null,
    },
  };
}

function readDecisionRows() {
  const decisionCoreRows = readDecisionCoreRows();
  if (decisionCoreRows) return decisionCoreRows;
  const latest = readJsonMaybe(DECISIONS_LATEST_PATH);
  const snapshotPath = latest?.snapshot_path ? path.join(ROOT, 'public', latest.snapshot_path.replace(/^\/+/, '')) : null;
  const out = new Map();
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return out;
  for (const name of fs.readdirSync(snapshotPath)) {
    if (!/^part-\d{3}\.ndjson\.gz$/.test(name)) continue;
    const text = readGzipText(path.join(snapshotPath, name));
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (canonical) out.set(canonical, row);
      } catch {
        // Keep bundle build tolerant; decision data is enrichment.
      }
    }
  }
  return out;
}

function readForecastSymbols() {
  const doc = readJsonMaybe(FORECAST_LATEST_PATH);
  const rows = Array.isArray(doc?.data?.forecasts) ? doc.data.forecasts : [];
  return new Set(rows.map((row) => normalizePageCoreAlias(row?.symbol || row?.ticker)).filter(Boolean));
}

function readBreakoutKeys() {
  const keys = new Map();
  const variantsFor = (raw) => {
    const value = normalizePageCoreAlias(raw);
    if (!value) return [];
    const variants = new Set([value]);
    const dot = value.match(/^([A-Z0-9_-]+)\.([A-Z0-9_-]{2,8})$/);
    if (dot) variants.add(`${dot[2]}:${dot[1]}`);
    const colon = value.match(/^([A-Z0-9_-]{2,8}):([A-Z0-9_.-]+)$/);
    if (colon) variants.add(`${colon[2]}.${colon[1]}`);
    return Array.from(variants).map((item) => normalizePageCoreAlias(item)).filter(Boolean);
  };
  for (const filePath of BREAKOUT_LATEST_MANIFEST_PATHS) {
    const doc = readJsonMaybe(filePath);
    if (!doc?.files) continue;
    // Prefer all_scored (full scope coverage) so non-top500 assets like AAPL/TSLA
    // also get breakout_summary populated in page-core rows. Fall back to top500
    // for older manifests / legacy runs that only emit top500.
    const sources = [];
    if (doc.files.all_scored) sources.push(doc.files.all_scored);
    if (doc.files.top500) sources.push(doc.files.top500);
    for (const rel of sources) {
      const source = readJsonMaybe(path.join(BREAKOUT_PUBLIC_ROOT, rel));
      const items = Array.isArray(source?.items) ? source.items : [];
      for (const item of items) {
        for (const raw of [item.asset_id, item.assetId, item.canonical_id, item.display_ticker, item.symbol, item.ticker]) {
          for (const key of variantsFor(raw)) {
            if (!keys.has(key)) keys.set(key, item);
          }
        }
      }
    }
  }
  return keys;
}

function createHistProfileReader() {
  const latest = readJsonMaybe(path.join(HIST_PROBS_PUBLIC_ROOT, 'latest.json'));
  const shardCount = Number(latest?.shard_count || 0);
  if (!latest || !Number.isInteger(shardCount) || shardCount <= 0) {
    return { available: false, status: 'projection_missing', get: () => null };
  }
  const embed = process.env.RV_PAGE_CORE_EMBED_HIST_PROFILE_SUMMARY === '1';
  const cache = new Map();
  const publicShardIndex = (key) => {
    const hash = crypto.createHash('sha256').update(String(key || '').toUpperCase()).digest();
    return hash.readUInt32BE(0) % shardCount;
  };
  const readShard = (key) => {
    const shard = publicShardIndex(key);
    if (cache.has(shard)) return cache.get(shard);
    const filePath = path.join(HIST_PROBS_PUBLIC_ROOT, latest.shards_path || 'shards', `${String(shard).padStart(3, '0')}.json`);
    const doc = readJsonMaybe(filePath) || {};
    cache.set(shard, doc);
    return doc;
  };
  return {
    available: true,
    embed,
    latest,
    get(canonicalId, displayTicker) {
      for (const key of [canonicalId, displayTicker]) {
        const normalized = normalizePageCoreAlias(key);
        if (!normalized) continue;
        const profile = readShard(normalized)?.[normalized] || null;
        if (profile?.events && Object.keys(profile.events).length > 0) return profile;
      }
      return null;
    },
  };
}

function compactPageCoreHorizon(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['n', 'win_rate', 'avg_return']) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) out[key] = Number(number.toFixed(key === 'n' ? 0 : 6));
  }
  return Object.keys(out).length ? out : null;
}

function histProfileEventScore(event) {
  if (!event || typeof event !== 'object') return 0;
  return Number(event.h20d?.n || 0) * 4
    + Number(event.h60d?.n || 0) * 2
    + Number(event.h5d?.n || 0)
    + Number(event.h120d?.n || 0);
}

function compactPageCoreHistProfile(profile, display) {
  if (!profile?.events || typeof profile.events !== 'object') return null;
  const events = {};
  const selected = Object.entries(profile.events)
    .filter(([, value]) => value && typeof value === 'object')
    .sort((left, right) => histProfileEventScore(right[1]) - histProfileEventScore(left[1]))
    .slice(0, 3);
  for (const [eventName, eventValue] of selected) {
    const compact = {};
    for (const horizon of ['h5d', 'h20d', 'h60d', 'h120d']) {
      const horizonValue = compactPageCoreHorizon(eventValue[horizon]);
      if (horizonValue) compact[horizon] = horizonValue;
    }
    if (Object.keys(compact).length) events[eventName] = compact;
  }
  if (!Object.keys(events).length) return null;
  return {
    ticker: profile.ticker || display,
    latest_date: profile.latest_date || null,
    bars_count: profile.bars_count ?? null,
    event_count: Object.keys(profile.events || {}).length,
    events,
    source: profile.source || 'hist_probs_public_projection',
  };
}

function normalizeTypedStatus(value, fallback = 'not_generated') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
}

function fundamentalsStatusFor({ display, name, assetClass, scopeDoc, targetMarketDate }) {
  const annotated = annotateFundamentalsForScope({
    ticker: display,
    universe: { name, asset_class: assetClass },
    fundamentals: null,
    scopeDoc,
    targetMarketDate,
    assetClass,
  });
  const status = normalizeTypedStatus(annotated.scope_status || annotated.typed_status);
  return status === 'ready' ? 'available' : status;
}

function forecastStatusFor({ display, assetClass, forecastSymbols }) {
  if (assetClass !== 'STOCK') return 'not_applicable';
  return forecastSymbols?.has(normalizePageCoreAlias(display)) ? 'available' : 'not_generated';
}

function breakoutStatusFor({ canonicalId, display, barsCount, breakoutKeys }) {
  if (breakoutKeys?.has(normalizePageCoreAlias(canonicalId)) || breakoutKeys?.has(normalizePageCoreAlias(display))) return 'available';
  return Number(barsCount || 0) < 200 ? 'insufficient_history' : 'not_generated';
}

function breakoutItemFor({ canonicalId, display, breakoutKeys }) {
  return breakoutKeys?.get(normalizePageCoreAlias(canonicalId)) || breakoutKeys?.get(normalizePageCoreAlias(display)) || null;
}

function createModelProjectionReader(latestPath) {
  const latest = readJsonMaybe(latestPath);
  if (!latest || !Array.isArray(latest.shard_files)) {
    return {
      available: false,
      latest: latest || null,
      get: () => null,
    };
  }
  const byAsset = new Map();
  const root = path.dirname(latestPath);
  for (const rel of latest.shard_files) {
    const filePath = path.join(root, String(rel || ''));
    const doc = readJsonCached(filePath);
    const entries = doc?.by_asset && typeof doc.by_asset === 'object' ? Object.entries(doc.by_asset) : [];
    for (const [canonical, row] of entries) {
      const id = normalizePageCoreAlias(canonical || row?.canonical_id);
      if (id) byAsset.set(id, row);
    }
  }
  return {
    available: byAsset.size > 0,
    latest,
    get: (canonicalId) => byAsset.get(normalizePageCoreAlias(canonicalId)) || null,
  };
}

function readProviderExceptions(filePath = PROVIDER_EXCEPTIONS_LATEST_PATH) {
  const doc = readJsonMaybe(filePath);
  const rows = Array.isArray(doc?.exceptions) ? doc.exceptions : [];
  const byAsset = new Map();
  for (const row of rows) {
    const id = normalizePageCoreAlias(row?.canonical_id);
    if (!id) continue;
    byAsset.set(id, {
      canonical_id: id,
      reason: String(row?.reason || 'provider_exception'),
      target_market_date: normalizeIsoDate(row?.target_market_date) || doc?.target_market_date || null,
      last_trade_date: normalizeIsoDate(row?.last_trade_date) || null,
      bars_count: numberOrNull(row?.bars_count),
      evidence: row?.evidence ? String(row.evidence) : null,
    });
  }
  return byAsset;
}

function providerExceptionBlocker(exception) {
  const reason = String(exception?.reason || '').toLowerCase();
  if (!reason) return null;
  if (reason.includes('insufficient_history')) return 'insufficient_history';
  if (reason.includes('no_target_row') || reason.includes('stale')) return 'bars_stale';
  if (reason.includes('refresh_report')) return 'provider_refresh_error';
  return 'provider_exception';
}

function modelStateFromProjection(reader, canonicalId, {
  missingReason,
  targetMarketDate,
  source,
  notApplicableReason = null,
} = {}) {
  if (!reader?.available) {
    return { status: 'unavailable', reason: `${source || 'model'}_projection_missing` };
  }
  const row = reader.get(canonicalId);
  if (!row) return { status: 'unavailable', reason: missingReason || `${source || 'model'}_entry_missing` };
  const status = String(row.status || '').trim().toLowerCase();
  const asOf = normalizeIsoDate(row.as_of || row.target_market_date || reader.latest?.target_market_date || null);
  if (status === 'not_applicable') {
    return {
      status: 'not_applicable',
      as_of: asOf || targetMarketDate || null,
      reason: row.reason || notApplicableReason || `${source || 'model'}_not_applicable`,
    };
  }
  if (status === 'ok' && (!targetMarketDate || (asOf && asOf >= targetMarketDate))) {
    return {
      status: 'ok',
      as_of: asOf || targetMarketDate || null,
      score: row.score ?? row.avg_top_percentile ?? null,
      reason: null,
    };
  }
  return {
    status: status || 'unavailable',
    as_of: asOf || null,
    reason: row.reason || (status === 'stale' ? `${source || 'model'}_stale` : `${source || 'model'}_not_ready`),
  };
}

function forecastModelState({ forecastStatus, targetMarketDate }) {
  if (forecastStatus === 'available') return { status: 'ok', as_of: targetMarketDate || null };
  if (forecastStatus === 'not_applicable') {
    return { status: 'not_applicable', as_of: targetMarketDate || null, reason: 'forecast_model_stock_only' };
  }
  return { status: 'unavailable', reason: 'forecast_unavailable' };
}

function summarizeModelCoverage(states) {
  const values = Object.values(states || {});
  const required = values.filter((state) => state?.status !== 'not_applicable');
  const ok = required.filter((state) => state?.status === 'ok');
  const blocked = required.filter((state) => state?.status !== 'ok');
  if (required.length === 0) return { status: 'not_applicable', available: 0, required: 0, total: values.length, blocked };
  if (blocked.length === 0) return { status: 'complete', available: ok.length, required: required.length, total: values.length, blocked };
  if (ok.length > 0) return { status: 'partial', available: ok.length, required: required.length, total: values.length, blocked };
  return { status: 'missing', available: 0, required: required.length, total: values.length, blocked };
}

function normalizeBreakoutItemStatus(item) {
  const raw = item?.breakout_status
    || item?.status
    || item?.ui?.status
    || item?.ui?.label
    || item?.label
    || null;
  return raw ? String(raw).trim().toUpperCase() : null;
}

function normalizeBreakoutItemLegacyState(item) {
  const raw = item?.legacy_state
    || item?.ui?.legacy_state
    || item?.state
    || item?.ui?.label
    || item?.label
    || item?.breakout_status
    || item?.status
    || null;
  return raw ? String(raw).trim().toUpperCase() : null;
}

function riskFallbackFor({ assetClass, marketStatsMin }) {
  const stats = marketStatsMin?.stats || {};
  const volPct = Number(stats.volatility_percentile);
  if (Number.isFinite(volPct)) {
    return {
      level: volPct >= 75 ? 'HIGH' : volPct >= 35 ? 'MODERATE' : 'LOW',
      source: 'vol_heuristic',
      score: Number(volPct.toFixed(2)),
    };
  }
  if (assetClass === 'ETF' || assetClass === 'INDEX') return { level: 'LOW', source: 'asset_class_default', score: null };
  if (assetClass === 'STOCK') return { level: 'MODERATE', source: 'asset_class_default', score: null };
  return null;
}

function addAlias(aliasMap, collisions, alias, canonical, { authoritative = false } = {}) {
  const key = normalizePageCoreAlias(alias);
  const value = normalizePageCoreAlias(canonical);
  if (!key || !value) return;
  const protectedTarget = PROTECTED_ALIASES.get(key);
  if (protectedTarget && protectedTarget !== value) {
    collisions.push({ alias: key, previous: value, next: protectedTarget, resolution: 'protected_rejected' });
    return;
  }
  const existing = aliasMap.get(key);
  if (!existing) {
    aliasMap.set(key, { canonical: value, authoritative });
    return;
  }
  if (existing.canonical === value) {
    existing.authoritative = existing.authoritative || authoritative;
    return;
  }
  if (authoritative && !existing.authoritative) {
    aliasMap.set(key, { canonical: value, authoritative: true });
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_override' });
    return;
  }
  if (existing.authoritative && !authoritative) {
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_kept' });
    return;
  }
  aliasMap.delete(key);
  collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'omitted_ambiguous' });
}

function buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds }) {
  const aliasMap = new Map();
  const collisions = [];

  for (const [alias, value] of Object.entries(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (!canonical) continue;
    if (!scopeIds.has(canonical) && !PROTECTED_ALIASES.has(normalizePageCoreAlias(alias))) continue;
    addAlias(aliasMap, collisions, alias, canonical, { authoritative: true });
  }

  for (const [alias, row] of Object.entries(searchExact.bySymbol || {})) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    if (!canonical) continue;
    if (!scopeIds.has(canonical) && !PROTECTED_ALIASES.has(normalizePageCoreAlias(alias))) continue;
    addAlias(aliasMap, collisions, alias, canonical);
  }

  const symbolOwners = new Map();
  const registryIds = new Set();
  for (const row of registryRows) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    const symbol = normalizePageCoreAlias(row?.symbol);
    if (canonical) registryIds.add(canonical);
    if (!canonical || !symbol) continue;
    if (!symbolOwners.has(symbol)) symbolOwners.set(symbol, canonical);
    else {
      const prev = symbolOwners.get(symbol);
      if (prev !== canonical) symbolOwners.set(symbol, null);
    }
  }
  for (const [symbol, canonical] of symbolOwners.entries()) {
    if (canonical) addAlias(aliasMap, collisions, symbol, canonical);
  }

  for (const canonical of scopeIds) {
    addAlias(aliasMap, collisions, canonical, canonical, { authoritative: true });
  }

  for (const [alias, expected] of PROTECTED_ALIASES.entries()) {
    if (!registryIds.has(expected) && !scopeIds.has(expected)) {
      throw new Error(`PROTECTED_ALIAS_TARGET_MISSING:${alias}:expected:${expected}`);
    }
    if (!scopeIds.has(expected)) continue;
    addAlias(aliasMap, collisions, alias, expected, { authoritative: true });
    const actual = aliasMap.get(alias)?.canonical || null;
    if (actual !== expected) throw new Error(`PROTECTED_ALIAS_MISMATCH:${alias}:${actual}:expected:${expected}`);
  }

  return {
    aliases: Object.fromEntries(Array.from(aliasMap.entries()).map(([key, entry]) => [key, entry.canonical]).sort(([a], [b]) => a.localeCompare(b))),
    collisions,
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeHistoryBar(row) {
  if (Array.isArray(row)) {
    const date = String(row[0] || '').slice(0, 10);
    const close = numberOrNull(row[5] ?? row[4]);
    if (!date || close == null) return null;
    return {
      date,
      open: numberOrNull(row[1]) ?? close,
      high: numberOrNull(row[2]) ?? close,
      low: numberOrNull(row[3]) ?? close,
      close,
      adjClose: close,
      volume: numberOrNull(row[6]) ?? 0,
    };
  }
  if (!row || typeof row !== 'object') return null;
  const date = String(row.date || row.trading_date || '').slice(0, 10);
  const close = numberOrNull(row.adjClose ?? row.adjusted_close ?? row.adj_close ?? row.close);
  if (!date || close == null) return null;
  return {
    date,
    open: numberOrNull(row.open) ?? close,
    high: numberOrNull(row.high) ?? close,
    low: numberOrNull(row.low) ?? close,
    close,
    adjClose: close,
    volume: numberOrNull(row.volume) ?? 0,
  };
}

function normalizeHistoryBars(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeHistoryBar)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeBars(existing, incoming) {
  const map = new Map();
  for (const row of [...(existing || []), ...(incoming || [])]) {
    if (row?.date) map.set(row.date, row);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function readJsonCached(filePath) {
  if (!filePath) return null;
  if (historyJsonCache.has(filePath)) return historyJsonCache.get(filePath);
  let doc = null;
  try {
    doc = filePath.endsWith('.gz') ? readGzipJson(filePath) : readJson(filePath);
  } catch {
    doc = null;
  }
  historyJsonCache.set(filePath, doc);
  return doc;
}

function readFirstJson(paths) {
  for (const filePath of paths) {
    if (filePath && fs.existsSync(filePath)) return readJsonCached(filePath);
  }
  return null;
}

function normalizePackEntry(entry, fallbackCanonicalId) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const pack = String(entry[1] || '').trim();
    const canonical = normalizePageCoreAlias(String(entry[0] || '').includes(':') ? entry[0] : fallbackCanonicalId);
    return canonical && pack ? { canonical_id: canonical, pack } : null;
  }
  const canonical = normalizePageCoreAlias(entry.canonical_id || fallbackCanonicalId);
  const pack = String(entry.pack || entry.path || '').trim();
  return canonical && pack ? { canonical_id: canonical, pack } : null;
}

function readPackRows(packPath) {
  if (!packPath) return null;
  if (historyPackCache.has(packPath)) {
    const cached = historyPackCache.get(packPath);
    historyPackCache.delete(packPath);
    historyPackCache.set(packPath, cached);
    return cached;
  }
  let indexed = null;
  for (const root of HISTORY_PACK_ROOTS) {
    const packCandidates = [
      packPath,
      String(packPath).replace(/^history\//, ''),
    ].filter((value, index, list) => value && list.indexOf(value) === index);
    const filePath = packCandidates.map((candidate) => path.join(root, candidate)).find((candidate) => fs.existsSync(candidate));
    if (!filePath) continue;
    indexed = new Map();
    const text = filePath.endsWith('.gz') ? readGzipText(filePath) : fs.readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (canonical) indexed.set(canonical, normalizeHistoryBars(row?.bars || []));
      } catch {
        // Ignore malformed pack rows; missing bars become a documented blocker.
      }
    }
    break;
  }
  historyPackCache.set(packPath, indexed);
  while (HISTORY_PACK_CACHE_LIMIT > 0 && historyPackCache.size > HISTORY_PACK_CACHE_LIMIT) {
    const oldestKey = historyPackCache.keys().next().value;
    historyPackCache.delete(oldestKey);
  }
  if (HISTORY_PACK_CACHE_LIMIT === 0) historyPackCache.delete(packPath);
  return indexed;
}

function readShardBars(symbol) {
  const clean = normalizePageCoreAlias(symbol).replace(/[^A-Z0-9.\-]/g, '');
  const shard = clean.charAt(0);
  if (!shard) return [];
  if (!historyShardCache.has(shard)) {
    const gzPath = path.join(ROOT, 'public/data/eod/history/shards', `${shard}.json.gz`);
    const jsonPath = path.join(ROOT, 'public/data/eod/history/shards', `${shard}.json`);
    historyShardCache.set(shard, readJsonCached(gzPath) || readJsonCached(jsonPath) || {});
  }
  const doc = historyShardCache.get(shard) || {};
  return normalizeHistoryBars(doc[clean] || doc[symbol] || []);
}

function historyPackPath(row) {
  return String(row?.pointers?.history_pack || row?.history_pack || '').trim();
}

function readHistoricalBars(canonicalId, symbol, registryRow = null) {
  let bars = [];
  const manifest = readFirstJson(HISTORY_MANIFEST_CANDIDATES);
  const lookup = readFirstJson(HISTORY_LOOKUP_CANDIDATES);
  const candidates = [
    normalizePageCoreAlias(canonicalId),
    normalizePageCoreAlias(symbol),
  ].filter(Boolean);
  const entries = [];
  entries.push(normalizePackEntry({ canonical_id: canonicalId, pack: historyPackPath(registryRow) }, canonicalId));
  for (const candidate of candidates) {
    entries.push(normalizePackEntry(lookup?.by_canonical_id?.[candidate], canonicalId));
    entries.push(normalizePackEntry(lookup?.by_symbol?.[candidate], canonicalId));
    entries.push(normalizePackEntry(manifest?.by_canonical_id?.[candidate], canonicalId));
    entries.push(normalizePackEntry(manifest?.by_symbol?.[candidate], canonicalId));
  }
  const unique = entries
    .filter(Boolean)
    .filter((entry, index, list) => list.findIndex((item) => item.pack === entry.pack && item.canonical_id === entry.canonical_id) === index);
  for (const entry of unique) {
    const indexed = readPackRows(entry.pack);
    const packBars = indexed?.get(entry.canonical_id) || indexed?.get(normalizePageCoreAlias(canonicalId)) || [];
    bars = mergeBars(bars, packBars);
  }
  if (!bars.length) bars = readShardBars(symbol);
  return bars;
}

function lastTwo(values) {
  if (!Array.isArray(values) || values.length === 0) return [null, null];
  const last = numberOrNull(values[values.length - 1]);
  const prev = values.length > 1 ? numberOrNull(values[values.length - 2]) : null;
  return [last, prev];
}

function lastTwoBars(bars) {
  if (!Array.isArray(bars) || !bars.length) return [null, null];
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  return [numberOrNull(last?.close ?? last?.adjClose), numberOrNull(prev?.close ?? prev?.adjClose)];
}

function confidenceBucket(score) {
  const n = numberOrNull(score);
  if (n == null) return null;
  if (n >= 85) return 'high';
  if (n >= 65) return 'medium';
  if (n >= 45) return 'low';
  return 'very_low';
}

function buildMarketStatsMin({ marketPrices, marketStats, latestBar, consistency }) {
  if (!marketStats?.stats || !latestBar) return null;
  const stats = {};
  for (const field of MARKET_STATS_FIELDS) {
    const value = numberOrNull(marketStats.stats[field]);
    if (value != null) stats[field] = value;
  }
  return {
    as_of: marketStats.as_of || latestBar.date || null,
    latest_bar_date: latestBar.date || null,
    price_date: marketPrices?.date || null,
    price_source: marketPrices ? 'historical-bars' : null,
    stats_source: marketStats ? 'historical-indicators' : null,
    use_historical_basis: Boolean(marketPrices),
    key_levels_ready: consistency?.keyLevelsReady === true,
    issues: Array.isArray(consistency?.issues) ? consistency.issues : [],
    stats,
  };
}

function buildHistoricalMarketContext({ canonicalId, display, registryRow = null }) {
  const bars = readHistoricalBars(canonicalId, display, registryRow);
  const latestBar = bars.length ? bars[bars.length - 1] : null;
  const indicatorBars = bars.length > HISTORY_INDICATOR_BARS ? bars.slice(-HISTORY_INDICATOR_BARS) : bars;
  const indicatorResult = indicatorBars.length >= 2 ? computeIndicators(indicatorBars) : { indicators: [] };
  const indicators = Array.isArray(indicatorResult) ? indicatorResult : (indicatorResult?.indicators || []);
  const marketPrices = latestBar ? buildMarketPricesFromBar(latestBar, display, 'historical-bars') : null;
  const marketStats = indicators.length ? buildMarketStatsFromIndicators(indicators, display, latestBar?.date || null) : null;
  const consistency = assessMarketDataConsistency({ marketPrices, marketStats, latestBar });
  return {
    bars,
    latestBar,
    marketPrices,
    marketStats,
    consistency,
    marketStatsMin: buildMarketStatsMin({ marketPrices, marketStats, latestBar, consistency }),
  };
}

function buildPageCoreRow({ canonicalId, registryRow, decisionRow, lookupValue, targetMarketDate, generatedAt, runId, snapshotId, moduleContext = {} }) {
  const display = normalizePageCoreAlias(registryRow?.symbol || (Array.isArray(lookupValue) ? lookupValue[0] : null) || canonicalId.split(':').pop());
  const name = registryRow?.name || (Array.isArray(lookupValue) ? lookupValue[1] : null) || display;
  const assetClass = normalizePageCoreAlias(registryRow?.type_norm || registryRow?.asset_class || (Array.isArray(lookupValue) ? lookupValue[5] : null) || 'UNKNOWN');
  const historyContext = buildHistoricalMarketContext({ canonicalId, display, registryRow });
  const [historyClose, historyPrevClose] = lastTwoBars(historyContext.bars);
  const [registryClose, registryPrevClose] = lastTwo(registryRow?._tmp_recent_closes);
  const lastClose = historyClose ?? registryClose;
  const prevClose = historyPrevClose ?? registryPrevClose;
  const priceSource = historyClose != null
    ? 'historical-bars'
    : (registryClose != null ? 'registry_tmp_recent_closes' : null);
  const dailyChangeAbs = lastClose != null && prevClose != null ? Number((lastClose - prevClose).toFixed(6)) : null;
  const rawDailyChangePct = dailyChangeAbs != null && prevClose ? Number((dailyChangeAbs / prevClose).toFixed(8)) : null;
  const returnIntegrity = normalizeReturnDecimal({ pct: rawDailyChangePct, abs: dailyChangeAbs, close: lastClose });
  const dailyChangePct = returnIntegrity.value;
  const qualityStatus = decisionRow?.pipeline_status || (registryRow ? 'DEGRADED' : 'MISSING_DATA');
  const blockingReasons = Array.isArray(decisionRow?.blocking_reasons)
    ? decisionRow.blocking_reasons
    : registryRow ? [] : ['registry_row_missing'];
  const warnings = Array.isArray(decisionRow?.warnings) ? decisionRow.warnings.slice(0, 8) : [];
  if (!registryRow) warnings.push('registry_row_missing');
  if (!decisionRow) warnings.push('decision_bundle_missing');
  const asOf = historyContext.latestBar?.date || registryRow?.last_trade_date || decisionRow?.target_market_date || targetMarketDate || null;
  const staleAfter = asOf ? new Date(Date.parse(`${asOf}T00:00:00Z`) + 48 * 60 * 60 * 1000).toISOString() : null;
  const barsCount = Math.max(numberOrNull(registryRow?.bars_count) || 0, historyContext.bars.length || 0);
  const targetable = OPERATIONAL_ASSET_CLASSES.has(assetClass) && barsCount >= 200;
  const providerException = moduleContext.providerExceptions?.get?.(canonicalId) || null;
  const providerBlocker = providerExceptionBlocker(providerException);
  const providerFreshnessBlocked = providerBlocker === 'bars_stale';
  const freshnessOk = (targetMarketDate ? Boolean(asOf && asOf >= targetMarketDate) : Boolean(asOf)) && !providerFreshnessBlocked;
  const rawRiskLevel = String(decisionRow?.risk_assessment?.level || '').toUpperCase();
  const riskFallback = (!rawRiskLevel || rawRiskLevel === 'UNKNOWN') && targetable
    ? riskFallbackFor({ assetClass, marketStatsMin: historyContext.marketStatsMin })
    : null;
  const riskLevel = riskFallback?.level || rawRiskLevel;
  const riskSource = riskFallback?.source || decisionRow?.risk_assessment?.source || (decisionRow ? 'decision_bundle' : null);
  const riskScore = riskFallback?.score ?? decisionRow?.risk_assessment?.score ?? null;
  const rawVerdict = String(decisionRow?.verdict || '').toUpperCase();
  const effectiveVerdict = riskFallback && rawVerdict === 'BUY' ? 'WAIT' : rawVerdict;
  const effectiveBlockingReasons = freshnessOk
    ? blockingReasons.filter((reason) => String(reason || '') !== 'bars_stale')
    : blockingReasons;
  const effectiveWarnings = freshnessOk
    ? warnings.filter((reason) => String(reason || '') !== 'bars_stale')
    : warnings;
  const isDecisionCoreRow = decisionRow?.source === 'decision-core' || Boolean(decisionRow?.decision_core_min);
  const decisionOperational = Boolean(
    decisionRow
    && decisionRow.pipeline_status === 'OK'
    && ['BUY', 'WAIT', 'AVOID'].includes(effectiveVerdict)
    && (isDecisionCoreRow || effectiveBlockingReasons.length === 0)
    && (isDecisionCoreRow || riskLevel !== 'UNKNOWN')
  );
  const keyLevelsReady = historyContext.consistency?.keyLevelsReady === true;
  const historicalBasisOk = Boolean(
    priceSource === 'historical-bars'
    && historyContext.latestBar
    && historyContext.marketStats
    && historyContext.marketStatsMin
    && keyLevelsReady
  );
  const primaryBlocker = (!isDecisionCoreRow ? effectiveBlockingReasons[0] : null)
    || (!OPERATIONAL_ASSET_CLASSES.has(assetClass) ? 'asset_class_out_of_scope' : null)
    || providerBlocker
    || (barsCount < 200 ? 'insufficient_history' : null)
    || (!historyContext.latestBar ? 'missing_historical_bar_basis' : null)
    || (!historyContext.marketStats ? 'missing_market_stats_basis' : null)
    || (priceSource !== 'historical-bars' ? 'non_canonical_price_source' : null)
    || (!keyLevelsReady ? 'key_levels_not_ready' : null)
    || (!freshnessOk ? 'bars_stale' : null)
    || (!decisionRow ? 'decision_bundle_missing' : null)
    || (!decisionOperational ? (riskLevel === 'UNKNOWN' ? 'risk_unknown' : 'decision_not_operational') : null)
    || effectiveWarnings[0]
    || null;
  const fundamentalsStatus = fundamentalsStatusFor({
    display,
    name,
    assetClass,
    scopeDoc: moduleContext.fundamentalsScope,
    targetMarketDate,
  });
  const forecastStatus = forecastStatusFor({
    display,
    assetClass,
    forecastSymbols: moduleContext.forecastSymbols,
  });
  const breakoutStatus = breakoutStatusFor({
    canonicalId,
    display,
    barsCount,
    breakoutKeys: moduleContext.breakoutKeys,
  });
  const breakoutItem = breakoutItemFor({
    canonicalId,
    display,
    breakoutKeys: moduleContext.breakoutKeys,
  });
  const rawHistoricalProfileSummary = moduleContext.histProfiles?.get?.(canonicalId, display) || null;
  const rawHistoricalProfileReady = Boolean(rawHistoricalProfileSummary?.events && Object.keys(rawHistoricalProfileSummary.events).length > 0);
  const historicalProfileSummary = moduleContext.histProfiles?.embed
    ? compactPageCoreHistProfile(rawHistoricalProfileSummary, display)
    : null;
  const historicalProfileStatus = historicalProfileSummary
    ? 'ready'
    : rawHistoricalProfileReady
      ? 'available_via_endpoint'
      : (moduleContext.histProfiles?.available ? 'not_generated' : 'projection_missing');
  const modelStates = {
    forecast: forecastModelState({ forecastStatus, targetMarketDate }),
    scientific: modelStateFromProjection(moduleContext.scientificModels, canonicalId, {
      missingReason: 'scientific_entry_missing',
      targetMarketDate,
      source: 'scientific',
      notApplicableReason: 'scientific_model_stock_only',
    }),
    quantlab: modelStateFromProjection(moduleContext.quantlabModels, canonicalId, {
      missingReason: 'quantlab_entry_missing',
      targetMarketDate,
      source: 'quantlab',
      notApplicableReason: 'quantlab_model_stock_etf_only',
    }),
  };
  const modelCoverage = summarizeModelCoverage(modelStates);
  const modelAvailable = modelCoverage.available;
  const modelCoverageStatus = modelCoverage.status;
  const moduleWarnings = [];
  if (riskFallback) moduleWarnings.push(`risk_fallback_${riskFallback.source}`);
  if (riskFallback && rawVerdict === 'BUY') moduleWarnings.push('buy_suppressed_by_risk_fallback');
  for (const [modelKey, state] of Object.entries(modelStates)) {
    if (state?.status && !['ok', 'not_applicable'].includes(state.status)) moduleWarnings.push(`${modelKey}_${state.status}`);
  }
  const historicalProfileOperational = ['ready', 'available_via_endpoint', 'not_applicable'].includes(historicalProfileStatus);
  const modelCoverageOperational = ['complete', 'not_applicable'].includes(modelCoverageStatus);
  const visibleModuleBlockers = [];
  if (!historicalProfileOperational) visibleModuleBlockers.push('historical_profile_not_ready');
  if (!modelCoverageOperational) visibleModuleBlockers.push('model_coverage_incomplete');
  if (!historicalProfileOperational) moduleWarnings.push(`historical_profile_${historicalProfileStatus || 'missing'}`);
  const visibleModulesOperational = visibleModuleBlockers.length === 0;
  const strictBlockingReasons = uniqueStrings([
    ...(primaryBlocker ? [primaryBlocker] : []),
    ...(targetable ? visibleModuleBlockers : []),
  ]);
  const uiBannerState = decisionOperational && targetable && historicalBasisOk && freshnessOk && visibleModulesOperational
    ? 'all_systems_operational'
    : primaryBlocker
      ? 'provider_or_data_reason'
      : 'degraded';
  const row = {
    ok: true,
    schema_version: PAGE_CORE_SCHEMA,
    run_id: runId,
    snapshot_id: snapshotId,
    target_market_date: targetMarketDate || null,
    canonical_asset_id: canonicalId,
    display_ticker: display,
    provider_ticker: registryRow?.provider_symbol || null,
    freshness: {
      status: asOf ? 'fresh' : 'missing',
      as_of: asOf,
      generated_at: generatedAt,
      stale_after: staleAfter,
    },
    identity: {
      name,
      country: registryRow?.country || (Array.isArray(lookupValue) ? lookupValue[3] : null) || null,
      exchange: registryRow?.exchange || (Array.isArray(lookupValue) ? lookupValue[2] : null) || null,
      sector: null,
      industry: null,
      asset_class: assetClass,
    },
    summary_min: {
      last_close: lastClose,
      daily_change_pct: dailyChangePct,
      daily_change_abs: dailyChangeAbs,
      market_cap: null,
      decision_verdict: effectiveVerdict || (registryRow ? 'WAIT' : 'WAIT_PIPELINE_INCOMPLETE'),
      decision_confidence_bucket: decisionRow?.confidence_bucket || String(decisionRow?.confidence || '').toLowerCase() || confidenceBucket(riskScore),
      decision_analysis_reliability: decisionRow?.decision_core_min?.decision?.analysis_reliability || decisionRow?.confidence || null,
      decision_wait_subtype: decisionRow?.wait_subtype || decisionRow?.decision_core_min?.decision?.wait_subtype || null,
      decision_primary_setup: decisionRow?.primary_setup || decisionRow?.decision_core_min?.decision?.primary_setup || null,
      decision_max_entry_price: decisionRow?.decision_core_min?.trade_guard?.max_entry_price ?? null,
      decision_invalidation_level: decisionRow?.decision_core_min?.trade_guard?.invalidation_level ?? null,
      risk_level: riskLevel || null,
      risk_source: riskSource,
      learning_status: null,
      quality_status: qualityStatus,
      governance_status: decisionRow ? 'available' : 'unavailable',
    },
    governance_summary: {
      status: decisionRow ? String(decisionRow.pipeline_status || 'available').toLowerCase() : 'unavailable',
      evaluation_role: decisionRow?.evaluation_role || null,
      learning_gate_status: null,
      risk_level: riskLevel || null,
      risk_source: riskSource,
      blocking_reasons: effectiveBlockingReasons,
      warnings: uniqueStrings([...effectiveWarnings, ...moduleWarnings]),
    },
    decision_core_min: decisionRow?.decision_core_min || null,
    coverage: {
      bars: barsCount || numberOrNull(registryRow?.bars_count),
      derived_daily: Boolean(decisionRow),
      governance: Boolean(decisionRow),
      fundamentals: fundamentalsStatus === 'available',
      fundamentals_status: fundamentalsStatus,
      forecast: forecastStatus === 'available',
      forecast_status: forecastStatus,
      scientific_status: modelStates.scientific.status,
      quantlab_status: modelStates.quantlab.status,
      breakout_status: breakoutStatus,
      historical_profile: historicalProfileStatus === 'ready',
      historical_profile_status: historicalProfileStatus,
      model_coverage_status: modelCoverageStatus,
      ui_renderable: true,
    },
    price_source: priceSource,
    latest_bar_date: historyContext.latestBar?.date || null,
    stats_date: historyContext.marketStats?.as_of || null,
    core_status: historicalBasisOk && freshnessOk ? 'fresh' : 'degraded',
    market_stats_min: historyContext.marketStatsMin,
    key_levels_ready: keyLevelsReady,
    ui_banner_state: uiBannerState,
    primary_blocker: primaryBlocker,
    status_contract: {
      core_status: historicalBasisOk && freshnessOk ? 'fresh' : (asOf ? 'degraded' : 'missing'),
      page_core_status: uiBannerState === 'all_systems_operational' ? 'operational' : 'degraded',
      key_levels_status: keyLevelsReady && historyContext.marketStatsMin ? 'ready' : 'degraded',
      decision_status: decisionRow ? (decisionOperational ? 'operational' : 'degraded') : 'missing',
      risk_status: riskLevel && riskLevel !== 'UNKNOWN' ? 'available' : 'degraded',
      risk_source: riskSource,
      hist_status: historyContext.marketStatsMin ? 'available' : 'missing',
      historical_profile_status: historicalProfileStatus,
      fundamentals_status: fundamentalsStatus,
      forecast_status: forecastStatus,
      breakout_status: breakoutStatus,
      quantlab_status: modelStates.quantlab.status,
      scientific_status: modelStates.scientific.status,
      model_coverage_status: modelCoverageStatus,
      visible_modules_operational: visibleModulesOperational,
      stock_detail_view_status: uiBannerState === 'all_systems_operational' ? 'operational' : 'degraded',
      strict_operational: uiBannerState === 'all_systems_operational',
      strict_blocking_reasons: strictBlockingReasons,
      provider_exception_status: providerException ? 'verified' : 'none',
    },
    historical_profile_summary: historicalProfileSummary ? {
      ticker: historicalProfileSummary.ticker || display,
      latest_date: historicalProfileSummary.latest_date || null,
      bars_count: historicalProfileSummary.bars_count ?? null,
      events: historicalProfileSummary.events || {},
      source: historicalProfileSummary.source || 'hist_probs_public_projection',
    } : null,
    model_coverage: {
      status: modelCoverageStatus,
      available: modelAvailable,
      required: modelCoverage.required,
      total: 3,
      states: modelStates,
    },
    breakout_summary: breakoutItem ? {
      asset_id: breakoutItem.asset_id || canonicalId,
      display_ticker: breakoutItem.display_ticker || display,
      breakout_status: normalizeBreakoutItemStatus(breakoutItem),
      legacy_state: normalizeBreakoutItemLegacyState(breakoutItem),
      status_reasons: Array.isArray(breakoutItem.status_reasons) ? breakoutItem.status_reasons : [],
      support_zone: breakoutItem.support_zone || null,
      invalidation: breakoutItem.invalidation || null,
      status_explanation: breakoutItem.status_explanation || null,
      scores: breakoutItem.scores || null,
      final_signal_score: numberOrNull(breakoutItem?.scores?.final_signal_score ?? breakoutItem?.final_signal_score),
      rank: numberOrNull(breakoutItem?.ui?.rank ?? breakoutItem?.rank),
      rank_percentile: numberOrNull(breakoutItem?.ui?.rank_percentile ?? breakoutItem?.rank_percentile),
      label: breakoutItem?.ui?.label || breakoutItem?.label || null,
      ui: breakoutItem.ui || null,
    } : null,
    module_links: {
      historical: `/api/v2/stocks/${encodeURIComponent(display)}/historical?asset_id=${encodeURIComponent(canonicalId)}`,
      fundamentals: `/api/fundamentals?ticker=${encodeURIComponent(display)}`,
      forecast: null,
      quote: `/api/v2/quote/${encodeURIComponent(display)}`,
    },
    meta: {
      source: 'page-core-builder',
      render_contract: 'critical_page_contract',
      warnings: uniqueStrings([...warnings, ...moduleWarnings]),
      provider_exception: providerException ? {
        reason: providerException.reason,
        evidence: providerException.evidence,
        target_market_date: providerException.target_market_date,
        last_trade_date: providerException.last_trade_date,
        bars_count: providerException.bars_count,
      } : null,
    },
  };
  return finalizePageCoreRow(row, { targetMarketDate, canonicalId });
}

function finalizePageCoreRow(row, { targetMarketDate, canonicalId = null } = {}) {
  const strictReasons = pageCoreStrictOperationalReasons(row, {
    latest: { target_market_date: targetMarketDate || null },
    freshnessStatus: row.freshness?.status || null,
  }).filter((reason) => reason !== 'ui_banner_not_operational');
  if (strictReasons.length > 0 && row.ui_banner_state === 'all_systems_operational') {
    const strictBlocker = strictReasons[0] || 'strict_operational_contract_failed';
    row.ui_banner_state = 'degraded';
    row.primary_blocker = strictBlocker;
    row.summary_min = {
      ...row.summary_min,
      quality_status: 'DEGRADED',
    };
    row.governance_summary = {
      ...row.governance_summary,
      blocking_reasons: uniqueStrings([...(row.governance_summary.blocking_reasons || []), strictBlocker]),
      warnings: uniqueStrings([...(row.governance_summary.warnings || []), 'false_green_downgraded_by_page_core_contract']),
    };
    row.status_contract = {
      ...row.status_contract,
      page_core_status: 'degraded',
      stock_detail_view_status: 'degraded',
      strict_operational: false,
      strict_blocking_reasons: strictReasons,
    };
    row.meta = {
      ...row.meta,
      warnings: uniqueStrings([...(row.meta.warnings || []), 'false_green_downgraded_by_page_core_contract']),
    };
  } else {
    row.status_contract = {
      ...row.status_contract,
      strict_operational: row.ui_banner_state === 'all_systems_operational' && strictReasons.length === 0,
      strict_blocking_reasons: strictReasons.length > 0 ? strictReasons : row.status_contract.strict_blocking_reasons,
    };
  }
  const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (bytes > PAGE_CORE_TARGET_BYTES) row.meta.warnings = Array.from(new Set([...row.meta.warnings, 'row_over_target_size']));
  let hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (hardBytes > PAGE_CORE_HARD_BYTES && row.historical_profile_summary?.events) {
    row.historical_profile_summary = {
      ticker: row.historical_profile_summary.ticker || row.display_ticker || null,
      latest_date: row.historical_profile_summary.latest_date || null,
      bars_count: row.historical_profile_summary.bars_count ?? null,
      event_count: row.historical_profile_summary.event_count ?? Object.keys(row.historical_profile_summary.events || {}).length,
      source: row.historical_profile_summary.source || 'hist_probs_public_projection',
      compact_only: true,
    };
    row.meta.warnings = Array.from(new Set([...row.meta.warnings, 'historical_profile_events_omitted_for_page_core_budget']));
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  if (hardBytes > PAGE_CORE_HARD_BYTES && row.historical_profile_summary) {
    row.historical_profile_summary = null;
    row.meta.warnings = Array.from(new Set([...row.meta.warnings, 'historical_profile_summary_omitted_for_page_core_budget']));
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  if (hardBytes > PAGE_CORE_HARD_BYTES) {
    row.meta.warnings = (row.meta.warnings || [])
      .filter((warning) => !/historical_profile|row_over_target_size/i.test(String(warning || '')))
      .slice(0, 2);
    row.governance_summary = {
      ...row.governance_summary,
      warnings: (row.governance_summary?.warnings || []).slice(0, 2),
    };
    if (row.model_coverage?.states) {
      row.model_coverage = {
        status: row.model_coverage.status,
        available: row.model_coverage.available,
        total: row.model_coverage.total,
      };
    }
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  if (hardBytes > PAGE_CORE_HARD_BYTES && row.meta?.provider_exception) {
    row.meta.provider_exception = {
      reason: row.meta.provider_exception.reason || 'provider_exception',
    };
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  if (hardBytes > PAGE_CORE_HARD_BYTES && row.meta?.provider_exception) {
    delete row.meta.provider_exception;
    row.meta.warnings = (row.meta.warnings || [])
      .filter((warning) => !String(warning || '').startsWith('provider_exception'))
      .slice(0, 1);
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  // 3rd-pass trim: long decision_reasons/strict_blocking_reasons arrays + free-form
  // text fields are diagnostic, not load-bearing for UI rendering. Truncate
  // aggressively rather than crash the whole pipeline on a single asset row.
  if (hardBytes > PAGE_CORE_HARD_BYTES) {
    if (Array.isArray(row.decision_reasons) && row.decision_reasons.length > 5) {
      row.decision_reasons = row.decision_reasons.slice(0, 5);
    }
    if (row.status_contract?.strict_blocking_reasons && Array.isArray(row.status_contract.strict_blocking_reasons) && row.status_contract.strict_blocking_reasons.length > 8) {
      row.status_contract.strict_blocking_reasons = row.status_contract.strict_blocking_reasons.slice(0, 8);
    }
    if (typeof row.status_explanation === 'string' && row.status_explanation.length > 200) {
      row.status_explanation = `${row.status_explanation.slice(0, 197)}...`;
    }
    if (Array.isArray(row.meta?.warnings) && row.meta.warnings.length > 3) {
      row.meta.warnings = row.meta.warnings.slice(0, 3);
    }
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  }
  // 4th-pass: if STILL oversized, flag the row as quarantined and replace the
  // bulky panels with a typed-exception placeholder. The UI then renders a
  // typed reason instead of operational content, but the pipeline finishes for
  // every other asset. Tracking field surfaces the canonical_id so the
  // post-build audit can decide whether to fix or accept as exception.
  if (hardBytes > PAGE_CORE_HARD_BYTES) {
    const placeholderCanonical = canonicalId || row.canonical_asset_id || 'unknown';
    if (row.market_stats_min) row.market_stats_min = { stats: {}, oversized_quarantined: true };
    if (row.summary_min) row.summary_min = { ...row.summary_min, oversized_quarantined: true };
    if (row.historical_profile) row.historical_profile = { availability: { status: 'oversized_quarantined' } };
    row.status_contract = {
      ...(row.status_contract || {}),
      strict_blocking_reasons: ['oversized_row_quarantined'],
      historical_profile_status: 'unavailable',
      model_coverage_status: 'unavailable',
      stock_detail_view_status: 'degraded',
      banner_state: 'degraded',
    };
    row.ui_banner_state = 'degraded';
    row.primary_blocker = 'oversized_row_quarantined';
    row.meta = { ...(row.meta || {}), oversized_quarantined_canonical: placeholderCanonical };
    hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
    process.stderr.write(`[page-core] quarantined oversized row canonical=${placeholderCanonical} bytes=${hardBytes}\n`);
  }
  if (hardBytes > PAGE_CORE_HARD_BYTES) throw new Error(`PAGE_CORE_ROW_TOO_LARGE:${canonicalId || row.canonical_asset_id || 'unknown'}:${hardBytes}`);
  return row;
}

function reusePageCoreRow(previousRow, { targetMarketDate, generatedAt, runId, snapshotId }) {
  const row = {
    ...previousRow,
    run_id: runId,
    snapshot_id: snapshotId,
    target_market_date: targetMarketDate || null,
    freshness: {
      ...(previousRow.freshness || {}),
      generated_at: generatedAt,
    },
    meta: {
      ...(previousRow.meta || {}),
      source: 'page-core-builder',
      reuse_mode: 'incremental_same_target',
      reused_from_snapshot_id: previousRow.snapshot_id || null,
      price_basis: previousRow?.meta?.price_basis || previousRow?.price_basis || 'adjusted_close',
    },
  };
  return finalizePageCoreRow(row, { targetMarketDate, canonicalId: row.canonical_asset_id });
}

function previousRowReusable(previousRow, { targetMarketDate }) {
  if (!previousRow || typeof previousRow !== 'object') return false;
  if (previousRow.schema_version !== PAGE_CORE_SCHEMA) return false;
  if (normalizeIsoDate(previousRow.target_market_date) !== targetMarketDate) return false;
  const priceBasis = previousRow?.meta?.price_basis || previousRow?.price_basis || 'adjusted_close';
  if (!['adjusted_close', 'adjusted', 'raw'].includes(String(priceBasis))) return false;
  return true;
}

function basicValidateRow(row) {
  const required = ['ok', 'schema_version', 'run_id', 'snapshot_id', 'canonical_asset_id', 'display_ticker', 'freshness', 'identity', 'summary_min', 'governance_summary', 'coverage', 'module_links', 'meta'];
  return required.every((key) => row[key] !== undefined) && row.schema_version === PAGE_CORE_SCHEMA;
}

function buildSchemaValidator() {
  const schema = readJson(PAGE_CORE_SCHEMA_PATH);
  const ajv = new Ajv2020({ strict: false, allErrors: false });
  return ajv.compile(schema);
}

function ensureEmptyDir(dirPath, replace) {
  if (fs.existsSync(dirPath)) {
    if (!replace) throw new Error(`OUTPUT_EXISTS:${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeGzipJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(payload);
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 });
  fs.writeFileSync(filePath, gz);
  return { bytes: gz.length, hash: sha256Prefix(gz) };
}

function summarizeShardFiles(files) {
  const totalBytes = files.reduce((sum, file) => sum + Number(file?.bytes || 0), 0);
  const maxFile = files.reduce((best, file) => (Number(file?.bytes || 0) > Number(best?.bytes || 0) ? file : best), null);
  return {
    count: files.length,
    total_bytes_gzip: totalBytes,
    max_bytes_gzip: Number(maxFile?.bytes || 0),
    max_shard: maxFile?.shard ?? null,
    files_hash: sha256Prefix(stableStringify(files)),
  };
}

function buildBundle(opts) {
  const generatedAt = new Date().toISOString();
  const scopeIds = readScopeIds();
  if (!scopeIds.size) {
    for (const canonical of readOperabilityIds()) scopeIds.add(canonical);
  }
  const registryRows = readRegistryRows();
  const registryById = new Map(registryRows.map((row) => [normalizePageCoreAlias(row.canonical_id), row]));
  const searchExact = readSearchExact();
  const lookupExact = readSymbolLookup();
  const decisions = readDecisionRows();
  const moduleContext = {
    fundamentalsScope: readJsonMaybe(FUNDAMENTALS_SCOPE_PATH),
    forecastSymbols: readForecastSymbols(),
    breakoutKeys: readBreakoutKeys(),
    histProfiles: createHistProfileReader(),
    scientificModels: createModelProjectionReader(SCIENTIFIC_PER_ASSET_LATEST_PATH),
    quantlabModels: createModelProjectionReader(QUANTLAB_MODEL_COVERAGE_LATEST_PATH),
    providerExceptions: readProviderExceptions(),
  };
  const { aliases, collisions } = buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds });
  const snapshotId = buildPageCoreSnapshotId({
    runId: opts.runId,
    targetMarketDate: opts.targetMarketDate,
    manifestSeed: `${opts.manifestSeed}|${Object.keys(aliases).length}|${scopeIds.size}`,
  });
  let canonicalIds = Array.from(scopeIds).filter(Boolean).sort((a, b) => {
    const ap = historyPackPath(registryById.get(a));
    const bp = historyPackPath(registryById.get(b));
    if (ap !== bp) return ap.localeCompare(bp);
    return a.localeCompare(b);
  });
  if (opts.maxAssets) canonicalIds = canonicalIds.slice(0, opts.maxAssets);
  const { report: touchReport, ids: touchedIds } = loadHistoryTouchIds(opts.historyTouchReport);
  const previous = opts.incremental && !opts.maxAssets ? readPreviousPageCoreRows(opts.pageCoreRoot) : { pointer: null, rows: new Map() };
  const incrementalMode = Boolean(
    opts.incremental
    && !opts.maxAssets
    && previous.pointer
    && normalizeIsoDate(previous.pointer.target_market_date) === opts.targetMarketDate
    && previous.pointer.schema_version_payload === PAGE_CORE_SCHEMA
    && previous.rows.size > 0
  );
  const incrementalFallbackReason = opts.incremental && !incrementalMode
    ? (!previous.pointer ? 'previous_pointer_missing' : normalizeIsoDate(previous.pointer.target_market_date) !== opts.targetMarketDate ? 'target_market_date_changed_full_fallback' : previous.pointer.schema_version_payload !== PAGE_CORE_SCHEMA ? 'schema_changed_full_fallback' : previous.rows.size <= 0 ? 'previous_rows_missing' : 'unknown')
    : null;

  const rows = [];
  let reusedRows = 0;
  let rebuiltRows = 0;
  const lookupByCanonical = new Map();
  for (const value of Object.values(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (canonical) lookupByCanonical.set(canonical, value);
  }
  for (const canonicalId of canonicalIds) {
    if (
      incrementalMode
      && !touchedIds.has(canonicalId)
      && previousRowReusable(previous.rows.get(canonicalId), { targetMarketDate: opts.targetMarketDate })
    ) {
      rows.push(reusePageCoreRow(previous.rows.get(canonicalId), {
        targetMarketDate: opts.targetMarketDate,
        generatedAt,
        runId: opts.runId,
        snapshotId,
      }));
      reusedRows += 1;
      continue;
    }
    const row = buildPageCoreRow({
      canonicalId,
      registryRow: registryById.get(canonicalId) || null,
      decisionRow: decisions.get(canonicalId) || null,
      lookupValue: lookupByCanonical.get(canonicalId) || null,
      targetMarketDate: opts.targetMarketDate,
      generatedAt,
      runId: opts.runId,
      snapshotId,
      moduleContext,
    });
    rows.push(row);
    rebuiltRows += 1;
  }

  const validateSchema = buildSchemaValidator();
  const invalid = [];
  const validRows = rows.filter((row) => {
    const ok = basicValidateRow(row) && validateSchema(row);
    if (!ok && invalid.length < 5) invalid.push({ canonical_id: row?.canonical_asset_id || null, errors: validateSchema.errors || [] });
    return ok;
  }).length;
  const schemaValidRate = rows.length ? validRows / rows.length : 0;
  if (schemaValidRate < 0.999) throw new Error(`PAGE_CORE_SCHEMA_VALID_RATE_LOW:${schemaValidRate}:${JSON.stringify(invalid)}`);

  const aliasShards = Array.from({ length: ALIAS_SHARD_COUNT }, () => ({}));
  for (const [alias, canonical] of Object.entries(aliases)) {
    aliasShards[aliasShardIndex(alias)][alias] = canonical;
  }

  const pageShards = Array.from({ length: PAGE_SHARD_COUNT }, () => ({}));
  for (const row of rows) {
    pageShards[pageShardIndex(row.canonical_asset_id)][row.canonical_asset_id] = row;
  }

  const rowBytes = rows.map((row) => Buffer.byteLength(JSON.stringify(row), 'utf8'));
  const overTarget = rowBytes.filter((value) => value > PAGE_CORE_TARGET_BYTES).length;
  const overHard = rowBytes.filter((value) => value > PAGE_CORE_HARD_BYTES).length;
  if (overHard > 0) throw new Error(`PAGE_CORE_HARD_SIZE_VIOLATION:${overHard}`);

  const manifest = {
    schema: 'rv.page_core_manifest.v1',
    schema_version: '1.0',
    status: 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
    alias_collision_count: collisions.filter((item) => item.resolution === 'omitted_ambiguous').length,
    row_size: {
      target_bytes: PAGE_CORE_TARGET_BYTES,
      hard_bytes: PAGE_CORE_HARD_BYTES,
      max_bytes: Math.max(...rowBytes, 0),
      over_target_count: overTarget,
      over_hard_count: overHard,
    },
    validation: {
      ok: schemaValidRate >= 0.999 && overHard === 0,
      schema_valid_rate: schemaValidRate,
      protected_aliases: Object.fromEntries(Array.from(PROTECTED_ALIASES.entries()).map(([alias, expected]) => [alias, aliases[alias] || null])),
    },
    incremental: {
      requested: Boolean(opts.incremental),
      mode: incrementalMode ? 'incremental_same_target' : 'full',
      fallback_reason: incrementalFallbackReason,
      history_touch_report_path: path.relative(ROOT, opts.historyTouchReport).split(path.sep).join('/'),
      history_touch_report_run_id: touchReport?.run_id || null,
      changed_ids_count: touchedIds.size,
      reused_rows: reusedRows,
      rebuilt_rows: rebuiltRows,
      compatibility: {
        schema_version_payload: PAGE_CORE_SCHEMA,
        target_market_date: opts.targetMarketDate,
        price_basis: 'adjusted_close',
      },
    },
    paths: {
      latest_candidate: '/data/page-core/candidates/latest.candidate.json',
      snapshot_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}`,
      manifest_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/manifest.json`,
      alias_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/alias-shards`,
      page_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/page-shards`,
    },
  };

  const pointer = {
    schema: 'rv.page_core_latest.v1',
    schema_version: '1.0',
    status: opts.promote ? 'ACTIVE' : 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    valid_until: new Date(Date.parse(generatedAt) + 48 * 60 * 60 * 1000).toISOString(),
    snapshot_path: manifest.paths.snapshot_path,
    manifest_path: manifest.paths.manifest_path,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
  };

  return { snapshotId, manifest, pointer, aliasShards, pageShards, rows, collisions };
}

function writeBundle(opts, bundle) {
  const snapshotDir = path.join(opts.pageCoreRoot, 'snapshots', opts.targetMarketDate, bundle.snapshotId);
  ensureEmptyDir(snapshotDir, opts.replace);
  const aliasDir = path.join(snapshotDir, 'alias-shards');
  const pageDir = path.join(snapshotDir, 'page-shards');
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.mkdirSync(pageDir, { recursive: true });

  const aliasFiles = [];
  for (let i = 0; i < ALIAS_SHARD_COUNT; i += 1) {
    const file = path.join(aliasDir, aliasShardName(i));
    const stats = writeGzipJson(file, bundle.aliasShards[i]);
    if (stats.bytes > ALIAS_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_ALIAS_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    aliasFiles.push({ shard: i, ...stats });
  }
  const pageFiles = [];
  for (let i = 0; i < PAGE_SHARD_COUNT; i += 1) {
    const file = path.join(pageDir, pageShardName(i));
    const stats = writeGzipJson(file, bundle.pageShards[i]);
    if (stats.bytes > PAGE_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_PAGE_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    pageFiles.push({ shard: i, ...stats });
  }

  const manifest = {
    ...bundle.manifest,
    alias_files: aliasFiles,
    page_files_summary: summarizeShardFiles(pageFiles),
    bundle_hash: sha256Prefix(stableStringify({
      pointer: bundle.pointer,
      alias_files: aliasFiles,
      page_files_summary: summarizeShardFiles(pageFiles),
    })),
    input_hash: opts.inputHash || null,
  };
  writeJsonAtomic(path.join(snapshotDir, 'manifest.json'), manifest);
  writeJsonAtomic(path.join(opts.pageCoreRoot, 'candidates/latest.candidate.json'), {
    ...bundle.pointer,
    status: 'STAGED',
    bundle_hash: manifest.bundle_hash,
    input_hash: opts.inputHash || null,
  });
  if (opts.promote) {
    writeJsonAtomic(path.join(opts.pageCoreRoot, 'latest.json'), {
      ...bundle.pointer,
      status: 'ACTIVE',
      bundle_hash: manifest.bundle_hash,
      input_hash: opts.inputHash || null,
    });
  }
  return manifest;
}

function computeInputsHash(opts) {
  // Idempotency hash over the inputs that drive page-core content. If unchanged + last
  // run targeted same market date + last snapshot still present, skip rebuild.
  // Skipped when --replace, --force-rebuild, or RV_PAGE_CORE_FORCE_REBUILD=1.
  const inputs = [
    GLOBAL_SCOPE_PATH,
    DAILY_SCOPE_PATH,
    COMPAT_SCOPE_PATH,
    OPERABILITY_PATH,
    DECISIONS_LATEST_PATH,
    FORECAST_LATEST_PATH,
    SCIENTIFIC_PER_ASSET_LATEST_PATH,
    QUANTLAB_MODEL_COVERAGE_LATEST_PATH,
    PROVIDER_EXCEPTIONS_LATEST_PATH,
    ...BREAKOUT_LATEST_MANIFEST_PATHS,
    path.join(DECISION_CORE_ROOT, 'core/manifest.json'),
    path.join(ROOT, 'public/data/ops/module-outputs-verify-latest.json'),
  ];
  const parts = [`target=${opts.targetMarketDate}`, `incremental=${opts.incremental ? 1 : 0}`, `max_assets=${opts.maxAssets || ''}`];
  for (const file of inputs) {
    try {
      const stat = fs.statSync(file);
      parts.push(`${path.relative(ROOT, file)}:${stat.size}:${stat.mtimeMs.toFixed(0)}`);
    } catch {
      parts.push(`${path.relative(ROOT, file)}:missing`);
    }
  }
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

function maybeSkipBuild(opts) {
  if (opts.replace || opts.dryRun) return null;
  if (process.env.RV_PAGE_CORE_FORCE_REBUILD === '1') return null;
  if (process.argv.includes('--force-rebuild')) return null;
  const latestPath = path.join(opts.pageCoreRoot, 'latest.json');
  if (!fs.existsSync(latestPath)) return null;
  let latest;
  try {
    latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
  if (!latest || latest.target_market_date !== opts.targetMarketDate) return null;
  if (!latest.input_hash) return null;
  if (latest.snapshot_path) {
    const snapshotPath = path.resolve(ROOT, latest.snapshot_path);
    if (!fs.existsSync(snapshotPath)) return null;
  }
  const currentHash = computeInputsHash(opts);
  if (currentHash !== latest.input_hash) return null;
  return { skipped: true, reason: 'inputs_unchanged', snapshot_id: latest.snapshot_id, snapshot_path: latest.snapshot_path, input_hash: currentHash, target_market_date: latest.target_market_date };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targetMarketDate) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const skipDecision = maybeSkipBuild(opts);
  if (skipDecision) {
    console.log(JSON.stringify({ ok: true, ...skipDecision }, null, 2));
    return;
  }
  const inputHash = computeInputsHash(opts);
  opts.inputHash = inputHash;
  const bundle = buildBundle(opts);
  if (opts.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      snapshot_id: bundle.snapshotId,
      asset_count: bundle.rows.length,
      alias_count: Object.keys(bundle.aliasShards.reduce((acc, shard) => Object.assign(acc, shard), {})).length,
      collisions: bundle.collisions.length,
      validation: bundle.manifest.validation,
    }, null, 2));
    return;
  }
  const manifest = writeBundle(opts, bundle);
  console.log(JSON.stringify({
    ok: true,
    snapshot_id: bundle.snapshotId,
    promoted: opts.promote,
    snapshot_path: manifest.paths.snapshot_path,
    asset_count: manifest.asset_count,
    alias_count: manifest.alias_count,
    alias_collision_count: manifest.alias_collision_count,
    max_row_bytes: manifest.row_size.max_bytes,
    bundle_hash: manifest.bundle_hash,
  }, null, 2));
}

main();
