#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const REGISTRY_NDJSON_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const REGISTRY_SNAPSHOT_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
const INDEX_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/reports/history_pack_canonical_index.json.gz');

function nowIso() {
  return new Date().toISOString();
}

function normalizeCanonical(value) {
  return String(value || '').trim().toUpperCase();
}

function sortRowsStable(a, b) {
  return String(a?.canonical_id || '').localeCompare(String(b?.canonical_id || ''));
}

function applyPointerFix(row, historyIndex, stats) {
  const cid = normalizeCanonical(row?.canonical_id);
  if (!cid) return row;
  const packs = Array.isArray(historyIndex[cid]) ? [...historyIndex[cid]].sort((a, b) => a.localeCompare(b)) : [];
  const currentPack = String(row?.pointers?.history_pack || '').trim();
  const hasPointer = Boolean(currentPack);

  if (!hasPointer && packs.length > 0) {
    row.pointers = row.pointers || {};
    row.pointers.history_pack = packs[0];
    if (row.pointers.pack_sha256) delete row.pointers.pack_sha256;
    if (!row.pointers.symbol_group) row.pointers.symbol_group = null;
    stats.rebound_missing_pointer += 1;
    return row;
  }

  if (!hasPointer) return row;

  if (packs.length === 0) {
    row.pointers = row.pointers || {};
    delete row.pointers.history_pack;
    delete row.pointers.pack_sha256;
    delete row.pointers.symbol_group;
    row.bars_count = 0;
    row.last_trade_date = null;
    row.avg_volume_10d = 0;
    row.avg_volume_30d = 0;
    row._quality_basis = 'eodhd_missing_phantom_fix';
    stats.cleared_phantom_pointer += 1;
    return row;
  }

  if (!packs.includes(currentPack)) {
    row.pointers = row.pointers || {};
    row.pointers.history_pack = packs[0];
    if (row.pointers.pack_sha256) delete row.pointers.pack_sha256;
    if (!row.pointers.symbol_group) row.pointers.symbol_group = null;
    stats.rebound_pointer_drift += 1;
    return row;
  }

  return row;
}

async function readHistoryIndex() {
  const gz = await fsp.readFile(INDEX_GZ);
  const doc = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  return doc?.by_canonical_id && typeof doc.by_canonical_id === 'object' ? doc.by_canonical_id : {};
}

async function rewriteRegistryNdjson(historyIndex) {
  const tmpPath = `${REGISTRY_NDJSON_GZ}.${process.pid}.tmp`;
  const inStream = fs.createReadStream(REGISTRY_NDJSON_GZ).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });
  const outGz = zlib.createGzip();
  const outStream = fs.createWriteStream(tmpPath);
  outGz.pipe(outStream);

  const stats = {
    rows_total: 0,
    rows_json_error: 0,
    cleared_phantom_pointer: 0,
    rebound_pointer_drift: 0,
    rebound_missing_pointer: 0
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
      stats.rows_total += 1;
    } catch {
      stats.rows_json_error += 1;
      continue;
    }
    applyPointerFix(row, historyIndex, stats);
    outGz.write(`${JSON.stringify(row)}\n`);
  }

  outGz.end();
  await new Promise((resolve, reject) => {
    outStream.on('finish', resolve);
    outStream.on('error', reject);
  });
  await fsp.rename(tmpPath, REGISTRY_NDJSON_GZ);
  return stats;
}

async function rewriteRegistrySnapshot(historyIndex) {
  const gz = await fsp.readFile(REGISTRY_SNAPSHOT_GZ);
  const doc = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  const rows = Array.isArray(doc?.records) ? doc.records : [];

  const stats = {
    rows_total: rows.length,
    rows_json_error: 0,
    cleared_phantom_pointer: 0,
    rebound_pointer_drift: 0,
    rebound_missing_pointer: 0
  };

  for (const row of rows) applyPointerFix(row, historyIndex, stats);

  const nextDoc = {
    ...doc,
    generated_at: nowIso(),
    record_count: rows.length,
    records: rows.sort(sortRowsStable)
  };

  const tmpPath = `${REGISTRY_SNAPSHOT_GZ}.${process.pid}.tmp`;
  const buf = zlib.gzipSync(Buffer.from(`${JSON.stringify(nextDoc)}\n`, 'utf8'));
  await fsp.writeFile(tmpPath, buf);
  await fsp.rename(tmpPath, REGISTRY_SNAPSHOT_GZ);
  return stats;
}

function summarize(label, stats) {
  const totalTouched = stats.cleared_phantom_pointer + stats.rebound_pointer_drift + stats.rebound_missing_pointer;
  return {
    target: label,
    ...stats,
    total_touched: totalTouched
  };
}

async function main() {
  if (!fs.existsSync(INDEX_GZ)) {
    throw new Error(`missing_history_index:${path.relative(REPO_ROOT, INDEX_GZ)}`);
  }
  if (!fs.existsSync(REGISTRY_NDJSON_GZ)) {
    throw new Error(`missing_registry_ndjson:${path.relative(REPO_ROOT, REGISTRY_NDJSON_GZ)}`);
  }
  if (!fs.existsSync(REGISTRY_SNAPSHOT_GZ)) {
    throw new Error(`missing_registry_snapshot:${path.relative(REPO_ROOT, REGISTRY_SNAPSHOT_GZ)}`);
  }

  const historyIndex = await readHistoryIndex();
  const historyIndexCount = Object.keys(historyIndex).length;

  console.log(`Loaded history index with ${historyIndexCount} entries.`);

  const ndjsonStats = await rewriteRegistryNdjson(historyIndex);
  const snapshotStats = await rewriteRegistrySnapshot(historyIndex);

  const ndjsonSummary = summarize('registry.ndjson.gz', ndjsonStats);
  const snapshotSummary = summarize('registry.snapshot.json.gz', snapshotStats);

  const totalTouched = ndjsonSummary.total_touched + snapshotSummary.total_touched;
  console.log('\nRegistry pointer sync complete.');
  console.log(`- Index canonical IDs: ${historyIndexCount}`);
  console.log(`- NDJSON touched: ${ndjsonSummary.total_touched} (clear=${ndjsonSummary.cleared_phantom_pointer}, rebind_drift=${ndjsonSummary.rebound_pointer_drift}, rebind_missing=${ndjsonSummary.rebound_missing_pointer})`);
  console.log(`- Snapshot touched: ${snapshotSummary.total_touched} (clear=${snapshotSummary.cleared_phantom_pointer}, rebind_drift=${snapshotSummary.rebound_pointer_drift}, rebind_missing=${snapshotSummary.rebound_missing_pointer})`);
  console.log(`- Total touched: ${totalTouched}`);
  console.log('\nBackfill queue can now see missing-history rows from the snapshot source used by run-v7.');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
