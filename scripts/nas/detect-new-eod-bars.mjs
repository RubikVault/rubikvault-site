#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/data/ops/eod-new-bar-detection-latest.json');

const DEFAULT_POLICY = {
  schema: 'rv.eod_new_bar_detection_policy.v1',
  anchors: {
    US: ['SPY.US', 'AAPL.US'],
    EU: ['SXR8.XETRA', 'EUNL.XETRA'],
    ASIA: ['2800.HK', '1306.TSE'],
  },
  min_regions_for_global_run: 1,
  cache_ttl_minutes: 60,
  budget_max_probe_calls: 12,
};

function parseArgs(argv = process.argv.slice(2)) {
  const out = { dryRun: false, targetMarketDate: null, noWrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--no-write') out.noWrite = true;
    else if (arg === '--target-market-date' && next) {
      out.targetMarketDate = next;
      i += 1;
    } else if (arg.startsWith('--target-market-date=')) {
      out.targetMarketDate = arg.split('=').slice(1).join('=');
    }
  }
  return out;
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function isoDate(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function lastProcessedTarget() {
  const candidates = [
    'public/data/decision-core/core/manifest.json',
    'public/data/page-core/latest.json',
    'public/data/public-status.json',
  ];
  for (const rel of candidates) {
    const doc = readJsonMaybe(path.join(ROOT, rel));
    const target = isoDate(doc?.target_market_date || doc?.manifest?.target_market_date || doc?.data?.target_market_date);
    if (target) return { target, source: rel };
  }
  return { target: null, source: null };
}

function fallbackTargetFromClock() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const d = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const hour = Number(parts.hour);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6 || hour < 18) d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function latestEodDate(symbol, apiToken) {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 10);
  const url = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(symbol)}`);
  url.searchParams.set('api_token', apiToken);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('from', from.toISOString().slice(0, 10));
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`EODHD_${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body) || body.length === 0) return null;
  const dates = body.map((row) => isoDate(row?.date)).filter(Boolean).sort();
  return dates.at(-1) || null;
}

async function probeRegions(policy, apiToken) {
  const regions = {};
  let calls = 0;
  for (const [region, anchors] of Object.entries(policy.anchors)) {
    regions[region] = { latest_bar: null, anchor: null, status: 'UNPROBED', errors: [] };
    for (const anchor of anchors) {
      if (calls >= policy.budget_max_probe_calls) break;
      calls += 1;
      try {
        const latest = await latestEodDate(anchor, apiToken);
        if (latest) {
          regions[region] = { latest_bar: latest, anchor, status: 'OK', errors: [] };
          break;
        }
      } catch (error) {
        regions[region].status = 'ERROR';
        regions[region].errors.push({ anchor, error: String(error?.message || error).slice(0, 120) });
      }
    }
  }
  return { regions, calls };
}

function decide({ lastTarget, targetOverride, regions }) {
  const observed = Object.values(regions || {}).map((row) => isoDate(row.latest_bar)).filter(Boolean).sort();
  const detected = targetOverride || observed.at(-1) || fallbackTargetFromClock();
  if (!lastTarget) return { detected, decision: 'run', status: 'NEW_BAR', skip_reason: null };
  if (detected > lastTarget) return { detected, decision: 'run', status: 'NEW_BAR', skip_reason: null };
  return { detected, decision: 'skip', status: 'NO_NEW_BAR', skip_reason: 'no_new_bar' };
}

async function main() {
  const args = parseArgs();
  const token = process.env[`EODHD_${'API_KEY'}`] || process.env[`EODHD_${'API_TOKEN'}`] || '';
  const last = lastProcessedTarget();
  const policy = DEFAULT_POLICY;
  let regions = {};
  let calls = 0;
  let degradedReason = null;
  if (token && !args.targetMarketDate) {
    const probed = await probeRegions(policy, token);
    regions = probed.regions;
    calls = probed.calls;
  } else {
    degradedReason = token ? 'target_override_used' : 'missing_eodhd_api_token';
    for (const region of Object.keys(policy.anchors)) {
      regions[region] = { latest_bar: args.targetMarketDate || null, anchor: policy.anchors[region][0], status: 'DEGRADED', errors: degradedReason ? [degradedReason] : [] };
    }
  }
  const d = decide({ lastTarget: last.target, targetOverride: args.targetMarketDate, regions });
  const okRegions = Object.values(regions).filter((row) => row.status === 'OK' && row.latest_bar).length;
  const doc = {
    schema: 'rv.eod_new_bar_detection.v1',
    generated_at: new Date().toISOString(),
    status: degradedReason && !args.targetMarketDate ? 'DEGRADED' : d.status,
    decision: d.decision,
    skip_reason: d.skip_reason,
    last_processed_target_market_date: last.target,
    last_processed_source: last.source,
    detected_target_market_date: d.detected,
    regions,
    probe_calls_used: calls,
    budget_guard_ok: calls <= policy.budget_max_probe_calls,
    min_regions_for_global_run: policy.min_regions_for_global_run,
    observed_regions_ok: okRegions,
    dry_run: args.dryRun,
    degraded_reason: degradedReason,
    policy,
  };
  if (!args.noWrite) writeJsonAtomic(OUT, doc);
  console.log(JSON.stringify({
    status: doc.status,
    decision: doc.decision,
    last_processed_target_market_date: doc.last_processed_target_market_date,
    detected_target_market_date: doc.detected_target_market_date,
    degraded_reason: doc.degraded_reason,
  }));
}

main().catch((error) => {
  const doc = {
    schema: 'rv.eod_new_bar_detection.v1',
    generated_at: new Date().toISOString(),
    status: 'PROVIDER_BLOCKED',
    decision: 'skip',
    skip_reason: 'new_bar_detection_failed',
    error: String(error?.stack || error).slice(0, 2000),
    policy: DEFAULT_POLICY,
  };
  writeJsonAtomic(OUT, doc);
  console.error(JSON.stringify({ status: doc.status, skip_reason: doc.skip_reason, error: String(error?.message || error) }));
  process.exitCode = 1;
});
