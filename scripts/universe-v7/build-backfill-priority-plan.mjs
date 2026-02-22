#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { REPO_ROOT, nowIso, parseArgs, toFinite, writeJsonAtomic, pathExists } from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { readJson } from './lib/common.mjs';

const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/backfill_priority_plan.json');

function bucketIdForType(typeNorm) {
  const t = String(typeNorm || '').toUpperCase();
  if (t === 'STOCK') return 'stocks';
  if (t === 'ETF') return 'etfs';
  return 'rest';
}

function qualityRank(value) {
  const q = String(value || '').toLowerCase();
  if (q === 'backfill_real') return 3;
  if (q === 'daily_bulk_estimate') return 2;
  if (q === 'estimate') return 1;
  return 0;
}

function toSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return s || null;
}

function toDate(raw) {
  const s = String(raw || '').slice(0, 10);
  if (!s) return null;
  const ts = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ts) ? s : null;
}

function compareCandidates(a, b) {
  if (a.needs_backfill_real !== b.needs_backfill_real) return Number(b.needs_backfill_real) - Number(a.needs_backfill_real);
  if (a.needs_history_pack !== b.needs_history_pack) return Number(b.needs_history_pack) - Number(a.needs_history_pack);
  if (a.needs_200_bars !== b.needs_200_bars) return Number(b.needs_200_bars) - Number(a.needs_200_bars);
  if (a.bucket === 'stocks' && b.bucket === 'stocks') {
    const scoreA = toFinite(a.score_0_100, 0);
    const scoreB = toFinite(b.score_0_100, 0);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const volA = toFinite(a.avg_volume_30d, 0);
    const volB = toFinite(b.avg_volume_30d, 0);
    if (volA !== volB) return volB - volA;
  }
  const barsA = toFinite(a.bars_count, 0);
  const barsB = toFinite(b.bars_count, 0);
  if (barsA !== barsB) return barsA - barsB;
  const qa = qualityRank(a.quality_basis);
  const qb = qualityRank(b.quality_basis);
  if (qa !== qb) return qa - qb;
  return String(a.canonical_id || '').localeCompare(String(b.canonical_id || ''));
}

async function loadCheckpoint(checkpointPath) {
  if (!checkpointPath || !(await pathExists(checkpointPath))) {
    return { done: new Set(), pending: new Set() };
  }
  const doc = await readJson(checkpointPath).catch(() => null);
  return {
    done: new Set(Array.isArray(doc?.symbols_done) ? doc.symbols_done : []),
    pending: new Set(Array.isArray(doc?.symbols_pending) ? doc.symbols_pending : [])
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maxPerBucket = Math.max(100, Number(args['max-per-bucket'] || 5000));
  const { cfg } = await loadV7Config(args.config ? path.resolve(String(args.config)) : undefined);
  const checkpointPath = resolvePathMaybe(cfg?.resume?.checkpoint_path)
    || path.join(REPO_ROOT, 'mirrors/universe-v7/state/checkpoint.json');
  const checkpoint = await loadCheckpoint(checkpointPath);

  if (!(await pathExists(REGISTRY_PATH))) {
    throw new Error(`missing_registry:${path.relative(REPO_ROOT, REGISTRY_PATH)}`);
  }

  const stats = {
    generated_at: nowIso(),
    schema: 'rv_v7_backfill_priority_plan_v1',
    source: {
      registry: path.relative(REPO_ROOT, REGISTRY_PATH),
      checkpoint: path.relative(REPO_ROOT, checkpointPath)
    },
    budgets: {
      daily_cap_calls: toFinite(cfg?.budget?.daily_cap_calls, 95000),
      planned_order: ['stocks', 'etfs', 'rest']
    },
    buckets: {
      stocks: {
        total_rows: 0, unique_symbols: 0, with_bars: 0, with_200: 0, with_500: 0, with_2000: 0, backfill_real: 0, with_history_pack: 0,
        checkpoint_done: 0, checkpoint_pending: 0, needs_backfill_real: 0, needs_200: 0
      },
      etfs: {
        total_rows: 0, unique_symbols: 0, with_bars: 0, with_200: 0, with_500: 0, with_2000: 0, backfill_real: 0, with_history_pack: 0,
        checkpoint_done: 0, checkpoint_pending: 0, needs_backfill_real: 0, needs_200: 0
      },
      rest: {
        total_rows: 0, unique_symbols: 0, with_bars: 0, with_200: 0, with_500: 0, with_2000: 0, backfill_real: 0, with_history_pack: 0,
        checkpoint_done: 0, checkpoint_pending: 0, needs_backfill_real: 0, needs_200: 0
      }
    },
    targets: {
      stocks: [],
      etfs: [],
      rest: []
    }
  };

  const uniqueSymbols = {
    stocks: new Set(),
    etfs: new Set(),
    rest: new Set()
  };

  const stream = (await fs.open(REGISTRY_PATH, 'r')).createReadStream().pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const canonicalId = String(row?.canonical_id || '').trim();
    const symbol = toSymbol(row?.symbol);
    if (!canonicalId || !symbol) continue;
    const typeNorm = String(row?.type_norm || 'OTHER').toUpperCase();
    const bucket = bucketIdForType(typeNorm);
    const bars = Math.max(0, toFinite(row?.bars_count, 0));
    const qualityBasis = String(row?._quality_basis || row?.quality_basis || '').toLowerCase() || null;
    const hasHistoryPack = Boolean(row?.pointers?.history_pack);

    const bucketStats = stats.buckets[bucket];
    bucketStats.total_rows += 1;
    if (bars > 0) bucketStats.with_bars += 1;
    if (bars >= 200) bucketStats.with_200 += 1;
    if (bars >= 500) bucketStats.with_500 += 1;
    if (bars >= 2000) bucketStats.with_2000 += 1;
    if (qualityBasis === 'backfill_real') bucketStats.backfill_real += 1;
    if (hasHistoryPack) bucketStats.with_history_pack += 1;
    if (checkpoint.done.has(canonicalId)) bucketStats.checkpoint_done += 1;
    if (checkpoint.pending.has(canonicalId)) bucketStats.checkpoint_pending += 1;

    uniqueSymbols[bucket].add(symbol);

    const needsBackfillReal = qualityBasis !== 'backfill_real';
    const needs200Bars = bars < 200;
    const needsHistoryPack = !hasHistoryPack;
    if (needsBackfillReal) bucketStats.needs_backfill_real += 1;
    if (needs200Bars) bucketStats.needs_200 += 1;

    if (!needsBackfillReal && !needs200Bars && !needsHistoryPack) continue;

    stats.targets[bucket].push({
      canonical_id: canonicalId,
      symbol,
      exchange: String(row?.exchange || '').toUpperCase() || null,
      type_norm: typeNorm,
      bars_count: bars,
      score_0_100: toFinite(row?.score_0_100 ?? row?.computed?.score_0_100, null),
      avg_volume_30d: toFinite(row?.avg_volume_30d, 0),
      last_trade_date: toDate(row?.last_trade_date),
      quality_basis: qualityBasis || 'unknown',
      needs_backfill_real: needsBackfillReal,
      needs_200_bars: needs200Bars,
      needs_history_pack: needsHistoryPack,
      checkpoint_state: checkpoint.pending.has(canonicalId)
        ? 'pending'
        : checkpoint.done.has(canonicalId)
          ? 'done'
          : 'unknown'
    });
  }

  for (const bucket of ['stocks', 'etfs', 'rest']) {
    stats.buckets[bucket].unique_symbols = uniqueSymbols[bucket].size;
    stats.targets[bucket].sort(compareCandidates);
    stats.targets[bucket] = stats.targets[bucket].slice(0, maxPerBucket);
  }

  stats.summary = {
    total_rows: stats.buckets.stocks.total_rows + stats.buckets.etfs.total_rows + stats.buckets.rest.total_rows,
    target_rows: stats.targets.stocks.length + stats.targets.etfs.length + stats.targets.rest.length,
    priority_order: ['stocks', 'etfs', 'rest'],
    suggested_commands: [
      'node scripts/universe-v7/run-backfill-loop.mjs --env-file /Users/michaelpuchowezki/Desktop/EODHD.env --buckets stocks --max-runs-per-bucket 120 --max-no-progress-runs 3 --max-throttle-stops 3 --throttle-cooldown-ms 120000 --backfill-max 1500 --sleep-ms 2000 --skip-archeology',
      'node scripts/universe-v7/run-backfill-loop.mjs --env-file /Users/michaelpuchowezki/Desktop/EODHD.env --buckets etfs --max-runs-per-bucket 80 --max-no-progress-runs 3 --max-throttle-stops 3 --throttle-cooldown-ms 120000 --backfill-max 1500 --sleep-ms 2000 --skip-archeology',
      'node scripts/universe-v7/run-backfill-loop.mjs --env-file /Users/michaelpuchowezki/Desktop/EODHD.env --buckets rest --max-runs-per-bucket 80 --max-no-progress-runs 3 --max-throttle-stops 3 --throttle-cooldown-ms 120000 --backfill-max 1500 --sleep-ms 2000 --skip-archeology'
    ]
  };

  await writeJsonAtomic(OUT_PATH, stats);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out: path.relative(REPO_ROOT, OUT_PATH),
    max_per_bucket: maxPerBucket,
    summary: stats.summary,
    bucket_counts: {
      stocks: stats.buckets.stocks,
      etfs: stats.buckets.etfs,
      rest: stats.buckets.rest
    }
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) })}\n`);
  process.exit(1);
});

