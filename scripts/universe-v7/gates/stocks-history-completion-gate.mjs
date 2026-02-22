#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { loadBackfillWaivers } from '../lib/backfill-waivers.mjs';

const REPO_ROOT = process.cwd();
const BACKFILL_PROGRESS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/backfill_bucket_progress.json');
const FORECAST_PACK_COVERAGE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_coverage.json');
const API_LIMIT_LOCK_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/stocks_history_completion_gate.json');

function nowIso() {
  return new Date().toISOString();
}

function todayUtc() {
  return nowIso().slice(0, 10);
}

function toFinite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    mode: 'completion',
    enforce: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--mode') out.mode = String(argv[++i] || out.mode).trim().toLowerCase();
    else if (token === '--enforce') out.enforce = String(argv[++i] || 'completion').trim().toLowerCase();
  }
  if (!['completion', 'readiness'].includes(out.mode)) out.mode = 'completion';
  if (out.enforce && !['completion', 'readiness'].includes(out.enforce)) out.enforce = 'completion';
  return out;
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function boolResult(ok, value, reasonIfFail) {
  return {
    ok: Boolean(ok),
    value,
    reason: ok ? null : reasonIfFail
  };
}

async function readWaiverImpacts(waivedIds) {
  const out = {
    waived_total: 0,
    waived_backfill_real: 0,
    waived_with_bars: 0,
    waived_outstanding: 0,
    waived_missing_bars: 0,
    ids: []
  };
  if (!(waivedIds instanceof Set) || waivedIds.size <= 0) return out;
  if (!fsSync.existsSync(REGISTRY_PATH)) return out;

  const stream = fsSync.createReadStream(REGISTRY_PATH).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const cid = String(row?.canonical_id || '').toUpperCase();
    if (!cid || !waivedIds.has(cid)) continue;
    if (String(row?.type_norm || '').toUpperCase() !== 'STOCK') continue;
    out.waived_total += 1;
    const bars = Number(row?.bars_count || 0);
    const hasBars = Number.isFinite(bars) && bars > 0;
    const isReal = String(row?._quality_basis || '').toLowerCase() === 'backfill_real';
    if (isReal) out.waived_backfill_real += 1;
    else out.waived_outstanding += 1;
    if (hasBars) out.waived_with_bars += 1;
    else out.waived_missing_bars += 1;
    out.ids.push({
      canonical_id: cid,
      bars_count: Number.isFinite(bars) ? bars : 0,
      quality_basis: row?._quality_basis || null
    });
  }

  out.ids.sort((a, b) => String(a.canonical_id).localeCompare(String(b.canonical_id)));
  return out;
}

async function main() {
  const args = parseArgs();
  const [progressDoc, coverageDoc, lockDoc, waiverDoc] = await Promise.all([
    readJsonSafe(BACKFILL_PROGRESS_PATH, null),
    readJsonSafe(FORECAST_PACK_COVERAGE_PATH, null),
    readJsonSafe(API_LIMIT_LOCK_PATH, null),
    loadBackfillWaivers({ repoRoot: REPO_ROOT, typeFilter: 'STOCK' })
  ]);

  const stocks = Array.isArray(progressDoc?.buckets)
    ? progressDoc.buckets.find((bucket) => String(bucket?.id || '').toLowerCase() === 'stocks')
    : null;

  const totalStocks = toFinite(stocks?.last_progress?.total, 0);
  const backfillReal = toFinite(stocks?.last_progress?.backfill_real, 0);
  const withBars = toFinite(stocks?.last_progress?.with_bars, 0);
  const remaining = toFinite(stocks?.last_progress?.remaining, null);
  const waiverImpacts = await readWaiverImpacts(waiverDoc?.ids || new Set());
  const effectiveTotalStocks = Math.max(0, totalStocks - waiverImpacts.waived_total);
  const effectiveBackfillReal = Math.max(0, backfillReal - waiverImpacts.waived_backfill_real);
  const effectiveWithBars = Math.max(0, withBars - waiverImpacts.waived_with_bars);
  const effectiveRemaining = Math.max(0, (remaining ?? 0) - waiverImpacts.waived_outstanding);
  const completionByBackfill = effectiveRemaining === 0 && effectiveTotalStocks > 0;
  const completionByBars = effectiveTotalStocks > 0 && effectiveWithBars >= effectiveTotalStocks;

  const packMatch = coverageDoc?.pack_match && typeof coverageDoc.pack_match === 'object'
    ? coverageDoc.pack_match
    : {};
  const resolvedMissingInPack = toFinite(packMatch?.resolved_missing_in_pack, null);
  const resolvedFoundInPack = toFinite(packMatch?.resolved_found_in_pack, null);
  const candidates = toFinite(packMatch?.total_candidates, null);
  const completionByPack = resolvedMissingInPack === 0 && Number.isFinite(candidates) && candidates > 0;

  const lockDay = String(lockDoc?.generated_at || '').slice(0, 10) || null;
  const lockStatus = toFinite(lockDoc?.status, null);
  const activeApiLimitLockToday = lockDay === todayUtc() && Number.isFinite(lockStatus);
  const readinessByLock = !activeApiLimitLockToday;

  const checks = {
    files_present: boolResult(Boolean(progressDoc && coverageDoc), {
      backfill_progress: Boolean(progressDoc),
      forecast_pack_coverage: Boolean(coverageDoc)
    }, 'required_reports_missing'),
    stocks_remaining_zero: boolResult(completionByBackfill, remaining, 'stocks_remaining_not_zero'),
    stocks_remaining_zero_effective: boolResult(completionByBackfill, {
      raw_remaining: remaining,
      waived_outstanding: waiverImpacts.waived_outstanding,
      effective_remaining: effectiveRemaining
    }, 'stocks_remaining_not_zero_after_waivers'),
    stocks_with_bars_full: boolResult(completionByBars, { with_bars: withBars, total: totalStocks }, 'stocks_with_bars_below_total'),
    stocks_with_bars_full_effective: boolResult(completionByBars, {
      raw_with_bars: withBars,
      raw_total: totalStocks,
      waived_with_bars: waiverImpacts.waived_with_bars,
      waived_total: waiverImpacts.waived_total,
      effective_with_bars: effectiveWithBars,
      effective_total: effectiveTotalStocks
    }, 'stocks_with_bars_below_total_after_waivers'),
    pack_resolved_missing_zero: boolResult(completionByPack, {
      resolved_missing_in_pack: resolvedMissingInPack,
      resolved_found_in_pack: resolvedFoundInPack,
      total_candidates: candidates
    }, 'resolved_missing_in_pack_not_zero'),
    api_limit_lock_inactive_today: boolResult(readinessByLock, {
      active: activeApiLimitLockToday,
      lock_day: lockDay,
      lock_status: lockStatus
    }, 'api_limit_lock_active_today')
  };

  const completionOk = checks.files_present.ok
    && checks.stocks_remaining_zero_effective.ok
    && checks.stocks_with_bars_full_effective.ok
    && checks.pack_resolved_missing_zero.ok;
  const readinessOk = checks.files_present.ok && checks.api_limit_lock_inactive_today.ok;
  const modeOk = args.mode === 'readiness' ? readinessOk : completionOk;

  const report = {
    schema: 'rv_v7_stocks_history_completion_gate_v1',
    generated_at: nowIso(),
    mode: args.mode,
    enforce: args.enforce || null,
    sources: {
      backfill_progress: 'public/data/universe/v7/reports/backfill_bucket_progress.json',
      forecast_pack_coverage: 'public/data/universe/v7/reports/forecast_pack_coverage.json',
      api_limit_lock: 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json'
    },
    snapshot: {
      stocks_total: totalStocks,
      stocks_backfill_real: backfillReal,
      stocks_with_bars: withBars,
      stocks_remaining: remaining,
      pack_total_candidates: candidates,
      pack_resolved_found_in_pack: resolvedFoundInPack,
      pack_resolved_missing_in_pack: resolvedMissingInPack,
      api_limit_lock_active_today: activeApiLimitLockToday
    },
    waivers: {
      path: waiverDoc?.path ? path.relative(REPO_ROOT, waiverDoc.path) : null,
      exists: Boolean(waiverDoc?.exists),
      count: Number(waiverDoc?.ids?.size || 0),
      stock_impacts: waiverImpacts
    },
    effective_snapshot: {
      stocks_total: effectiveTotalStocks,
      stocks_backfill_real: effectiveBackfillReal,
      stocks_with_bars: effectiveWithBars,
      stocks_remaining: effectiveRemaining
    },
    checks,
    status: {
      completion_ok: completionOk,
      readiness_ok: readinessOk,
      mode_ok: modeOk
    }
  };

  await writeJsonAtomic(OUT_PATH, report);

  const out = {
    status: modeOk ? 'OK' : 'FAIL',
    code: modeOk ? 0 : 1,
    mode: args.mode,
    completion_ok: completionOk,
    readiness_ok: readinessOk,
    report: 'public/data/universe/v7/reports/stocks_history_completion_gate.json'
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);

  const enforceTarget = args.enforce || null;
  if (enforceTarget) {
    const enforceOk = enforceTarget === 'readiness' ? readinessOk : completionOk;
    if (!enforceOk) process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    reason: error?.message || String(error)
  })}\n`);
  process.exit(1);
});
