#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const REPO_ROOT = process.cwd();
const LEDGER_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/ledgers/dropout_ledger.ndjson');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/dropout_summary.json');

async function writeJsonAtomic(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, filePath);
}

async function main() {
  if (!fs.existsSync(LEDGER_PATH)) {
    const empty = {
      schema: 'rv_v7_dropout_summary_v1',
      generated_at: new Date().toISOString(),
      ledger_path: path.relative(REPO_ROOT, LEDGER_PATH),
      records_total: 0,
      by_feature: {},
      top_reasons: []
    };
    await writeJsonAtomic(OUT_PATH, empty);
    console.log(JSON.stringify({ ok: true, out: path.relative(REPO_ROOT, OUT_PATH), records_total: 0 }));
    return;
  }

  const byFeature = new Map();
  const byReason = new Map();
  let total = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(LEDGER_PATH),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    total += 1;
    const feature = String(row?.feature || 'unknown');
    const reason = String(row?.reason || 'UNKNOWN');
    byFeature.set(feature, (byFeature.get(feature) || 0) + 1);
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }

  const summary = {
    schema: 'rv_v7_dropout_summary_v1',
    generated_at: new Date().toISOString(),
    ledger_path: path.relative(REPO_ROOT, LEDGER_PATH),
    records_total: total,
    by_feature: Object.fromEntries([...byFeature.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    top_reasons: [...byReason.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, 25)
  };

  await writeJsonAtomic(OUT_PATH, summary);
  console.log(JSON.stringify({ ok: true, out: path.relative(REPO_ROOT, OUT_PATH), records_total: total }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, reason: error?.message || String(error) }));
  process.exit(1);
});

