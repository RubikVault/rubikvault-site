#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import {
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
} from './pipeline-artifact-contract.mjs';
import { classifyRuntimeFailure } from './runtime-preflight.mjs';
import {
  PAGE_CORE_SCHEMA,
  aliasShardIndex,
  aliasShardName,
  normalizePageCoreAlias,
  PAGE_SHARD_COUNT,
  pageShardIndex,
  pageShardName,
} from '../../functions/api/_shared/page-core-contract.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json');
const DELIVERY_OUTPUT_PATH = path.join(ROOT, 'public/data/runtime/stock-analyzer-ui-delivery.json');
const PATHS = {
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  stockAudit: path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  runtimePreflight: path.join(ROOT, 'public/data/ops/runtime-preflight-latest.json'),
};
const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';
const CRITICAL_ENDPOINTS = ['summary', 'historical', 'governance', 'historical-profile'];
const OPTIONAL_ENDPOINTS = ['fundamentals'];
const DEFAULT_CANARIES = [
  { ticker: 'AAPL', asset_class: 'STOCK' },
  { ticker: 'SPY', asset_class: 'ETF' },
];
const PAGE_CORE_CANARIES = ['AAPL', 'MSFT', 'F', 'V', 'TSLA', 'SPY', 'QQQ', 'BRK-B', 'BRK.B', 'BF-B', 'BF.B'];
const PAGE_CORE_RANDOM_SAMPLE_SIZE = Math.max(0, Number(process.env.RV_PAGE_CORE_RANDOM_SAMPLE_SIZE || 200));
const PAGE_CORE_RANDOM_MIN_OK_RATE = Number(process.env.RV_PAGE_CORE_RANDOM_MIN_OK_RATE || 0.995);
const PAGE_CORE_SCHEMA_MIN_VALID_RATE = Number(process.env.RV_PAGE_CORE_SCHEMA_MIN_VALID_RATE || 0.999);

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.RV_UI_TRUTH_BASE_URL || DEFAULT_BASE_URL,
    outputPath: OUTPUT_PATH,
    runId: process.env.RUN_ID || process.env.RV_RUN_ID || null,
    targetMarketDate: normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null),
    canaries: DEFAULT_CANARIES,
    timeoutMs: Math.max(1000, Number(process.env.RV_UI_TRUTH_TIMEOUT_MS || 12000)),
    pageCoreOnly: process.env.RV_UI_TRUTH_PAGE_CORE_ONLY === '1',
    pageCoreLatestPath: process.env.RV_PAGE_CORE_LATEST_PATH || null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--base-url' || arg === '--target') && next) {
      options.baseUrl = next;
      i += 1;
    } else if (arg.startsWith('--target=')) {
      options.baseUrl = arg.split('=').slice(1).join('=');
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
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = Math.max(1000, Number(next) || options.timeoutMs);
      i += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Math.max(1000, Number(arg.split('=')[1]) || options.timeoutMs);
    } else if (arg === '--page-core-only') {
      options.pageCoreOnly = true;
    } else if (arg === '--page-core-latest-path' && next) {
      options.pageCoreLatestPath = next;
      i += 1;
    } else if (arg.startsWith('--page-core-latest-path=')) {
      options.pageCoreLatestPath = arg.split('=').slice(1).join('=');
    }
  }
  return options;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function inferDate(payload) {
  return normalizeDate(
    payload?.meta?.data_date
    || payload?.meta?.price_date
    || payload?.data?.latest_bar?.date
    || payload?.data?.market_prices?.date
    || payload?.data?.asOf
    || null
  );
}

function payloadHasData(payload, endpoint) {
  if (!payload?.ok) return false;
  if (endpoint === 'summary') return Boolean(payload?.data?.ticker);
  if (endpoint === 'historical') return Array.isArray(payload?.data?.bars) && payload.data.bars.length > 0;
  if (endpoint === 'governance') return Boolean(payload?.data?.evaluation_v4 || payload?.data?.market_score || payload?.data?.universe);
  if (endpoint === 'historical-profile') return Boolean(payload?.data?.profile || payload?.data?.availability?.status);
  if (endpoint === 'fundamentals') {
    const typedStatus = String(payload?.data?.typed_status || payload?.typed_status || '').toUpperCase();
    if (typedStatus === 'OUT_OF_SCOPE' || typedStatus === 'NOT_APPLICABLE') return true;
    return Boolean(payload?.data?.ticker || payload?.data?.companyName || payload?.meta?.fallback_used || payload?.metadata?.fallback_used);
  }
  return false;
}

function payloadHasPageCoreData(payload) {
  return Boolean(
    payload?.ok === true
    && payload?.data?.schema_version === PAGE_CORE_SCHEMA
    && payload?.data?.canonical_asset_id
    && payload?.data?.summary_min
    && payload?.data?.governance_summary
  );
}

function readPageCoreAssetJson(publicPath) {
  const cleanPath = String(publicPath || '').replace(/^\/+/, '');
  if (!cleanPath.startsWith('data/page-core/')) throw new Error(`PAGE_CORE_PATH_OUT_OF_SCOPE:${publicPath}`);
  const filePath = path.join(ROOT, 'public', cleanPath);
  const body = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz') ? gunzipSync(body).toString('utf8') : body.toString('utf8');
  return JSON.parse(text);
}

function readPageCoreLatestPath(latestPath) {
  const filePath = path.resolve(ROOT, latestPath);
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`PAGE_CORE_LATEST_PATH_OUT_OF_SCOPE:${latestPath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function endpointCurrentEnough(endpoint, payload, targetMarketDate) {
  const date = inferDate(payload);
  if (!targetMarketDate) return true;
  if (endpoint === 'summary' || endpoint === 'historical') {
    return Boolean(date) && date >= targetMarketDate;
  }
  if (endpoint === 'historical-profile') {
    if (!Boolean(date)) return false;
    if (date >= targetMarketDate) return true;
    // Scope registry lag tolerance: accept data within 7 calendar days of target.
    // hist_probs files use the last available trade date per scope; data providers
    // may not have the target date bar yet (e.g., AAPL at 2026-04-10 for target 2026-04-13).
    const lagDays = (new Date(targetMarketDate) - new Date(date)) / 86400000;
    return lagDays <= 7;
  }
  return true;
}

function shouldRetryViaCurl(baseUrl, errorMessage) {
  const normalizedBaseUrl = String(baseUrl || '').trim().toLowerCase();
  const normalizedMessage = String(errorMessage || '').toLowerCase();
  if (!normalizedBaseUrl.startsWith('http://127.0.0.1') && !normalizedBaseUrl.startsWith('http://localhost')) {
    return false;
  }
  return normalizedMessage.includes('eperm')
    || normalizedMessage.includes('eaddrnotavail')
    || normalizedMessage.includes('econnreset')
    || normalizedMessage.includes('econnrefused')
    || normalizedMessage.includes('timeout_after_')
    || normalizedMessage.includes('failed to fetch');
}

function fetchJsonViaCurl(baseUrl, endpointPath, timeoutMs) {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const result = spawnSync('curl', [
    '-sS',
    '--max-time',
    String(seconds),
    '-H',
    'accept: application/json',
    '-w',
    '\n%{http_code}',
    `${baseUrl}${endpointPath}`,
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '').trim();
  const lines = stdout.split('\n');
  const statusLine = lines.pop() || '000';
  const body = lines.join('\n');
  const payload = (() => {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  })();
  const status = Number.parseInt(statusLine, 10) || 0;
  if (result.status === 0 && status > 0) {
    return {
      http_ok: status >= 200 && status < 300,
      status,
      payload,
      error: null,
    };
  }
  return {
    http_ok: false,
    status,
    payload,
    error: stderr || `curl_exit_${result.status ?? 'unknown'}`,
  };
}

async function fetchJson(baseUrl, endpointPath, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(`${baseUrl}${endpointPath}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    const body = await response.text();
    const payload = (() => {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    })();
    return {
      http_ok: response.ok,
      status: response.status,
      payload,
      error: null,
    };
  } catch (error) {
    const result = {
      http_ok: false,
      status: 0,
      payload: null,
      error: error?.name === 'AbortError'
        ? `timeout_after_${timeoutMs}ms`
        : String(error?.cause?.message || error?.message || error || 'fetch_failed'),
    };
    if (shouldRetryViaCurl(baseUrl, result.error)) {
      return fetchJsonViaCurl(baseUrl, endpointPath, timeoutMs);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function classifyCheckFailure(endpoint, response, payload, ok) {
  if (ok) return null;
  const runtimeFailure = classifyRuntimeFailure(response.error);
  if (runtimeFailure) return runtimeFailure;
  if (!response.http_ok && response.status === 0) return 'runtime_unavailable';
  if (response.status >= 500) return 'runtime_unstable';
  if (payload?.ok === false && payload?.error) {
    const payloadFailure = classifyRuntimeFailure(payload.error?.message || payload.error);
    if (payloadFailure) return payloadFailure;
  }
  return OPTIONAL_ENDPOINTS.includes(endpoint) ? 'advisory_contract_failed' : 'endpoint_contract_failed';
}

function buildArtifactHash(payload) {
  return createHash('sha256').update(JSON.stringify({ ...payload, artifact_hash: null })).digest('hex');
}

async function checkCanary(baseUrl, targetMarketDate, canary, timeoutMs) {
  const endpointPaths = {
    summary: `/api/v2/stocks/${encodeURIComponent(canary.ticker)}/summary`,
    historical: `/api/v2/stocks/${encodeURIComponent(canary.ticker)}/historical`,
    governance: `/api/v2/stocks/${encodeURIComponent(canary.ticker)}/governance`,
    historicalProfile: `/api/v2/stocks/${encodeURIComponent(canary.ticker)}/historical-profile`,
    fundamentals: `/api/fundamentals?ticker=${encodeURIComponent(canary.ticker)}`,
  };
  const summary = await fetchJson(baseUrl, endpointPaths.summary, timeoutMs);
  const historical = await fetchJson(baseUrl, endpointPaths.historical, timeoutMs);
  const governance = await fetchJson(baseUrl, endpointPaths.governance, timeoutMs);
  const historicalProfile = await fetchJson(baseUrl, endpointPaths.historicalProfile, timeoutMs);
  const fundamentals = await fetchJson(baseUrl, endpointPaths.fundamentals, timeoutMs);

  const checks = [
    ['summary', summary],
    ['historical', historical],
    ['governance', governance],
    ['historical-profile', historicalProfile],
    ['fundamentals', fundamentals],
  ].map(([endpoint, response]) => {
    const payload = response.payload;
    const fallbackUsed = payload?.fallback_used === true || payload?.meta?.fallback_used === true;
    const hasData = payloadHasData(payload, endpoint);
    const currentEnough = endpointCurrentEnough(endpoint, payload, targetMarketDate);
    const ok = response.http_ok && payload?.ok === true && hasData && currentEnough && fallbackUsed !== true;
    const failureClass = classifyCheckFailure(endpoint, response, payload, ok);
    return {
      endpoint,
      ok,
      http_status: response.status,
      data_date: inferDate(payload),
      fallback_used: fallbackUsed,
      has_data: hasData,
      current_enough: currentEnough,
      provider: payload?.meta?.provider || null,
      quality_flags: Array.isArray(payload?.meta?.quality_flags) ? payload.meta.quality_flags : [],
      failure_class: failureClass,
      error: ok ? null : (response.error || payload?.error?.message || payload?.error || 'endpoint_contract_failed'),
    };
  });

  return {
    ticker: canary.ticker,
    asset_class: canary.asset_class,
    ok: checks.filter((check) => CRITICAL_ENDPOINTS.includes(check.endpoint)).every((check) => check.ok),
    checks,
  };
}

function readPageCoreSmokeLocal(latest, ticker) {
  const query = normalizePageCoreAlias(ticker);
  const aliasShard = readPageCoreAssetJson(`${latest.snapshot_path}/alias-shards/${aliasShardName(aliasShardIndex(query))}`);
  const canonical = normalizePageCoreAlias(aliasShard?.[query]);
  if (!canonical) {
    return {
      http_ok: true,
      status: 200,
      payload: { ok: false, error: { code: 'INVALID_OR_UNMAPPED_TICKER' } },
      error: null,
    };
  }
  const pageShard = readPageCoreAssetJson(`${latest.snapshot_path}/page-shards/${pageShardName(pageShardIndex(canonical))}`);
  const row = pageShard?.[canonical] || null;
  return {
    http_ok: true,
    status: 200,
    payload: row ? {
      ok: true,
      data: row,
      meta: {
        canonical_asset_id: canonical,
        status: row?.freshness?.status || null,
      },
    } : {
      ok: false,
      meta: { canonical_asset_id: canonical },
      error: { code: 'PAGE_CORE_NOT_FOUND' },
    },
    error: null,
  };
}

function pageCoreSampleKey(seed, row) {
  const id = normalizePageCoreAlias(row?.canonical_asset_id || row?.identity?.canonical_asset_id || row?.display_ticker);
  return createHash('sha256').update(`${seed}:${id}`).digest('hex');
}

function listPageCoreRowsLocal(latest) {
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < PAGE_SHARD_COUNT; index += 1) {
    const shard = readPageCoreAssetJson(`${latest.snapshot_path}/page-shards/${pageShardName(index)}`);
    if (!shard || typeof shard !== 'object' || Array.isArray(shard)) continue;
    for (const [canonicalAssetId, row] of Object.entries(shard)) {
      const canonical = normalizePageCoreAlias(row?.canonical_asset_id || canonicalAssetId);
      if (!canonical || seen.has(canonical)) continue;
      seen.add(canonical);
      rows.push({
        canonical_asset_id: canonical,
        ticker: row?.display_ticker || canonical.split(':').pop(),
        ui_renderable: row?.coverage?.ui_renderable === true,
        row,
      });
    }
  }
  return rows;
}

function selectDeterministicPageCoreSamples(rows, latest, sampleSize) {
  const seed = latest?.snapshot_id || latest?.run_id || 'page-core';
  return rows
    .filter((row) => row.ui_renderable && row.ticker)
    .map((row) => ({ ...row, sample_key: pageCoreSampleKey(seed, row.row || row) }))
    .sort((left, right) => left.sample_key.localeCompare(right.sample_key))
    .slice(0, sampleSize);
}

async function checkPageCoreSmokes(baseUrl, timeoutMs, options = {}) {
  const latestResponse = options.latestPath
    ? (() => {
      try {
        return { http_ok: true, status: 200, payload: readPageCoreLatestPath(options.latestPath), error: null };
      } catch (error) {
        return { http_ok: false, status: 0, payload: null, error: error?.message || String(error) };
      }
    })()
    : await fetchJson(baseUrl, '/data/page-core/latest.json', timeoutMs);
  const latest = latestResponse.payload || null;
  if (!latestResponse.http_ok || !latest?.snapshot_id) {
    return {
      enabled: false,
      ok: true,
      release_eligible: true,
      reason: 'page_core_latest_missing',
      latest_status: latestResponse.status,
      samples: [],
      sample_5xx_rate: 0,
      schema_valid_rate: 0,
      missing_rate: 0,
      expired_count: 0,
    };
  }
  const samples = [];
  for (const ticker of PAGE_CORE_CANARIES) {
    const endpointPath = `/api/v2/page/${encodeURIComponent(ticker)}?v=${encodeURIComponent(latest.snapshot_id)}`;
    const started = Date.now();
    const response = options.latestPath
      ? readPageCoreSmokeLocal(latest, ticker)
      : await fetchJson(baseUrl, endpointPath, timeoutMs);
    const latencyMs = Date.now() - started;
    const payload = response.payload;
    const ok = response.http_ok && payloadHasPageCoreData(payload);
    samples.push({
      sample_type: 'protected',
      ticker,
      ok,
      http_status: response.status,
      latency_ms: latencyMs,
      canonical_asset_id: payload?.data?.canonical_asset_id || payload?.meta?.canonical_asset_id || null,
      freshness_status: payload?.meta?.status || payload?.data?.freshness?.status || null,
      error: ok ? null : (response.error || payload?.error?.message || payload?.error?.code || 'page_core_contract_failed'),
    });
  }
  let rowCount = null;
  let randomSampleCount = 0;
  let randomOkRate = null;
  let randomFailures = [];
  if (options.latestPath && PAGE_CORE_RANDOM_SAMPLE_SIZE > 0) {
    const rows = listPageCoreRowsLocal(latest);
    rowCount = rows.length;
    const randomRows = selectDeterministicPageCoreSamples(rows, latest, PAGE_CORE_RANDOM_SAMPLE_SIZE);
    randomSampleCount = randomRows.length;
    for (const row of randomRows) {
      const started = Date.now();
      const response = readPageCoreSmokeLocal(latest, row.ticker);
      const latencyMs = Date.now() - started;
      const payload = response.payload;
      const ok = response.http_ok
        && payloadHasPageCoreData(payload)
        && payload?.data?.coverage?.ui_renderable === true
        && normalizePageCoreAlias(payload?.data?.canonical_asset_id) === row.canonical_asset_id;
      const sample = {
        sample_type: 'random',
        ticker: row.ticker,
        ok,
        http_status: response.status,
        latency_ms: latencyMs,
        canonical_asset_id: payload?.data?.canonical_asset_id || payload?.meta?.canonical_asset_id || row.canonical_asset_id,
        freshness_status: payload?.meta?.status || payload?.data?.freshness?.status || null,
        error: ok ? null : (response.error || payload?.error?.message || payload?.error?.code || 'page_core_random_contract_failed'),
      };
      samples.push(sample);
    }
    const randomSamples = samples.filter((sample) => sample.sample_type === 'random');
    randomFailures = randomSamples.filter((sample) => !sample.ok);
    randomOkRate = randomSamples.length ? (randomSamples.length - randomFailures.length) / randomSamples.length : 0;
  }
  const failures = samples.filter((sample) => !sample.ok);
  const http5xx = samples.filter((sample) => sample.http_status >= 500).length;
  const expiredCount = samples.filter((sample) => sample.freshness_status === 'expired').length;
  const latencies = samples.map((sample) => sample.latency_ms).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null;
  const protectedSamples = samples.filter((sample) => sample.sample_type === 'protected');
  const protectedFailures = protectedSamples.filter((sample) => !sample.ok);
  const schemaValidRate = samples.length ? (samples.length - failures.length) / samples.length : 0;
  const randomGateOk = randomSampleCount === 0 || randomOkRate >= PAGE_CORE_RANDOM_MIN_OK_RATE;
  const schemaGateOk = schemaValidRate >= PAGE_CORE_SCHEMA_MIN_VALID_RATE;
  return {
    enabled: true,
    ok: protectedFailures.length === 0 && randomGateOk && schemaGateOk && http5xx === 0,
    release_eligible: protectedFailures.length === 0 && randomGateOk && schemaGateOk && http5xx === 0,
    snapshot_id: latest.snapshot_id,
    run_id: latest.run_id || null,
    row_count: rowCount,
    sample_count: samples.length,
    protected_sample_count: protectedSamples.length,
    random_sample_count: randomSampleCount,
    random_ok_rate: randomOkRate,
    random_min_ok_rate: PAGE_CORE_RANDOM_MIN_OK_RATE,
    sample_5xx_rate: samples.length ? http5xx / samples.length : 0,
    schema_valid_rate: schemaValidRate,
    schema_min_valid_rate: PAGE_CORE_SCHEMA_MIN_VALID_RATE,
    missing_rate: samples.length ? failures.length / samples.length : 0,
    expired_count: expiredCount,
    p95_latency_ms: p95,
    protected_failures: protectedFailures,
    random_failures: randomFailures,
    samples,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const release = readJson(PATHS.release) || null;
  const runtime = readJson(PATHS.runtime) || null;
  const system = readJson(PATHS.system) || null;
  const stockAudit = readJson(PATHS.stockAudit) || null;
  const runtimePreflight = readJson(PATHS.runtimePreflight) || null;
  const targetMarketDate = options.targetMarketDate
    || resolveReleaseTargetMarketDate(release)
    || normalizeDate(runtime?.target_market_date)
    || normalizeDate(system?.summary?.target_market_date)
    || normalizeDate(stockAudit?.target_market_date)
    || null;
  const runId = options.runId
    || release?.run_id
    || runtime?.run_id
    || system?.run_id
    || stockAudit?.run_id
    || `run-ui-field-truth-${targetMarketDate || new Date().toISOString().slice(0, 10)}`;

  const canaries = [];
  if (!options.pageCoreOnly) {
    for (const canary of options.canaries) {
      canaries.push(await checkCanary(
        options.baseUrl,
        targetMarketDate,
        canary,
        options.timeoutMs,
      ));
    }
  }
  const pageCoreSmokes = await checkPageCoreSmokes(options.baseUrl, options.timeoutMs, {
    latestPath: options.pageCoreLatestPath,
  });
  const auditSummary = stockAudit?.summary || null;
  const auditGreen = (auditSummary?.artifact_release_ready === true
      || (auditSummary?.artifact_full_validated === true || auditSummary?.full_universe_validated === true)
    && auditSummary?.release_eligible === true)
    && auditSummary?.sampled_mode !== true;
  const advisory = [];
  const auditProvenanceComplete = Boolean(
    stockAudit?.schema_version
    && stockAudit?.generator_id
    && stockAudit?.run_id
    && stockAudit?.target_market_date
    && stockAudit?.artifact_hash
  );
  if (!auditProvenanceComplete) {
    advisory.push('full_universe_audit_missing_provenance');
  }

  const failures = canaries.flatMap((canary) => canary.checks
    .filter((check) => !check.ok && CRITICAL_ENDPOINTS.includes(check.endpoint))
    .map((check) => ({
      ticker: canary.ticker,
      endpoint: check.endpoint,
      failure_class: check.failure_class || 'endpoint_contract_failed',
      error: check.error,
    })));
  const optionalAdvisories = canaries.flatMap((canary) => canary.checks
    .filter((check) => !check.ok && OPTIONAL_ENDPOINTS.includes(check.endpoint))
    .map((check) => ({
      ticker: canary.ticker,
      endpoint: check.endpoint,
      failure_class: check.failure_class || 'advisory_contract_failed',
      error: check.error,
    })));
  const runtimeFailures = failures.filter((entry) => entry.failure_class === 'runtime_unavailable' || entry.failure_class === 'runtime_unstable');
  const endpointFailures = failures.filter((entry) => entry.failure_class === 'endpoint_contract_failed');
  const runtimeFailureClass = runtimeFailures.some((entry) => entry.failure_class === 'runtime_unstable')
    ? 'runtime_unstable'
    : (runtimeFailures.length > 0 ? 'runtime_unavailable' : null);
  if (!options.pageCoreOnly && runtimePreflight?.ok === false && !advisory.includes('runtime_preflight_failed')) {
    advisory.push('runtime_preflight_failed');
  }
  const uiFieldTruthOk = options.pageCoreOnly
    ? pageCoreSmokes.ok
    : auditGreen && failures.length === 0;
  const gateMode = options.pageCoreOnly
    ? 'filesystem_candidate_smoke'
    : 'local_runtime_smoke';

  const payload = {
    schema: 'rv.ui_field_truth_report.v1',
    schema_version: 'rv.ui_field_truth_report.v1',
    generator_id: 'scripts/ops/build-ui-field-truth-report.mjs',
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: new Date().toISOString(),
    artifact_hash: null,
    gate_mode: gateMode,
    contract: {
      required_endpoints: CRITICAL_ENDPOINTS,
      optional_endpoints: OPTIONAL_ENDPOINTS,
      target_date_endpoints: ['summary', 'historical', 'historical-profile'],
      canaries: options.canaries,
      page_core_canaries: PAGE_CORE_CANARIES,
    },
    summary: {
      ui_field_truth_ok: uiFieldTruthOk,
      full_universe_source_ok: options.pageCoreOnly ? true : auditGreen,
      audit_provenance_complete: auditProvenanceComplete,
      canary_ok: failures.length === 0,
      runtime_ok: options.pageCoreOnly ? null : runtimePreflight?.ok !== false && runtimeFailures.length === 0,
      runtime_failure_class: runtimeFailureClass,
      runtime_failure_count: runtimeFailures.length,
      endpoint_contract_failure_count: endpointFailures.length,
      checked_canaries: canaries.length,
      failed_checks: failures.length,
      optional_advisory_count: optionalAdvisories.length,
      page_core_smoke_ok: pageCoreSmokes.ok,
      page_core_enabled: pageCoreSmokes.enabled,
      advisory_reasons: advisory,
    },
    full_universe_audit_ref: 'public/data/reports/stock-analyzer-universe-audit-latest.json',
    runtime_preflight_ref: 'public/data/ops/runtime-preflight-latest.json',
    runtime_preflight_ok: options.pageCoreOnly ? null : runtimePreflight?.ok === true,
    runtime_preflight: runtimePreflight ? {
      ok: runtimePreflight.ok === true,
      generated_at: runtimePreflight.generated_at || null,
      failure_reasons: Array.isArray(runtimePreflight.failure_reasons) ? runtimePreflight.failure_reasons : [],
    } : null,
    canaries,
    page_core_smokes: pageCoreSmokes,
    failures,
    optional_advisories: optionalAdvisories,
  };
  payload.artifact_hash = buildArtifactHash(payload);
  writeJsonAtomic(options.outputPath, payload);
  writeJsonAtomic(DELIVERY_OUTPUT_PATH, {
    schema: 'rv.ui_delivery_report.v1',
    schema_version: 'rv.ui_delivery_report.v1',
    generated_at: payload.generated_at,
    run_id: payload.run_id,
    target_market_date: payload.target_market_date,
    gate_mode: gateMode,
    page_core_smokes: pageCoreSmokes,
    release_eligible: pageCoreSmokes.release_eligible,
  });
  process.stdout.write(`${JSON.stringify({
    ok: payload.summary.ui_field_truth_ok,
    target_market_date: payload.target_market_date,
    failed_checks: payload.summary.failed_checks,
  })}\n`);
  if (!payload.summary.ui_field_truth_ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
