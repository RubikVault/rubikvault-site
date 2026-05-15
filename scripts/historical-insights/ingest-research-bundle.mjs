#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const NAS_OPS_ROOT = process.env.NAS_OPS_ROOT || '/volume1/homes/neoboy/RepoOps/rubikvault-site';
const DEFAULT_INBOX = path.join(NAS_OPS_ROOT, 'external-analysis/historical-research/inbox/current');
const DEFAULT_LAST_GOOD = path.join(NAS_OPS_ROOT, 'external-analysis/historical-research/last-good');
const OUT_ROOT = path.join(REPO_ROOT, 'public/data/historical-insights');
const REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/historical-research-ingest-latest.json');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function writeReport(payload) {
  atomicWriteJson(REPORT_PATH, {
    schema: 'rv.historical_research_ingest_report.v1',
    generated_at: new Date().toISOString(),
    ...payload,
  });
}

function validateBundle(root) {
  const manifest = readJson(path.join(root, 'manifest.json'));
  if (!manifest) return { ok: false, reason: 'manifest_missing_or_unreadable' };
  if (manifest.schema !== 'rv.historical_research_bundle.v2') return { ok: false, reason: 'schema_mismatch', manifest };
  const publicRoot = path.join(root, 'public/historical-insights');
  const latest = readJson(path.join(publicRoot, 'latest.json'));
  const coverage = readJson(path.join(publicRoot, 'coverage-latest.json'));
  if (latest?.schema !== 'rv.historical_insights.latest.v1') return { ok: false, reason: 'latest_invalid', manifest };
  if (coverage?.schema !== 'rv.historical_research_coverage.v1') return { ok: false, reason: 'coverage_invalid', manifest };
  if (!fs.existsSync(path.join(publicRoot, 'shards'))) return { ok: false, reason: 'shards_missing', manifest };
  return { ok: true, manifest, latest, coverage, publicRoot };
}

function generatedMs(doc) {
  const ms = Date.parse(String(doc?.generated_at || doc?.historical_insights_generated_at || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function promotePublic(publicRoot) {
  const tmpRoot = path.join(path.dirname(OUT_ROOT), `.historical-insights.${process.pid}.tmp`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.cpSync(publicRoot, tmpRoot, { recursive: true });
  fs.rmSync(path.join(OUT_ROOT, 'shards'), { recursive: true, force: true });
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.renameSync(path.join(tmpRoot, 'shards'), path.join(OUT_ROOT, 'shards'));
  for (const file of ['latest.json', 'coverage-latest.json']) {
    fs.copyFileSync(path.join(tmpRoot, file), path.join(OUT_ROOT, file));
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

function syncLastGood(inbox, lastGoodRoot) {
  fs.rmSync(lastGoodRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(lastGoodRoot), { recursive: true });
  fs.cpSync(inbox, lastGoodRoot, { recursive: true });
}

function main() {
  const inbox = path.resolve(argValue('inbox', process.env.RV_HISTORICAL_RESEARCH_INBOX || DEFAULT_INBOX));
  const lastGoodRoot = path.resolve(argValue('last-good-root', process.env.RV_HISTORICAL_RESEARCH_LAST_GOOD || DEFAULT_LAST_GOOD));
  if (!fs.existsSync(path.join(inbox, 'manifest.json'))) {
    writeReport({ ok: true, status: 'no_op', reason: 'inbox_empty', inbox });
    console.log('[historical-ingest] no-op inbox_empty');
    return;
  }
  const validation = validateBundle(inbox);
  if (!validation.ok) {
    writeReport({ ok: true, status: 'rejected', reason: validation.reason, inbox });
    console.log(`[historical-ingest] rejected reason=${validation.reason}`);
    return;
  }
  const current = readJson(path.join(OUT_ROOT, 'latest.json'));
  if (generatedMs(validation.latest) <= generatedMs(current)) {
    writeReport({
      ok: true,
      status: 'no_op',
      reason: 'incoming_not_newer',
      incoming_generated_at: validation.latest.generated_at || null,
      current_generated_at: current?.generated_at || null,
    });
    console.log('[historical-ingest] no-op incoming_not_newer');
    return;
  }
  promotePublic(validation.publicRoot);
  syncLastGood(inbox, lastGoodRoot);
  writeReport({
    ok: true,
    status: 'promoted',
    incoming_generated_at: validation.latest.generated_at || null,
    asset_count: validation.latest.asset_count || 0,
    rule_count: validation.latest.rule_count || 0,
    coverage: validation.coverage,
  });
  console.log(`[historical-ingest] promoted assets=${validation.latest.asset_count || 0} rules=${validation.latest.rule_count || 0}`);
}

main();
