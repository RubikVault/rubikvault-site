#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { normalizeTicker } from '../../functions/api/_shared/stock-helpers.js';
import { transformV2ToStockShape } from '../../public/js/rv-v2-client.js';
import { guardPayload } from '../../public/js/stock-data-guard.js';
import {
  buildActiveModelConsensusPresentation,
  buildBreakoutDensityPresentation,
  buildCatalystPresentation,
  buildExecutiveDecisionPresentation,
  buildFundamentalsPresentation,
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
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json');
const UI_CONTRACT_CHECKS_PER_ASSET = 24;
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
    run_command: 'node scripts/build-fundamentals.mjs --force',
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
};

function humanizeId(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    registryPath: DEFAULT_REGISTRY_PATH,
    allowlistPath: null,
    assetClasses: ['STOCK', 'ETF'],
    maxTickers: 0,
    liveSampleSize: 300,
    concurrency: 6,
    timeoutMs: 20000,
    tickers: [],
    outputPath: OUTPUT_PATH,
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
    } else if (arg === '--asset-classes' && next) {
      options.assetClasses = next.split(',').map((value) => String(value || '').trim().toUpperCase()).filter(Boolean);
      i += 1;
    } else if (arg === '--max-tickers' && next) {
      options.maxTickers = Math.max(0, Number(next) || 0);
      i += 1;
    } else if (arg === '--live-sample-size' && next) {
      options.liveSampleSize = Math.max(1, Number(next) || 1);
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
    }
  }
  return options;
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
    }))
    .filter((entry) => entry.ticker);
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
      error: error?.name === 'TimeoutError' ? 'TIMEOUT' : (error?.message || 'FETCH_FAILED'),
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
    moduleFreshness: [],
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
  if (!executive.verdict || !executive.primaryNextAction || !Array.isArray(executive.whyNotNow) || executive.whyNotNow.length === 0) {
    addIssue(issues, 'decision_contract_incomplete', 'executive_missing');
  }
  if (!risk.finalState || !risk.displaySentence) {
    addIssue(issues, 'decision_contract_incomplete', 'risk_missing');
  }
  if (!catalysts.title || (!catalysts.primaryText && !Array.isArray(catalysts.items))) {
    addIssue(issues, 'fundamentals_unavailable', 'catalyst_missing');
  }
  if (!fundamentals.title || !fundamentals.renderMode) {
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
  if (guard?.corrections?.priceStack?.valid === false) {
    addIssue(issues, 'price_stack_mismatch', (guard.corrections.priceStack.issues || []).join(',') || 'price_stack_invalid');
  }
  if (guard?.panelGates?.keyLevels?.show === false) {
    addIssue(issues, 'key_levels_unavailable', guard.panelGates.keyLevels.reason || 'key_levels_hidden');
  }
  if ((guard?.panelGates?.fundamentals?.degraded || fundamentals.status === 'unavailable') && !['ETF', 'Index'].includes(fundamentals.assetClass)) {
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
    },
    failureFamilies,
    orderedRecovery,
  };
}

async function auditTicker(entry, options) {
  const ticker = entry.ticker;
  const requestTicker = entry.requestTicker || ticker;
  // Run endpoint checks sequentially per ticker to avoid overloading Pages dev with
  // 4x fan-out per asset during smoke audits across large non-US samples.
  const summaryRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/summary`, options.timeoutMs);
  const historicalRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/historical`, options.timeoutMs);
  const governanceRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/governance`, options.timeoutMs);
  const historicalProfileRes = await fetchJson(options.baseUrl, `/api/v2/stocks/${encodeURIComponent(requestTicker)}/historical-profile`, options.timeoutMs);

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

function buildPayload({ options, totalUniverseAssets, processedEntries, records, startedAt, completedAt, fullUniverseScope = false }) {
  const summarized = summarizeAuditFindings({
    totalAssets: totalUniverseAssets,
    processedAssets: processedEntries.length,
    records,
  });
  const liveEndpointMode = !options.tickers.length && options.maxTickers === 0 && processedEntries.length < totalUniverseAssets
    ? 'sampled_smoke'
    : 'full_live';
  const fullUniverse = fullUniverseScope || (!options.tickers.length && options.maxTickers === 0 && processedEntries.length >= totalUniverseAssets);
  summarized.summary.full_universe = fullUniverse;
  summarized.summary.live_endpoint_mode = liveEndpointMode;
  summarized.summary.live_endpoint_sample_size = processedEntries.length;
  return {
    schema: 'rv.stock_analyzer_universe_audit.v1',
    generated_at: completedAt,
    started_at: startedAt,
    completed_at: completedAt,
    run: {
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
      source_mode: options.tickers.length
        ? 'explicit_tickers'
        : (options.allowlistPath ? (liveEndpointMode === 'sampled_smoke' ? 'registry_allowlist_smoke' : 'registry_allowlist') : 'registry'),
    },
    summary: summarized.summary,
    failure_families: summarized.failureFamilies,
    ordered_recovery: summarized.orderedRecovery,
    samples: {
      failing_assets: summarized.failureFamilies.flatMap((family) => family.examples).slice(0, 20),
    },
  };
}

export async function runUniverseAudit(options = parseArgs(process.argv)) {
  const startedAt = new Date().toISOString();
  const allowlist = readAllowlist(options.allowlistPath);
  let registryEntries = options.tickers.length
    ? options.tickers.map((ticker) => ({ ticker, requestTicker: ticker, assetClass: 'UNKNOWN', canonicalId: null, name: null }))
    : readRegistryEntries(options.registryPath, options.assetClasses);
  if (!options.tickers.length && allowlist && (allowlist.symbols.size || allowlist.canonicalIds.size)) {
    registryEntries = registryEntries.filter((entry) => (
      allowlist.symbols.has(entry.ticker)
      || (entry.canonicalId && allowlist.canonicalIds.has(String(entry.canonicalId).trim().toUpperCase()))
    ));
  }
  const totalUniverseAssets = registryEntries.length;
  const fullUniverseScope = !options.tickers.length && options.maxTickers === 0;
  const selectedEntries = options.maxTickers > 0
    ? registryEntries.slice(0, options.maxTickers)
    : (fullUniverseScope ? pickDistributedSample(registryEntries, options.liveSampleSize) : registryEntries);
  const issueSets = await mapLimit(selectedEntries, options.concurrency, (entry) => auditTicker(entry, options));
  const records = issueSets.flat();
  const completedAt = new Date().toISOString();
  const payload = buildPayload({
    options,
    totalUniverseAssets,
    processedEntries: selectedEntries,
    records,
    startedAt,
    completedAt,
    fullUniverseScope,
  });
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runUniverseAudit(parseArgs(process.argv));
}
