#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_LEDGER_PATH = path.join(process.cwd(), 'mirrors/universe-v7/ledgers/dropout_ledger.ndjson');

export function buildDropoutRecord(record = {}) {
  return {
    ts: record.ts || new Date().toISOString(),
    run_id: record.run_id || null,
    feature: record.feature || null,
    canonical_id: record.canonical_id || null,
    symbol_display: record.symbol_display || null,
    status: record.status || 'DROP',
    reason: record.reason || 'UNKNOWN',
    details: record.details && typeof record.details === 'object' ? record.details : {},
    policy_versions: record.policy_versions && typeof record.policy_versions === 'object' ? record.policy_versions : {},
    counts: record.counts && typeof record.counts === 'object' ? record.counts : {}
  };
}

export async function appendDropoutRecord(record, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const line = `${JSON.stringify(buildDropoutRecord(record))}\n`;
  await fs.appendFile(ledgerPath, line, 'utf8');
  return { ok: true, ledgerPath };
}

export async function appendDropoutRecords(records = [], opts = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: true, count: 0, ledgerPath: opts.ledgerPath || DEFAULT_LEDGER_PATH };
  }
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const payload = records.map((r) => JSON.stringify(buildDropoutRecord(r))).join('\n') + '\n';
  await fs.appendFile(ledgerPath, payload, 'utf8');
  return { ok: true, count: records.length, ledgerPath };
}

