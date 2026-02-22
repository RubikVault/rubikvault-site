#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';
import {
  REPO_ROOT,
  nowIso,
  parseArgs,
  normalizeTicker,
  toFinite,
  clamp,
  stableContentHash,
  sha256File,
  writeJsonAtomic,
  readJson,
  pathExists,
  walkFiles
} from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { EXIT } from './lib/exit-codes.mjs';
import { readJsonGz, readNdjsonGz, writeJsonGz, writeNdjsonGz } from './lib/gzip-json.mjs';
import { readCheckpoint, writeCheckpoint } from './lib/checkpoint.mjs';
import { fetchExchangesList, fetchExchangeSymbols, fetchDailyEod, fetchBulkLastDay } from './ingestor/eodhd-client.mjs';
import { loadEnvFile } from './lib/env-loader.mjs';
import { loadBudgetState, bumpDailyCalls } from './lib/budget.mjs';
import { loadBackfillWaivers } from './lib/backfill-waivers.mjs';

function ensureNetworkAllowed() {
  const allowed = String(process.env.NETWORK_ALLOWED || '').toLowerCase() === 'true';
  if (!allowed) throw new Error('NETWORK_NOT_ALLOWED');
}

async function appendJsonl(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(doc)}\n`, 'utf8');
}

async function persistBudgetProgress({
  budget,
  budgetStatePath,
  budgetTracker,
  runId,
  phase,
  meta = {}
}) {
  if (!budgetStatePath || !budgetTracker) return;
  const current = Math.max(0, Number(budget?.calls_total || 0));
  const lastPersisted = Math.max(0, Number(budgetTracker.last_persisted_calls || 0));
  const delta = current - lastPersisted;
  if (!Number.isFinite(delta) || delta <= 0) return;

  const next = await bumpDailyCalls(budgetStatePath, delta);
  budgetTracker.last_persisted_calls = Number(next?.daily_calls ?? (lastPersisted + delta));

  if (budgetTracker.calls_ledger_path) {
    await appendJsonl(budgetTracker.calls_ledger_path, {
      schema: 'rv_v7_calls_ledger_v1',
      generated_at: nowIso(),
      run_id: runId,
      phase,
      delta_calls: delta,
      calls_total_process: current,
      daily_calls_persisted: budgetTracker.last_persisted_calls,
      ...meta
    });
  }
}

function normalizeTypeNorm(v) {
  const t = String(v || 'OTHER').toUpperCase();
  const allowed = new Set(['STOCK', 'ETF', 'FUND', 'BOND', 'INDEX', 'FOREX', 'CRYPTO', 'OTHER']);
  return allowed.has(t) ? t : 'OTHER';
}

function profileForType(typeNorm) {
  const map = {
    STOCK: 'EQUITY_LIKE',
    ETF: 'EQUITY_LIKE',
    FUND: 'NAV_LIKE',
    BOND: 'BOND_LIKE',
    INDEX: 'INDEX_LIKE',
    FOREX: 'FOREX_LIKE',
    CRYPTO: 'CRYPTO_LIKE',
    OTHER: 'NAV_LIKE'
  };
  return map[String(typeNorm || 'OTHER').toUpperCase()] || 'NAV_LIKE';
}

function canonicalId(exchangeCode, symbol) {
  return `${String(exchangeCode || 'UNK').toUpperCase()}:${String(symbol || '').toUpperCase()}`;
}

function pickSymbol(row) {
  return normalizeTicker(row?.symbol || row?.ticker || row?.code || row?.Code || row);
}

function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((acc, x) => acc + Number(x || 0), 0) / values.length;
}

function stdev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const m = avg(values);
  const variance = values.reduce((acc, x) => {
    const d = Number(x || 0) - m;
    return acc + d * d;
  }, 0) / values.length;
  return Math.sqrt(variance);
}

function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.max(0, Math.floor((db - da) / 86400000));
}

function stalenessBusinessDays(lastTradeDate, cfg, today = nowIso().slice(0, 10)) {
  if (!lastTradeDate) return Number(cfg?.eligibility?.freshness_max_days || 180);
  const delta = daysBetween(lastTradeDate, today);
  if (!Number.isFinite(delta)) return Number(cfg?.eligibility?.freshness_max_days || 180);
  const f = toFinite(cfg?.staleness?.weekend_adjust_factor, 5);
  const d = toFinite(cfg?.staleness?.weekend_adjust_divisor, 7);
  return Math.floor(delta * (f / Math.max(1, d)));
}

function toSafeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseLegacyUniverse(contractDoc, universeAll) {
  const set = new Set();
  const names = new Map();

  const fromContract = Array.isArray(contractDoc?.legacy_sets?.universe_tickers)
    ? contractDoc.legacy_sets.universe_tickers
    : [];
  for (const ticker of fromContract) {
    const t = normalizeTicker(ticker);
    if (!t) continue;
    set.add(canonicalId('US', t));
  }

  if (Array.isArray(universeAll)) {
    for (const row of universeAll) {
      const t = normalizeTicker(row?.ticker || row?.symbol || row);
      if (!t) continue;
      names.set(canonicalId('US', t), String(row?.name || '').trim() || null);
    }
  }

  return { coreSet: set, nameMap: names };
}

async function buildDiscovery({
  cfg,
  args,
  runDir,
  budget,
  budgetStatePath = null,
  budgetTracker = null,
  runId = null
}) {
  const runMode = String(cfg?.run?.mode || 'shadow').toLowerCase();
  const sourceMode = String(cfg?.run?.universe_source_mode || 'hybrid').toLowerCase();
  const discoveryCfg = cfg?.discovery || {};

  const includeLegacy = discoveryCfg?.include_legacy_universe !== false;
  const shadowLimit = Number(discoveryCfg?.shadow_exchange_limit ?? 8);
  const fullLimit = Number(discoveryCfg?.full_exchange_limit ?? 0);
  const exchangeAllowlist = Array.isArray(discoveryCfg?.exchange_allowlist) ? discoveryCfg.exchange_allowlist.map((x) => String(x).toUpperCase()) : [];
  const exchangeDenylist = new Set(
    Array.isArray(discoveryCfg?.exchange_denylist)
      ? discoveryCfg.exchange_denylist.map((x) => String(x).toUpperCase())
      : []
  );

  const discovered = [];
  const byExchange = new Map();

  const universeAllPath = path.join(REPO_ROOT, 'public/data/universe/all.json');
  const universeAll = await readJson(universeAllPath).catch(() => []);

  if (includeLegacy) {
    for (const row of Array.isArray(universeAll) ? universeAll : []) {
      const symbol = pickSymbol(row);
      if (!symbol) continue;
      const exchange = 'US';
      const id = canonicalId(exchange, symbol);
      discovered.push({
        canonical_id: id,
        symbol,
        exchange,
        mic: 'US',
        provider_symbol: `${symbol}.US`,
        name: String(row?.name || '').trim() || null,
        type_norm: 'STOCK',
        currency: 'USD',
        country: 'US',
        source: 'legacy_universe'
      });
      byExchange.set(exchange, (byExchange.get(exchange) || 0) + 1);
    }
  }

  const wantsFull = sourceMode === 'full_exchange' || sourceMode === 'hybrid';
  const skipNetwork = Boolean(args['offline']) || String(process.env.NETWORK_ALLOWED || '').toLowerCase() !== 'true';

  let exchangesFetched = [];
  let fullDiscoveryCalls = 0;
  let fullDiscoveryError = null;

  if (wantsFull && !skipNetwork) {
    let exchanges = [];
    try {
      ensureNetworkAllowed();
      const exResult = await fetchExchangesList();
      const attempts = Math.max(1, Number(exResult?.attempts || 1));
      budget.calls_total += attempts;
      fullDiscoveryCalls += attempts;
      exchanges = Array.isArray(exResult?.rows) ? exResult.rows : [];
      await persistBudgetProgress({
        budget,
        budgetStatePath,
        budgetTracker,
        runId,
        phase: 'discovery_exchanges_list',
        meta: { attempts, exchanges: exchanges.length }
      });
    } catch (err) {
      const attempts = Math.max(1, Number(err?.attempts || 1));
      budget.calls_total += attempts;
      fullDiscoveryCalls += attempts;
      await persistBudgetProgress({
        budget,
        budgetStatePath,
        budgetTracker,
        runId,
        phase: 'discovery_exchanges_list',
        meta: { attempts, error: String(err?.message || 'fetch_failed') }
      }).catch(() => { });
      fullDiscoveryError = String(err?.message || 'full_discovery_failed');
      exchanges = [];
    }

    let selected = exchanges;
    if (exchangeAllowlist.length > 0) {
      const allow = new Set(exchangeAllowlist);
      selected = selected.filter((row) => allow.has(row.code));
    }
    if (exchangeDenylist.size > 0) {
      selected = selected.filter((row) => !exchangeDenylist.has(row.code));
    }

    if (runMode === 'shadow' && shadowLimit > 0) {
      selected = selected.slice(0, shadowLimit);
    } else if (runMode !== 'shadow' && fullLimit > 0) {
      selected = selected.slice(0, fullLimit);
    }

    exchangesFetched = selected.map((row) => row.code);

    for (const ex of selected) {
      if (budget.calls_total >= budget.daily_cap_calls) break;
      const symbolsResult = await fetchExchangeSymbols(ex.code).catch((error) => ({
        rows: [],
        attempts: Math.max(1, Number(error?.attempts || 1)),
        error
      }));
      const rows = Array.isArray(symbolsResult?.rows) ? symbolsResult.rows : [];
      const attempts = Math.max(1, Number(symbolsResult?.attempts || 1));
      budget.calls_total += attempts;
      await persistBudgetProgress({
        budget,
        budgetStatePath,
        budgetTracker,
        runId,
        phase: 'discovery_exchange_symbols',
        meta: {
          exchange: ex.code || null,
          rows: rows.length,
          attempts,
          error: symbolsResult?.error ? String(symbolsResult.error?.message || 'fetch_failed') : null
        }
      });
      fullDiscoveryCalls += attempts;
      for (const row of rows) {
        const symbol = pickSymbol(row);
        if (!symbol) continue;
        const id = canonicalId(ex.code || ex.mic || 'UNK', symbol);
        discovered.push({
          canonical_id: id,
          symbol,
          exchange: String(ex.code || '').toUpperCase(),
          mic: String(ex.mic || ex.code || '').toUpperCase() || null,
          provider_symbol: String(row.provider_symbol || `${symbol}.${ex.code}`).toUpperCase(),
          name: row.name || null,
          type_norm: normalizeTypeNorm(row.type_norm),
          currency: row.currency || ex.currency || null,
          country: row.country || ex.country || null,
          source: 'full_exchange'
        });
      }
      byExchange.set(ex.code, (byExchange.get(ex.code) || 0) + rows.length);
    }
  }

  const unique = new Map();
  for (const row of discovered) {
    if (!row?.canonical_id) continue;
    if (!unique.has(row.canonical_id)) {
      unique.set(row.canonical_id, row);
      continue;
    }

    const prev = unique.get(row.canonical_id);
    if ((prev?.source === 'legacy_universe') && row.source !== 'legacy_universe') {
      unique.set(row.canonical_id, row);
    }
  }

  const out = [...unique.values()].sort((a, b) => String(a.canonical_id).localeCompare(String(b.canonical_id)));
  const discoveredPath = path.join(runDir, 'discovery', 'discovered.ndjson.gz');
  await writeNdjsonGz(discoveredPath, out);

  const byExchangeObj = {};
  for (const [k, v] of byExchange.entries()) byExchangeObj[k] = v;

  return {
    rows: out,
    file: discoveredPath,
    summary: {
      discovered_count: out.length,
      exchanges_seen: Object.keys(byExchangeObj).length,
      by_exchange: byExchangeObj,
      full_discovery_calls: fullDiscoveryCalls,
      exchanges_fetched: exchangesFetched,
      source_mode: sourceMode,
      run_mode: runMode,
      skip_network: skipNetwork,
      full_discovery_error: fullDiscoveryError
    }
  };
}

async function buildDiscoveryFromRegistrySnapshot({ runDir }) {
  const snapshotPath = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
  const snapshot = await readJsonGz(snapshotPath, null);
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];

  const rows = records
    .map((row) => ({
      canonical_id: row?.canonical_id ? String(row.canonical_id).toUpperCase() : null,
      symbol: row?.symbol ? String(row.symbol).toUpperCase() : null,
      exchange: row?.exchange ? String(row.exchange).toUpperCase() : null,
      mic: row?.mic ? String(row.mic).toUpperCase() : null,
      provider_symbol: row?.provider_symbol ? String(row.provider_symbol).toUpperCase() : null,
      name: row?.name || null,
      type_norm: normalizeTypeNorm(row?.type_norm),
      currency: row?.currency || null,
      country: row?.country || null,
      source: 'cached_registry'
    }))
    .filter((row) => row.canonical_id && row.symbol && row.exchange);

  const byExchangeObj = {};
  for (const row of rows) {
    byExchangeObj[row.exchange] = (byExchangeObj[row.exchange] || 0) + 1;
  }

  const discoveredPath = path.join(runDir, 'discovery', 'discovered.ndjson.gz');
  await writeNdjsonGz(discoveredPath, rows);

  return {
    rows,
    file: discoveredPath,
    summary: {
      discovered_count: rows.length,
      exchanges_seen: Object.keys(byExchangeObj).length,
      by_exchange: byExchangeObj,
      full_discovery_calls: 0,
      exchanges_fetched: [],
      source_mode: 'cached_registry',
      run_mode: 'backfill_fast',
      skip_network: true,
      full_discovery_error: null
    }
  };
}

async function buildIdentityBridge({ rows, cfg, runDir }) {
  const bridge = rows.map((row) => ({
    canonical_id: row.canonical_id,
    mic: row.mic || row.exchange || null,
    exchange: row.exchange || null,
    provider_symbol: row.provider_symbol || null,
    legacy_ticker: row.exchange === 'US' ? row.symbol : null,
    aliases: [row.symbol].filter(Boolean),
    currency: row.currency || null,
    type_norm: normalizeTypeNorm(row.type_norm),
    status: 'active',
    collision_rule_version: '1.0'
  }));

  const bridgeDoc = {
    schema: 'rv_v7_identity_bridge_v1',
    generated_at: nowIso(),
    record_count: bridge.length,
    records: bridge
  };

  const bridgePathRun = path.join(runDir, 'identity', 'identity_bridge.json.gz');
  await writeJsonGz(bridgePathRun, bridgeDoc);

  const bridgePathPolicy = resolvePathMaybe(cfg?.identity?.identity_bridge_path)
    || path.join(REPO_ROOT, 'policies/universe/identity_bridge.json.gz');
  await writeJsonGz(bridgePathPolicy, bridgeDoc);

  return { bridge, bridgePathRun, bridgePathPolicy };
}

function registrySchema() {
  return {
    schema: 'rv_v7_registry_schema_v1',
    fields: [
      'canonical_id', 'symbol', 'exchange', 'mic', 'provider_symbol', 'name', 'type_norm',
      'last_trade_date', 'bars_count', 'avg_volume_10d', 'avg_volume_30d',
      'pointers.history_pack', 'pointers.pack_sha256', 'pointers.symbol_group',
      'computed.score_0_100', 'computed.layer', 'flags.ghost_price', 'meta.updated_at', 'meta.run_id'
    ]
  };
}

async function buildRegistry({ rows, runId, runDir }) {
  const ts = nowIso();
  const prevSnapshotPath = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
  const prevSnapshot = await readJsonGz(prevSnapshotPath, null);
  const prevRecords = Array.isArray(prevSnapshot?.records) ? prevSnapshot.records : [];
  const prevById = new Map(prevRecords.map((r) => [r.canonical_id, r]));

  const registryRows = rows.map((row) => ({
    ...(prevById.get(row.canonical_id) || {}),
    canonical_id: row.canonical_id,
    symbol: row.symbol,
    exchange: row.exchange,
    mic: row.mic,
    provider_symbol: row.provider_symbol,
    name: row.name || null,
    currency: row.currency || null,
    country: row.country || null,
    type_norm: normalizeTypeNorm(row.type_norm),
    last_trade_date: prevById.get(row.canonical_id)?.last_trade_date || null,
    bars_count: toSafeNum(prevById.get(row.canonical_id)?.bars_count, null),
    avg_volume_10d: toSafeNum(prevById.get(row.canonical_id)?.avg_volume_10d, null),
    avg_volume_30d: toSafeNum(prevById.get(row.canonical_id)?.avg_volume_30d, null),
    pointers: {
      history_pack: prevById.get(row.canonical_id)?.pointers?.history_pack || null,
      pack_sha256: prevById.get(row.canonical_id)?.pointers?.pack_sha256 || null,
      symbol_group: prevById.get(row.canonical_id)?.pointers?.symbol_group || null
    },
    computed: {
      score_0_100: null,
      layer: null
    },
    flags: {
      ghost_price: prevById.get(row.canonical_id)?.flags?.ghost_price ?? null
    },
    _quality_basis: prevById.get(row.canonical_id)?._quality_basis || 'estimate',
    meta: {
      updated_at: ts,
      run_id: runId,
      git_sha: process.env.GITHUB_SHA || null
    }
  }));

  const registryDir = path.join(runDir, 'registry');
  const registryLogPath = path.join(registryDir, 'registry.ndjson.gz');
  const registrySnapshotPath = path.join(registryDir, 'registry.snapshot.json.gz');
  const schemaPath = path.join(registryDir, 'registry.schema.json');

  await writeNdjsonGz(registryLogPath, registryRows);
  await writeJsonGz(registrySnapshotPath, {
    schema: 'rv_v7_registry_snapshot_v1',
    generated_at: ts,
    record_count: registryRows.length,
    records: registryRows
  });
  await writeJsonAtomic(schemaPath, registrySchema());

  return {
    registryRows,
    registryLogPath,
    registrySnapshotPath,
    schemaPath
  };
}

async function applyDailySweep({
  registryRows,
  budget,
  cfg,
  offline = false,
  budgetStatePath = null,
  budgetTracker = null,
  runId = null
}) {
  const discoveryCfg = cfg?.discovery || {};
  const sweepCfg = cfg?.daily_sweep || {};
  const exchangeDenylist = new Set(
    Array.isArray(sweepCfg?.exchange_denylist)
      ? sweepCfg.exchange_denylist.map((x) => String(x).toUpperCase())
      : Array.isArray(discoveryCfg?.exchange_denylist)
        ? discoveryCfg.exchange_denylist.map((x) => String(x).toUpperCase())
        : []
  );
  const maxExchangesPerRun = Number(sweepCfg?.max_exchanges_per_run || 0);
  const useBulk = sweepCfg?.use_bulk_endpoint !== false;
  const networkAllowed = String(process.env.NETWORK_ALLOWED || '').toLowerCase() === 'true';
  const skipNetwork = offline || !networkAllowed;

  let updated = 0;
  let inputRows = 0;
  const perExchange = {};

  const rowsByExchangeSymbol = new Map();
  for (const rec of registryRows) {
    const ex = String(rec?.exchange || '').toUpperCase();
    const sym = String(rec?.symbol || '').toUpperCase();
    if (!ex || !sym) continue;
    rowsByExchangeSymbol.set(`${ex}:${sym}`, rec);
  }

  const exchanges = [...new Set(
    registryRows
      .map((r) => String(r?.exchange || '').toUpperCase())
      .filter(Boolean)
  )]
    .filter((ex) => !exchangeDenylist.has(ex))
    .sort();

  const selectedExchanges = maxExchangesPerRun > 0 ? exchanges.slice(0, maxExchangesPerRun) : exchanges;

  if (useBulk && !skipNetwork) {
    ensureNetworkAllowed();
    for (const ex of selectedExchanges) {
      if (budget.calls_total >= budget.daily_cap_calls) break;
      const bulkResult = await fetchBulkLastDay(ex).catch((error) => ({
        rows: [],
        attempts: Math.max(1, Number(error?.attempts || 1)),
        error
      }));
      const rows = Array.isArray(bulkResult?.rows) ? bulkResult.rows : [];
      const attempts = Math.max(1, Number(bulkResult?.attempts || 1));
      budget.calls_total += attempts;
      await persistBudgetProgress({
        budget,
        budgetStatePath,
        budgetTracker,
        runId,
        phase: 'daily_sweep_exchange',
        meta: {
          exchange: ex,
          rows: rows.length,
          attempts,
          error: bulkResult?.error ? String(bulkResult.error?.message || 'fetch_failed') : null
        }
      });
      inputRows += rows.length;
      perExchange[ex] = rows.length;

      if (bulkResult?.error) {
        const s = bulkResult.error.status;
        if (s === 402 || s === 429) {
          console.warn(`[DAILY SWEEP] Aborting loop due to API Limit (HTTP ${s}) on exchange ${ex}`);
          break;
        }
      }

      for (const row of rows) {
        const key = `${ex}:${String(row?.symbol || '').toUpperCase()}`;
        const rec = rowsByExchangeSymbol.get(key);
        if (!rec) continue;
        rec.last_trade_date = row.date || rec.last_trade_date;
        const vol = toSafeNum(row?.volume, 0);
        rec.avg_volume_10d = vol;
        rec.avg_volume_30d = vol;
        rec.bars_count = Math.max(1, toSafeNum(rec.bars_count, 0));
        if (rec._quality_basis !== 'backfill_real') rec._quality_basis = 'daily_bulk_estimate';
        updated += 1;
      }
    }

    return {
      updated,
      eod_input_rows: inputRows,
      calls_used: budget.calls_total,
      source: 'eod_bulk_last_day',
      exchanges_attempted: selectedExchanges.length,
      exchanges_covered: Object.keys(perExchange).length,
      rows_by_exchange: perExchange
    };
  }

  // Offline/local fallback: keep US snapshots support so pipeline remains runnable without network.
  const eodPath = path.join(REPO_ROOT, 'public/data/v3/eod/US/latest.ndjson.gz');
  const eodRows = await readNdjsonGz(eodPath, []);
  const eodByTicker = new Map();
  for (const row of eodRows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker || row?.canonical_id?.split(':')?.[1]);
    if (!ticker) continue;
    eodByTicker.set(ticker, row);
  }

  for (const rec of registryRows) {
    if (rec.exchange !== 'US') continue;
    const eod = eodByTicker.get(rec.symbol);
    if (!eod) continue;
    rec.last_trade_date = String(eod?.date || eod?.trading_date || '').slice(0, 10) || rec.last_trade_date;
    const vol = toSafeNum(eod?.volume, 0);
    rec.avg_volume_10d = vol;
    rec.avg_volume_30d = vol;
    rec.bars_count = Math.max(1, toSafeNum(rec.bars_count, 0));
    if (rec._quality_basis !== 'backfill_real') rec._quality_basis = 'daily_bulk_estimate';
    updated += 1;
  }

  return {
    updated,
    eod_input_rows: eodRows.length,
    calls_used: budget.calls_total,
    source: 'offline_us_fallback',
    exchanges_attempted: 1,
    exchanges_covered: 1,
    rows_by_exchange: { US: eodRows.length }
  };
}

function chunkArray(rows, n) {
  const out = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

function parseCanonicalAllowlist(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;

  const normalize = (value) => String(value || '').trim().toUpperCase();
  const out = new Set();

  // @/path/to/file.json(.gz) or .ndjson(.gz)
  if (txt.startsWith('@')) {
    const filePath = txt.slice(1).trim();
    if (!filePath) return null;
    try {
      const abs = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
      if (!fsSync.existsSync(abs)) return null;
      const readRaw = fsSync.readFileSync(abs);
      const content = abs.endsWith('.gz') ? zlib.gunzipSync(readRaw).toString('utf8') : readRaw.toString('utf8');
      if (abs.endsWith('.ndjson') || abs.endsWith('.ndjson.gz')) {
        for (const line of content.split(/\r?\n/)) {
          const t = normalize(line);
          if (t) out.add(t);
        }
      } else {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const t = normalize(item);
            if (t) out.add(t);
          }
        } else if (Array.isArray(parsed?.items)) {
          for (const item of parsed.items) {
            const t = normalize(item?.canonical_id || item?.id || item);
            if (t) out.add(t);
          }
        } else if (Array.isArray(parsed?.canonical_ids)) {
          for (const item of parsed.canonical_ids) {
            const t = normalize(item);
            if (t) out.add(t);
          }
        }
      }
    } catch {
      return null;
    }
    return out.size ? out : null;
  }

  for (const token of txt.split(',')) {
    const t = normalize(token);
    if (t) out.add(t);
  }
  return out.size ? out : null;
}

async function runBackfill({
  registryRows,
  coreSet,
  cfg,
  runId,
  runDir,
  budget,
  offline = false,
  backfillMaxOverride = null,
  budgetStatePath = null,
  budgetTracker = null
}) {
  const backfillCfg = cfg?.backfill || {};
  const envTypeAllow = String(process.env.RV_V7_BACKFILL_TYPE_ALLOWLIST || '').trim();
  const envCanonicalAllowRaw = String(process.env.RV_V7_BACKFILL_CANONICAL_ALLOWLIST || '').trim();
  const envFromDate = String(process.env.RV_V7_BACKFILL_FROM_DATE || '').trim();
  const canonicalAllow = parseCanonicalAllowlist(envCanonicalAllowRaw);
  const backfillWaivers = await loadBackfillWaivers({ repoRoot: REPO_ROOT, cfg, typeFilter: 'STOCK' });
  const waivedBackfillIds = backfillWaivers.ids;
  const enabled = backfillCfg?.enabled !== false;
  const parsedOverride = Number(backfillMaxOverride);
  const configuredMaxSymbolsPerRun = Math.max(0, Number(backfillCfg?.max_symbols_per_run || 120));
  const hardCapSymbolsPerRun = Math.max(
    configuredMaxSymbolsPerRun,
    Number(backfillCfg?.hard_cap_symbols_per_run || configuredMaxSymbolsPerRun)
  );
  const requestedSymbolsPerRun = Number.isFinite(parsedOverride)
    ? Math.max(0, parsedOverride)
    : configuredMaxSymbolsPerRun;
  const allowOversize = String(process.env.RV_V7_ALLOW_OVERSIZE_BACKFILL || '').toLowerCase() === 'true';
  const maxSymbolsPerRun = allowOversize
    ? requestedSymbolsPerRun
    : Math.min(requestedSymbolsPerRun, hardCapSymbolsPerRun);
  const fromDate = envFromDate || String(backfillCfg?.from_date || '2018-01-01');
  const checkpointEvery = Number(backfillCfg?.checkpoint_every_symbols || cfg?.resume?.checkpoint_every_symbols || 1000);
  const maxEmptyRetries = Math.max(1, Number(backfillCfg?.max_empty_retries || 2));
  const checkpointPath = resolvePathMaybe(cfg?.resume?.checkpoint_path)
    || path.join(runDir, 'state', 'backfill_checkpoint.json');
  const checkpoint = await readCheckpoint(checkpointPath, {
    requireHash: Boolean(cfg?.resume?.checkpoint_hash_required)
  });

  if (checkpoint?.invalid) {
    return {
      status: 'FAIL',
      code: EXIT.CHECKPOINT_INVALID,
      reason: checkpoint.reason,
      details: checkpoint.doc
    };
  }

  const defaultTypePriority = ['STOCK', 'ETF', 'FUND', 'INDEX', 'FOREX', 'CRYPTO', 'BOND', 'OTHER'];
  const configuredTypePriority = Array.isArray(backfillCfg?.type_priority) && backfillCfg.type_priority.length
    ? backfillCfg.type_priority.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
    : defaultTypePriority;
  const typePriority = configuredTypePriority.reduce((acc, typeNorm, index) => {
    if (!(typeNorm in acc)) acc[typeNorm] = index;
    return acc;
  }, {});

  const typeAllow = envTypeAllow
    ? new Set(
      envTypeAllow
        .split(',')
        .map((x) => String(x || '').trim().toUpperCase())
        .filter(Boolean)
    )
    : Array.isArray(backfillCfg?.type_allowlist)
      ? new Set(backfillCfg.type_allowlist.map((x) => String(x).toUpperCase()))
      : null;
  const exchangeAllow = Array.isArray(backfillCfg?.exchange_allowlist)
    ? new Set(backfillCfg.exchange_allowlist.map((x) => String(x).toUpperCase()))
    : null;
  const exchangeDeny = new Set(
    Array.isArray(backfillCfg?.exchange_denylist)
      ? backfillCfg.exchange_denylist.map((x) => String(x).toUpperCase())
      : Array.isArray(cfg?.discovery?.exchange_denylist)
        ? cfg.discovery.exchange_denylist.map((x) => String(x).toUpperCase())
        : []
  );

  const fullQueue = registryRows
    .filter((row) => {
      const ex = String(row?.exchange || '').toUpperCase();
      const tn = String(row?.type_norm || 'OTHER').toUpperCase();
      if (!row?.canonical_id) return false;
      if (waivedBackfillIds.has(String(row.canonical_id || '').toUpperCase())) return false;
      if (canonicalAllow && !canonicalAllow.has(String(row.canonical_id || '').toUpperCase())) return false;
      if (exchangeAllow && !exchangeAllow.has(ex)) return false;
      if (exchangeDeny.has(ex)) return false;
      if (typeAllow && !typeAllow.has(tn)) return false;
      return true;
    })
    .sort((a, b) => {
      const aType = typePriority[String(a?.type_norm || 'OTHER').toUpperCase()] ?? 99;
      const bType = typePriority[String(b?.type_norm || 'OTHER').toUpperCase()] ?? 99;
      if (aType !== bType) return aType - bType;
      const aCore = coreSet.has(a.canonical_id) ? 0 : 1;
      const bCore = coreSet.has(b.canonical_id) ? 0 : 1;
      if (aCore !== bCore) return aCore - bCore;
      const aReal = String(a?._quality_basis || '').toLowerCase() === 'backfill_real' ? 1 : 0;
      const bReal = String(b?._quality_basis || '').toLowerCase() === 'backfill_real' ? 1 : 0;
      if (aReal !== bReal) return aReal - bReal;
      const aBars = Number.isFinite(Number(a?.bars_count)) ? Number(a.bars_count) : 0;
      const bBars = Number.isFinite(Number(b?.bars_count)) ? Number(b.bars_count) : 0;
      if (aBars !== bBars) return aBars - bBars;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    })
    .map((row) => row.canonical_id);

  const queueHash = stableContentHash(fullQueue);
  const queueSet = new Set(fullQueue);

  const done = new Set();
  const failCounts = new Map();
  let pending = [...fullQueue];
  if (Array.isArray(checkpoint?.doc?.symbols_done)) {
    for (const cid of checkpoint.doc.symbols_done) {
      if (queueSet.has(cid)) done.add(cid);
    }
  }
  if (checkpoint?.doc && typeof checkpoint.doc.fail_counts === 'object' && checkpoint.doc.fail_counts) {
    for (const [cid, rawCount] of Object.entries(checkpoint.doc.fail_counts)) {
      if (!queueSet.has(cid) || done.has(cid)) continue;
      const n = Number(rawCount);
      if (Number.isFinite(n) && n > 0) failCounts.set(cid, Math.floor(n));
    }
  }
  if (checkpoint?.doc?.queue_hash === queueHash && Array.isArray(checkpoint.doc.symbols_pending)) {
    pending = checkpoint.doc.symbols_pending.filter((cid) => queueSet.has(cid));
  } else if (done.size > 0) {
    // Queue changed (e.g. small discovery delta): continue progress using done-set intersection.
    pending = fullQueue.filter((cid) => !done.has(cid));
  }

  const registryById = new Map(registryRows.map((row) => [row.canonical_id, row]));
  const isBackfillReal = (row) => String(row?._quality_basis || row?.quality_basis || '').toLowerCase() === 'backfill_real';
  const forcedPendingSet = canonicalAllow ? new Set([...canonicalAllow].filter((cid) => queueSet.has(cid))) : new Set();
  const qualityPending = fullQueue.filter((cid) => forcedPendingSet.has(cid) || !isBackfillReal(registryById.get(cid)));
  if (qualityPending.length > 0) {
    const qualityPendingSet = new Set(qualityPending);
    // Keep checkpoint state aligned with actual quality basis:
    // symbols that are not backfill_real must remain in pending, not done.
    pending = pending.filter((cid) => qualityPendingSet.has(cid));
    const pendingSet = new Set(pending);
    for (const cid of qualityPending) {
      if (!pendingSet.has(cid)) {
        pending.push(cid);
        pendingSet.add(cid);
      }
      done.delete(cid);
    }
  }
  const barsById = new Map();
  const updatedSet = new Set();
  const packMaxSymbols = Math.max(1, Number(cfg?.packs?.max_pack_symbols || 2000));
  const incrementalPackWrite = String(
    process.env.RV_V7_INCREMENTAL_PACK_WRITE ?? backfillCfg?.incremental_pack_write ?? ''
  ).toLowerCase() === 'true';
  const incrementalPackBufferCap = Math.max(
    packMaxSymbols,
    Number(
      process.env.RV_V7_INCREMENTAL_PACK_BUFFER_SYMBOLS
      || backfillCfg?.incremental_pack_buffer_symbols
      || (packMaxSymbols * 2)
    )
  );
  const packs = [];
  const incrementalGroupState = new Map();
  let bufferedSymbols = 0;

  function groupKeyForRecord(rec) {
    const exchange = String(rec?.exchange || 'UNK').toUpperCase();
    const bucket = String(rec?.symbol || 'other').charAt(0).toLowerCase() || 'other';
    return `${exchange}/${bucket}`;
  }

  async function flushPackGroup(groupKey, { force = false } = {}) {
    const state = incrementalGroupState.get(groupKey);
    if (!state || !Array.isArray(state.rows) || state.rows.length <= 0) return;
    const [exchange, bucket] = groupKey.split('/');

    while (state.rows.length > 0 && (force || state.rows.length >= packMaxSymbols)) {
      const take = Math.min(packMaxSymbols, state.rows.length);
      const chunk = state.rows
        .splice(0, take)
        .sort((a, b) => String(a?.canonical_id || '').localeCompare(String(b?.canonical_id || '')));
      if (chunk.length <= 0) break;
      const runTag = String(runId || 'run').replace(/[^a-zA-Z0-9_-]/g, '');
      let packId = `inc_${runTag}_${String(state.packIdx).padStart(4, '0')}`;
      let rel = `history/${exchange}/${bucket}/${packId}.ndjson.gz`;
      let abs = path.join(REPO_ROOT, 'mirrors/universe-v7', rel);
      while (fsSync.existsSync(abs)) {
        state.packIdx += 1;
        packId = `inc_${runTag}_${String(state.packIdx).padStart(4, '0')}`;
        rel = `history/${exchange}/${bucket}/${packId}.ndjson.gz`;
        abs = path.join(REPO_ROOT, 'mirrors/universe-v7', rel);
      }
      await writeNdjsonGz(abs, chunk);
      const sha = await sha256File(abs);
      const symbolGroup = `${chunk[0]?.canonical_id || ''}..${chunk[chunk.length - 1]?.canonical_id || ''}`;
      packs.push({ rel, sha, exchange, bucket, symbols: chunk.length, symbol_group: symbolGroup });
      bufferedSymbols = Math.max(0, bufferedSymbols - chunk.length);
      state.packIdx += 1;
      globalThis.__rv_counters = {
        ...(globalThis.__rv_counters || {}),
        packs_written: Number(globalThis.__rv_counters?.packs_written || 0) + 1
      };

      for (const row of chunk) {
        const rec = registryById.get(row.canonical_id);
        if (!rec) continue;
        rec.pointers.history_pack = rel;
        rec.pointers.pack_sha256 = `sha256:${sha}`;
        rec.pointers.symbol_group = symbolGroup;
      }
    }
  }

  async function flushIncrementalPacks({ force = false } = {}) {
    const keys = [...incrementalGroupState.keys()].sort();
    for (const key of keys) await flushPackGroup(key, { force });
  }

  async function enqueueBackfillBars({ cid, rec, bars }) {
    if (!incrementalPackWrite) {
      barsById.set(cid, bars);
      return;
    }
    const key = groupKeyForRecord(rec);
    if (!incrementalGroupState.has(key)) {
      incrementalGroupState.set(key, {
        packIdx: 1,
        rows: []
      });
    }
    const state = incrementalGroupState.get(key);
    state.rows.push({ canonical_id: cid, bars });
    bufferedSymbols += 1;

    if (state.rows.length >= packMaxSymbols) {
      await flushPackGroup(key);
    }
    if (bufferedSymbols >= incrementalPackBufferCap) {
      // Force-flush buffered rows across groups to keep RAM bounded.
      await flushIncrementalPacks({ force: true });
    }
  }

  if (!enabled || pending.length === 0 || offline) {
    return {
      status: 'OK',
      code: EXIT.SUCCESS,
      barsById,
      fetched_symbols: 0,
      processed_symbols: 0,
      queue_total: fullQueue.length,
      max_symbols_per_run_requested: requestedSymbolsPerRun,
      max_symbols_per_run_effective: maxSymbolsPerRun,
      max_symbols_per_run_hard_cap: hardCapSymbolsPerRun,
      pack_write_mode: incrementalPackWrite ? 'incremental' : 'finalize',
      incremental_pack_buffer_cap: incrementalPackBufferCap,
      remaining: pending.length,
      checkpoint_path: checkpointPath,
      packs: [],
      updated_ids: []
    };
  }

  ensureNetworkAllowed();

  let processed = 0;
  let fetchedWithData = 0;
  let consumed = 0;
  const runQueue = pending.slice(0, Math.max(0, maxSymbolsPerRun));
  const cap = Number(budget?.daily_cap_calls || cfg?.budget?.daily_cap_calls || 30000);
  const concurrency = Math.max(1, Number(cfg?.rate_limit?.concurrency || 8));
  let nextCheckpointAt = checkpointEvery;
  let budgetStopped = false;
  let apiLimitStop = false;
  let apiThrottleStop = false;
  let stopReason = 'ok';
  const retryTail = [];

  while (consumed < runQueue.length && budget.calls_total < cap) {
    const budgetLeft = Math.max(0, cap - budget.calls_total);
    if (budgetLeft <= 0) break;

    const batchSize = Math.min(concurrency, runQueue.length - consumed, budgetLeft);
    const batchIds = runQueue.slice(consumed, consumed + batchSize);

    const batchResults = await Promise.all(batchIds.map(async (cid) => {
      const rec = registryById.get(cid);
      if (!rec) return { cid, rec: null, bars: [], error: null, attempts: 0 };
      try {
        const eodResult = await fetchDailyEod(rec.symbol, rec.exchange, { from: fromDate });
        return {
          cid,
          rec,
          bars: Array.isArray(eodResult?.rows) ? eodResult.rows : [],
          error: null,
          attempts: Math.max(1, Number(eodResult?.attempts || 1))
        };
      } catch (error) {
        return {
          cid,
          rec,
          bars: [],
          error,
          attempts: Math.max(1, Number(error?.attempts || 1))
        };
      }
    }));

    const batchCallAttempts = batchResults.reduce((acc, row) => acc + Math.max(0, Number(row?.attempts || 0)), 0);
    budget.calls_total += batchCallAttempts;
    await persistBudgetProgress({
      budget,
      budgetStatePath,
      budgetTracker,
      runId,
      phase: 'backfill_batch',
      meta: {
        batch_size: batchResults.length,
        batch_call_attempts: batchCallAttempts,
        consumed,
        queue_total: runQueue.length
      }
    });

    for (const row of batchResults) {
      const { cid, rec, bars, error } = row;
      processed += 1;
      consumed += 1;

      if (!rec) continue;
      const status = Number(error?.status || NaN);
      if (Number.isFinite(status) && status === 402) {
        apiLimitStop = true;
        stopReason = 'api_limit_reached_402';
      } else if (Number.isFinite(status) && status === 429) {
        apiThrottleStop = true;
        stopReason = 'api_rate_limited_429';
      }

      if (Array.isArray(bars) && bars.length > 0) {
        fetchedWithData += 1;
        done.add(cid);
        failCounts.delete(cid);
        await enqueueBackfillBars({ cid, rec, bars });
        rec.last_trade_date = bars[bars.length - 1]?.date || rec.last_trade_date;
        rec.bars_count = bars.length;
        const v10 = bars.slice(-10).map((b) => toSafeNum(b.volume, 0));
        const v30 = bars.slice(-30).map((b) => toSafeNum(b.volume, 0));
        rec.avg_volume_10d = avg(v10);
        rec.avg_volume_30d = avg(v30);
        rec._tmp_recent_closes = bars.slice(-10).map((b) => toSafeNum(b.close, null)).filter((v) => v !== null);
        rec._tmp_recent_volumes = bars.slice(-10).map((b) => toSafeNum(b.volume, 0));
        rec._quality_basis = 'backfill_real';
        updatedSet.add(cid);
      } else {
        const attempts = (failCounts.get(cid) || 0) + 1;
        if (attempts >= maxEmptyRetries) {
          done.add(cid);
          failCounts.delete(cid);
        } else {
          failCounts.set(cid, attempts);
          retryTail.push(cid);
        }
      }
    }

    if (apiLimitStop || apiThrottleStop) break;

    if (processed >= nextCheckpointAt) {
      const failCountsObj = Object.fromEntries([...failCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
      await writeCheckpoint({
        checkpointPath,
        payload: {
          schema: 'rv_v7_backfill_checkpoint_v1',
          run_id: runId,
          queue_hash: queueHash,
          symbols_done: [...done],
          symbols_pending: pending.slice(consumed),
          fail_counts: failCountsObj
        }
      });
      nextCheckpointAt += checkpointEvery;
    }
  }

  pending = pending.slice(consumed);
  if (retryTail.length > 0) {
    const pendingSet = new Set(pending);
    for (const cid of retryTail) {
      if (!queueSet.has(cid) || done.has(cid) || pendingSet.has(cid)) continue;
      pending.push(cid);
      pendingSet.add(cid);
    }
  }
  if (apiLimitStop) {
    const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json');
    await writeJsonAtomic(lockPath, {
      schema: 'rv_v7_api_limit_lock_v1',
      generated_at: nowIso(),
      run_id: runId,
      status: 402,
      reason: stopReason,
      calls_total: budget.calls_total,
      daily_cap_calls: cap
    });
    budgetStopped = true;
  } else if (apiThrottleStop) {
    budgetStopped = true;
  } else if (budget.calls_total >= cap && pending.length > 0) {
    budgetStopped = true;
    stopReason = 'budget_cap_reached';
  }

  const failCountsObj = Object.fromEntries([...failCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  await writeCheckpoint({
    checkpointPath,
    payload: {
      schema: 'rv_v7_backfill_checkpoint_v1',
      run_id: runId,
      queue_hash: queueHash,
      symbols_done: [...done],
      symbols_pending: pending,
      fail_counts: failCountsObj
    }
  });

  if (incrementalPackWrite) {
    await flushIncrementalPacks({ force: true });
  } else {
    const groups = new Map();
    for (const [cid, bars] of barsById.entries()) {
      const rec = registryById.get(cid);
      const exchange = String(rec?.exchange || 'UNK').toUpperCase();
      const bucket = String(rec?.symbol || 'other').charAt(0).toLowerCase() || 'other';
      const key = `${exchange}/${bucket}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ canonical_id: cid, bars });
    }

    for (const [group, rows] of groups.entries()) {
      const [exchange, bucket] = group.split('/');
      const chunks = chunkArray(rows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id)), packMaxSymbols);
      let packIdx = 1;
      const runTag = String(runId || 'run').replace(/[^a-zA-Z0-9_-]/g, '');
      for (const chunk of chunks) {
        let packId = `run_${runTag}_${String(packIdx).padStart(4, '0')}`;
        let rel = `history/${exchange}/${bucket}/${packId}.ndjson.gz`;
        let abs = path.join(REPO_ROOT, 'mirrors/universe-v7', rel);
        while (fsSync.existsSync(abs)) {
          packIdx += 1;
          packId = `run_${runTag}_${String(packIdx).padStart(4, '0')}`;
          rel = `history/${exchange}/${bucket}/${packId}.ndjson.gz`;
          abs = path.join(REPO_ROOT, 'mirrors/universe-v7', rel);
        }
        await writeNdjsonGz(abs, chunk);
        const sha = await sha256File(abs);
        const symbolGroup = `${chunk[0]?.canonical_id || ''}..${chunk[chunk.length - 1]?.canonical_id || ''}`;
        packs.push({ rel, sha, exchange, bucket, symbols: chunk.length, symbol_group: symbolGroup });
        globalThis.__rv_counters = {
          ...(globalThis.__rv_counters || {}),
          packs_written: Number(globalThis.__rv_counters?.packs_written || 0) + 1
        };

        for (const row of chunk) {
          const rec = registryById.get(row.canonical_id);
          if (!rec) continue;
          rec.pointers.history_pack = rel;
          rec.pointers.pack_sha256 = `sha256:${sha}`;
          rec.pointers.symbol_group = symbolGroup;
        }
        packIdx += 1;
      }
    }
  }

  await writeJsonAtomic(path.join(REPO_ROOT, 'mirrors/universe-v7/manifests/packs_manifest.json'), {
    schema: 'rv_v7_packs_manifest_v1',
    generated_at: nowIso(),
    run_id: runId,
    pack_count: packs.length,
    packs
  });

  return {
    status: 'OK',
    code: apiThrottleStop
      ? EXIT.API_THROTTLE
      : budgetStopped
        ? EXIT.BUDGET_STOP
        : EXIT.SUCCESS,
    reason: stopReason,
    barsById,
    fetched_symbols: fetchedWithData,
    processed_symbols: processed,
    queue_total: fullQueue.length,
    max_symbols_per_run_requested: requestedSymbolsPerRun,
    max_symbols_per_run_effective: maxSymbolsPerRun,
    max_symbols_per_run_hard_cap: hardCapSymbolsPerRun,
    pack_write_mode: incrementalPackWrite ? 'incremental' : 'finalize',
    incremental_pack_buffer_cap: incrementalPackBufferCap,
    remaining: pending.length,
    done_total: done.size,
    waived_canonical_ids_count: waivedBackfillIds.size,
    waived_canonical_ids_path: path.relative(REPO_ROOT, backfillWaivers.path),
    checkpoint_path: checkpointPath,
    packs,
    updated_ids: [...updatedSet]
  };
}

function computeEligibility({ rec, cfg }) {
  const weights = cfg?.eligibility?.weights || {
    history_depth: 0.4,
    ohlcv_completeness: 0.25,
    volume_quality: 0.2,
    freshness: 0.15
  };

  const bars = Math.max(0, toSafeNum(rec.bars_count, 0));
  const years = bars / 252;
  const historyDepth = years >= 10 ? 1 : years <= 0 ? 0 : years / 10;

  const profile = profileForType(rec.type_norm);
  const requiresVolume = profile === 'EQUITY_LIKE' || profile === 'CRYPTO_LIKE';

  const ohlcvCompleteness = bars > 0 ? 1 : 0;

  const avg10 = Math.max(0, toSafeNum(rec.avg_volume_10d, 0));
  const avg30 = Math.max(0, toSafeNum(rec.avg_volume_30d, 0));
  const volumeGate = avg10 >= Number(cfg?.volume?.min_avg_volume_10d_equity || 10000) ? 1 : 0;
  const volumeConsistency = avg30 <= 0
    ? 0
    : clamp(1 - (stdev(rec._tmp_recent_volumes || [avg30]) / Math.max(1, avg30)), 0, 1);

  let volumeScore = 0.7;
  if (requiresVolume) {
    volumeScore = volumeGate === 0 ? 0 : 0.5 * volumeGate + 0.5 * volumeConsistency;
  }

  const stale = stalenessBusinessDays(rec.last_trade_date, cfg);
  const freshnessMax = Number(cfg?.eligibility?.freshness_max_days || 180);
  const freshness = clamp(1 - stale / Math.max(1, freshnessMax), 0, 1);

  const score = Math.round(
    100 * (
      Number(weights.history_depth || 0.4) * historyDepth +
      Number(weights.ohlcv_completeness || 0.25) * ohlcvCompleteness +
      Number(weights.volume_quality || 0.2) * volumeScore +
      Number(weights.freshness || 0.15) * freshness
    )
  );

  const t = cfg?.eligibility?.layer_thresholds || { L1_FULL: 85, L2_PARTIAL: 65, L3_MINIMAL: 40 };
  let layer = 'L4_DEAD';
  if (score >= Number(t.L1_FULL || 85)) layer = 'L1_FULL';
  else if (score >= Number(t.L2_PARTIAL || 65)) layer = 'L2_PARTIAL';
  else if (score >= Number(t.L3_MINIMAL || 40)) layer = 'L3_MINIMAL';

  // Protect feature correctness: only full history backfills can unlock non-core layers.
  const qualityBasis = String(rec?._quality_basis || 'estimate');
  if (qualityBasis !== 'backfill_real') layer = 'L4_DEAD';

  return {
    profile,
    staleness_bd: stale,
    score,
    layer
  };
}

async function computeEligibilityAndReports({ registryRows, coreSet, cfg, runId, runDir }) {
  const byLayer = { L0_LEGACY_CORE: 0, L1_FULL: 0, L2_PARTIAL: 0, L3_MINIMAL: 0, L4_DEAD: 0 };
  const byType = {};

  for (const rec of registryRows) {
    const e = computeEligibility({ rec, cfg });
    rec.computed.score_0_100 = e.score;
    rec.computed.profile = e.profile;
    rec.computed.staleness_bd = e.staleness_bd;
    rec.computed.layer = coreSet.has(rec.canonical_id) ? 'L0_LEGACY_CORE' : e.layer;

    byLayer[rec.computed.layer] = (byLayer[rec.computed.layer] || 0) + 1;
    byType[rec.type_norm] = (byType[rec.type_norm] || 0) + 1;
  }

  const discoveredCount = registryRows.length;
  const ingestibleCount = registryRows.filter((r) => Number.isFinite(Number(r.bars_count)) && Number(r.bars_count) > 0).length;

  const eligibleAnalyzer = registryRows.filter((r) => ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL'].includes(r.computed.layer)).length;
  const eligibleForecast = registryRows.filter((r) => ['L0_LEGACY_CORE', 'L1_FULL'].includes(r.computed.layer)).length;
  const eligibleMarketphase = registryRows.filter((r) => ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL', 'L3_MINIMAL'].includes(r.computed.layer)).length;
  const eligibleScientific = registryRows.filter((r) => ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL'].includes(r.computed.layer)).length;

  const kpiReport = {
    schema: 'rv_v7_kpi_levels_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    discovered_count: discoveredCount,
    active_ingestible_count: ingestibleCount,
    feature_eligible_count: {
      analyzer: eligibleAnalyzer,
      forecast: eligibleForecast,
      marketphase: eligibleMarketphase,
      scientific: eligibleScientific
    },
    feature_eligible_pct_of_ingestible: {
      analyzer: ingestibleCount ? Number(clamp(eligibleAnalyzer / ingestibleCount, 0, 1).toFixed(4)) : 0,
      forecast: ingestibleCount ? Number(clamp(eligibleForecast / ingestibleCount, 0, 1).toFixed(4)) : 0,
      marketphase: ingestibleCount ? Number(clamp(eligibleMarketphase / ingestibleCount, 0, 1).toFixed(4)) : 0,
      scientific: ingestibleCount ? Number(clamp(eligibleScientific / ingestibleCount, 0, 1).toFixed(4)) : 0
    },
    by_layer: byLayer,
    by_type_norm: byType
  };

  const featureReport = {
    schema: 'rv_v7_feature_eligibility_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    counts_by_layer: byLayer,
    counts_by_feature: kpiReport.feature_eligible_count,
    breakdown_by_type_norm: byType,
    assumptions: {
      analyzer: 'layer >= L2_PARTIAL or legacy core',
      forecast: 'layer == L1_FULL or legacy core',
      marketphase: 'layer >= L3_MINIMAL or legacy core',
      scientific: 'layer >= L2_PARTIAL or legacy core'
    }
  };

  await writeJsonAtomic(path.join(runDir, 'reports', 'kpi_levels_report.json'), kpiReport);
  await writeJsonAtomic(path.join(runDir, 'reports', 'feature_eligibility_report.json'), featureReport);

  return { kpiReport, featureReport };
}

function rankScore(rec) {
  const elig = toSafeNum(rec.computed?.score_0_100, 0) / 100;
  const avg30 = Math.max(1, toSafeNum(rec.avg_volume_30d, 1));
  const v = Math.log10(avg30) / 10;
  const m = toSafeNum(rec.market_cap_proxy_percentile, 0);
  return 0.6 * elig + 0.3 * v + 0.1 * m;
}

function qualityBasisRank(value) {
  const q = String(value || '').toLowerCase();
  if (q === 'backfill_real') return 3;
  if (q === 'daily_bulk_estimate') return 2;
  if (q === 'estimate') return 1;
  return 0;
}

function toDateScore(raw) {
  const date = String(raw || '').slice(0, 10);
  if (!date) return 0;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : 0;
}

function layerRankForSearch(rawLayer) {
  const layer = String(rawLayer || '').toUpperCase();
  if (layer === 'L0_LEGACY_CORE') return 5;
  if (layer === 'L1_FULL') return 4;
  if (layer === 'L2_PARTIAL') return 3;
  if (layer === 'L3_MINIMAL') return 2;
  return 1;
}

function compareGlobalBestSearchCandidate(a, b) {
  const lr = layerRankForSearch(a?.layer) - layerRankForSearch(b?.layer);
  if (lr !== 0) return lr;

  const q = qualityBasisRank(a?.quality_basis) - qualityBasisRank(b?.quality_basis);
  if (q !== 0) return q;

  const d = toDateScore(a?.last_trade_date) - toDateScore(b?.last_trade_date);
  if (d !== 0) return d;

  const bars = toSafeNum(a?.bars_count, 0) - toSafeNum(b?.bars_count, 0);
  if (bars !== 0) return bars;

  const score = toSafeNum(a?.score_0_100, 0) - toSafeNum(b?.score_0_100, 0);
  if (score !== 0) return score;

  const vol = toSafeNum(a?.avg_volume_30d, 0) - toSafeNum(b?.avg_volume_30d, 0);
  if (vol !== 0) return vol;

  const ac = String(a?.canonical_id || '');
  const bc = String(b?.canonical_id || '');
  if (ac === bc) return 0;
  return ac < bc ? 1 : -1;
}

function buildPrefixBuckets(rows, maxItems = 1000, maxDepth = 3) {
  const out = new Map();

  const items = rows.map((row) => ({
    canonical_id: row.canonical_id,
    symbol: row.symbol,
    name: row.name || null,
    type_norm: row.type_norm,
    layer: row.computed?.layer,
    score_0_100: row.computed?.score_0_100,
    bars_count: toSafeNum(row?.bars_count, 0),
    avg_volume_30d: row.avg_volume_30d || 0,
    last_trade_date: row?.last_trade_date || null,
    quality_basis: row?._quality_basis || null
  }));

  function split(prefix, subset, depth) {
    if (subset.length <= maxItems || depth >= maxDepth) {
      out.set(prefix || '_', subset);
      return;
    }
    const groups = new Map();
    for (const row of subset) {
      const key = (String(row.symbol || '').toLowerCase().charAt(depth) || '_');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [k, v] of groups.entries()) {
      split(`${prefix}${k}`, v, depth + 1);
    }
  }

  const root = new Map();
  for (const row of items) {
    const k = String(row.symbol || '').toLowerCase().charAt(0) || '_';
    if (!root.has(k)) root.set(k, []);
    root.get(k).push(row);
  }

  for (const [k, subset] of root.entries()) split(k, subset, 1);
  return out;
}

async function buildSearchAndReadModels({ registryRows, runDir, cfg }) {
  const searchDir = path.join(runDir, 'search');
  const bucketsDir = path.join(searchDir, 'buckets');
  await fs.mkdir(bucketsDir, { recursive: true });

  const ranked = [...registryRows].sort((a, b) => {
    const as = rankScore(a);
    const bs = rankScore(b);
    if (as !== bs) return bs - as;
    const aScore = toSafeNum(a.computed?.score_0_100, 0);
    const bScore = toSafeNum(b.computed?.score_0_100, 0);
    if (aScore !== bScore) return bScore - aScore;
    const aVol = toSafeNum(a.avg_volume_30d, 0);
    const bVol = toSafeNum(b.avg_volume_30d, 0);
    if (aVol !== bVol) return bVol - aVol;
    return String(a.canonical_id).localeCompare(String(b.canonical_id));
  });

  const topK = ranked.slice(0, 2000).map((row) => ({
    canonical_id: row.canonical_id,
    symbol: row.symbol,
    name: row.name || null,
    type_norm: row.type_norm,
    layer: row.computed?.layer,
    score_0_100: row.computed?.score_0_100,
    bars_count: toSafeNum(row?.bars_count, 0),
    avg_volume_30d: row.avg_volume_30d || 0,
    last_trade_date: row?.last_trade_date || null,
    quality_basis: row?._quality_basis || null
  }));

  await writeJsonGz(path.join(searchDir, 'search_global_top_2000.json.gz'), {
    schema: 'rv_v7_search_top_v1',
    generated_at: nowIso(),
    items: topK
  });

  const buckets = buildPrefixBuckets(ranked, 1000, 3);
  const manifest = {
    schema: 'rv_v7_search_manifest_v1',
    generated_at: nowIso(),
    buckets: {}
  };

  for (const [prefix, rows] of buckets.entries()) {
    const rel = `search/buckets/${prefix}.json.gz`;
    await writeJsonGz(path.join(runDir, rel), {
      schema: 'rv_v7_search_bucket_v1',
      prefix,
      count: rows.length,
      items: rows
    });
    manifest.buckets[prefix] = {
      count: rows.length,
      path: rel,
      sha256: stableContentHash(rows)
    };
  }

  await writeJsonAtomic(path.join(searchDir, 'search_index_manifest.json'), manifest);

  const bySymbolBest = new Map();
  for (const row of ranked) {
    const symbol = normalizeTicker(row?.symbol);
    if (!symbol) continue;
    const candidate = {
      canonical_id: row.canonical_id,
      symbol,
      name: row.name || null,
      type_norm: row.type_norm,
      layer: row.computed?.layer || null,
      score_0_100: toSafeNum(row?.computed?.score_0_100, 0),
      bars_count: toSafeNum(row?.bars_count, 0),
      avg_volume_30d: toSafeNum(row?.avg_volume_30d, 0),
      last_trade_date: row?.last_trade_date || null,
      quality_basis: row?._quality_basis || null
    };
    const current = bySymbolBest.get(symbol);
    if (!current) {
      bySymbolBest.set(symbol, { best: candidate, variants_count: 1 });
      continue;
    }
    current.variants_count += 1;
    if (compareGlobalBestSearchCandidate(candidate, current.best) > 0) current.best = candidate;
  }

  const bySymbolDoc = {};
  const byPrefix1 = {};
  const symbols = [...bySymbolBest.keys()].sort((a, b) => a.localeCompare(b));
  for (const symbol of symbols) {
    const entry = bySymbolBest.get(symbol);
    const outRow = {
      ...entry.best,
      variants_count: entry.variants_count
    };
    bySymbolDoc[symbol] = outRow;
    const p1 = String(symbol || '').charAt(0).toLowerCase() || '_';
    if (!byPrefix1[p1]) byPrefix1[p1] = [];
    byPrefix1[p1].push(symbol);
  }

  await writeJsonGz(path.join(searchDir, 'search_exact_by_symbol.json.gz'), {
    schema: 'rv_v7_search_exact_index_v1',
    generated_at: nowIso(),
    count: symbols.length,
    by_symbol: bySymbolDoc,
    by_prefix_1: byPrefix1
  });

  const readDir = path.join(runDir, 'read_models');
  await fs.mkdir(readDir, { recursive: true });

  function eligibilityFromLayer(layer) {
    const L = String(layer || '');
    const isCore = L === 'L0_LEGACY_CORE';
    return {
      analyzer: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL',
      forecast: isCore || L === 'L1_FULL',
      marketphase: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL' || L === 'L3_MINIMAL',
      scientific: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL'
    };
  }

  const rankedRows = ranked.map((r) => {
    const layer = r.computed?.layer || null;
    return {
      canonical_id: r.canonical_id,
      symbol: r.symbol,
      name: r.name || null,
      type_norm: normalizeTypeNorm(r.type_norm),
      layer,
      score_0_100: r.computed?.score_0_100,
      eligibility: eligibilityFromLayer(layer)
    };
  });

  const readModelsCfg = cfg?.read_models && typeof cfg.read_models === 'object' ? cfg.read_models : {};
  const pageSize = Math.max(20, Math.min(500, Math.floor(toFinite(readModelsCfg.page_size, 100))));
  const defaultMaxItems = {
    marketphase: 12000,
    scientific: 10000,
    forecast: 5000
  };

  function summarizeByType(rows) {
    const out = {};
    for (const row of rows) {
      const t = normalizeTypeNorm(row?.type_norm);
      out[t] = (out[t] || 0) + 1;
    }
    return out;
  }

  function summarizeByLayer(rows) {
    const out = {};
    for (const row of rows) {
      const layer = String(row?.layer || 'UNKNOWN');
      out[layer] = (out[layer] || 0) + 1;
    }
    return out;
  }

  for (const feature of ['marketphase', 'scientific', 'forecast']) {
    const configuredMax = toFinite(readModelsCfg?.max_items?.[feature], defaultMaxItems[feature]);
    const maxItems = Number.isFinite(configuredMax) ? Math.max(100, Math.floor(configuredMax)) : defaultMaxItems[feature];
    const eligibleRows = rankedRows.filter((row) => row?.eligibility?.[feature] === true);
    const featureRows = eligibleRows.slice(0, maxItems);
    const topPreviewRows = featureRows.slice(0, Math.min(featureRows.length, 1000));
    const pages = chunkArray(featureRows, pageSize);
    const totalPages = pages.length;

    await writeJsonGz(path.join(readDir, `${feature}_top.json.gz`), {
      schema: `rv_v7_${feature}_top_v1`,
      generated_at: nowIso(),
      total_items: featureRows.length,
      eligible_total_items: eligibleRows.length,
      preview_items: topPreviewRows.length,
      page_size: pageSize,
      total_pages: totalPages,
      by_type_norm: summarizeByType(featureRows),
      by_layer: summarizeByLayer(featureRows),
      items: topPreviewRows
    });

    const pagesDir = path.join(readDir, `${feature}_pages`);
    await fs.mkdir(pagesDir, { recursive: true });
    for (let i = 0; i < pages.length; i += 1) {
      await writeJsonGz(path.join(pagesDir, `page_${String(i).padStart(3, '0')}.json.gz`), {
        schema: `rv_v7_${feature}_page_v1`,
        page: i,
        page_size: pageSize,
        total_pages: totalPages,
        total_items: featureRows.length,
        eligible_total_items: eligibleRows.length,
        items: pages[i]
      });
    }
  }
}

async function computeGhostPrice({ registryRows, runDir }) {
  let flagged = 0;
  for (const rec of registryRows) {
    const profile = profileForType(rec.type_norm);
    if (!['EQUITY_LIKE', 'CRYPTO_LIKE', 'FOREX_LIKE'].includes(profile)) {
      rec.flags.ghost_price = false;
      continue;
    }

    const closes = Array.isArray(rec._tmp_recent_closes) ? rec._tmp_recent_closes : [];
    const vols = Array.isArray(rec._tmp_recent_volumes) ? rec._tmp_recent_volumes : [];
    if (closes.length < 3) {
      rec.flags.ghost_price = false;
      continue;
    }

    const rounded = closes.map((v) => Number(Number(v).toFixed(4)));
    const allEqual = rounded.every((v) => v === rounded[0]);
    const avgVol = avg(vols);
    const lowVol = avgVol <= 100;
    rec.flags.ghost_price = allEqual && lowVol;
    if (rec.flags.ghost_price) flagged += 1;
  }

  await writeJsonAtomic(path.join(runDir, 'reports', 'ghost_price_report.json'), {
    schema: 'rv_v7_ghost_price_report_v1',
    generated_at: nowIso(),
    flagged_count: flagged
  });
}

async function runDriftAndLegacyGate({ registryRows, coreSet, cfg, runDir, updatedIds = [] }) {
  const stateDir = path.join(REPO_ROOT, 'mirrors/universe-v7/state');
  await fs.mkdir(stateDir, { recursive: true });
  const prevPath = path.join(stateDir, 'quality_snapshot.json');
  const prev = await readJson(prevPath).catch(() => ({ records: [] }));
  const prevById = new Map((Array.isArray(prev.records) ? prev.records : []).map((r) => [r.canonical_id, r]));

  const driftRows = [];
  let red = 0;
  let yellow = 0;
  let info = 0;

  const tBars = Number(cfg?.drift?.bars_count_pct_threshold || 0.05);
  const tStale = Number(cfg?.drift?.staleness_bd_abs_threshold || 5);
  const tDate = Number(cfg?.drift?.last_trade_date_changed_threshold_days || 2);
  const runMode = String(cfg?.run?.mode || 'shadow').toLowerCase();
  const updatedSet = new Set(updatedIds);

  for (const rec of registryRows) {
    const prevRec = prevById.get(rec.canonical_id);
    if (!prevRec) continue;

    const barsNew = toSafeNum(rec.bars_count, 0);
    const barsOld = toSafeNum(prevRec.bars_count, 0);
    const barsPct = Math.abs(barsNew - barsOld) / Math.max(1, barsOld);

    const staleNew = toSafeNum(rec.computed?.staleness_bd, 0);
    const staleOld = toSafeNum(prevRec.staleness_bd, 0);
    const staleAbs = Math.abs(staleNew - staleOld);

    const dateAbs = daysBetween(rec.last_trade_date, prevRec.last_trade_date) ?? 0;

    const drift = barsPct >= tBars || staleAbs >= tStale || dateAbs >= tDate;
    if (!drift) continue;

    let severity = 'INFO';
    const oldBasis = String(prevRec.quality_basis || 'estimate');
    const newBasis = String(rec._quality_basis || 'estimate');
    const comparableReal = oldBasis === 'backfill_real' && newBasis === 'backfill_real';

    if (coreSet.has(rec.canonical_id)) {
      if (runMode === 'shadow' && !comparableReal) {
        severity = 'INFO';
      } else {
        severity = 'RED';
      }
    } else if (['L1_FULL', 'L2_PARTIAL'].includes(rec.computed?.layer)) {
      severity = 'YELLOW';
    }

    if (severity === 'RED') red += 1;
    else if (severity === 'YELLOW') yellow += 1;
    else info += 1;

    driftRows.push({
      canonical_id: rec.canonical_id,
      severity,
      old_quality_basis: oldBasis,
      new_quality_basis: newBasis,
      bars_pct: Number(barsPct.toFixed(4)),
      staleness_abs: staleAbs,
      last_trade_date_shift_days: dateAbs
    });
  }

  await writeJsonAtomic(path.join(runDir, 'reports', 'drift_report.json'), {
    schema: 'rv_v7_drift_report_v1',
    generated_at: nowIso(),
    core_legacy_drift_detected: red > 0,
    counts: { red, yellow, info },
    rows: driftRows.slice(0, 5000)
  });

  const qualitySnapshot = {
    schema: 'rv_v7_quality_snapshot_v1',
    generated_at: nowIso(),
    records: registryRows.map((rec) => ({
      canonical_id: rec.canonical_id,
      bars_count: rec.bars_count,
      staleness_bd: rec.computed?.staleness_bd,
      last_trade_date: rec.last_trade_date,
      layer: rec.computed?.layer,
      quality_basis: rec._quality_basis || 'estimate'
    }))
  };

  await writeJsonAtomic(prevPath, qualitySnapshot);

  if (red > 0) {
    return {
      ok: false,
      code: EXIT.HARD_FAIL_LEGACY_CORE,
      reason: `LEGACY_CORE_DRIFT_RED:${red}`
    };
  }

  return { ok: true, code: EXIT.SUCCESS, drift: { red, yellow, info } };
}

async function enforcePublishRegressionGuard({ registryRows, cfg, runDir, runId, enforce = true }) {
  const minTotalRatio = clamp(toFinite(cfg?.run?.publish_regression_min_ratio, 0.9), 0, 1);
  const minStockRatio = clamp(toFinite(cfg?.run?.publish_regression_stock_ratio, minTotalRatio), 0, 1);
  const prevSnapshotPath = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
  const prevSnapshot = await readJsonGz(prevSnapshotPath, null);
  const prevRows = Array.isArray(prevSnapshot?.records) ? prevSnapshot.records : [];

  const countStocks = (rows) => rows.reduce((acc, row) => (
    acc + (String(row?.type_norm || '').toUpperCase() === 'STOCK' ? 1 : 0)
  ), 0);

  const currentTotal = registryRows.length;
  const prevTotal = prevRows.length;
  const currentStocks = countStocks(registryRows);
  const prevStocks = countStocks(prevRows);

  const totalRatio = prevTotal > 0 ? currentTotal / prevTotal : 1;
  const stockRatio = prevStocks > 0 ? currentStocks / prevStocks : 1;
  const ok = !enforce || (totalRatio >= minTotalRatio && stockRatio >= minStockRatio);

  const report = {
    schema: 'rv_v7_publish_regression_guard_v1',
    generated_at: nowIso(),
    run_id: runId,
    previous: {
      total: prevTotal,
      stocks: prevStocks
    },
    current: {
      total: currentTotal,
      stocks: currentStocks
    },
    thresholds: {
      min_total_ratio: minTotalRatio,
      min_stock_ratio: minStockRatio
    },
    ratios: {
      total_ratio: Number(totalRatio.toFixed(6)),
      stock_ratio: Number(stockRatio.toFixed(6))
    },
    status: enforce ? (ok ? 'PASS' : 'BLOCKED') : 'SKIPPED_OFFLINE_OR_SHADOW',
    enforce
  };

  await writeJsonAtomic(path.join(runDir, 'reports', 'publish_regression_guard.json'), report);

  if (enforce && !ok) {
    const reason = `PUBLISH_REGRESSION_GUARD:${report.ratios.total_ratio}/${minTotalRatio}:${report.ratios.stock_ratio}/${minStockRatio}`;
    return { ok: false, code: EXIT.HARD_FAIL_CONTRACT, reason, report };
  }
  return { ok: true, code: EXIT.SUCCESS, report };
}

// P3 / 1.5b: Pack-size limit — verify individual gz artifacts stay under threshold
async function assertPackSize(packPath, maxPackMbGz = 1800) {
  try {
    const stat = await fs.stat(packPath);
    const mb = stat.size / (1024 * 1024);
    if (mb > maxPackMbGz) {
      return { ok: false, reason: `PACK_TOO_LARGE:${path.basename(packPath)}:${mb.toFixed(1)}MB/${maxPackMbGz}MB` };
    }
    return { ok: true, mb: Math.round(mb * 10) / 10 };
  } catch (err) {
    return { ok: true, mb: 0, note: `stat_failed:${err.message}` };
  }
}

async function enforcePackLimits({ publishDir, cfg }) {
  const maxPackMb = Number(cfg?.packs?.max_pack_mb_gz || 1800);
  const warnThresholdPct = Number(cfg?.packs?.warn_threshold_pct || 90);
  const gzFiles = (await walkFiles(publishDir, { ignore: new Set(['.DS_Store']) }))
    .filter((file) => file.full.endsWith('.gz'));

  const rows = [];
  for (const file of gzFiles) {
    const check = await assertPackSize(file.full, maxPackMb);
    rows.push({
      rel: file.rel,
      mb: check?.mb ?? null,
      ok: Boolean(check?.ok),
      note: check?.note || null
    });
    if (!check.ok) {
      const reportsDir = path.join(REPO_ROOT, 'public/data/universe/v7/reports');
      await writeJsonAtomic(path.join(reportsDir, 'pack_limits_report.json'), {
        schema: 'rv_v7_pack_limits_report_v1',
        generated_at: nowIso(),
        max_pack_mb_gz: maxPackMb,
        warn_threshold_pct: warnThresholdPct,
        checked_files: rows.length,
        status: 'EXCEEDED',
        offenders: rows.filter((row) => !row.ok),
        top_10_packs: [...rows].sort((a, b) => (b.mb || 0) - (a.mb || 0)).slice(0, 10)
      });
      return { ok: false, code: EXIT.HARD_FAIL_CONTRACT, reason: check.reason };
    }
  }

  const topPacks = [...rows].sort((a, b) => (b.mb || 0) - (a.mb || 0)).slice(0, 10);
  const topPct = topPacks[0]?.mb ? Math.round((topPacks[0].mb / maxPackMb) * 100) : 0;
  const status = topPct >= 100 ? 'EXCEEDED' : topPct >= warnThresholdPct ? 'WARNING' : 'OK';
  const warnings = topPacks
    .filter((row) => Number.isFinite(row.mb) && row.mb >= (maxPackMb * warnThresholdPct / 100))
    .map((row) => ({ rel: row.rel, mb: row.mb }));

  const reportsDir = path.join(REPO_ROOT, 'public/data/universe/v7/reports');
  await writeJsonAtomic(path.join(reportsDir, 'pack_limits_report.json'), {
    schema: 'rv_v7_pack_limits_report_v1',
    generated_at: nowIso(),
    max_pack_mb_gz: maxPackMb,
    warn_threshold_pct: warnThresholdPct,
    checked_files: rows.length,
    status,
    warnings,
    top_10_packs: topPacks
  });

  if (status === 'WARNING') {
    console.warn(`[LIMITS] Largest .gz pack at ${topPct}% of ${maxPackMb}MB limit (${topPacks[0]?.rel || 'n/a'})`);
  }

  return { ok: true, code: EXIT.SUCCESS, status, checked: rows.length, max_pack_mb_gz: maxPackMb };
}

async function enforceFileLimits({ publishDir, cfg }) {
  const files = await walkFiles(publishDir, { ignore: new Set(['.DS_Store']) });
  const maxTotal = Number(cfg?.public_limits?.max_total_files || 20000);
  const maxSingleMb = Number(cfg?.public_limits?.max_single_artifact_mb || 50);
  const maxTotalMb = Number(cfg?.public_limits?.max_total_public_mb || 2048);

  if (files.length > maxTotal) {
    return { ok: false, code: EXIT.HARD_FAIL_CONTRACT, reason: `PUBLIC_FILE_COUNT_EXCEEDED:${files.length}` };
  }

  let totalBytes = 0;
  const fileSizes = [];
  for (const file of files) {
    const stat = await fs.stat(file.full);
    const sizeMb = stat.size / (1024 * 1024);
    totalBytes += stat.size;
    fileSizes.push({ rel: file.rel, mb: Math.round(sizeMb * 100) / 100 });
    if (sizeMb > maxSingleMb) {
      return { ok: false, code: EXIT.HARD_FAIL_CONTRACT, reason: `PUBLIC_FILE_TOO_LARGE:${file.rel}:${sizeMb.toFixed(2)}MB` };
    }
  }

  const totalMb = totalBytes / (1024 * 1024);
  const topFiles = [...fileSizes].sort((a, b) => b.mb - a.mb).slice(0, 10);
  const pctUsed = Math.round((totalMb / maxTotalMb) * 100);
  const status = totalMb > maxTotalMb ? 'EXCEEDED'
    : pctUsed >= 90 ? 'WARNING'
      : 'OK';

  // Limits report (P3 Diagnose)
  const reportsDir = path.join(REPO_ROOT, 'public/data/universe/v7/reports');
  await writeJsonAtomic(path.join(reportsDir, 'public_limits_report.json'), {
    schema: 'rv_v7_public_limits_report_v1',
    generated_at: nowIso(),
    total_mb: Math.round(totalMb * 10) / 10,
    max_total_mb: maxTotalMb,
    pct_used: pctUsed,
    file_count: files.length,
    max_file_count: maxTotal,
    top_10_files: topFiles,
    status
  });

  if (totalMb > maxTotalMb) {
    return {
      ok: false, code: EXIT.HARD_FAIL_CONTRACT,
      reason: `PUBLIC_TOTAL_MB_EXCEEDED:${totalMb.toFixed(1)}MB/${maxTotalMb}MB`,
      top_offenders: topFiles
    };
  }
  if (pctUsed >= 90) {
    console.warn(`[LIMITS] Public dir at ${pctUsed}% of ${maxTotalMb}MB limit. Top: ${topFiles[0]?.rel}`);
  }

  return { ok: true, code: EXIT.SUCCESS, total_mb: totalMb, file_count: files.length, status };
}

async function writePublishPayload({ cfg, runDir, runId, contractDoc, registryRows }) {
  const publishRoot = path.join(runDir, 'publish_payload');
  const dirs = [
    'core', 'registry', 'search', 'search/buckets', 'read_models', 'reports', 'config'
  ];
  for (const rel of dirs) await fs.mkdir(path.join(publishRoot, rel), { recursive: true });

  const coreDoc = {
    schema: 'rv_v7_core_legacy_v1',
    generated_at: nowIso(),
    run_id: runId,
    universe_tickers: contractDoc?.legacy_sets?.universe_tickers || []
  };
  await writeJsonGz(path.join(publishRoot, 'core', 'core_legacy.json.gz'), coreDoc);
  await writeJsonAtomic(path.join(publishRoot, 'core', 'core_legacy_hashes.json'), {
    contract_hash: contractDoc?.contract_hash || null,
    legacy_artifacts: contractDoc?.legacy_artifacts || {}
  });

  await writeNdjsonGz(path.join(publishRoot, 'registry', 'registry.ndjson.gz'), registryRows);
  await writeJsonGz(path.join(publishRoot, 'registry', 'registry.snapshot.json.gz'), {
    schema: 'rv_v7_registry_snapshot_v1',
    generated_at: nowIso(),
    record_count: registryRows.length,
    records: registryRows
  });
  await writeJsonAtomic(path.join(publishRoot, 'registry', 'registry.schema.json'), registrySchema());

  // P4: Lean Browse Index (only fields used by Worker browse/filter/sort)
  const browseRows = registryRows.map(r => ({
    canonical_id: r.canonical_id,
    symbol: r.symbol,
    name: r.name || null,
    type_norm: r.type_norm,
    exchange: r.exchange || r.mic || null,
    bars_count: r.bars_count || 0,
    last_trade_date: r.last_trade_date || null,
    status: r.computed?.layer || r.status || null
  }));
  await writeJsonGz(path.join(publishRoot, 'registry', 'registry.browse.json.gz'), {
    schema: 'rv_v7_browse_index_v1',
    generated_at: nowIso(),
    record_count: browseRows.length,
    records: browseRows
  });

  const copyPairs = [
    ['reports/coverage_summary.json', 'reports/coverage_summary.json'],
    ['reports/data_access_report.json', 'reports/data_access_report.json'],
    ['reports/feature_eligibility_report.json', 'reports/feature_eligibility_report.json'],
    ['reports/kpi_levels_report.json', 'reports/kpi_levels_report.json'],
    ['reports/ghost_price_report.json', 'reports/ghost_price_report.json'],
    ['reports/drift_report.json', 'reports/drift_report.json'],
    ['reports/publish_regression_guard.json', 'reports/publish_regression_guard.json'],
    ['reports/budget_report.json', 'reports/budget_report.json'],
    ['reports/run_status.json', 'reports/run_status.json'],
    ['reports/system_status.json', 'reports/system_status.json'],
    ['search/search_index_manifest.json', 'search/search_index_manifest.json'],
    ['search/search_global_top_2000.json.gz', 'search/search_global_top_2000.json.gz'],
    ['search/search_exact_by_symbol.json.gz', 'search/search_exact_by_symbol.json.gz']
  ];

  for (const [srcRel, dstRel] of copyPairs) {
    const src = path.join(runDir, srcRel);
    if (!(await pathExists(src))) continue;
    const dst = path.join(publishRoot, dstRel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }

  for (const f of await walkFiles(path.join(runDir, 'search', 'buckets'), { ignore: new Set(['.DS_Store']) }).catch(() => [])) {
    const rel = path.relative(path.join(runDir, 'search'), f.full);
    const dst = path.join(publishRoot, 'search', rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(f.full, dst);
  }

  for (const f of await walkFiles(path.join(runDir, 'read_models'), { ignore: new Set(['.DS_Store']) }).catch(() => [])) {
    const rel = path.relative(path.join(runDir, 'read_models'), f.full);
    const dst = path.join(publishRoot, 'read_models', rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(f.full, dst);
  }

  const cfgSrc = path.join(REPO_ROOT, 'public/data/universe/v7/config');
  for (const f of await walkFiles(cfgSrc, { ignore: new Set(['.DS_Store']) }).catch(() => [])) {
    const rel = path.relative(cfgSrc, f.full);
    const dst = path.join(publishRoot, 'config', rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(f.full, dst);
  }

  return publishRoot;
}

export async function runPipeline({ runId, args = {} } = {}) {
  const envCandidates = [
    args['env-file'] ? String(args['env-file']) : null,
    process.env.EODHD_ENV_FILE || null,
    '/Users/michaelpuchowezki/Desktop/EODHD.env',
    path.join(REPO_ROOT, '.env.local')
  ].filter(Boolean);
  for (const candidate of envCandidates) {
    const loaded = await loadEnvFile(candidate);
    if (loaded.loaded && Object.keys(loaded.vars || {}).length > 0) break;
  }

  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);

  const effectiveRunId = runId || `v7_${nowIso().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 6)}`;
  const tmpRoot = resolvePathMaybe(cfg?.run?.tmp_dir) || path.join(REPO_ROOT, 'tmp/v7-build');
  const runDir = path.join(tmpRoot, effectiveRunId);
  await fs.mkdir(path.join(runDir, 'reports'), { recursive: true });

  // P1: Breadcrumbs for crash forensics
  globalThis.__rv_run_id = effectiveRunId;
  globalThis.__rv_run_dir = runDir;
  globalThis.__rv_pipeline_phase = 'init';
  globalThis.__rv_counters = { symbols_done: 0, symbols_pending: 0, packs_written: 0 };

  // P1.3: Load persisted budget state for cross-run daily cap tracking
  const budgetStatePath = resolvePathMaybe(cfg?.budget?.state_path)
    || path.join(REPO_ROOT, 'mirrors/universe-v7/state/budget_state.json');
  const persistedBudget = await loadBudgetState(budgetStatePath).catch(() => null);
  const callsLedgerPath = resolvePathMaybe(cfg?.budget?.calls_ledger_path)
    || path.join(path.dirname(budgetStatePath), 'calls_ledger.ndjson');
  const budgetTracker = {
    last_persisted_calls: Number(persistedBudget?.daily_calls || 0),
    calls_ledger_path: callsLedgerPath
  };
  const envDailyCapOverride = Number(process.env.RV_V7_DAILY_CAP_CALLS);
  const budget = {
    calls_total: persistedBudget?.daily_calls || 0,
    daily_cap_calls: Number.isFinite(envDailyCapOverride) && envDailyCapOverride > 0
      ? Math.floor(envDailyCapOverride)
      : Number(cfg?.budget?.daily_cap_calls || 30000)
  };

  const contractPath = resolvePathMaybe(cfg?.legacy_core?.contract_path) || path.join(REPO_ROOT, 'policies/universe/core_legacy_contract.json');
  const contractDoc = await readJson(contractPath).catch(() => null);
  if (!contractDoc) {
    return { ok: false, code: EXIT.HARD_FAIL_LEGACY_CORE, reason: 'missing legacy core contract' };
  }

  const universeAll = await readJson(path.join(REPO_ROOT, 'public/data/universe/all.json')).catch(() => []);
  const { coreSet } = parseLegacyUniverse(contractDoc, universeAll);

  const backfillFastMode = String(process.env.RV_V7_BACKFILL_FAST_MODE || '').toLowerCase() === 'true';
  const discovery = backfillFastMode
    ? await buildDiscoveryFromRegistrySnapshot({ runDir })
    : await buildDiscovery({
      cfg,
      args,
      runDir,
      budget,
      budgetStatePath,
      budgetTracker,
      runId: effectiveRunId
    });
  await writeJsonAtomic(path.join(runDir, 'reports', 'coverage_summary.json'), {
    schema: 'rv_v7_coverage_summary_v1',
    generated_at: nowIso(),
    run_id: effectiveRunId,
    ...discovery.summary,
    legacy_core_count: coreSet.size,
    legacy_missing_in_discovery: [...coreSet].filter((id) => !discovery.rows.some((r) => r.canonical_id === id)).length
  });

  const identity = await buildIdentityBridge({ rows: discovery.rows, cfg, runDir });
  const registryBuild = await buildRegistry({ rows: discovery.rows, runId: effectiveRunId, runDir });

  const dailySweep = backfillFastMode
    ? {
      updated: 0,
      eod_input_rows: 0,
      calls_used: budget.calls_total,
      source: 'skipped_backfill_fast_mode',
      exchanges_attempted: 0,
      exchanges_covered: 0,
      rows_by_exchange: {}
    }
    : await applyDailySweep({
      registryRows: registryBuild.registryRows,
      budget,
      cfg,
      offline: Boolean(args.offline),
      budgetStatePath,
      budgetTracker,
      runId: effectiveRunId
    });

  if (backfillFastMode && dailySweep.source !== 'skipped_backfill_fast_mode') {
    return {
      ok: false,
      code: EXIT.HARD_FAIL_CONTRACT,
      reason: `BACKFILL_FAST_MODE_VIOLATION:${dailySweep.source || 'unknown'}`,
      runId: effectiveRunId,
      runDir
    };
  }
  await writeJsonAtomic(path.join(runDir, 'reports', 'data_access_report.json'), {
    schema: 'rv_v7_data_access_report_v1',
    generated_at: nowIso(),
    run_id: effectiveRunId,
    calls_total: budget.calls_total,
    daily_sweep: dailySweep,
    discovery_calls: discovery.summary.full_discovery_calls
  });

  const backfill = await runBackfill({
    registryRows: registryBuild.registryRows,
    coreSet,
    cfg,
    runId: effectiveRunId,
    runDir,
    budget,
    offline: Boolean(args.offline),
    backfillMaxOverride: args['backfill-max'] ?? null,
    budgetStatePath,
    budgetTracker
  });

  if (backfill.code === EXIT.CHECKPOINT_INVALID) {
    return { ok: false, code: EXIT.CHECKPOINT_INVALID, reason: backfill.reason };
  }

  await writeJsonAtomic(path.join(runDir, 'reports', 'budget_report.json'), {
    schema: 'rv_v7_budget_report_v1',
    generated_at: nowIso(),
    run_id: effectiveRunId,
    calls_total: budget.calls_total,
    calls_delta: Math.max(0, Number(budget.calls_total || 0) - Number(persistedBudget?.daily_calls || 0)),
    daily_cap_calls: budget.daily_cap_calls,
    reserve_calls_floor: Number(cfg?.budget?.reserve_calls_floor || 10000),
    backfill_fetched_symbols: backfill.fetched_symbols,
    backfill_processed_symbols: backfill.processed_symbols,
    backfill_max_requested: backfill.max_symbols_per_run_requested,
    backfill_max_effective: backfill.max_symbols_per_run_effective,
    backfill_max_hard_cap: backfill.max_symbols_per_run_hard_cap,
    backfill_pack_write_mode: backfill.pack_write_mode,
    backfill_incremental_pack_buffer_cap: backfill.incremental_pack_buffer_cap,
    backfill_remaining: backfill.remaining,
    backfill_stop_reason: backfill.reason || null,
    checkpoint_path: backfill.checkpoint_path
  });

  await computeEligibilityAndReports({
    registryRows: registryBuild.registryRows,
    coreSet,
    cfg,
    runId: effectiveRunId,
    runDir
  });

  await buildSearchAndReadModels({ registryRows: registryBuild.registryRows, runDir, cfg });
  await computeGhostPrice({ registryRows: registryBuild.registryRows, runDir });

  const drift = await runDriftAndLegacyGate({
    registryRows: registryBuild.registryRows,
    coreSet,
    cfg,
    runDir,
    updatedIds: backfill.updated_ids || []
  });
  if (!drift.ok) {
    await writeJsonAtomic(path.join(runDir, 'reports', 'run_status.json'), {
      schema: 'rv_v7_run_status_v1',
      generated_at: nowIso(),
      run_id: effectiveRunId,
      exit_code: drift.code,
      reason: drift.reason,
      phases: {
        discovery: discovery.summary,
        identity_records: identity.bridge.length,
        registry_records: registryBuild.registryRows.length,
        budget_calls: budget.calls_total
      }
    });
    return { ok: false, code: drift.code, reason: drift.reason, runId: effectiveRunId, runDir };
  }

  const publishRegressionGuard = await enforcePublishRegressionGuard({
    registryRows: registryBuild.registryRows,
    cfg,
    runDir,
    runId: effectiveRunId,
    enforce: !Boolean(args.offline)
      && String(cfg?.run?.mode || 'shadow').toLowerCase() !== 'shadow'
  });
  if (!publishRegressionGuard.ok) {
    return {
      ok: false,
      code: publishRegressionGuard.code,
      reason: publishRegressionGuard.reason,
      runId: effectiveRunId,
      runDir
    };
  }

  const publishPayload = await writePublishPayload({
    cfg,
    runDir,
    runId: effectiveRunId,
    contractDoc,
    registryRows: registryBuild.registryRows
  });

  const packGate = await enforcePackLimits({ publishDir: publishPayload, cfg });
  if (!packGate.ok) {
    return { ok: false, code: packGate.code, reason: packGate.reason, runId: effectiveRunId, runDir };
  }

  const fileGate = await enforceFileLimits({ publishDir: publishPayload, cfg });
  if (!fileGate.ok) {
    return { ok: false, code: fileGate.code, reason: fileGate.reason, runId: effectiveRunId, runDir };
  }

  const finalCode = backfill.code === EXIT.BUDGET_STOP
    ? EXIT.BUDGET_STOP
    : backfill.code === EXIT.API_THROTTLE
      ? EXIT.API_THROTTLE
      : EXIT.SUCCESS;
  const finalReason = backfill.reason
    || (finalCode === EXIT.BUDGET_STOP
      ? 'budget_stop_with_checkpoint'
      : finalCode === EXIT.API_THROTTLE
        ? 'api_rate_limited_429'
        : 'ok');

  await writeJsonAtomic(path.join(runDir, 'reports', 'run_status.json'), {
    schema: 'rv_v7_run_status_v1',
    generated_at: nowIso(),
    run_id: effectiveRunId,
    exit_code: finalCode,
    reason: finalReason,
    phases: {
      discovery: discovery.summary,
      identity_records: identity.bridge.length,
      registry_records: registryBuild.registryRows.length,
      daily_sweep_updated: dailySweep.updated,
      backfill: {
        fetched_symbols: backfill.fetched_symbols,
        processed_symbols: backfill.processed_symbols,
        pack_write_mode: backfill.pack_write_mode,
        incremental_pack_buffer_cap: backfill.incremental_pack_buffer_cap,
        queue_total: backfill.queue_total,
        remaining: backfill.remaining,
        reason: backfill.reason || null
      },
      drift,
      budget_calls: budget.calls_total,
      publish_payload: path.relative(REPO_ROOT, publishPayload)
    }
  });

  await writeJsonAtomic(path.join(runDir, 'reports', 'system_status.json'), {
    schema: 'rv_v7_system_status_v1',
    generated_at: nowIso(),
    run_id: effectiveRunId,
    budget_health: {
      status: finalCode === EXIT.BUDGET_STOP
        ? 'BUDGET_STOP'
        : finalCode === EXIT.API_THROTTLE
          ? 'THROTTLED'
          : 'PASS',
      calls_total: budget.calls_total,
      cap: budget.daily_cap_calls
    },
    drift_state: 'PASS',
    golden_baseline_delta: null,
    active_universe_counts: {
      discovered: registryBuild.registryRows.length,
      ingestible: registryBuild.registryRows.filter((r) => Number.isFinite(Number(r.bars_count)) && Number(r.bars_count) > 0).length,
      eligible: registryBuild.registryRows.filter((r) => ['L0_LEGACY_CORE', 'L1_FULL', 'L2_PARTIAL', 'L3_MINIMAL'].includes(r.computed?.layer)).length
    },
    top_feature_by_rolling_sharpe: null,
    promotion_state: 'DISABLED',
    circuit_open_reason: null
  });

  // P1.3: Persist budget state to disk for cross-run tracking
  await bumpDailyCalls(budgetStatePath, budget.calls_total - Number(budgetTracker?.last_persisted_calls || 0)).catch(err =>
    console.warn(`[BUDGET] Failed to persist budget state: ${err.message}`)
  );

  return {
    ok: true,
    code: finalCode,
    runId: effectiveRunId,
    runDir,
    publishPayload
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runPipeline({ runId: args['run-id'], args });

  if (!result.ok) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: result.code, reason: result.reason, run_id: result.runId || null }) + '\n');
    process.exit(result.code || 1);
  }

  process.stdout.write(JSON.stringify({
    status: 'OK',
    code: result.code,
    run_id: result.runId,
    run_dir: path.relative(REPO_ROOT, result.runDir),
    publish_payload: path.relative(REPO_ROOT, result.publishPayload)
  }) + '\n');

  process.exit(result.code);
}

main().catch(async (err) => {
  // P1: Write crash forensics artifact (best-effort)
  const errorDoc = {
    schema: 'rv_v7_pipeline_error_v1',
    generated_at: new Date().toISOString(),
    error_name: err?.name || 'UnknownError',
    error_message: err?.message || 'pipeline_failed',
    stack_head: String(err?.stack || '').split('\n').slice(0, 10),
    phase: globalThis.__rv_pipeline_phase || null,
    last_exchange: globalThis.__rv_last_exchange || null,
    counters: globalThis.__rv_counters || null,
    node_version: process.version,
    run_id: globalThis.__rv_run_id || null
  };
  const fallbackPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/pipeline_error.json');
  try {
    const targetDir = globalThis.__rv_run_dir
      ? path.join(globalThis.__rv_run_dir, 'reports')
      : path.dirname(fallbackPath);
    await fs.mkdir(targetDir, { recursive: true });
    await writeJsonAtomic(path.join(targetDir, 'pipeline_error.json'), errorDoc);
    await writeJsonAtomic(fallbackPath, errorDoc);
  } catch { /* best-effort, never crash the crash handler */ }
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: 1, reason: err?.message || 'pipeline_failed' }) + '\n');
  process.exit(1);
});
