#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const HISTORY_ROOT = path.join(REPO_ROOT, 'mirrors/universe-v7/history');
const OUT_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/reports/history_pack_canonical_index.json.gz');
const OUT_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/reports/history_pack_canonical_index_report.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeCanonical(value) {
  return String(value || '').trim().toUpperCase();
}

async function findPackFiles(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  async function walk(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (entry.isFile() && /^(?:run_v7_|inc_|pack_).*\.ndjson\.gz$/i.test(entry.name)) {
        out.push(abs);
      }
    }
  }
  await walk(rootDir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function indexPack(absPack, relativePack, byCanonical) {
  let rows = 0;
  const stream = fs.createReadStream(absPack).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    rows += 1;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const canonicalId = normalizeCanonical(row?.canonical_id);
    if (!canonicalId) continue;
    const current = byCanonical.get(canonicalId);
    if (!current) {
      byCanonical.set(canonicalId, [relativePack]);
      continue;
    }
    if (!current.includes(relativePack)) {
      current.push(relativePack);
      current.sort((a, b) => a.localeCompare(b));
    }
  }
  return rows;
}

async function writeGzipJson(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const gz = zlib.gzipSync(Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8'));
  await fsp.writeFile(tmpPath, gz);
  await fsp.rename(tmpPath, filePath);
}

async function writeJsonAtomic(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

async function main() {
  const startedAt = nowIso();
  const packFiles = await findPackFiles(HISTORY_ROOT);
  const byCanonical = new Map();
  let rowsScanned = 0;

  for (let i = 0; i < packFiles.length; i += 1) {
    const absPack = packFiles[i];
    const relativePack = path.relative(path.join(REPO_ROOT, 'mirrors/universe-v7'), absPack).replaceAll('\\', '/');
    rowsScanned += await indexPack(absPack, relativePack, byCanonical);
    if ((i + 1) % 100 === 0 || i + 1 === packFiles.length) {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        stage: 'indexing',
        scanned_packs: i + 1,
        total_packs: packFiles.length,
        canonical_ids: byCanonical.size
      })}\n`);
    }
  }

  const byCanonicalObject = {};
  for (const [canonicalId, packs] of byCanonical.entries()) {
    byCanonicalObject[canonicalId] = packs;
  }

  const indexDoc = {
    schema: 'rv_v7_history_pack_canonical_index_v1',
    generated_at: nowIso(),
    source_root: 'mirrors/universe-v7/history',
    packs_scanned: packFiles.length,
    rows_scanned: rowsScanned,
    canonical_ids: byCanonical.size,
    by_canonical_id: byCanonicalObject
  };

  const reportDoc = {
    schema: 'rv_v7_history_pack_canonical_index_report_v1',
    generated_at: indexDoc.generated_at,
    started_at: startedAt,
    source_root: indexDoc.source_root,
    outputs: {
      index_gz: 'public/data/universe/v7/reports/history_pack_canonical_index.json.gz',
      report: 'public/data/universe/v7/reports/history_pack_canonical_index_report.json'
    },
    counts: {
      packs_scanned: indexDoc.packs_scanned,
      rows_scanned: indexDoc.rows_scanned,
      canonical_ids: indexDoc.canonical_ids
    }
  };

  await writeGzipJson(OUT_GZ, indexDoc);
  await writeJsonAtomic(OUT_REPORT, reportDoc);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out: path.relative(REPO_ROOT, OUT_GZ),
    report_out: path.relative(REPO_ROOT, OUT_REPORT),
    packs_scanned: indexDoc.packs_scanned,
    rows_scanned: indexDoc.rows_scanned,
    canonical_ids: indexDoc.canonical_ids
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    message: error?.message || String(error)
  })}\n`);
  process.exit(1);
});
