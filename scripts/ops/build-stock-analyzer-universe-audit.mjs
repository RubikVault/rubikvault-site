#!/usr/bin/env node

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';

import { buildHistProbsCandidatePaths } from '../../functions/api/_shared/hist-probs-paths.js';
import { resolveFundamentalsScopeMember } from '../../functions/api/_shared/fundamentals-scope.mjs';
import { tradingDaysBetween } from '../../functions/api/_shared/market-calendar.js';
import { normalizeTicker } from '../../functions/api/_shared/stock-helpers.js';
import { transformV2ToStockShape } from '../../public/js/rv-v2-client.js';
import { guardPayload } from '../../public/js/stock-data-guard.js';
import {
  buildActiveModelConsensusPresentation,
  buildBreakoutDensityPresentation,
  buildCatalystPresentation,
  buildExecutiveDecisionPresentation,
  buildFundamentalsPresentation,
  buildModuleFreshnessPresentation,
  buildHistoricalModulePresentation,
  buildInterpretiveChangePresentation,
  buildMobileNavigationPresentation,
  buildPageHierarchyPresentation,
  buildPageIdentity,
  buildRiskPresentation,
  buildTrustPresentation,
} from '../../public/js/stock-page-view-model.js';
import { SYSTEM_STATUS_STEP_CONTRACTS } from './system-status-ssot.mjs';

const ROOT = process.cwd();
const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';
const DEFAULT_REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_ALLOWLIST_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const DEFAULT_PROVIDER_NO_DATA_MANIFEST_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/provider-no-data-exclusions.json');
const HIST_PROBS_CHECKPOINTS_PATH = path.join(ROOT, 'public/data/hist-probs/checkpoints.json');
const HIST_PROBS_NO_DATA_PATH = path.join(ROOT, 'public/data/hist-probs/no-data-tickers.json');
const FUNDAMENTALS_SCOPE_PATH = path.join(ROOT, 'public/data/fundamentals/_scope.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json');
const GENERATOR_ID = 'scripts/ops/build-stock-analyzer-universe-audit.mjs';
const UI_CONTRACT_CHECKS_PER_ASSET = 24;
const DEFAULT_LIVE_CANARY_SIZE = 4;
const STABLE_LIVE_CANARIES = ['AAPL', 'SPY', 'SAP', 'EXSA'];
const POLICY_NEUTRAL_STRUCTURAL_FAMILIES = new Set([
  'historical_profile_unavailable',
  'artifact_fundamentals_missing',
  'fundamentals_unavailable',
  'model_consensus_degraded',
  'key_levels_unavailable',
  'artifact_provider_no_data_excluded',
]);
const CANONICAL_RECOVERY_ORDER = [
  'market_data_refresh',
  'q1_delta_ingest',
  'fundamentals_refresh',
  'hist_probs',
  'forecast_daily',
  'scientific_summary',
  'snapshot',
  'stock_analyzer_universe_audit',
];

const CUSTOM_RECOVERY_TASKS = {
  fundamentals_refresh: {
    id: 'fundamentals_refresh',
    label: 'Fundamentals Refresh',
    owner: 'Fundamentals',
    subsystem: 'fundamentals',
    run_command: 'node scripts/build-fundamentals.mjs --top-scope --force',
    verify_commands: [
      "jq '.meta.quality' public/data/v3/fundamentals/manifest.json",
      "ls public/data/fundamentals | head",
    ],
    outputs: [
      'public/data/fundamentals/<TICKER>.json',
      'public/data/v3/fundamentals/manifest.json',
    ],
    ui_surfaces: [
      'analyze-v4 Fundamentals',
      'analyze-v4 Catalysts',
    ],
  },
  manual_contract_repair: {
    id: 'manual_contract_repair',
    label: 'Manual Stock Analyzer Contract Repair',
    owner: 'Frontend/API',
    subsystem: 'stock_analyzer_ui',
    run_command: 'No script can fix this automatically. Repair the UI/API contract, then rerun the universe audit.',
    verify_commands: [
      'node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --asset-classes STOCK,ETF --max-tickers 0',
      'node scripts/ops/build-system-status-report.mjs',
      'node scripts/generate_meta_dashboard_data.mjs',
    ],
    outputs: [
      'public/data/reports/stock-analyzer-universe-audit-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Stock Analyzer Universe Audit',
      'analyze-v4 all panels',
    ],
  },
};

export const ISSUE_FAMILY_CATALOG = {
  summary_endpoint_failure: {
    severity: 'critical',
    label: 'Summary endpoint failed',
    description: 'The core Stock Analyzer summary contract could not be assembled for this asset.',
    recovery_ids: ['market_data_refresh', 'q1_delta_ingest', 'manual_contract_repair'],
  },
  historical_endpoint_failure: {
    severity: 'critical',
    label: 'Historical endpoint failed',
    description: 'Bars, indicators, or breakout inputs are missing, so the technical panels cannot be trusted.',
    recovery_ids: ['market_data_refresh', 'q1_delta_ingest', 'manual_contract_repair'],
  },
  governance_endpoint_failure: {
    severity: 'critical',
    label: 'Governance endpoint failed',
    description: 'Evaluation/governance data is unavailable, so decision/model evidence is incomplete.',
    recovery_ids: ['forecast_daily', 'scientific_summary', 'manual_contract_repair'],
  },
  historical_profile_unavailable: {
    severity: 'warning',
    label: 'Historical profile unavailable',
    description: 'Historical Performance / Historical signal profile could not load for this asset.',
    recovery_ids: ['hist_probs'],
  },
  price_stack_mismatch: {
    severity: 'critical',
    label: 'Price stack mismatch',
    description: 'Key Levels are reading mixed price sources, so CURRENT/52W/support-resistance can drift.',
    recovery_ids: ['market_data_refresh', 'q1_delta_ingest', 'manual_contract_repair'],
  },
  key_levels_unavailable: {
    severity: 'warning',
    label: 'Key Levels unavailable',
    description: 'The key-levels panel was degraded or hidden because canonical price consistency failed.',
    recovery_ids: ['market_data_refresh', 'q1_delta_ingest', 'manual_contract_repair'],
  },
  fundamentals_unavailable: {
    severity: 'warning',
    label: 'Fundamentals unavailable',
    description: 'Fundamentals/catalysts contract is incomplete for this asset.',
    recovery_ids: ['fundamentals_refresh', 'manual_contract_repair'],
  },
  model_consensus_degraded: {
    severity: 'warning',
    label: 'Model consensus degraded',
    description: 'At least one model-evidence lane is unavailable or incomplete.',
    recovery_ids: ['forecast_daily', 'scientific_summary'],
  },
  decision_contract_incomplete: {
    severity: 'critical',
    label: 'Decision contract incomplete',
    description: 'The Executive/WAIT decision layer is missing required decision-first fields.',
    recovery_ids: ['manual_contract_repair'],
  },
  ui_contract_incomplete: {
    severity: 'critical',
    label: 'UI contract incomplete',
    description: 'The transformed Stock Analyzer page contract is missing required presentational fields.',
    recovery_ids: ['manual_contract_repair'],
  },
  mixed_visible_dates: {
    severity: 'critical',
    label: 'Mixed visible dates',
    description: 'Visible Stock Analyzer modules disagree on the market date, so the page mixes stale and current facts.',
    recovery_ids: ['market_data_refresh', 'q1_delta_ingest', 'hist_probs', 'forecast_daily', 'scientific_summary', 'manual_contract_repair'],
  },
  freshness_mislabel: {
    severity: 'critical',
    label: 'Freshness mislabel',
    description: 'The UI claims current/full coverage although one or more visible modules are delayed, stale, or unavailable.',
    recovery_ids: ['hist_probs', 'manual_contract_repair'],
  },
  impossible_state_combo: {
    severity: 'critical',
    label: 'Impossible state combination',
    description: 'The Stock Analyzer page emitted a logically impossible combination of UI or learning-gate states.',
    recovery_ids: ['manual_contract_repair'],
  },
  artifact_hist_probs_missing: {
    severity: 'critical',
    label: 'Hist-Probs artifact missing',
    description: 'The universe-level historical profile artifact is missing for this asset, so full-universe UI truth cannot be proven.',
    recovery_ids: ['hist_probs'],
  },
  artifact_hist_probs_stale: {
    severity: 'critical',
    label: 'Hist-Probs artifact stale',
    description: 'The hist-probs artifact is behind the active target market date for this asset.',
    recovery_ids: ['hist_probs'],
  },
  artifact_fundamentals_missing: {
    severity: 'warning',
    label: 'Fundamentals artifact missing',
    description: 'The fundamentals artifact is missing for a stock asset that should expose fundamentals in the UI.',
    recovery_ids: ['fundamentals_refresh'],
  },
  artifact_provider_no_data_excluded: {
    severity: 'warning',
    label: 'Provider no-data exclusion applied',
    description: 'The asset was excluded from the releasable universe because the provider is explicitly documented as returning no data.',
    recovery_ids: ['market_data_refresh'],
  },
  frontpage_ui_mismatch: {
    severity: 'critical',
    label: 'Frontpage / Stock Analyzer mismatch',
    description: 'Asset appears in the frontpage BUY snapshot but fails Stock Analyzer UI contract checks, so the frontpage shows a signal the Analyzer cannot confirm.',
    recovery_ids: ['hist_probs', 'snapshot'],
  },
};

function humanizeId(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isLocalAuditBaseUrl(baseUrl) {
  try {
    const url = new URL(String(baseUrl || ''));
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname);
  } catch {
    return false;
  }
}

function clampLocalAuditConcurrency(options, selectedCount) {
  const explicitUnsafe = String(process.env.RV_ALLOW_HIGH_AUDIT_CONCURRENCY || '').trim() === '1';
  if (explicitUnsafe) return options.concurrency;
  if (!isLocalAuditBaseUrl(options.baseUrl)) return options.concurrency;
  if (selectedCount < 1000) return options.concurrency;
  return Math.min(options.concurrency, 6);
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    registryPath: DEFAULT_REGISTRY_PATH,
    allowlistPath: fs.existsSync(DEFAULT_ALLOWLIST_PATH) ? DEFAULT_ALLOWLIST_PATH : null,
    providerNoDataManifestPath: fs.existsSync(DEFAULT_PROVIDER_NO_DATA_MANIFEST_PATH) ? DEFAULT_PROVIDER_NO_DATA_MANIFEST_PATH : null,
    assetClasses: ['STOCK', 'ETF'],
    maxTickers: 0,
    liveSampleSize: Math.max(0, Number(process.env.RV_STOCK_ANALYZER_LIVE_SAMPLE_SIZE || DEFAULT_LIVE_CANARY_SIZE)),
    concurrency: 6,
    timeoutMs: 20000,
    tickers: [],
    outputPath: OUTPUT_PATH,
    runId: process.env.RUN_ID || process.env.RV_RUN_ID || null,
    targetMarketDate: normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url' && next) {
      options.baseUrl = next;
      i += 1;
    } else if (arg === '--registry-path' && next) {
      options.registryPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--allowlist-path' && next) {
      options.allowlistPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--provider-no-data-manifest' && next) {
      options.providerNoDataManifestPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--asset-classes' && next) {
      options.assetClasses = next.split(',').map((value) => String(value || '').trim().toUpperCase()).filter(Boolean);
      i += 1;
    } else if (arg === '--max-tickers' && next) {
      options.maxTickers = Math.max(0, Number(next) || 0);
      i += 1;
    } else if (arg === '--live-sample-size' && next) {
      options.liveSampleSize = Math.max(0, Number(next) || 0);
      i += 1;
    } else if (arg === '--concurrency' && next) {
      options.concurrency = Math.max(1, Number(next) || 1);
      i += 1;
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = Math.max(1000, Number(next) || 20000);
      i += 1;
    } else if (arg === '--tickers' && next) {
      options.tickers = next.split(',').map((value) => normalizeTicker(value)).filter(Boolean);
      i += 1;
    } else if (arg === '--output' && next) {
      options.outputPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === '--run-id' && next) {
      options.runId = String(next || '').trim() || null;
      i += 1;
    } else if ((arg === '--date' || arg === '--target-market-date') && next) {
      options.targetMarketDate = normalizeDate(next);
      i += 1;
    } else if (arg.startsWith('--date=')) {
      options.targetMarketDate = normalizeDate(arg.split('=')[1]);
    } else if (arg.startsWith('--target-market-date=')) {
      options.targetMarketDate = normalizeDate(arg.split('=')[1]);
    }
  }
  return options;
}

function withArtifactHash(payload) {
  const doc = { ...payload, artifact_hash: null };
  const artifactHash = createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  return {
    ...doc,
    artifact_hash: artifactHash,
  };
}

function pickDistributedSample(entries, sampleSize) {
  if (!Array.isArray(entries) || entries.length <= sampleSize) return [...(entries || [])];
  const sample = [];
  const seen = new Set();
  const stride = entries.length / sampleSize;
  for (let index = 0; index < sampleSize; index += 1) {
    const picked = entries[Math.min(entries.length - 1, Math.floor(index * stride))];
    const key = `${picked.assetClass}:${picked.requestTicker || picked.ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      sample.push(picked);
    }
  }
  return sample;
}

function readAllowlist(filePath) {
  if (!filePath) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const symbols = new Set(
      Array.isArray(doc?.symbols)
        ? doc.symbols.map((value) => normalizeTicker(value)).filter(Boolean)
        : [],
    );
    const canonicalIds = new Set(
      Array.isArray(doc?.canonical_ids)
        ? doc.canonical_ids.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
        : [],
    );
    return { symbols, canonicalIds };
  } catch {
    return { symbols: new Set(), canonicalIds: new Set() };
  }
}

function readRegistryEntries(filePath, assetClasses = ['STOCK', 'ETF']) {
  const buf = fs.readFileSync(filePath);
  const text = zlib.gunzipSync(buf).toString('utf8');
  const allowed = new Set(assetClasses.map((value) => String(value || '').toUpperCase()));
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => allowed.has(String(entry.type_norm || '').toUpperCase()))
    .map((entry) => ({
      ticker: normalizeTicker(entry.symbol),
      requestTicker: String(entry.exchange || '').toUpperCase() === 'US'
        ? normalizeTicker(entry.symbol)
        : (String(entry.canonical_id || '').trim().toUpperCase() || normalizeTicker(entry.symbol)),
      canonicalId: entry.canonical_id || null,
      assetClass: String(entry.type_norm || '').toUpperCase(),
      name: entry.name || null,
      exchange: entry.exchange || null,
      country: entry.country || null,
      lastTradeDate: normalizeDate(entry.last_trade_date || null),
      barsCount: Number(entry.bars_count || 0) || 0,
    }))
    .filter((entry) => entry.ticker);
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function buildSnapshotTickerSet(snapshotDoc) {
  const tickers = new Set();
  for (const assetGroup of ['stocks', 'etfs']) {
    const group = snapshotDoc?.data?.[assetGroup] || {};
    for (const rows of Object.values(group)) {
      for (const row of Array.isArray(rows) ? rows : []) {
        const ticker = normalizeTicker(row?.ticker || '');
        if (ticker) tickers.add(ticker);
      }
    }
  }
  return tickers;
}

function publicPathToFileSystem(publicPath) {
  const normalized = String(publicPath || '').replace(/^\/+/, '');
  if (normalized.startsWith('public/')) return path.join(ROOT, normalized);
  if (normalized.startsWith('data/')) return path.join(ROOT, 'public', normalized);
  return path.join(ROOT, normalized);
}

function readFirstJsonArtifact(publicPaths = []) {
  for (const publicPath of publicPaths) {
    const filePath = publicPathToFileSystem(publicPath);
    const doc = readJsonMaybe(filePath);
    if (doc) return { publicPath, filePath, doc };
  }
  return null;
}

function readHistProbsStatusIndex() {
  const index = new Map();
  const checkpointsDoc = readJsonMaybe(HIST_PROBS_CHECKPOINTS_PATH);
  for (const [ticker, checkpoint] of Object.entries(checkpointsDoc?.tickers || {})) {
    const normalizedTicker = normalizeTicker(ticker);
    if (!normalizedTicker) continue;
    index.set(normalizedTicker, {
      ticker: normalizedTicker,
      status: String(checkpoint?.status || '').trim().toLowerCase() || null,
      latest_date: normalizeDate(checkpoint?.latest_date || null),
      updated_at: checkpoint?.updated_at || checkpoint?.computed_at || null,
      source: 'checkpoint',
      no_data_manifest: false,
      bars_count: null,
    });
  }
  const noDataDoc = readJsonMaybe(HIST_PROBS_NO_DATA_PATH);
  for (const row of noDataDoc?.tickers || []) {
    const normalizedTicker = normalizeTicker(row?.symbol);
    if (!normalizedTicker) continue;
    const existing = index.get(normalizedTicker) || {};
    index.set(normalizedTicker, {
      ...existing,
      ticker: normalizedTicker,
      status: existing.status || 'no_data',
      latest_date: normalizeDate(existing.latest_date || row?.expected_date || null),
      updated_at: existing.updated_at || null,
      source: existing.source || 'no_data_manifest',
      no_data_manifest: true,
      bars_count: Number.isFinite(Number(row?.bars_count)) ? Number(row.bars_count) : null,
    });
  }
  return index;
}

function histProbsStatusIsNeutral(statusDoc = null) {
  const status = String(statusDoc?.status || '').trim().toLowerCase();
  return ['no_data', 'insufficient_history', 'provider_no_data_excluded', 'inactive'].includes(status)
    || statusDoc?.no_data_manifest === true;
}

function resolveHistProbsExpectedDate(entry, targetMarketDate) {
  return normalizeDate(entry?.lastTradeDate || targetMarketDate || null);
}

function isTradableRegistryEntry(entry) {
  return Number(entry?.barsCount || 0) > 0 && Boolean(normalizeDate(entry?.lastTradeDate || null));
}

function countMeaningfulFundamentals(doc) {
  if (!doc || typeof doc !== 'object') return 0;
  const keys = ['marketCap', 'pe_ttm', 'eps_ttm', 'pb', 'companyName', 'sector', 'industry', 'nextEarningsDate'];
  return keys.filter((key) => doc[key] != null && doc[key] !== '').length;
}

function inferArtifactAssetRegion(entry) {
  const exchange = String(entry?.exchange || '').toUpperCase();
  const country = String(entry?.country || '').toUpperCase();
  if (exchange === 'US' || country === 'USA' || country === 'UNITED STATES') return 'US';
  return 'EU';
}

function buildDefaultCanaryOrder(entries = []) {
  const buckets = new Map();
  for (const entry of entries) {
    const key = `${inferArtifactAssetRegion(entry)}:${entry.assetClass}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  return [
    ...(buckets.get('US:STOCK') || []).slice(0, 1),
    ...(buckets.get('US:ETF') || []).slice(0, 1),
    ...(buckets.get('EU:STOCK') || []).slice(0, 1),
    ...(buckets.get('EU:ETF') || []).slice(0, 1),
  ].filter(Boolean);
}

function pickCanaryEntries(entries = [], sampleSize = DEFAULT_LIVE_CANARY_SIZE) {
  if (!Array.isArray(entries) || entries.length === 0 || sampleSize <= 0) return [];
  const selected = [];
  const seen = new Set();
  for (const ticker of STABLE_LIVE_CANARIES) {
    const entry = entries.find((candidate) => candidate.ticker === ticker || candidate.requestTicker === ticker);
    if (!entry) continue;
    const key = `${entry.assetClass}:${entry.requestTicker || entry.ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(entry);
    }
    if (selected.length >= sampleSize) return selected.slice(0, sampleSize);
  }
  for (const entry of buildDefaultCanaryOrder(entries)) {
    const key = `${entry.assetClass}:${entry.requestTicker || entry.ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(entry);
    }
  }
  if (selected.length >= sampleSize) return selected.slice(0, sampleSize);
  for (const entry of pickDistributedSample(entries, sampleSize * 2)) {
    const key = `${entry.assetClass}:${entry.requestTicker || entry.ticker}`;
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(entry);
      if (selected.length >= sampleSize) break;
    }
  }
  return selected;
}

function readProviderNoDataManifest(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { symbols: new Set(), canonicalIds: new Set(), entries: [] };
  const doc = readJsonMaybe(filePath);
  if (!doc || typeof doc !== 'object') return { symbols: new Set(), canonicalIds: new Set(), entries: [] };
  const rawEntries = Array.isArray(doc.entries) ? doc.entries : [];
  const entries = rawEntries
    .map((entry) => ({
      symbol: normalizeTicker(entry?.symbol),
      canonicalId: String(entry?.canonical_id || '').trim().toUpperCase() || null,
      reason: String(entry?.reason || '').trim() || 'provider_no_data_verified',
      evidence: entry?.evidence || null,
    }))
    .filter((entry) => entry.symbol || entry.canonicalId);
  return {
    symbols: new Set([
      ...(Array.isArray(doc.symbols) ? doc.symbols : []),
      ...entries.map((entry) => entry.symbol),
    ].map((value) => normalizeTicker(value)).filter(Boolean)),
    canonicalIds: new Set([
      ...(Array.isArray(doc.canonical_ids) ? doc.canonical_ids : []),
      ...entries.map((entry) => entry.canonicalId),
    ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)),
    entries,
  };
}

function buildExcludedAssetRecord(entry, manifestEntry = null) {
  return {
    ticker: entry.ticker,
    assetClass: entry.assetClass,
    region: inferArtifactAssetRegion(entry),
    canonical_id: entry.canonicalId || null,
    reason: manifestEntry?.reason || 'provider_no_data_verified',
    evidence: manifestEntry?.evidence || null,
  };
}

function buildHistProbsPublicPaths(ticker) {
  return buildHistProbsCandidatePaths(ticker)
    .map((value) => String(value || ''))
    .map((value) => value.replace(/^\/+/, ''))
    .filter(Boolean);
}

function buildFundamentalsPublicPaths(ticker) {
  const normalized = String(ticker || '').trim().toUpperCase();
  if (!normalized) return [];
  return [
    `data/fundamentals/${encodeURIComponent(normalized)}.json`,
    `public/data/fundamentals/${encodeURIComponent(normalized)}.json`,
  ];
}

function auditArtifactEntry(entry, targetMarketDate, fundamentalsScopeDoc = null, histProbsStatusIndex = null, bestSetupsTickers = null) {
  const records = [];
  const histProbsArtifact = readFirstJsonArtifact(buildHistProbsPublicPaths(entry.ticker));
  const histProbsDate = normalizeDate(histProbsArtifact?.doc?.latest_date);
  const histProbsStatus = histProbsStatusIndex?.get(entry.ticker) || null;
  const histProbsNeutral = histProbsStatusIsNeutral(histProbsStatus);
  const expectedHistProbsDate = resolveHistProbsExpectedDate(entry, targetMarketDate);
  if (!histProbsArtifact && !histProbsNeutral) {
    records.push({
      ticker: entry.ticker,
      assetClass: entry.assetClass,
      familyId: 'artifact_hist_probs_missing',
      severity: ISSUE_FAMILY_CATALOG.artifact_hist_probs_missing.severity,
      detail: 'hist_probs_artifact_missing',
    });
  } else if (histProbsArtifact && expectedHistProbsDate && (!histProbsDate || histProbsDate < expectedHistProbsDate) && !histProbsNeutral) {
    records.push({
      ticker: entry.ticker,
      assetClass: entry.assetClass,
      familyId: 'artifact_hist_probs_stale',
      severity: ISSUE_FAMILY_CATALOG.artifact_hist_probs_stale.severity,
      detail: histProbsDate || 'hist_probs_target_missing',
    });
  }

  const fundamentalsArtifact = readFirstJsonArtifact(buildFundamentalsPublicPaths(entry.ticker));
  const fundamentalsDoc = fundamentalsArtifact?.doc || null;
  const fundamentalsCount = countMeaningfulFundamentals(fundamentalsDoc);
  const scopeMember = resolveFundamentalsScopeMember(fundamentalsScopeDoc, entry.ticker);
  const fundamentalsExpected = Boolean(fundamentalsScopeDoc)
    ? Boolean(scopeMember?.coverage_expected)
    : entry.assetClass === 'STOCK';
  const fundamentalsScopeNeutral = Boolean(fundamentalsScopeDoc) && (!scopeMember || fundamentalsExpected === false);
  if (fundamentalsExpected && fundamentalsCount < 2) {
    records.push({
      ticker: entry.ticker,
      assetClass: entry.assetClass,
      familyId: 'artifact_fundamentals_missing',
      severity: ISSUE_FAMILY_CATALOG.artifact_fundamentals_missing.severity,
      detail: fundamentalsArtifact ? 'fundamentals_incomplete' : 'fundamentals_artifact_missing',
    });
  }

  if (bestSetupsTickers?.has(entry.ticker) && expectedHistProbsDate && !histProbsNeutral && (!histProbsDate || histProbsDate < expectedHistProbsDate)) {
    records.push({
      ticker: entry.ticker,
      assetClass: entry.assetClass,
      familyId: 'frontpage_ui_mismatch',
      severity: ISSUE_FAMILY_CATALOG.frontpage_ui_mismatch.severity,
      detail: histProbsDate ? `buy_but_hist_probs_stale:${histProbsDate}` : 'buy_but_hist_probs_missing',
    });
  }

  return {
    ticker: entry.ticker,
    assetClass: entry.assetClass,
    hist_probs_date: histProbsDate,
    hist_probs_status: histProbsStatus?.status || null,
    hist_probs_neutral: histProbsNeutral,
    fundamentals_available: fundamentalsCount >= 2,
    fundamentals_expected: fundamentalsExpected,
    fundamentals_scope_neutral: fundamentalsScopeNeutral,
    fundamentals_typed_optional: entry.assetClass === 'ETF' || fundamentalsScopeNeutral,
    records,
  };
}

async function fetchJson(baseUrl, pathname, timeoutMs) {
  const url = new URL(pathname, baseUrl);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      url: url.toString(),
      body,
      error: response.ok ? null : body?.error?.code || `HTTP_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url: url.toString(),
      body: null,
      error: error?.name === 'TimeoutError'
        ? 'TIMEOUT'
        : (error?.cause?.message || error?.message || 'FETCH_FAILED'),
    };
  }
}

function addIssue(issues, familyId, detail = null) {
  issues.push({
    familyId,
    severity: ISSUE_FAMILY_CATALOG[familyId]?.severity || 'warning',
    detail,
  });
}

export function collectUiContractIssues({ ticker, payload, summaryRes, historicalRes, governanceRes, historicalProfileRes }) {
  const issues = [];

  if (!summaryRes?.ok || !summaryRes?.body?.ok) addIssue(issues, 'summary_endpoint_failure', summaryRes?.body?.error?.code || summaryRes?.error || 'summary_failed');
  if (!historicalRes?.ok || !historicalRes?.body?.ok) addIssue(issues, 'historical_endpoint_failure', historicalRes?.body?.error?.code || historicalRes?.error || 'historical_failed');
  if (!governanceRes?.ok || !governanceRes?.body?.ok) addIssue(issues, 'governance_endpoint_failure', governanceRes?.body?.error?.code || governanceRes?.error || 'governance_failed');
  if (!historicalProfileRes?.ok || !historicalProfileRes?.body?.ok) addIssue(issues, 'historical_profile_unavailable', historicalProfileRes?.body?.error?.code || historicalProfileRes?.error || 'historical_profile_failed');

  if (!payload) return issues;

  const guard = guardPayload(payload, ticker);
  const identity = buildPageIdentity(payload, ticker);
  const stats = payload?.data?.market_stats?.stats || {};
  const moduleFreshness = buildTrustPresentation({
    decisionAsOf: payload?.decision?.asof || payload?.metadata?.as_of || null,
    priceAsOf: identity.pageAsOf || null,
    moduleFreshness: buildModuleFreshnessPresentation(payload),
    fundamentalsStatus: buildFundamentalsPresentation({
      ticker,
      name: identity.name,
      fundamentals: payload?.data?.fundamentals || null,
      universe: payload?.universe || null,
    }).status,
    modelEvidenceLimited: Boolean(guard?.corrections?.modelConsensus?.degraded),
  });
  const executive = buildExecutiveDecisionPresentation({
    decision: payload?.decision || {},
    states: payload?.states || {},
    explanation: payload?.explanation || {},
    stats,
    close: identity.pageClose,
    effectiveVerdict: payload?.decision?.verdict || null,
  });
  const risk = buildRiskPresentation({
    decision: payload?.decision || {},
    states: payload?.states || {},
    stats,
  });
  const catalysts = buildCatalystPresentation({
    ticker,
    name: identity.name,
    fundamentals: payload?.data?.fundamentals || null,
    universe: payload?.universe || null,
  });
  const fundamentals = buildFundamentalsPresentation({
    ticker,
    name: identity.name,
    fundamentals: payload?.data?.fundamentals || null,
    universe: payload?.universe || null,
  });
  const fundamentalsNeutral = ['out_of_scope', 'not_applicable'].includes(fundamentals.status);
  const modelConsensus = buildActiveModelConsensusPresentation({
    evaluation: payload?.evaluation_v4 || null,
    decision: payload?.decision || {},
    missingModels: guard?.corrections?.modelConsensus?.missingModels || [],
    modelStates: payload?.evaluation_v4?.input_states || {},
  });
  const breakout = buildBreakoutDensityPresentation({
    breakout: payload?.data?.breakout_v2 || {},
    verdict: payload?.decision?.verdict || 'WAIT',
  });
  const change = buildInterpretiveChangePresentation({
    close: identity.pageClose,
    stats,
    change: payload?.data?.change || {},
  });
  const background = buildHistoricalModulePresentation({
    status: payload?.data?.historical_profile?.availability?.status || 'pending',
  });
  const hierarchy = buildPageHierarchyPresentation();
  const mobile = buildMobileNavigationPresentation({ viewportWidth: 390 });

  if (!identity.name || !identity.pageAsOf || !Number.isFinite(identity.pageClose)) {
    addIssue(issues, 'ui_contract_incomplete', 'identity_missing');
  }
  if (!moduleFreshness.summaryText) {
    addIssue(issues, 'ui_contract_incomplete', 'trust_missing');
  }
  const freshnessItems = buildModuleFreshnessPresentation(payload);
  if (!executive.verdict || !executive.primaryNextAction || !Array.isArray(executive.whyNotNow) || executive.whyNotNow.length === 0) {
    addIssue(issues, 'decision_contract_incomplete', 'executive_missing');
  }
  if (!risk.finalState || !risk.displaySentence) {
    addIssue(issues, 'decision_contract_incomplete', 'risk_missing');
  }
  if (!fundamentalsNeutral && (!catalysts.title || (!catalysts.primaryText && !Array.isArray(catalysts.items)))) {
    addIssue(issues, 'fundamentals_unavailable', 'catalyst_missing');
  }
  if (!fundamentalsNeutral && (!fundamentals.title || !fundamentals.renderMode)) {
    addIssue(issues, 'fundamentals_unavailable', 'fundamentals_missing');
  }
  if (!modelConsensus.finalInterpretation) {
    addIssue(issues, 'model_consensus_degraded', 'model_consensus_missing');
  }
  if (!breakout.headline || !breakout.mode) {
    addIssue(issues, 'ui_contract_incomplete', 'breakout_missing');
  }
  if (!change.summary || !Array.isArray(change.items) || change.items.length === 0) {
    addIssue(issues, 'ui_contract_incomplete', 'change_missing');
  }
  if (!background.confidenceLabel || !Array.isArray(hierarchy.sections) || hierarchy.sections.length !== 3 || !mobile.enabled || mobile.tabs.length !== 3) {
    addIssue(issues, 'ui_contract_incomplete', 'layout_missing');
  }
  if (payload?.data?.ssot?.historical_profile?.status !== 'ready') {
    addIssue(issues, 'historical_profile_unavailable', payload?.data?.ssot?.historical_profile?.reason || 'historical_not_ready');
  }
  if (moduleFreshness.coverageLabel === 'full' && freshnessItems.some((item) => item.state !== 'fresh')) {
    addIssue(issues, 'freshness_mislabel', `coverage_full_with_${freshnessItems.filter((item) => item.state !== 'fresh').map((item) => `${item.label}:${item.state}`).join(',')}`);
  }
  if (moduleFreshness.historicalState === 'current' && freshnessItems.find((item) => item.label === 'Historical')?.state !== 'fresh') {
    addIssue(issues, 'freshness_mislabel', 'historical_current_without_fresh_profile');
  }
  const decisionDate = normalizeDate(payload?.decision?.asof || null);
  const baseVisibleDates = Array.from(new Set([
    identity.pageAsOf,
    summaryRes?.body?.meta?.data_date || null,
    historicalRes?.body?.meta?.data_date || null,
    governanceRes?.body?.meta?.data_date || null,
  ].filter(Boolean))).sort();
  const visibleDates = Array.from(new Set([
    ...baseVisibleDates,
    decisionDate,
  ].filter(Boolean))).sort();
  const allowForwardDecisionDate = Boolean(
    decisionDate
    && baseVisibleDates.length === 1
    && tradingDaysBetween(baseVisibleDates[0], decisionDate) === 1
  );
  if (visibleDates.length > 1 && !allowForwardDecisionDate) {
    addIssue(issues, 'mixed_visible_dates', visibleDates.join(','));
  }
  const learningGate = payload?.decision?.learning_gate || payload?.evaluation_v4?.decision?.learning_gate || null;
  if (moduleFreshness.coverageLabel === 'full' && payload?.data?.ssot?.historical_profile?.status !== 'ready') {
    addIssue(issues, 'impossible_state_combo', 'coverage_full_with_historical_not_ready');
  }
  if (guard?.corrections?.priceStack?.valid === false) {
    addIssue(issues, 'price_stack_mismatch', (guard.corrections.priceStack.issues || []).join(',') || 'price_stack_invalid');
  }
  if (guard?.panelGates?.keyLevels?.show === false) {
    addIssue(issues, 'key_levels_unavailable', guard.panelGates.keyLevels.reason || 'key_levels_hidden');
  }
  if ((guard?.panelGates?.fundamentals?.degraded || fundamentals.status === 'unavailable') && !fundamentalsNeutral && !['ETF', 'Index'].includes(fundamentals.assetClass)) {
    addIssue(issues, 'fundamentals_unavailable', guard?.panelGates?.fundamentals?.reason || fundamentals.secondaryText || 'fundamentals_degraded');
  }
  if (guard?.panelGates?.modelConsensus?.degraded || guard?.panelGates?.modelConsensus?.show === false) {
    addIssue(issues, 'model_consensus_degraded', guard?.panelGates?.modelConsensus?.reason || 'model_consensus_panel_degraded');
  }
  for (const warning of guard?.warnings || []) {
    if (/Price stack mismatch/i.test(warning)) addIssue(issues, 'price_stack_mismatch', warning);
    else if (/Model consensus/i.test(warning)) addIssue(issues, 'model_consensus_degraded', warning);
    else if (/Fundamentals/i.test(warning)) addIssue(issues, 'fundamentals_unavailable', warning);
    else if (/Trade plan|Structure|Narrative/i.test(warning)) addIssue(issues, 'decision_contract_incomplete', warning);
  }

  return issues;
}

function compactExamples(records, limit = 5) {
  return records.slice(0, limit).map((record) => ({
    ticker: record.ticker,
    assetClass: record.assetClass,
    detail: record.detail || null,
  }));
}

const FIELD_PROBLEM_MAP = [
  { key: 'summary_endpoint_failure|*', uiField: 'Summary API Endpoint', severity: 'critical', rootCause: 'API endpoint down or data missing', repairStep: 'market_data_refresh' },
  { key: 'historical_endpoint_failure|*', uiField: 'Historical API Endpoint', severity: 'critical', rootCause: 'API endpoint down or bars missing', repairStep: 'market_data_refresh' },
  { key: 'governance_endpoint_failure|*', uiField: 'Governance API Endpoint', severity: 'critical', rootCause: 'Decision/model evidence unavailable', repairStep: 'forecast_daily' },
  { key: 'historical_profile_unavailable|*', uiField: 'Historical Performance Profile', severity: 'warning', rootCause: 'Hist-probs artifact stale or missing', repairStep: 'hist_probs' },
  { key: 'artifact_hist_probs_stale|*', uiField: 'Historical Probabilities (stale)', severity: 'critical', rootCause: 'Hist-probs artifact behind target_market_date', repairStep: 'hist_probs' },
  { key: 'artifact_hist_probs_missing|*', uiField: 'Historical Probabilities (missing)', severity: 'critical', rootCause: 'Hist-probs artifact file does not exist', repairStep: 'hist_probs' },
  { key: 'artifact_fundamentals_missing|*', uiField: 'Fundamentals Data', severity: 'warning', rootCause: 'Provider returned no fundamentals', repairStep: 'fundamentals_refresh' },
  { key: 'ui_contract_incomplete|identity_missing', uiField: 'Asset Identity (Name/Price/Date)', severity: 'critical', rootCause: 'Page contract missing name or price', repairStep: 'market_data_refresh' },
  { key: 'ui_contract_incomplete|trust_missing', uiField: 'Trust Bar / Coverage Label', severity: 'critical', rootCause: 'Module freshness state cannot be computed', repairStep: 'market_data_refresh' },
  { key: 'ui_contract_incomplete|breakout_missing', uiField: 'Breakout Panel', severity: 'critical', rootCause: 'Breakout headline/mode missing', repairStep: 'snapshot' },
  { key: 'ui_contract_incomplete|change_missing', uiField: 'Price Change Summary', severity: 'critical', rootCause: 'Change summary missing or empty', repairStep: 'market_data_refresh' },
  { key: 'ui_contract_incomplete|layout_missing', uiField: 'Page Layout / Navigation', severity: 'critical', rootCause: 'Page hierarchy or mobile nav broken', repairStep: 'market_data_refresh' },
  { key: 'decision_contract_incomplete|executive_missing', uiField: 'Executive Decision (BUY/WAIT)', severity: 'critical', rootCause: 'Decision verdict or next-action missing', repairStep: 'forecast_daily' },
  { key: 'decision_contract_incomplete|risk_missing', uiField: 'Final Risk Level', severity: 'critical', rootCause: 'Risk finalState null — often hist-probs stale', repairStep: 'hist_probs' },
  { key: 'fundamentals_unavailable|catalyst_missing', uiField: 'Catalysts Panel', severity: 'warning', rootCause: 'Fundamentals missing, catalyst cannot be built', repairStep: 'fundamentals_refresh' },
  { key: 'fundamentals_unavailable|fundamentals_missing', uiField: 'Fundamentals Panel', severity: 'warning', rootCause: 'Fundamentals data absent from provider cache', repairStep: 'fundamentals_refresh' },
  { key: 'fundamentals_unavailable|*', uiField: 'Fundamentals Panel (degraded)', severity: 'warning', rootCause: 'Provider degraded or panel gate hidden', repairStep: 'fundamentals_refresh' },
  { key: 'model_consensus_degraded|model_consensus_missing', uiField: 'Model Consensus Panel', severity: 'warning', rootCause: 'Model consensus finalInterpretation missing', repairStep: 'forecast_daily' },
  { key: 'model_consensus_degraded|*', uiField: 'Model Consensus (degraded)', severity: 'warning', rootCause: 'One or more model lanes degraded', repairStep: 'forecast_daily' },
  { key: 'price_stack_mismatch|*', uiField: 'Key Levels / Price Stack', severity: 'critical', rootCause: 'Price sources disagree (CURRENT vs 52W)', repairStep: 'market_data_refresh' },
  { key: 'key_levels_unavailable|*', uiField: 'Key Levels Panel', severity: 'warning', rootCause: 'Panel hidden due to price stack failure', repairStep: 'market_data_refresh' },
  { key: 'mixed_visible_dates|*', uiField: 'Module Date Alignment', severity: 'critical', rootCause: 'Visible modules show different market dates', repairStep: 'market_data_refresh' },
  { key: 'freshness_mislabel|*', uiField: 'Coverage Label Accuracy', severity: 'critical', rootCause: 'Coverage=full claimed but stale modules present', repairStep: 'hist_probs' },
  { key: 'impossible_state_combo|*', uiField: 'Learning State Consistency', severity: 'critical', rootCause: 'Logically impossible UI/learning state combination', repairStep: 'market_data_refresh' },
  { key: 'artifact_provider_no_data_excluded|*', uiField: 'Provider No-Data Exclusion', severity: 'warning', rootCause: 'Asset excluded: provider documents no data', repairStep: 'market_data_refresh' },
  { key: 'frontpage_ui_mismatch|*', uiField: 'Frontpage BUY / Analyzer Consistency', severity: 'critical', rootCause: 'Ticker is promoted on the frontpage but fails Analyzer UI truth gates', repairStep: 'snapshot' },
];

function resolveFieldEntry(familyId, detail) {
  return FIELD_PROBLEM_MAP.find((entry) => entry.key === `${familyId}|${detail || '*'}`)
    || FIELD_PROBLEM_MAP.find((entry) => entry.key === `${familyId}|*`)
    || null;
}

export function buildOrderedRecovery(familyStats = {}) {
  const entries = [];
  for (const [familyId, stat] of Object.entries(familyStats)) {
    const catalog = ISSUE_FAMILY_CATALOG[familyId];
    if (!catalog) continue;
    for (const recoveryId of catalog.recovery_ids || []) {
      const contract = SYSTEM_STATUS_STEP_CONTRACTS[recoveryId] || CUSTOM_RECOVERY_TASKS[recoveryId] || null;
      if (!contract) continue;
      const existing = entries.find((entry) => entry.step_id === recoveryId);
      if (existing) {
        existing.affected_assets += stat.affected_assets;
        if (!existing.affected_families.includes(familyId)) existing.affected_families.push(familyId);
        continue;
      }
      entries.push({
        rank: CANONICAL_RECOVERY_ORDER.indexOf(recoveryId) >= 0 ? CANONICAL_RECOVERY_ORDER.indexOf(recoveryId) + 1 : 999,
        step_id: recoveryId,
        label: contract.label || humanizeId(recoveryId),
        affected_assets: stat.affected_assets,
        affected_families: [familyId],
        run_command: contract.run_command || null,
        verify_commands: contract.verify_commands || [],
        outputs: contract.outputs || [],
        ui_surfaces: contract.ui_surfaces || [],
      });
    }
  }
  return entries.sort((a, b) => a.rank - b.rank || b.affected_assets - a.affected_assets)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function summarizeAuditFindings({ totalAssets = 0, processedAssets = 0, records = [] } = {}) {
  const familyStats = {};
  for (const record of records) {
    const bucket = familyStats[record.familyId] || {
      severity: ISSUE_FAMILY_CATALOG[record.familyId]?.severity || 'warning',
      label: ISSUE_FAMILY_CATALOG[record.familyId]?.label || record.familyId,
      description: ISSUE_FAMILY_CATALOG[record.familyId]?.description || null,
      affected_assets: 0,
      asset_classes: {},
      examples: [],
    };
    bucket.affected_assets += 1;
    bucket.asset_classes[record.assetClass] = (bucket.asset_classes[record.assetClass] || 0) + 1;
    if (bucket.examples.length < 5) {
      bucket.examples.push({
        ticker: record.ticker,
        assetClass: record.assetClass,
        detail: record.detail || null,
      });
    }
    familyStats[record.familyId] = bucket;
  }

  const fieldStats = {};
  for (const record of records) {
    const entry = resolveFieldEntry(record.familyId, record.detail);
    if (!entry) continue;
    const stepContract = SYSTEM_STATUS_STEP_CONTRACTS[entry.repairStep] || CUSTOM_RECOVERY_TASKS[entry.repairStep] || null;
    const bucket = fieldStats[entry.uiField] || {
      ui_field: entry.uiField,
      severity: entry.severity,
      root_cause: entry.rootCause,
      repair_step: entry.repairStep,
      repair_command: stepContract?.run_command || null,
      family_ids: [],
      affected_assets: 0,
      asset_classes: {},
    };
    bucket.affected_assets += 1;
    bucket.asset_classes[record.assetClass] = (bucket.asset_classes[record.assetClass] || 0) + 1;
    if (!bucket.family_ids.includes(record.familyId)) bucket.family_ids.push(record.familyId);
    fieldStats[entry.uiField] = bucket;
  }

  const fieldProblemStats = Object.values(fieldStats)
    .sort((a, b) => {
      const rank = { critical: 2, warning: 1, ok: 0 };
      return (rank[b.severity] || 0) - (rank[a.severity] || 0) || b.affected_assets - a.affected_assets;
    })
    .map((entry, index) => ({
      rank: index + 1,
      ...entry,
      affected_ratio: totalAssets > 0 ? entry.affected_assets / totalAssets : 0,
    }));

  const failureFamilies = Object.entries(familyStats)
    .map(([familyId, stat]) => ({
      family_id: familyId,
      severity: stat.severity,
      label: stat.label,
      description: stat.description,
      affected_assets: stat.affected_assets,
      affected_ratio: totalAssets > 0 ? stat.affected_assets / totalAssets : 0,
      asset_classes: stat.asset_classes,
      examples: compactExamples(stat.examples, 5),
      recovery_ids: ISSUE_FAMILY_CATALOG[familyId]?.recovery_ids || [],
    }))
    .sort((a, b) => {
      const rank = { critical: 2, warning: 1, ok: 0 };
      return (rank[b.severity] || 0) - (rank[a.severity] || 0) || b.affected_assets - a.affected_assets;
    });

  const affectedTickers = new Set(records.map((record) => `${record.assetClass}:${record.ticker}`)).size;
  const criticalFailureFamilies = failureFamilies.filter((family) => family.severity === 'critical');
  const warningFailureFamilies = failureFamilies.filter((family) => family.severity === 'warning');
  const severity = failureFamilies.some((family) => family.severity === 'critical')
    ? 'critical'
    : failureFamilies.length
      ? 'warning'
      : 'ok';
  const orderedRecovery = buildOrderedRecovery(familyStats);

  return {
    summary: {
      severity,
      total_assets: totalAssets,
      processed_assets: processedAssets,
      healthy_assets: Math.max(0, processedAssets - affectedTickers),
      affected_assets: affectedTickers,
      failure_family_count: failureFamilies.length,
      critical_failure_family_count: criticalFailureFamilies.length,
      warning_failure_family_count: warningFailureFamilies.length,
      field_checks_total: processedAssets * UI_CONTRACT_CHECKS_PER_ASSET,
      ui_contract_checks_per_asset: UI_CONTRACT_CHECKS_PER_ASSET,
      full_universe: totalAssets > 0 && processedAssets >= totalAssets,
      sampled_mode: false,
      ui_field_truth_ok: severity === 'ok',
      full_universe_validated: false,
      artifact_release_ready: false,
      policy_neutral_structural_gap_count: 0,
      policy_blocking_failure_family_count: failureFamilies.length,
      policy_neutral_structural_gaps_only: false,
    },
    failureFamilies,
    orderedRecovery,
    fieldProblemStats,
  };
}

async function auditTicker(entry, options) {
  const ticker = entry.ticker;
  const requestTicker = entry.requestTicker || ticker;
  console.log(`Auditing ${requestTicker}...`);
  const summaryRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/summary`, options.timeoutMs);
  const historicalRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/historical`, options.timeoutMs);
  const governanceRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/governance`, options.timeoutMs);
  const historicalProfileRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/historical-profile`, options.timeoutMs);
  console.log(`Audited ${requestTicker}.`);

  let payload = null;
  if (summaryRes.ok && historicalRes.ok && governanceRes.ok && summaryRes.body?.ok && historicalRes.body?.ok && governanceRes.body?.ok) {
    payload = transformV2ToStockShape(
      summaryRes.body.data,
      summaryRes.body.meta,
      historicalRes.body.data,
      governanceRes.body.data,
      summaryRes.body.data?.fundamentals || null,
      {
        summary: summaryRes.body.meta || null,
        historical: historicalRes.body.meta || null,
        governance: governanceRes.body.meta || null,
        historical_profile: historicalProfileRes.body?.meta || null,
      },
      null,
      historicalProfileRes.body?.ok ? historicalProfileRes.body.data : null,
    );
  }

  const issues = collectUiContractIssues({
    ticker,
    payload,
    summaryRes,
    historicalRes,
    governanceRes,
    historicalProfileRes,
  });
  return issues.map((issue) => ({
    ticker,
    assetClass: entry.assetClass,
    familyId: issue.familyId,
    severity: issue.familyId === 'historical_endpoint_failure' && issue.detail === 'QUALITY_REJECT'
      ? 'warning'
      : issue.severity,
    detail: issue.detail,
  }));
}

async function mapLimit(items, concurrency, iteratee) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await iteratee(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

export function buildPayload({
  options,
  totalUniverseAssets,
  processedEntries,
  records,
  startedAt,
  completedAt,
  fullUniverseScope = false,
  canaryEntries = [],
  canaryIssueRecords = [],
  artifactChecks = [],
  excludedAssets = [],
}) {
  const summarized = summarizeAuditFindings({
    totalAssets: totalUniverseAssets,
    processedAssets: processedEntries.length,
    records,
  });
  // ── Scope decision — single source of truth ─────────────────────────────────
  const requestedFullUniverse = !options.tickers.length && options.maxTickers === 0;
  const isSampledRun = options.maxTickers > 0 && options.maxTickers < totalUniverseAssets;
  const processedAll = processedEntries.length >= totalUniverseAssets;
  const processedFullUniverse = requestedFullUniverse && processedAll && !isSampledRun;

  // All dependent scope fields derived consistently from the above
  summarized.summary.requested_scope_full_universe = requestedFullUniverse;
  summarized.summary.processed_scope_full_universe = processedFullUniverse;
  summarized.summary.full_universe = processedFullUniverse;
  summarized.summary.sampled_mode = isSampledRun;
  summarized.summary.audit_mode = processedFullUniverse
    ? 'full'
    : (isSampledRun ? 'smoke' : 'subset');
  summarized.summary.live_endpoint_mode = requestedFullUniverse
    ? (canaryEntries.length > 0 ? 'canary_live' : 'artifact_only')
    : 'subset_live';
  summarized.summary.live_endpoint_sample_size = canaryEntries.length;

  // Artifact validation: only possible when truly full + no critical issues + not sampled
  const artifactRecords = artifactChecks.flatMap((entry) => entry.records);
  const artifactCriticalIssueCount = artifactRecords.filter((record) => String(record?.severity || '').toLowerCase() === 'critical').length;
  const liveCanaryOk = canaryIssueRecords.length === 0;
  const policyNeutralFailureFamilies = summarized.failureFamilies.filter((family) => POLICY_NEUTRAL_STRUCTURAL_FAMILIES.has(family.family_id));
  const policyBlockingFailureFamilies = summarized.failureFamilies.filter((family) => !POLICY_NEUTRAL_STRUCTURAL_FAMILIES.has(family.family_id));
  const artifactReleaseReady = processedFullUniverse && policyBlockingFailureFamilies.length === 0;
  summarized.summary.artifact_issue_count = artifactRecords.length;
  summarized.summary.artifact_critical_issue_count = artifactCriticalIssueCount;
  summarized.summary.live_canary_issue_count = canaryIssueRecords.length;
  summarized.summary.live_canary_ok = liveCanaryOk;
  summarized.summary.artifact_full_validated = processedFullUniverse && artifactCriticalIssueCount === 0;
  summarized.summary.artifact_release_ready = artifactReleaseReady;
  summarized.summary.policy_neutral_structural_gap_count = policyNeutralFailureFamilies.length;
  summarized.summary.policy_blocking_failure_family_count = policyBlockingFailureFamilies.length;
  summarized.summary.policy_neutral_structural_gaps_only = artifactReleaseReady && policyNeutralFailureFamilies.length > 0;
  summarized.summary.ui_field_truth_ok = artifactReleaseReady && liveCanaryOk;
  summarized.summary.full_universe_validated = summarized.summary.artifact_full_validated;
  summarized.summary.validated_scope_full_universe = summarized.summary.artifact_full_validated;
  summarized.summary.release_eligible = artifactReleaseReady;
  summarized.summary.processed_scope_count = processedEntries.length;
  summarized.summary.validated_scope_count = summarized.summary.artifact_full_validated === true ? processedEntries.length : 0;
  summarized.summary.target_market_date = options.targetMarketDate || null;
  const runId = options.runId || `run-stock-analyzer-audit-${(options.targetMarketDate || completedAt.slice(0, 10) || 'unknown').replace(/[^0-9-]/g, '')}`;
  return withArtifactHash({
    schema: 'rv.stock_analyzer_universe_audit.v1',
    schema_version: 'rv.stock_analyzer_universe_audit.v1',
    generator_id: GENERATOR_ID,
    run_id: runId,
    target_market_date: options.targetMarketDate || null,
    generated_at: completedAt,
    started_at: startedAt,
    completed_at: completedAt,
    run: {
      run_id: runId,
      base_url: options.baseUrl,
      registry_path: path.relative(ROOT, options.registryPath),
      allowlist_path: options.allowlistPath ? path.relative(ROOT, options.allowlistPath) : null,
      asset_classes: options.assetClasses,
      max_tickers: options.maxTickers,
      live_sample_size: options.liveSampleSize,
      concurrency: options.concurrency,
      timeout_ms: options.timeoutMs,
      explicit_tickers: options.tickers,
      processed_assets: processedEntries.length,
      total_universe_assets: totalUniverseAssets,
      excluded_assets: excludedAssets.length,
      source_mode: options.tickers.length
        ? 'explicit_tickers'
        : (options.allowlistPath ? 'registry_allowlist' : 'registry'),
    },
    summary: summarized.summary,
    artifact_audit: {
      mode: processedFullUniverse ? 'full_artifact' : 'subset_artifact',
      target_market_date: options.targetMarketDate || null,
      checked_assets: processedEntries.length,
      total_assets: totalUniverseAssets,
      excluded_assets: excludedAssets.length,
      excluded_reasons: excludedAssets.slice(0, 20),
      hist_probs_current_assets: artifactChecks.filter((entry) => entry.hist_probs_date === options.targetMarketDate).length,
      fundamentals_ready_assets: artifactChecks.filter((entry) => entry.fundamentals_available || entry.fundamentals_typed_optional).length,
      fundamentals_expected_assets: artifactChecks.filter((entry) => entry.fundamentals_expected).length,
      fundamentals_scope_neutral_assets: artifactChecks.filter((entry) => entry.fundamentals_scope_neutral).length,
      provider_no_data_manifest: options.providerNoDataManifestPath
        ? path.relative(ROOT, options.providerNoDataManifestPath)
        : null,
    },
    live_canary: {
      mode: canaryEntries.length > 0 ? 'live_canary' : 'disabled',
      sample_size: canaryEntries.length,
      passed: canaryEntries.length - new Set(canaryIssueRecords.map((record) => `${record.assetClass}:${record.ticker}`)).size,
      failed: new Set(canaryIssueRecords.map((record) => `${record.assetClass}:${record.ticker}`)).size,
      tickers: canaryEntries.map((entry) => ({
        ticker: entry.requestTicker || entry.ticker,
        assetClass: entry.assetClass,
        region: inferArtifactAssetRegion(entry),
      })),
    },
    failure_families: summarized.failureFamilies,
    field_problem_stats: summarized.fieldProblemStats,
    ordered_recovery: summarized.orderedRecovery,
    samples: {
      failing_assets: summarized.failureFamilies.flatMap((family) => family.examples).slice(0, 20),
    },
  });
}

export async function runUniverseAudit(options = parseArgs(process.argv)) {
  const startedAt = new Date().toISOString();
  const allowlist = readAllowlist(options.allowlistPath);
  const providerNoDataManifest = readProviderNoDataManifest(options.providerNoDataManifestPath);
  const fundamentalsScopeDoc = readJsonMaybe(FUNDAMENTALS_SCOPE_PATH);
  const histProbsStatusIndex = readHistProbsStatusIndex();
  const bestSetupsSnapshot = readJsonMaybe(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'));
  const bestSetupsTickers = buildSnapshotTickerSet(bestSetupsSnapshot);
  let registryEntries = options.tickers.length
    ? options.tickers.map((ticker) => ({ ticker, requestTicker: ticker, assetClass: 'UNKNOWN', canonicalId: null, name: null }))
    : readRegistryEntries(options.registryPath, options.assetClasses);
  if (!options.tickers.length && allowlist && (allowlist.symbols.size || allowlist.canonicalIds.size)) {
    registryEntries = registryEntries.filter((entry) => (
      allowlist.symbols.has(entry.ticker)
      || (entry.canonicalId && allowlist.canonicalIds.has(String(entry.canonicalId).trim().toUpperCase()))
    ));
  }
  const excludedAssets = [];
  if (!options.tickers.length && (providerNoDataManifest.symbols.size || providerNoDataManifest.canonicalIds.size)) {
    registryEntries = registryEntries.filter((entry) => {
      const matched = providerNoDataManifest.entries.find((candidate) => (
        (candidate.symbol && candidate.symbol === entry.ticker)
        || (candidate.canonicalId && candidate.canonicalId === String(entry.canonicalId || '').trim().toUpperCase())
      )) || null;
      const excluded = providerNoDataManifest.symbols.has(entry.ticker)
        || (entry.canonicalId && providerNoDataManifest.canonicalIds.has(String(entry.canonicalId).trim().toUpperCase()));
      if (excluded) excludedAssets.push(buildExcludedAssetRecord(entry, matched));
      return !excluded;
    });
  }
  if (!options.tickers.length) {
    registryEntries = registryEntries.filter((entry) => {
      if (isTradableRegistryEntry(entry)) return true;
      excludedAssets.push({
        ticker: entry.ticker,
        assetClass: entry.assetClass,
        region: inferArtifactAssetRegion(entry),
        canonical_id: entry.canonicalId || null,
        reason: 'non_tradable_scope_alias',
        evidence: {
          bars_count: Number(entry?.barsCount || 0) || 0,
          last_trade_date: normalizeDate(entry?.lastTradeDate || null),
        },
      });
      return false;
    });
  }
  const totalUniverseAssets = registryEntries.length;
  const fullUniverseScope = !options.tickers.length && options.maxTickers === 0;
  const selectedEntries = options.maxTickers > 0
    ? registryEntries.slice(0, options.maxTickers)
    : registryEntries;
  const artifactChecks = selectedEntries.map((entry) => auditArtifactEntry(
    entry,
    options.targetMarketDate,
    fundamentalsScopeDoc,
    histProbsStatusIndex,
    bestSetupsTickers,
  ));
  const artifactRecords = artifactChecks.flatMap((entry) => entry.records);
  let effectiveLiveSampleSize = options.liveSampleSize;
  if (effectiveLiveSampleSize > 0) {
    const preflightRes = await fetchJson(options.baseUrl, '/api/diag', 2000).catch(() => ({ ok: false }));
    if (!preflightRes.ok) {
      process.stderr.write(`[universe-audit] preflight ${options.baseUrl}/api/diag failed — running artifact_only (no live canary)\n`);
      effectiveLiveSampleSize = 0;
    }
  }
  const canaryEntries = pickCanaryEntries(selectedEntries, effectiveLiveSampleSize);
  const effectiveConcurrency = clampLocalAuditConcurrency(options, canaryEntries.length);
  const issueSets = await mapLimit(canaryEntries, effectiveConcurrency, (entry) => auditTicker(entry, { ...options, concurrency: effectiveConcurrency }));
  const liveRecords = issueSets.flat();
  const records = [...artifactRecords, ...liveRecords];
  const completedAt = new Date().toISOString();
  const payload = buildPayload({
    options: { ...options, concurrency: effectiveConcurrency },
    totalUniverseAssets,
    processedEntries: selectedEntries,
    records,
    startedAt,
    completedAt,
    fullUniverseScope,
    canaryEntries,
    canaryIssueRecords: liveRecords,
    artifactChecks,
    excludedAssets,
  });
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runUniverseAudit(parseArgs(process.argv));
}
