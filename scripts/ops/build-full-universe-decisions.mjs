import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  buildAssetDecision,
  buildSnapshotId,
  computeDecisionSummary,
  decisionHash,
  DECISION_PARTITION_COUNT,
  evaluateCoveragePolicy,
  hashMod64,
  normalizeIsoDate,
  partName,
  sha256Prefix,
  stableStringify,
} from '../lib/decision-bundle-contract.mjs';
import {
  fsyncDirSync,
  writeJsonDurableAtomicSync,
  writeTextDurableAtomicSync,
} from '../lib/durable-atomic-write.mjs';
import { assertMayWriteProductionTruth } from './prod-runtime-guard.mjs';
import { writeLeafSeal } from '../lib/write-leaf-seal.mjs';
import { latestUsMarketSessionIso } from '../../functions/api/_shared/market-calendar.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DECISIONS_ROOT = path.join(ROOT, 'public/data/decisions');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DAILY_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json');
const COMPAT_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const OPS_DECISION_SEAL_PATH = path.join(ROOT, 'public/data/ops/decision-bundle-latest.json');

function parseArgs(argv) {
  const get = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
  return {
    targetMarketDate: normalizeIsoDate(get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || null),
    runId: get('run-id') || process.env.RV_RUN_ID || process.env.RUN_ID || null,
    maxAssets: Number.isFinite(Number(get('max-assets'))) ? Number(get('max-assets')) : null,
    minHistoryBars: Number.isFinite(Number(get('min-history-bars'))) ? Number(get('min-history-bars')) : 200,
    manifestSeed: get('manifest-seed') || process.env.RV_MANIFEST_SEED || '',
    tmpOnly: argv.includes('--tmp-only') || argv.includes('--no-promote'),
    replace: argv.includes('--replace'),
    dryRun: argv.includes('--dry-run'),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readScopeIds() {
  const usingCompat = !fs.existsSync(DAILY_SCOPE_PATH);
  const scopePath = usingCompat ? COMPAT_SCOPE_PATH : DAILY_SCOPE_PATH;
  if (usingCompat) {
    process.stderr.write(`[build-full-universe-decisions] WARN: daily_eval scope file missing, falling back to compat scope: ${COMPAT_SCOPE_PATH}\n`);
  }
  const doc = readJson(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  if (!ids.length) throw new Error(`DAILY_EVAL_SCOPE_EMPTY:${scopePath}`);
  return { scopePath, ids: new Set(ids.map((id) => String(id).toUpperCase())) };
}

function readRegistryRows(scopeIds, maxAssets = null) {
  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_PATH)).toString('utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const canonicalId = String(row?.canonical_id || '').toUpperCase();
    if (!scopeIds.has(canonicalId)) continue;
    const typeNorm = String(row?.type_norm || row?.asset_class || '').toUpperCase();
    if (!['STOCK', 'ETF', 'INDEX'].includes(typeNorm)) continue;
    rows.push(row);
    if (maxAssets && rows.length >= maxAssets) break;
  }
  return rows;
}

function ensureEmptyDir(dirPath, { replace = false } = {}) {
  if (fs.existsSync(dirPath)) {
    if (!replace) throw new Error(`OUTPUT_EXISTS:${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeStaleTmp(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

function validateBundle({ decisions, index, summary, parts }) {
  if (parts.length !== DECISION_PARTITION_COUNT) throw new Error('DECISION_BUNDLE_PART_COUNT_MISMATCH');
  const ids = new Set();
  for (const decision of decisions) {
    const id = decision.canonical_id;
    if (!id) throw new Error('DECISION_WITHOUT_CANONICAL_ID');
    if (ids.has(id)) throw new Error(`DECISION_DUPLICATE:${id}`);
    ids.add(id);
    if (!index.assets[id]) throw new Error(`DECISION_INDEX_MISSING:${id}`);
  }
  if (ids.size !== summary.assets_processed) throw new Error('DECISION_SUMMARY_COUNT_MISMATCH');
  if (summary.assets_unclassified_missing > 0) throw new Error('DECISION_UNCLASSIFIED_MISSING');
}

function writeGzipPart(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 });
  fs.writeFileSync(filePath, gz);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return sha256Prefix(gz);
}

export function buildDecisionBundlePayload(rows, {
  runId,
  snapshotId,
  targetMarketDate,
  generatedAt,
  minHistoryBars = 200,
} = {}) {
  const decisions = rows
    .map((row) => buildAssetDecision(row, {
      runId,
      snapshotId,
      targetMarketDate,
      generatedAt,
      minHistoryBars,
    }))
    .sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));
  const summary = computeDecisionSummary(decisions);
  const policy = evaluateCoveragePolicy(summary);
  return { decisions, summary, policy };
}

export async function buildAndPublishDecisionBundle(options = {}) {
  const now = new Date();
  const targetMarketDate = normalizeIsoDate(options.targetMarketDate) || latestUsMarketSessionIso(now);
  const runId = options.runId || `pipeline-master-${targetMarketDate}`;
  const generatedAt = now.toISOString();
  const snapshotId = options.snapshotId || buildSnapshotId({
    runId,
    targetMarketDate,
    manifestSeed: options.manifestSeed || generatedAt,
  });
  const guard = assertMayWriteProductionTruth({ job: 'build-full-universe-decisions' });
  if (!guard.ok) {
    throw new Error(`PROD_RUNTIME_BLOCKED:${guard.failures.join(',')}`);
  }

  const { scopePath, ids: scopeIds } = readScopeIds();
  const rows = readRegistryRows(scopeIds, options.maxAssets || null);
  const { decisions, summary, policy } = buildDecisionBundlePayload(rows, {
    runId,
    snapshotId,
    targetMarketDate,
    generatedAt,
    minHistoryBars: options.minHistoryBars || 200,
  });

  const snapshotPathPublic = `/data/decisions/snapshots/${targetMarketDate}/${snapshotId}`;
  const tmpDir = path.join(DECISIONS_ROOT, '.tmp', snapshotId);
  const finalDir = path.join(DECISIONS_ROOT, 'snapshots', targetMarketDate, snapshotId);
  const dateDir = path.dirname(finalDir);
  removeStaleTmp(tmpDir);
  fs.mkdirSync(tmpDir, { recursive: true });

  const partitionRows = Array.from({ length: DECISION_PARTITION_COUNT }, () => []);
  const index = {
    schema: 'rv.decision_bundle_index.v1',
    schema_version: '1.0',
    partition_strategy: 'hash_mod_64',
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    snapshot_id: snapshotId,
    assets: {},
    symbols: {},
  };

  for (const decision of decisions) {
    const partition = hashMod64(decision.canonical_id);
    const part = partName(partition);
    const hash = decisionHash(decision);
    partitionRows[partition].push(decision);
    index.assets[decision.canonical_id] = {
      symbol: decision.symbol,
      asset_class: decision.asset_class,
      partition,
      part,
      decision_hash: hash,
    };
    index.symbols[decision.symbol] ||= [];
    index.symbols[decision.symbol].push(decision.canonical_id);
  }
  for (const values of Object.values(index.symbols)) values.sort();

  const parts = [];
  for (let i = 0; i < DECISION_PARTITION_COUNT; i += 1) {
    const name = partName(i);
    const partPath = path.join(tmpDir, name);
    const partHash = writeGzipPart(partPath, partitionRows[i]);
    parts.push({ part: name, partition: i, row_count: partitionRows[i].length, hash: partHash });
  }

  const summaryDoc = {
    schema: 'rv.decision_bundle_summary.v1',
    schema_version: '1.0',
    status: policy.status,
    run_id: runId,
    snapshot_id: snapshotId,
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    coverage_policy: {
      ok_threshold: 0.95,
      degraded_threshold: 0.50,
      blocking_reasons: policy.blocking_reasons,
      warnings: policy.warnings,
    },
    ...summary,
  };

  const indexHash = sha256Prefix(stableStringify(index));
  const summaryHash = sha256Prefix(stableStringify(summaryDoc));
  const manifest = {
    schema: 'rv.decision_bundle_manifest.v1',
    schema_version: '1.0',
    status: policy.status,
    run_id: runId,
    snapshot_id: snapshotId,
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    source_scope_path: path.relative(ROOT, scopePath),
    partition_strategy: 'hash_mod_64',
    partition_count: DECISION_PARTITION_COUNT,
    counts: {
      decisions: decisions.length,
      parts: DECISION_PARTITION_COUNT,
    },
    hashes: {
      summary: summaryHash,
      index: indexHash,
      parts,
    },
  };
  manifest.bundle_hash = sha256Prefix(stableStringify({
    summary: summaryHash,
    index: indexHash,
    parts: parts.map((part) => [part.part, part.hash]),
  }));

  validateBundle({ decisions, index, summary: summaryDoc, parts });
  writeJsonDurableAtomicSync(path.join(tmpDir, 'summary.json'), summaryDoc);
  writeJsonDurableAtomicSync(path.join(tmpDir, 'index.json'), index);
  writeJsonDurableAtomicSync(path.join(tmpDir, 'manifest.json'), manifest);
  fsyncDirSync(tmpDir);

  const latest = {
    schema: 'rv.decision_bundle_latest.v1',
    schema_version: '1.0',
    status: policy.status,
    snapshot_id: snapshotId,
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    valid_until: options.validUntil || new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString(),
    snapshot_path: snapshotPathPublic,
    manifest_path: `${snapshotPathPublic}/manifest.json`,
    summary_path: `${snapshotPathPublic}/summary.json`,
    index_path: `${snapshotPathPublic}/index.json`,
    bundle_hash: manifest.bundle_hash,
    summary: summaryDoc,
    blocking_reasons: policy.blocking_reasons,
    warnings: policy.warnings,
  };

  if (options.dryRun || options.tmpOnly) {
    return { latest, manifest, summary: summaryDoc, index, tmp_dir: tmpDir, promoted: false };
  }

  fs.mkdirSync(dateDir, { recursive: true });
  if (fs.existsSync(finalDir)) {
    if (!options.replace) throw new Error(`SNAPSHOT_EXISTS:${finalDir}`);
    fs.rmSync(finalDir, { recursive: true, force: true });
  }
  fs.renameSync(tmpDir, finalDir);
  fsyncDirSync(dateDir);
  fsyncDirSync(path.join(DECISIONS_ROOT, 'snapshots'));
  writeJsonDurableAtomicSync(path.join(DECISIONS_ROOT, 'latest.json'), latest);
  writeJsonDurableAtomicSync(OPS_DECISION_SEAL_PATH, {
    schema: 'rv.decision_bundle_seal.v1',
    schema_version: '1.0',
    ...latest,
  });
  fsyncDirSync(DECISIONS_ROOT);
  try {
    writeLeafSeal('decision_bundle', latest.status === 'FAILED' ? 'FAILED' : latest.status === 'DEGRADED' ? 'DEGRADED' : 'OK', {
      targetMarketDate: latest.target_market_date || null,
      runId: latest.run_id || null,
      outputsVerified: [path.join(DECISIONS_ROOT, 'latest.json')],
      blockingReasons: latest.blocking_reasons || [],
      warnings: latest.warnings || [],
    });
  } catch {
    // leaf seal write must not block the bundle promote
  }
  return { latest, manifest, summary: summaryDoc, index, snapshot_dir: finalDir, promoted: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildAndPublishDecisionBundle(options);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      promoted: result.promoted,
      status: result.latest.status,
      snapshot_id: result.latest.snapshot_id,
      target_market_date: result.latest.target_market_date,
      summary: {
        assets_processed: result.summary.assets_processed,
        strict_full_coverage_ratio: result.summary.strict_full_coverage_ratio,
        buy_count: result.summary.buy_count,
        wait_count: result.summary.wait_count,
        wait_pipeline_incomplete_count: result.summary.wait_pipeline_incomplete_count,
      },
    }, null, 2)}\n`);
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
