import fs from 'node:fs';
import path from 'node:path';
import { addTradingDays } from './trading_date.mjs';
import { sha256Json } from './hashing.mjs';
import { readJson, writeJsonAtomic, appendNdjsonUnique } from './io.mjs';

function pendingPath(repoRoot, dateStr) {
  const month = dateStr.slice(0, 7);
  return path.join(repoRoot, 'mirrors/forecast/ledgers/outcomes/pending', `${month}.json`);
}

function revisionStatePath(repoRoot) {
  return path.join(repoRoot, 'mirrors/forecast/ledgers/outcomes/revisions/state.json');
}

function streamPath(repoRoot, revision, dateStr) {
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(5, 7);
  return path.join(repoRoot, 'mirrors/forecast/ledgers/outcomes', revision, year, `${month}.ndjson.zst`);
}

function loadBars(repoRoot, symbol) {
  const p = path.join(repoRoot, 'public/data/eod/bars', `${symbol}.json`);
  if (!fs.existsSync(p)) return [];
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r?.date && Number.isFinite(r?.close)).sort((a, b) => a.date.localeCompare(b.date));
}

function closeOnDate(rows, dateStr) {
  for (const row of rows) {
    if (row.date === dateStr) return Number(row.close);
  }
  return null;
}

function loadPending(repoRoot, asofDate) {
  const p = pendingPath(repoRoot, asofDate);
  const doc = readJson(p, { schema: 'forecast_outcomes_pending_v6', month: asofDate.slice(0, 7), rows: [] });
  return { path: p, rows: Array.isArray(doc.rows) ? doc.rows : [], month: doc.month || asofDate.slice(0, 7) };
}

function writePending(repoRoot, asofDate, rows) {
  const p = pendingPath(repoRoot, asofDate);
  writeJsonAtomic(p, {
    schema: 'forecast_outcomes_pending_v6',
    month: asofDate.slice(0, 7),
    rows
  });
}

function collectManifestMap(repoRoot, asofDate, lookback = 252) {
  const dir = path.join(repoRoot, 'mirrors/forecast/ledgers/bars_manifest');
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name.slice(0, 10) <= asofDate)
    .sort()
    .slice(-lookback);

  const map = {};
  for (const file of files) {
    const abs = path.join(dir, file);
    const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
    map[file.slice(0, 10)] = doc.bars_manifest_hash;
  }
  return map;
}

export function determineOutcomeRevision(repoRoot, asofDate, persistState = true) {
  const statePath = revisionStatePath(repoRoot);
  const prev = readJson(statePath, {
    current_revision: 1,
    manifest_map: {}
  });

  const nextMap = collectManifestMap(repoRoot, asofDate, 252);
  const prevMap = prev.manifest_map || {};

  let changed = false;
  for (const [date, hash] of Object.entries(nextMap)) {
    if (prevMap[date] && prevMap[date] !== hash) {
      changed = true;
      break;
    }
  }

  const nextRevision = changed ? Number(prev.current_revision || 1) + 1 : Number(prev.current_revision || 1);
  const revision = `v6.0-r${nextRevision}`;

  if (persistState) {
    writeJsonAtomic(statePath, {
      schema: 'forecast_outcome_revision_state_v6',
      asof_date: asofDate,
      current_revision: nextRevision,
      manifest_map: nextMap
    });
  }

  return {
    revision,
    changed
  };
}

function toPendingRow(prediction, barsManifestHash) {
  return {
    prediction_id: prediction.prediction_id,
    symbol: prediction.symbol,
    asof_date: prediction.asof_date,
    horizon_days: Number(prediction.horizon_days || 10),
    p_up: Number(prediction.p_up),
    bars_manifest_hash: barsManifestHash,
    input_hashes: prediction.input_hashes || {}
  };
}

function dedupePending(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = row.prediction_id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => a.asof_date.localeCompare(b.asof_date) || a.symbol.localeCompare(b.symbol));
  return out;
}

export function runOutcomeMaturation({
  repoRoot,
  asofDate,
  predictionsRows,
  barsManifestHash,
  calendar,
  outcomePolicy,
  algorithmHash
}) {
  const pending = loadPending(repoRoot, asofDate);
  const incomingPending = predictionsRows.map((row) => toPendingRow(row, barsManifestHash));
  const pendingRows = dedupePending([...(pending.rows || []), ...incomingPending]);

  const matured = [];
  const nextPending = [];
  const barsCache = new Map();

  for (const item of pendingRows) {
    const outcomeDate = addTradingDays(item.asof_date, item.horizon_days, calendar);
    if (outcomeDate > asofDate) {
      nextPending.push(item);
      continue;
    }

    if (!barsCache.has(item.symbol)) {
      barsCache.set(item.symbol, loadBars(repoRoot, item.symbol));
    }
    const bars = barsCache.get(item.symbol);

    const startClose = closeOnDate(bars, item.asof_date);
    const endClose = closeOnDate(bars, outcomeDate);

    if (!Number.isFinite(startClose) || !Number.isFinite(endClose) || startClose <= 0 || endClose <= 0) {
      nextPending.push(item);
      continue;
    }

    const y = endClose > startClose ? 1 : 0;
    matured.push({
      outcome_id: sha256Json({ prediction_id: item.prediction_id, outcome_date: outcomeDate, y }),
      prediction_id: item.prediction_id,
      symbol: item.symbol,
      asof_date: item.asof_date,
      outcome_date: outcomeDate,
      y,
      outcome_policy_version: outcomePolicy?.schema_version || 'v6.0',
      algorithm_hash: algorithmHash,
      bars_manifest_hash: item.bars_manifest_hash,
      input_hashes: item.input_hashes,
      computed_at: new Date().toISOString()
    });
  }

  writePending(repoRoot, asofDate, nextPending);

  const revisionInfo = determineOutcomeRevision(repoRoot, asofDate, true);
  const byMonth = new Map();
  for (const row of matured) {
    const key = row.outcome_date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }

  const streamWrites = [];
  for (const rows of byMonth.values()) {
    const p = streamPath(repoRoot, revisionInfo.revision, rows[0].outcome_date);
    const appendInfo = appendNdjsonUnique(p, rows, 'outcome_id');
    streamWrites.push({
      path: path.relative(repoRoot, p),
      appended: appendInfo.appended,
      total: appendInfo.total
    });
  }

  let backlogDays = 0;
  if (nextPending.length > 0) {
    const oldest = nextPending[0].asof_date;
    backlogDays = Math.max(0, Math.floor((new Date(`${asofDate}T00:00:00Z`) - new Date(`${oldest}T00:00:00Z`)) / (24 * 60 * 60 * 1000)));
  }

  const outcomesDoc = {
    schema: 'forecast_outcomes_v6',
    stream_revision: revisionInfo.revision,
    rows: matured
  };

  return {
    revision: revisionInfo.revision,
    revision_changed: revisionInfo.changed,
    matured_rows: matured,
    pending_rows: nextPending,
    backlog_days: backlogDays,
    stream_writes: streamWrites,
    outcomes_doc: outcomesDoc
  };
}

export default { runOutcomeMaturation, determineOutcomeRevision };
