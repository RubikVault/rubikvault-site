#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  applyPageCoreAliasMarketDataFallback,
  normalizePageCoreOperationalState,
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
} from '../../functions/api/_shared/page-core-reader.js';
import { aliasShardName, normalizePageCoreAlias, pageShardName } from '../../functions/api/_shared/page-core-contract.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DEFAULT_BASE_URL = process.env.RV_STOCK_UI_AUDIT_BASE_URL || 'https://rubikvault-site.pages.dev';
const DEFAULT_OUTPUT = path.join(ROOT, 'tmp/stock-analyzer-ui-integrity-audit.json');
const ELIGIBLE_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);
const REQUIRED_PROBE_TICKERS = ['HOOD', 'AAPL', 'SPY', 'QQQ'];
const EXPLAINED_BUCKETS = new Set([
  'provider-side unavailable',
  'stale source',
  'missing full history',
  'invalid return/benchmark',
  'chart contract issue',
  'correlation not computed',
  'other resolver BLOCK',
]);

function argValue(name, fallback = null) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function fetchJsonMaybeGzip(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FETCH_FAILED:${url}:${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  let pathname = String(url || '');
  try {
    pathname = new URL(url).pathname;
  } catch {
    // keep raw value
  }
  const text = pathname.endsWith('.gz') ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return JSON.parse(text);
}

async function fetchJsonOrNull(url, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonMaybeGzip(url);
    } catch {
      if (attempt >= attempts) return null;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
}

function arrayAtPath(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function endpointStatus(payload) {
  return String(payload?.meta?.status || payload?.data?.status || payload?.status || '').trim().toLowerCase();
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('rv', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return parsed.toString();
}

export function bucketReason(reason) {
  const text = String(reason || '').toLowerCase();
  if (/freshness|stale|expired|bars_stale/.test(text)) return 'stale source';
  if (/return|benchmark/.test(text)) return 'invalid return/benchmark';
  if (/history|bars|historical/.test(text)) return 'missing full history';
  if (/chart/.test(text)) return 'chart contract issue';
  if (/correlation/.test(text)) return 'correlation not computed';
  if (/provider|unavailable|missing|not_found/.test(text)) return 'provider-side unavailable';
  return 'other resolver BLOCK';
}

export function eligible(row) {
  const cls = String(row?.identity?.asset_class || row?.identity?.security_type || '').toUpperCase();
  return ELIGIBLE_CLASSES.has(cls) && Boolean(row?.display_ticker || row?.canonical_asset_id);
}

function moduleStatus(row, key) {
  const statusKey = `${key}_status`;
  return String(
    row?.status_contract?.[statusKey]
    || row?.coverage?.[statusKey]
    || row?.[key]?.availability?.status
    || row?.[key]?.status
    || ''
  ).trim().toLowerCase();
}

function hasTypedModuleStatus(row, key) {
  return [
    'available',
    'ready',
    'ok',
    'not_applicable',
    'out_of_scope',
    'provider_unavailable',
    'provider_no_data',
    'not_generated',
    'insufficient_history',
    'unavailable',
    'updating',
  ].includes(moduleStatus(row, key));
}

export function uiCompletenessReasons(row) {
  if (row?.coverage?.ui_renderable !== true) return ['ui_not_renderable'];
  return [];
}

export function auditRow(row, latest, { aliasFallbackRow = null } = {}) {
  const rawReasons = pageCoreStrictOperationalReasons(row, {
    latest,
    freshnessStatus: row?.freshness?.status || null,
  });
  const baseNormalized = normalizePageCoreOperationalState(row, {
    latest,
    freshnessStatus: row?.freshness?.status || null,
  });
  const normalized = applyPageCoreAliasMarketDataFallback(row, aliasFallbackRow, { latest }) || baseNormalized;
  const normalizedReasons = pageCoreStrictOperationalReasons(normalized, {
    latest,
    freshnessStatus: normalized?.freshness?.status || null,
  });
  const rawFalseGreen = pageCoreClaimsOperational(row) && rawReasons.length > 0;
  const normalizedFalseGreen = pageCoreClaimsOperational(normalized) && normalizedReasons.length > 0;
  const uiIncompleteReasons = uiCompletenessReasons(normalized);
  const falseGreenUiRender = pageCoreClaimsOperational(normalized) && normalizedReasons.length === 0 && uiIncompleteReasons.length > 0;
  const bucketSource = [...rawReasons, ...normalizedReasons, normalized?.primary_blocker]
    .concat(uiIncompleteReasons)
    .find((reason) => reason && reason !== 'ui_banner_not_operational');
  const bucket = bucketReason(bucketSource || rawReasons[0] || normalizedReasons[0] || normalized?.primary_blocker);
  const operational = normalizedReasons.length === 0 && uiIncompleteReasons.length === 0 && pageCoreClaimsOperational(normalized);
  const pass = !normalizedFalseGreen && !falseGreenUiRender && EXPLAINED_BUCKETS.has(bucket);
  return {
    pass,
    operational,
    ticker: row?.display_ticker || row?.canonical_asset_id || null,
    canonical_id: row?.canonical_asset_id || null,
    raw_false_green: rawFalseGreen,
    normalized_false_green: normalizedFalseGreen,
    false_green_ui_render: falseGreenUiRender,
    bucket,
    reasons: rawReasons.length ? rawReasons : normalizedReasons,
    ui_completeness_reasons: uiIncompleteReasons,
    normalized_status: normalized?.status_contract?.stock_detail_view_status || null,
  };
}

function rowKey(row) {
  return `${row?.canonical_asset_id || ''}|${row?.display_ticker || ''}`;
}

function pickProbeRows(rows, auditResults, sampleSize) {
  const byTicker = new Map();
  const byKey = new Map();
  for (const row of rows) {
    const ticker = String(row?.display_ticker || '').toUpperCase();
    if (ticker) {
      const list = byTicker.get(ticker) || [];
      list.push(row);
      byTicker.set(ticker, list);
    }
    byKey.set(rowKey(row), row);
  }
  const picked = new Map();
  for (const ticker of REQUIRED_PROBE_TICKERS) {
    const list = byTicker.get(ticker) || [];
    const row = list.find((candidate) => String(candidate?.canonical_asset_id || '').toUpperCase() === `US:${ticker}`)
      || list.find((candidate) => String(candidate?.canonical_asset_id || '').toUpperCase().endsWith(`:${ticker}`))
      || list[0];
    if (row) picked.set(rowKey(row), row);
  }
  for (const result of auditResults) {
    if (picked.size >= sampleSize) break;
    if (!result.operational) continue;
    const row = byKey.get(`${result.canonical_id || ''}|${result.ticker || ''}`);
    if (!row) continue;
    picked.set(rowKey(row), row);
    if (picked.size >= sampleSize) break;
  }
  return [...picked.values()];
}

async function probeHistorical(baseUrl, row, minBars = 60) {
  const ticker = encodeURIComponent(row?.display_ticker || row?.canonical_asset_id || '');
  const assetId = row?.canonical_asset_id ? `?asset_id=${encodeURIComponent(row.canonical_asset_id)}` : '';
  const payload = await fetchJsonOrNull(withCacheBust(`${baseUrl}/api/v2/stocks/${ticker}/historical${assetId}`));
  const bars = arrayAtPath(payload?.data?.bars, payload?.bars, payload?.data?.history);
  const provider = String(payload?.meta?.provider || payload?.data?.provider || payload?.provider || '').trim();
  const ok = bars.length >= minBars && provider !== 'page-core-minimal-history';
  return {
    ok,
    check: 'historical',
    ticker: row?.display_ticker || null,
    canonical_id: row?.canonical_asset_id || null,
    bars: bars.length,
    provider: provider || null,
    status: endpointStatus(payload) || null,
    reason: ok ? null : `historical_bars_lt_${minBars}_or_minimal_provider`,
  };
}

async function probeGovernance(baseUrl, row) {
  const ticker = encodeURIComponent(row?.display_ticker || row?.canonical_asset_id || '');
  const assetId = row?.canonical_asset_id ? `?asset_id=${encodeURIComponent(row.canonical_asset_id)}` : '';
  const payload = await fetchJsonOrNull(withCacheBust(`${baseUrl}/api/v2/stocks/${ticker}/governance${assetId}`));
  const evaluation = payload?.data?.evaluation_v4;
  const ok = evaluation && typeof evaluation === 'object' && Object.keys(evaluation).length > 0;
  return {
    ok,
    check: 'governance',
    ticker: row?.display_ticker || null,
    canonical_id: row?.canonical_asset_id || null,
    evaluation_status: evaluation?.status || null,
    status: endpointStatus(payload) || null,
    reason: ok ? null : 'evaluation_v4_missing_or_null',
  };
}

async function probeBenchmark(baseUrl, ticker) {
  const payload = await fetchJsonOrNull(withCacheBust(`${baseUrl}/api/v2/stocks/${encodeURIComponent(ticker)}/historical`));
  const bars = arrayAtPath(payload?.data?.bars, payload?.bars, payload?.data?.history);
  return {
    ok: bars.length >= 252,
    check: 'benchmark_historical',
    ticker,
    bars: bars.length,
    status: endpointStatus(payload) || null,
    reason: bars.length >= 252 ? null : 'benchmark_history_lt_252',
  };
}

async function runLiveProbes(baseUrl, rows, auditResults, sampleSize) {
  const probes = [];
  const probeRows = pickProbeRows(rows, auditResults, sampleSize);
  for (const row of probeRows) {
    probes.push(await probeHistorical(baseUrl, row));
    probes.push(await probeGovernance(baseUrl, row));
  }
  for (const ticker of ['SPY', 'QQQ']) {
    const existing = probes.find((probe) => probe.check === 'historical' && probe.ticker === ticker);
    if (existing && Number(existing.bars || 0) >= 252) {
      probes.push({
        ok: true,
        check: 'benchmark_historical',
        ticker,
        bars: existing.bars,
        status: existing.status,
        reason: null,
        reused_from: 'historical_probe',
      });
    } else {
      probes.push(await probeBenchmark(baseUrl, ticker));
    }
  }
  const breakout = await fetchJsonOrNull(withCacheBust(`${baseUrl}/data/breakout/manifests/latest.json`));
  probes.push({
    ok: Boolean(breakout && typeof breakout === 'object'),
    check: 'breakout_manifest',
    status: breakout ? 'ok' : 'missing',
    reason: breakout ? null : 'breakout_manifest_missing',
  });
  return probes;
}

async function main() {
  const baseUrl = normalizeBaseUrl(argValue('--base-url', DEFAULT_BASE_URL));
  const output = path.resolve(ROOT, argValue('--output', DEFAULT_OUTPUT));
  const minPassRate = Number(argValue('--min-pass-rate', '0.90'));
  const minOperationalRateRaw = argValue('--min-operational-rate', null);
  const minOperationalRate = minOperationalRateRaw == null ? null : Number(minOperationalRateRaw);
  const gate = String(argValue('--gate', 'ui_renderable') || 'ui_renderable').toLowerCase();
  const sampleSize = Math.max(REQUIRED_PROBE_TICKERS.length, Number(argValue('--sample-size', process.env.RV_STOCK_UI_AUDIT_SAMPLE_SIZE || String(REQUIRED_PROBE_TICKERS.length))) || REQUIRED_PROBE_TICKERS.length);
  const publicStatus = await fetchJsonOrNull(`${baseUrl}/data/public-status.json`);
  const stockAnalyzer = publicStatus?.stock_analyzer && typeof publicStatus.stock_analyzer === 'object'
    ? publicStatus.stock_analyzer
    : {};
  const latest = await fetchJsonMaybeGzip(`${baseUrl}/data/page-core/latest.json`);
  const snapshotPath = String(latest.snapshot_path || '').replace(/\/+$/, '');
  if (!snapshotPath) throw new Error('PAGE_CORE_SNAPSHOT_PATH_MISSING');

  const aliases = {};
  for (let i = 0; i < 64; i += 1) {
    Object.assign(aliases, await fetchJsonMaybeGzip(`${baseUrl}${snapshotPath}/alias-shards/${aliasShardName(i)}`));
  }
  const rows = [];
  const rowsByCanonical = new Map();
  const pageShardCount = Number(latest.page_shard_count) || 256;
  for (let i = 0; i < pageShardCount; i += 1) {
    const shard = await fetchJsonMaybeGzip(`${baseUrl}${snapshotPath}/page-shards/${pageShardName(i, pageShardCount)}`);
    for (const row of Object.values(shard || {})) {
      rows.push(row);
      if (row?.canonical_asset_id) rowsByCanonical.set(String(row.canonical_asset_id), row);
    }
  }

  const failures = [];
  const falseAuthorityFailures = [];
  const falseGreenUiFailures = [];
  const auditResults = [];
  const operationalBuckets = {};
  const buckets = {};
  let denominator = 0;
  let passCount = 0;
  let operationalCount = 0;
  for (const row of rows) {
      if (!eligible(row)) continue;
      denominator += 1;
      const aliasCanonical = aliases[normalizePageCoreAlias(row?.display_ticker || '')] || null;
      const aliasFallbackRow = aliasCanonical && aliasCanonical !== row?.canonical_asset_id
        ? rowsByCanonical.get(String(aliasCanonical)) || null
        : null;
      const result = auditRow(row, latest, { aliasFallbackRow });
      auditResults.push(result);
      buckets[result.bucket] = (buckets[result.bucket] || 0) + (result.pass ? 0 : 1);
      if (result.pass) passCount += 1;
      else falseAuthorityFailures.push(result);
      if (result.false_green_ui_render) falseGreenUiFailures.push(result);
      if (result.operational) {
        operationalCount += 1;
      } else {
        operationalBuckets[result.bucket] = (operationalBuckets[result.bucket] || 0) + 1;
        failures.push(result);
      }
  }

  const publicUiRenderableRatio = Number(stockAnalyzer.ui_renderable_ratio ?? stockAnalyzer.ui_operational_ratio);
  const publicTargetableTotal = Number(stockAnalyzer.targetable_total);
  const publicUiRenderableTotal = Number(stockAnalyzer.ui_renderable_total);
  const publicContractViolations = Number(stockAnalyzer.ui_state_contract_violations);
  const overallUiReady = publicStatus?.overall_ui_ready === true || stockAnalyzer.overall_ui_ready === true;
  const liveProbes = await runLiveProbes(baseUrl, rows, auditResults, sampleSize);
  const liveProbeFailures = liveProbes.filter((probe) => !probe.ok);
  const passRate = denominator > 0 ? passCount / denominator : 0;
  const operationalRate = Number.isFinite(publicUiRenderableRatio)
    ? publicUiRenderableRatio
    : (denominator > 0 ? operationalCount / denominator : 0);
  const effectiveOperationalCount = Number.isFinite(publicUiRenderableTotal)
    ? publicUiRenderableTotal
    : operationalCount;
  const effectiveDenominator = Number.isFinite(publicTargetableTotal)
    ? publicTargetableTotal
    : denominator;
  const publicContractOk = !Number.isFinite(publicContractViolations) || publicContractViolations === 0;
  const qualitygatePass = passRate >= minPassRate
    && (minOperationalRate == null || operationalRate >= minOperationalRate)
    && overallUiReady
    && publicContractOk
    && liveProbeFailures.length === 0;
  const report = {
    schema: 'rv.stock_analyzer_ui_integrity_audit.v1',
    base_url: baseUrl,
    snapshot_id: latest.snapshot_id || null,
    run_id: latest.run_id || null,
    generated_at: new Date().toISOString(),
    denominator,
    ui_denominator: effectiveDenominator,
    pass_count: passCount,
    fail_count: failures.length,
    false_authority_fail_count: falseAuthorityFailures.length,
    false_green_ui_render_count: falseGreenUiFailures.length,
    operational_fail_count: failures.length,
    pass_rate: Number(passRate.toFixed(6)),
    operational_count: effectiveOperationalCount,
    operational_rate: Number(operationalRate.toFixed(6)),
    public_status_ui_green: publicStatus?.ui_green ?? null,
    public_status_overall_ui_ready: overallUiReady,
    public_status_stock_analyzer: stockAnalyzer,
    live_probe_count: liveProbes.length,
    live_probe_failure_count: liveProbeFailures.length,
    min_pass_rate: minPassRate,
    min_operational_rate: minOperationalRate,
    gate,
    qualitygate: qualitygatePass ? 'PASS' : 'FAIL',
    buckets,
    operational_buckets: operationalBuckets,
    live_probes: liveProbes,
    live_probe_failures: liveProbeFailures,
    false_authority_failures: falseAuthorityFailures.slice(0, 5000),
    false_green_ui_render_failures: falseGreenUiFailures.slice(0, 5000),
    failures: failures.slice(0, 5000),
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[stock-ui-integrity] ${report.qualitygate} pass_rate=${(passRate * 100).toFixed(2)}% operational_rate=${(operationalRate * 100).toFixed(2)}% denominator=${denominator} failures=${failures.length} output=${output}`);
  if (report.qualitygate !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[stock-ui-integrity] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
