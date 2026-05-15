#!/usr/bin/env node
/**
 * audit-degraded-assets.mjs
 *
 * Walks every page-shard of the current page-core snapshot, classifies each
 * row that is not all_systems_operational by primary_blocker / strict
 * reasons, and emits a single audit artifact at
 * public/data/ops/degraded-asset-audit-latest.json.
 *
 * Why not samples.degraded? build-stock-analyzer-ui-state-summary.mjs:341
 * caps the embedded sample at 50 — useful for UI, useless for closing a
 * 322-asset coverage gap. This script reads the full shard set instead so
 * every degraded canonical_id appears with its reason.
 *
 * Buckets:
 *   fixable_by_rebuild : reasons that come from internal modules and clear
 *                        once a producer is re-run (model_coverage_incomplete,
 *                        historical_profile_not_ready, key_levels_not_ready,
 *                        missing_market_stats_basis).
 *   provider_exception : reasons that originate at the data provider
 *                        (bars_stale, null_price, insufficient_history,
 *                        provider_or_data_reason, stale_price). Probe via
 *                        scripts/ops/build-stock-analyzer-provider-exceptions.mjs
 *                        --audit-mode to confirm before classification.
 *   needs_review       : everything else.
 *
 * Schema: rv.degraded_asset_audit.v1
 *
 * CLI:
 *   node scripts/ops/audit-degraded-assets.mjs \
 *        [--page-core-root public/data/page-core] \
 *        [--target-market-date 2026-05-14] \
 *        [--output public/data/ops/degraded-asset-audit-latest.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const PAGE_CORE_ROOT = path.resolve(ROOT, getArg('page-core-root') || 'public/data/page-core');
const OUTPUT_PATH = path.resolve(ROOT, getArg('output') || 'public/data/ops/degraded-asset-audit-latest.json');

const FIXABLE_REASONS = new Set([
  'model_coverage_incomplete',
  'historical_profile_not_ready',
  'key_levels_not_ready',
  'missing_market_stats_basis',
  'missing_market_stats_values',
  'missing_price_source',
  'missing_stats_source',
  'missing_latest_bar_date',
  'missing_price_date',
  'missing_stats_date',
  'decision_bundle_missing',
  'decision_not_operational',
  'ui_not_renderable',
  'ui_banner_not_operational',
]);

const PROVIDER_REASONS = new Set([
  'bars_stale',
  'null_price',
  'insufficient_history',
  'provider_or_data_reason',
  'stale_price',
  'price_below_min',
  'price_latest_bar_date_mismatch',
  'stats_latest_bar_date_mismatch',
  'freshness_stale',
  'freshness_expired',
  'freshness_missing',
  'freshness_last_good',
  'freshness_error',
]);

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readGzipJsonMaybe(filePath) {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
  } catch {
    return null;
  }
}

function loadSnapshotMeta() {
  const latest = readJsonMaybe(path.join(PAGE_CORE_ROOT, 'latest.json'));
  if (!latest) throw new Error(`page-core latest.json missing under ${PAGE_CORE_ROOT}`);
  const targetOverride = getArg('target-market-date');
  const target = targetOverride || latest.target_market_date;
  if (!target) throw new Error('target_market_date not resolvable from latest.json or --target-market-date');
  const snapshotPath = latest.snapshot_path || (latest.snapshot_id ? `data/page-core/snapshots/${target}/${latest.snapshot_id}` : null);
  if (!snapshotPath) throw new Error('snapshot_path missing in latest.json');
  // snapshot_path may be /data/... (web rooted) — normalize to filesystem.
  const trimmed = snapshotPath.replace(/^\/+/, '');
  const fsRoot = trimmed.startsWith('data/') ? path.join(ROOT, 'public', trimmed) : path.join(ROOT, trimmed);
  return { target, snapshotDir: fsRoot, snapshotId: latest.snapshot_id, generatedAt: latest.generated_at };
}

function* iteratePageShards(snapshotDir) {
  const pageDir = path.join(snapshotDir, 'page-shards');
  if (!fs.existsSync(pageDir)) throw new Error(`page-shards directory missing under ${pageDir}`);
  for (const entry of fs.readdirSync(pageDir)) {
    if (!entry.endsWith('.json.gz') && !entry.endsWith('.json')) continue;
    const filePath = path.join(pageDir, entry);
    const doc = entry.endsWith('.gz') ? readGzipJsonMaybe(filePath) : readJsonMaybe(filePath);
    if (!doc || typeof doc !== 'object') continue;
    for (const [canonicalId, row] of Object.entries(doc)) {
      if (!row || typeof row !== 'object') continue;
      yield { canonicalId, row, shard: entry };
    }
  }
}

function classifyRow(row) {
  const reasons = [];
  const contractReasons = Array.isArray(row?.status_contract?.strict_blocking_reasons)
    ? row.status_contract.strict_blocking_reasons
    : [];
  for (const r of contractReasons) reasons.push(String(r));
  if (row?.primary_blocker) reasons.push(`primary_blocker:${row.primary_blocker}`);
  const banner = String(row?.ui_banner_state || row?.status_contract?.banner_state || '').toLowerCase();
  if (banner === 'all_systems_operational') return null;
  // Treat primary_blocker:<reason> as another classification signal so a row
  // whose only signal is "primary_blocker:decision_bundle_missing" still
  // buckets correctly without needing a redundant strict_blocking_reasons.
  const flatReasons = reasons
    .map((r) => r.toLowerCase().replace(/^primary_blocker:/, ''));
  const hasFixable = flatReasons.some((r) => FIXABLE_REASONS.has(r));
  const hasProvider = flatReasons.some((r) => PROVIDER_REASONS.has(r));
  let bucket = 'needs_review';
  if (hasProvider && !hasFixable) bucket = 'provider_exception';
  else if (hasFixable && !hasProvider) bucket = 'fixable_by_rebuild';
  else if (hasFixable && hasProvider) bucket = 'fixable_by_rebuild'; // rebuild may resolve provider downstream
  return { reasons, banner, bucket, primary: row?.primary_blocker || null };
}

function main() {
  const meta = loadSnapshotMeta();
  const totals = {
    scanned: 0,
    operational: 0,
    degraded: 0,
    provider_exception: 0,
    fixable_by_rebuild: 0,
    needs_review: 0,
  };
  const reasonCounts = new Map();
  const primaryCounts = new Map();
  const sample = { fixable_by_rebuild: [], provider_exception: [], needs_review: [] };
  const idsByBucket = { fixable_by_rebuild: [], provider_exception: [], needs_review: [] };

  for (const { canonicalId, row } of iteratePageShards(meta.snapshotDir)) {
    totals.scanned += 1;
    const classification = classifyRow(row);
    if (!classification) {
      totals.operational += 1;
      continue;
    }
    totals.degraded += 1;
    totals[classification.bucket] += 1;
    idsByBucket[classification.bucket].push(canonicalId);
    if (sample[classification.bucket].length < 25) {
      sample[classification.bucket].push({
        canonical_id: canonicalId,
        primary_blocker: classification.primary,
        reasons: classification.reasons.slice(0, 6),
        asset_type: row?.meta?.asset_type || null,
        region: row?.meta?.region || null,
      });
    }
    for (const r of classification.reasons) {
      reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
    }
    if (classification.primary) {
      primaryCounts.set(classification.primary, (primaryCounts.get(classification.primary) || 0) + 1);
    }
  }

  const reportBuckets = {};
  for (const bucket of ['fixable_by_rebuild', 'provider_exception', 'needs_review']) {
    reportBuckets[bucket] = {
      count: totals[bucket],
      canonical_ids: idsByBucket[bucket].sort(),
      sample: sample[bucket],
    };
  }

  const report = {
    schema: 'rv.degraded_asset_audit.v1',
    generated_at: new Date().toISOString(),
    target_market_date: meta.target,
    snapshot_id: meta.snapshotId,
    snapshot_generated_at: meta.generatedAt,
    totals,
    reason_counts: Object.fromEntries([...reasonCounts.entries()].sort((a, b) => b[1] - a[1])),
    primary_blocker_counts: Object.fromEntries([...primaryCounts.entries()].sort((a, b) => b[1] - a[1])),
    buckets: reportBuckets,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmp = `${OUTPUT_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(tmp, OUTPUT_PATH);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    output: path.relative(ROOT, OUTPUT_PATH),
    totals,
    target_market_date: meta.target,
  })}\n`);
}

main();
