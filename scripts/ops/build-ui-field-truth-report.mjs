#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
} from './pipeline-artifact-contract.mjs';
import { classifyRuntimeFailure } from './runtime-preflight.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json');
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

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.RV_UI_TRUTH_BASE_URL || DEFAULT_BASE_URL,
    outputPath: OUTPUT_PATH,
    runId: process.env.RUN_ID || process.env.RV_RUN_ID || null,
    targetMarketDate: normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null),
    canaries: DEFAULT_CANARIES,
    timeoutMs: Math.max(1000, Number(process.env.RV_UI_TRUTH_TIMEOUT_MS || 12000)),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url' && next) {
      options.baseUrl = next;
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
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = Math.max(1000, Number(next) || options.timeoutMs);
      i += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Math.max(1000, Number(arg.split('=')[1]) || options.timeoutMs);
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
  for (const canary of options.canaries) {
    canaries.push(await checkCanary(
      options.baseUrl,
      targetMarketDate,
      canary,
      options.timeoutMs,
    ));
  }
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
  if (runtimePreflight?.ok === false && !advisory.includes('runtime_preflight_failed')) {
    advisory.push('runtime_preflight_failed');
  }

  const payload = {
    schema: 'rv.ui_field_truth_report.v1',
    schema_version: 'rv.ui_field_truth_report.v1',
    generator_id: 'scripts/ops/build-ui-field-truth-report.mjs',
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: new Date().toISOString(),
    artifact_hash: null,
    contract: {
      required_endpoints: CRITICAL_ENDPOINTS,
      optional_endpoints: OPTIONAL_ENDPOINTS,
      target_date_endpoints: ['summary', 'historical', 'historical-profile'],
      canaries: options.canaries,
    },
    summary: {
      ui_field_truth_ok: auditGreen && failures.length === 0,
      full_universe_source_ok: auditGreen,
      audit_provenance_complete: auditProvenanceComplete,
      canary_ok: failures.length === 0,
      runtime_ok: runtimePreflight?.ok !== false && runtimeFailures.length === 0,
      runtime_failure_class: runtimeFailureClass,
      runtime_failure_count: runtimeFailures.length,
      endpoint_contract_failure_count: endpointFailures.length,
      checked_canaries: canaries.length,
      failed_checks: failures.length,
      optional_advisory_count: optionalAdvisories.length,
      advisory_reasons: advisory,
    },
    full_universe_audit_ref: 'public/data/reports/stock-analyzer-universe-audit-latest.json',
    runtime_preflight_ref: 'public/data/ops/runtime-preflight-latest.json',
    runtime_preflight_ok: runtimePreflight?.ok === true,
    runtime_preflight: runtimePreflight ? {
      ok: runtimePreflight.ok === true,
      generated_at: runtimePreflight.generated_at || null,
      failure_reasons: Array.isArray(runtimePreflight.failure_reasons) ? runtimePreflight.failure_reasons : [],
    } : null,
    canaries,
    failures,
    optional_advisories: optionalAdvisories,
  };
  payload.artifact_hash = buildArtifactHash(payload);
  writeJsonAtomic(options.outputPath, payload);
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
