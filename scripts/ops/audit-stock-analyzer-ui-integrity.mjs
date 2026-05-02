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
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`FETCH_FAILED:${url}:${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = url.endsWith('.gz') ? gunzipSync(buffer).toString('utf8') : buffer.toString('utf8');
  return JSON.parse(text);
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
  const bucketSource = [...rawReasons, ...normalizedReasons, normalized?.primary_blocker]
    .find((reason) => reason && reason !== 'ui_banner_not_operational');
  const bucket = bucketReason(bucketSource || rawReasons[0] || normalizedReasons[0] || normalized?.primary_blocker);
  const operational = normalizedReasons.length === 0 && pageCoreClaimsOperational(normalized);
  const pass = !normalizedFalseGreen && EXPLAINED_BUCKETS.has(bucket);
  return {
    pass,
    operational,
    ticker: row?.display_ticker || row?.canonical_asset_id || null,
    canonical_id: row?.canonical_asset_id || null,
    raw_false_green: rawFalseGreen,
    normalized_false_green: normalizedFalseGreen,
    bucket,
    reasons: rawReasons.length ? rawReasons : normalizedReasons,
    normalized_status: normalized?.status_contract?.stock_detail_view_status || null,
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(argValue('--base-url', DEFAULT_BASE_URL));
  const output = path.resolve(ROOT, argValue('--output', DEFAULT_OUTPUT));
  const minPassRate = Number(argValue('--min-pass-rate', '0.90'));
  const minOperationalRateRaw = argValue('--min-operational-rate', null);
  const minOperationalRate = minOperationalRateRaw == null ? null : Number(minOperationalRateRaw);
  const latest = await fetchJsonMaybeGzip(`${baseUrl}/data/page-core/latest.json`);
  const snapshotPath = String(latest.snapshot_path || '').replace(/\/+$/, '');
  if (!snapshotPath) throw new Error('PAGE_CORE_SNAPSHOT_PATH_MISSING');

  const aliases = {};
  for (let i = 0; i < 64; i += 1) {
    Object.assign(aliases, await fetchJsonMaybeGzip(`${baseUrl}${snapshotPath}/alias-shards/${aliasShardName(i)}`));
  }
  const rows = [];
  const rowsByCanonical = new Map();
  for (let i = 0; i < 256; i += 1) {
    const shard = await fetchJsonMaybeGzip(`${baseUrl}${snapshotPath}/page-shards/${pageShardName(i)}`);
    for (const row of Object.values(shard || {})) {
      rows.push(row);
      if (row?.canonical_asset_id) rowsByCanonical.set(String(row.canonical_asset_id), row);
    }
  }

  const failures = [];
  const falseAuthorityFailures = [];
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
      buckets[result.bucket] = (buckets[result.bucket] || 0) + (result.pass ? 0 : 1);
      if (result.pass) passCount += 1;
      else falseAuthorityFailures.push(result);
      if (result.operational) {
        operationalCount += 1;
      } else {
        operationalBuckets[result.bucket] = (operationalBuckets[result.bucket] || 0) + 1;
        failures.push(result);
      }
  }

  const passRate = denominator > 0 ? passCount / denominator : 0;
  const operationalRate = denominator > 0 ? operationalCount / denominator : 0;
  const report = {
    schema: 'rv.stock_analyzer_ui_integrity_audit.v1',
    base_url: baseUrl,
    snapshot_id: latest.snapshot_id || null,
    run_id: latest.run_id || null,
    generated_at: new Date().toISOString(),
    denominator,
    pass_count: passCount,
    fail_count: failures.length,
    false_authority_fail_count: falseAuthorityFailures.length,
    operational_fail_count: failures.length,
    pass_rate: Number(passRate.toFixed(6)),
    operational_count: operationalCount,
    operational_rate: Number(operationalRate.toFixed(6)),
    min_pass_rate: minPassRate,
    min_operational_rate: minOperationalRate,
    qualitygate: passRate >= minPassRate && (minOperationalRate == null || operationalRate >= minOperationalRate) ? 'PASS' : 'FAIL',
    buckets,
    operational_buckets: operationalBuckets,
    false_authority_failures: falseAuthorityFailures.slice(0, 5000),
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
