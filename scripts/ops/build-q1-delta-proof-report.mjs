#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const quantRoot = getArg('--quant-root', process.env.QUANT_ROOT || process.env.NAS_QUANT_ROOT || process.env.RV_QUANT_ROOT || '');
const inputPath = getArg(
  '--input',
  quantRoot ? path.join(quantRoot, 'ops/q1_daily_delta_ingest/latest_success.json') : 'var/private/ops/q1-delta-latest-success.json',
);
const outputPath = getArg('--output', process.env.RV_Q1_DELTA_PROOF_REPORT_PATH || 'var/private/ops/q1-delta-proof-latest.json');
const allowMissing = args.includes('--allow-missing') || process.env.RV_Q1_DELTA_PROOF_ALLOW_MISSING === '1';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

let source = null;
let ok = false;
let missing = false;
try {
  source = readJson(path.resolve(ROOT, inputPath));
} catch {
  missing = true;
}

const stats = source?.stats || {};
const packSelection = source?.pack_selection || {};
const reconciliation = source?.reconciliation || {};
const mode = String(packSelection.mode || 'unknown');
const thresholdFailures = Array.isArray(reconciliation.threshold_failures) ? reconciliation.threshold_failures : [];
const rowsBalanced = reconciliation.rows_filter_accounting_balanced !== false;
const fullScan = mode === 'full_scan';
const noop = Boolean(reconciliation.noop_no_changed_packs);
const deltaOnlyOk = Boolean(source && rowsBalanced && thresholdFailures.length === 0 && !fullScan);
ok = deltaOnlyOk || (allowMissing && missing);

const report = {
  schema: 'rv.q1_delta_proof_report.v1',
  generated_at: new Date().toISOString(),
  ok,
  missing,
  input_path: path.resolve(ROOT, inputPath),
  run_id: source?.run_id || null,
  ingest_date: source?.ingest_date || null,
  reason: missing ? 'latest_success_missing' : source?.reason || null,
  delta_only_ok: deltaOnlyOk,
  full_scan: fullScan,
  noop_no_changed_packs: noop,
  mode,
  touched: {
    packs_selected: num(packSelection.selected_packs_total ?? stats.selected_packs_total),
    packs_done: num(stats.packs_done),
    packs_failed: num(stats.packs_failed),
    assets_emitted_delta: num(reconciliation.assets_emitted_delta ?? stats.assets_emitted_delta),
    rows_emitted_delta: num(reconciliation.rows_emitted_delta ?? stats.bars_rows_emitted_delta),
    rows_filter_input_total: num(reconciliation.rows_filter_input_total ?? stats.rows_filter_input_total),
    rows_skipped_old_or_known: num(reconciliation.rows_skipped_old_or_known ?? stats.rows_skipped_old_or_known),
  },
  reconciliation: {
    rows_filter_accounting_balanced: rowsBalanced,
    rows_emitted_matches_keys: reconciliation.rows_emitted_matches_keys !== false,
    threshold_failures: thresholdFailures,
    failed_pack_ratio: num(reconciliation.failed_pack_ratio),
    invalid_row_ratio: num(reconciliation.invalid_row_ratio),
  },
  artifacts: {
    manifest_path: source?.manifest_path || null,
    run_status_path: source?.run_status_path || null,
  },
};

const resolvedOutput = path.resolve(ROOT, outputPath);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!ok) process.exit(1);
