import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { classifyTrend as classifyServerTrend, classifyMomentum as classifyServerMomentum } from '../../../../functions/api/_shared/stock-states-v1.js';
import { classifyP0Regime } from '../../../decision-core/classify-p0-regime.mjs';
import { mapDecisionCoreToUi } from '../../../../public/js/decision-core-ui-map.js';

export const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
export const OUT_DIR = path.join(ROOT, 'public/data/runtime/classifier-audit');

const SUPPRESSING_REASON_RE = /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/;
const BLOCKING_BUY_CODES = new Set([
  'WAIT_LOW_EVIDENCE',
  'COST_PROXY_UNAVAILABLE',
  'COST_PROXY_HIGH',
  'TAIL_RISK_HIGH',
  'TAIL_RISK_UNKNOWN',
  'EV_PROXY_UNAVAILABLE',
  'EV_PROXY_NOT_POSITIVE',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { sample: 0, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--sample' && next) {
      out.sample = Number(next) || 0;
      i += 1;
    } else if (arg.startsWith('--sample=')) {
      out.sample = Number(arg.split('=').slice(1).join('=')) || 0;
    } else if (arg === '--verbose') {
      out.verbose = true;
    }
  }
  return out;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function readMaybeGzip(filePath) {
  const body = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz') ? gunzipSync(body).toString('utf8') : body.toString('utf8');
  return JSON.parse(text);
}

export function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function writeTextAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, filePath);
}

function inc(map, key, amount = 1) {
  const normalized = String(key || 'unknown');
  map[normalized] = (map[normalized] || 0) + amount;
}

function topEntries(map, limit = 25) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function canonicalTicker(assetId) {
  return String(assetId || '').split(':').pop() || null;
}

function regionFromAssetId(assetId) {
  const prefix = String(assetId || '').split(':')[0].toUpperCase();
  if (prefix === 'US' || prefix === 'NASDAQ' || prefix === 'NYSE') return 'US';
  if (['LSE', 'XETRA', 'PA', 'MI', 'AS', 'BR', 'BE', 'DU', 'F', 'HM', 'IR', 'LS', 'MC', 'ST', 'SW', 'VI'].includes(prefix)) return 'EU';
  if (['HK', 'KO', 'KQ', 'TSE', 'TO', 'AU', 'SHG', 'SHE', 'BK', 'SN'].includes(prefix)) return 'ASIA';
  return 'OTHER';
}

function latestPageCoreSnapshotPath() {
  const latestPath = path.join(ROOT, 'public/data/page-core/latest.json');
  const latest = readJson(latestPath);
  const raw = String(latest.snapshot_path || '').replace(/^\/+/, '');
  if (!raw) throw new Error('PAGE_CORE_SNAPSHOT_PATH_MISSING');
  return path.join(ROOT, 'public', raw.replace(/^public\//, ''));
}

export function loadPageCoreRows({ sample = 0 } = {}) {
  const snapshotPath = latestPageCoreSnapshotPath();
  const shardsDir = path.join(snapshotPath, 'page-shards');
  const rows = [];
  for (const name of fs.readdirSync(shardsDir).filter((file) => file.endsWith('.json.gz')).sort()) {
    const doc = readMaybeGzip(path.join(shardsDir, name));
    const entries = Array.isArray(doc) ? doc.map((row) => [row?.canonical_asset_id, row]) : Object.entries(doc || {});
    for (const [assetId, row] of entries) {
      if (!row || typeof row !== 'object') continue;
      rows.push({ asset_id: row.canonical_asset_id || assetId, row });
      if (sample > 0 && rows.length >= sample) return rows;
    }
  }
  return rows;
}

export function loadDecisionRows() {
  const root = path.join(ROOT, 'public/data/decision-core/core');
  const manifest = readJson(path.join(root, 'manifest.json'));
  const rows = [];
  const partsDir = path.join(root, 'parts');
  for (const name of fs.readdirSync(partsDir).filter((file) => file.endsWith('.ndjson.gz')).sort()) {
    const text = gunzipSync(fs.readFileSync(path.join(partsDir, name))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      rows.push(row);
    }
  }
  return { manifest, rows };
}

export function loadReasonRegistry() {
  const registryPath = path.join(ROOT, 'public/data/decision-core/reason-codes/latest.json');
  const registry = readJson(registryPath);
  const codeMap = new Map((registry.codes || []).map((row) => [row.code, row]));
  return { registryPath, registry, codeMap };
}

export function loadBestSetups() {
  const filePath = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
  const doc = readJson(filePath);
  const rows = [];
  for (const [assetClass, byHorizon] of Object.entries(doc.data || {})) {
    for (const [horizon, entries] of Object.entries(byHorizon || {})) {
      for (const row of entries || []) rows.push({ ...row, asset_class_bucket: assetClass, horizon });
    }
  }
  return { filePath, doc, rows };
}

function statsFromPageRow(row) {
  const stats = row?.market_stats_min?.stats || row?.market_stats_min || row?.technical_min || {};
  const close = num(row?.summary_min?.last_close ?? row?.market_stats_min?.last_close ?? row?.latest_bar?.close);
  return {
    close,
    sma20: num(stats.sma20),
    sma50: num(stats.sma50),
    sma200: num(stats.sma200),
    rsi14: num(stats.rsi14),
    macd_hist: num(stats.macd_hist),
    volatility_percentile: num(stats.volatility_percentile),
    ret_20d_pct: num(stats.ret_20d_pct ?? stats.return_20d_pct ?? row?.historical_profile_summary?.ret_20d_pct),
  };
}

export function classifyClientStates(stats) {
  const price = stats.close;
  const { sma20, sma50, sma200, rsi14 } = stats;
  const volPctile = stats.volatility_percentile;
  let trend = 'UNKNOWN';
  if ([price, sma20, sma50, sma200].every(Number.isFinite)) {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) trend = 'STRONG_UP';
    else if (price > sma50 && sma50 >= sma200) trend = 'UP';
    else if (price < sma20 && sma20 < sma50 && sma50 < sma200) trend = 'STRONG_DOWN';
    else if (price < sma50 && sma50 <= sma200) trend = 'DOWN';
    else trend = 'RANGE';
  }
  let momentum = 'UNKNOWN';
  if (Number.isFinite(rsi14)) {
    if (rsi14 < 30) momentum = 'OVERSOLD';
    else if (rsi14 < 45) momentum = 'BEARISH';
    else if (rsi14 <= 55) momentum = 'NEUTRAL';
    else if (rsi14 <= 70) momentum = 'BULLISH';
    else momentum = 'OVERBOUGHT';
  }
  let volatility = 'UNKNOWN';
  if (Number.isFinite(volPctile)) {
    const normalized = volPctile <= 1 ? volPctile * 100 : volPctile;
    volatility = normalized >= 90 ? 'EXTREME' : normalized >= 70 ? 'HIGH' : normalized <= 25 ? 'LOW' : 'NORMAL';
  }
  return { trend, momentum, volatility };
}

function trendBucket(value) {
  if (value === 'STRONG_UP' || value === 'UP' || value === 'up') return 'up';
  if (value === 'STRONG_DOWN' || value === 'DOWN' || value === 'down') return 'down';
  if (value === 'RANGE' || value === 'sideways') return 'sideways';
  return 'unknown';
}

function publicAction(row) {
  return row?.decision_core_min?.decision?.primary_action
    || row?.decision_core_min?.primary_action
    || row?.summary_min?.decision_verdict
    || row?.summary_min?.verdict
    || null;
}

function decisionReasonCodes(row) {
  return row?.decision?.reason_codes || [];
}

export function buyGateFailures(row) {
  const failures = [];
  const eligibility = row?.eligibility || {};
  const evidence = row?.evidence_summary || {};
  const decision = row?.decision || {};
  const guard = row?.trade_guard || {};
  const codes = new Set(decisionReasonCodes(row));
  if (eligibility.eligibility_status !== 'ELIGIBLE') failures.push('eligibility_status');
  if (eligibility.decision_grade !== true) failures.push('decision_grade');
  if (!decision.primary_setup || decision.primary_setup === 'none') failures.push('primary_setup');
  if (!(Number(evidence.evidence_effective_n) > 0)) failures.push('evidence_effective_n');
  if (evidence.ev_proxy_bucket !== 'positive') failures.push('ev_proxy_bucket');
  if (!['LOW', 'MEDIUM'].includes(evidence.tail_risk_bucket)) failures.push('tail_risk_bucket');
  if (row?.method_status?.cost_proxy_available === false || codes.has('COST_PROXY_UNAVAILABLE') || codes.has('COST_PROXY_HIGH')) failures.push('cost_proxy');
  if (decision.analysis_reliability === 'LOW') failures.push('analysis_reliability');
  if (guard.max_entry_price == null) failures.push('max_entry_price');
  if (guard.invalidation_level == null) failures.push('invalidation_level');
  if (decisionReasonCodes(row).some((code) => BLOCKING_BUY_CODES.has(code))) failures.push('blocking_reason_code');
  return failures;
}

export function bestSetupsFilterFailures(row) {
  const failures = [];
  if (row?.decision?.primary_action !== 'BUY') failures.push('primary_action');
  if (row?.eligibility?.decision_grade !== true) failures.push('decision_grade');
  if (row?.eligibility?.eligibility_status !== 'ELIGIBLE') failures.push('eligibility_status');
  if (row?.trade_guard?.max_entry_price == null) failures.push('max_entry_price');
  if (row?.trade_guard?.invalidation_level == null) failures.push('invalidation_level');
  if (row?.evidence_summary?.ev_proxy_bucket !== 'positive') failures.push('ev_proxy_bucket');
  if (!['LOW', 'MEDIUM'].includes(row?.evidence_summary?.tail_risk_bucket)) failures.push('tail_risk_bucket');
  return failures;
}

function sampleDecision(row, extra = {}) {
  return {
    asset_id: row?.meta?.asset_id || null,
    ticker: canonicalTicker(row?.meta?.asset_id),
    region: regionFromAssetId(row?.meta?.asset_id),
    asset_type: row?.meta?.asset_type || null,
    action: row?.decision?.primary_action || null,
    reliability: row?.decision?.analysis_reliability || null,
    setup: row?.decision?.primary_setup || null,
    reason_codes: decisionReasonCodes(row),
    ...extra,
  };
}

function samplePage(assetId, row, extra = {}) {
  return {
    asset_id: assetId,
    ticker: row?.display_ticker || row?.ticker || canonicalTicker(assetId),
    region: regionFromAssetId(assetId),
    asset_type: row?.decision_core_min?.meta?.asset_type || row?.meta?.asset_type || null,
    action: publicAction(row),
    ...extra,
  };
}

export async function layer01CrossClassifierDisagreement(options = {}) {
  const rows = loadPageCoreRows(options);
  const counts = { scanned: 0, comparable: 0, disagreements: 0 };
  const byPair = {};
  const samples = [];
  for (const { asset_id: assetId, row } of rows) {
    const stats = statsFromPageRow(row);
    const client = classifyClientStates(stats);
    const serverTrend = classifyServerTrend(stats, stats.close);
    const serverMomentum = classifyServerMomentum(stats);
    counts.scanned += 1;
    if (client.trend !== 'UNKNOWN' && serverTrend !== 'UNKNOWN') {
      counts.comparable += 1;
      if (client.trend !== serverTrend) {
        counts.disagreements += 1;
        inc(byPair, `client_trend:${client.trend}|server_trend:${serverTrend}`);
        if (samples.length < 50) samples.push(samplePage(assetId, row, { client_trend: client.trend, server_trend: serverTrend, stats }));
      }
    }
    if (client.momentum !== 'UNKNOWN' && serverMomentum !== 'UNKNOWN' && client.momentum !== serverMomentum) {
      inc(byPair, `client_momentum:${client.momentum}|server_momentum:${serverMomentum}`);
    }
  }
  const bp = samples.find((row) => row.ticker === 'BP') || null;
  return { layer: '01-cross-classifier-disagreement', status: 'OK', counts, by_pair: topEntries(byPair), bp_sample: bp, samples };
}

export async function layer02ServerVsClientOracle(options = {}) {
  const rows = loadPageCoreRows(options);
  const counts = { scanned: 0, comparable: 0, conflicts: 0 };
  const byPair = {};
  const samples = [];
  for (const { asset_id: assetId, row } of rows) {
    const stats = statsFromPageRow(row);
    const client = classifyClientStates(stats);
    const regime = classifyP0Regime(stats);
    const a = trendBucket(client.trend);
    const b = trendBucket(regime.trend_regime);
    counts.scanned += 1;
    if (a !== 'unknown' && b !== 'unknown') {
      counts.comparable += 1;
      if (a !== b) {
        counts.conflicts += 1;
        inc(byPair, `client:${a}|p0:${b}`);
        if (samples.length < 50) samples.push(samplePage(assetId, row, { client_trend: client.trend, p0_regime: regime, stats }));
      }
    }
  }
  return { layer: '02-server-vs-client-oracle', status: 'OK', counts, by_pair: topEntries(byPair), samples };
}

export async function layer03InvariantViolations(options = {}) {
  const rows = loadPageCoreRows(options);
  const counts = { scanned: 0, violations: 0 };
  const byInvariant = {};
  const samples = [];
  for (const { asset_id: assetId, row } of rows) {
    const stats = statsFromPageRow(row);
    const client = classifyClientStates(stats);
    const violations = [];
    const { close, sma20, sma50, sma200, rsi14 } = stats;
    if ([close, sma20, sma50, sma200].every(Number.isFinite) && close > sma20 && sma20 > sma50 && sma50 > sma200 && client.trend !== 'STRONG_UP') {
      violations.push('price_gt_sma20_gt_sma50_gt_sma200_requires_strong_up');
    }
    if ([close, sma50, sma200].every(Number.isFinite) && close > sma50 && sma50 > sma200 && client.trend === 'RANGE') {
      violations.push('bullish_stack_price_gt_sma50_not_range');
    }
    if (Number.isFinite(rsi14) && rsi14 >= 45 && rsi14 <= 55 && client.momentum !== 'NEUTRAL') {
      violations.push('rsi_45_55_requires_neutral');
    }
    const action = publicAction(row);
    if (action === 'BUY' && ['DOWN', 'STRONG_DOWN'].includes(client.trend)) violations.push('buy_with_downtrend_display');
    if (action === 'AVOID' && client.trend === 'STRONG_UP') violations.push('avoid_with_strong_up_display');
    if (violations.length) {
      counts.violations += violations.length;
      for (const violation of violations) inc(byInvariant, violation);
      if (samples.length < 50) samples.push(samplePage(assetId, row, { violations, client, stats }));
    }
    counts.scanned += 1;
  }
  return { layer: '03-invariant-violations', status: counts.violations ? 'WARN' : 'OK', counts, by_invariant: topEntries(byInvariant), samples };
}

export async function layer04BoundaryMutation(options = {}) {
  const rows = loadPageCoreRows(options);
  const thresholds = {
    rsi14: [30, 45, 55, 70],
    volatility_percentile: [25, 70, 90],
  };
  const counts = { scanned: rows.length, near_boundary: 0 };
  const byThreshold = {};
  const samples = [];
  for (const { asset_id: assetId, row } of rows) {
    const stats = statsFromPageRow(row);
    for (const [field, values] of Object.entries(thresholds)) {
      const value = stats[field];
      if (!Number.isFinite(value)) continue;
      for (const threshold of values) {
        const distance = Math.abs(value - threshold);
        if (distance <= 0.25) {
          counts.near_boundary += 1;
          inc(byThreshold, `${field}:${threshold}`);
          if (samples.length < 50) samples.push(samplePage(assetId, row, { field, value, threshold, distance }));
        }
      }
    }
  }
  return { layer: '04-boundary-mutation', status: 'OK', counts, by_threshold: topEntries(byThreshold), samples };
}

export async function layer05CoverageDistribution(options = {}) {
  const rows = loadPageCoreRows(options);
  const counts = { scanned: 0 };
  const distributions = { trend: {}, momentum: {}, volatility: {}, action: {} };
  for (const { row } of rows) {
    const states = classifyClientStates(statsFromPageRow(row));
    inc(distributions.trend, states.trend);
    inc(distributions.momentum, states.momentum);
    inc(distributions.volatility, states.volatility);
    inc(distributions.action, publicAction(row));
    counts.scanned += 1;
  }
  const flags = [];
  for (const [name, dist] of Object.entries(distributions)) {
    for (const [key, count] of Object.entries(dist)) {
      const ratio = counts.scanned ? count / counts.scanned : 0;
      if (ratio > 0.60) flags.push({ classifier: name, category: key, ratio: Number(ratio.toFixed(4)), issue: 'dominant_category_gt_60pct' });
      if (ratio > 0 && ratio < 0.005) flags.push({ classifier: name, category: key, ratio: Number(ratio.toFixed(4)), issue: 'rare_category_lt_0_5pct' });
    }
  }
  return { layer: '05-coverage-distribution', status: flags.length ? 'WARN' : 'OK', counts, distributions, flags };
}

export async function layer06ThresholdLint() {
  const files = [
    'public/js/rv-v2-client.js',
    'public/js/stock-page-view-model.js',
    'public/js/stock-data-guard.js',
    'functions/api/_shared/stock-states-v1.js',
    'functions/api/_shared/stock-analyzer-contract.js',
    'scripts/decision-core/classify-p0-regime.mjs',
    'scripts/decision-core/resolve-horizon-state.mjs',
  ];
  const concepts = {
    rsi: /\brsi\w*\b[^;\n]*(?:<=|>=|<|>)\s*(20|30|40|45|50|55|60|70|80)/ig,
    volatility: /\b(?:volatility|volPctile|vp|vol)\w*\b[^;\n]*(?:<=|>=|<|>)\s*(10|25|70|75|90)/ig,
    action_score: /\b(?:score|threshold)\w*\b[^;\n]*(?:<=|>=|<|>)\s*(1\.5|2|3|90|100)/ig,
  };
  const findings = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const [concept, re] of Object.entries(concepts)) {
      for (const match of text.matchAll(re)) {
        const before = text.slice(0, match.index);
        const line = before.split('\n').length;
        findings.push({ concept, file: rel, line, snippet: match[0].trim().slice(0, 180) });
      }
    }
  }
  return { layer: '06-threshold-lint', status: 'OK', counts: { findings: findings.length }, findings };
}

export async function layer07ReasonCodeCoverage() {
  const { rows, manifest } = loadDecisionRows();
  const { registryPath, codeMap } = loadReasonRegistry();
  const counts = { decision_rows: rows.length, buy_rows: 0, unmapped_buy_codes: 0, suppressing_unmapped_buy_codes: 0 };
  const byCode = {};
  const samples = [];
  for (const row of rows) {
    if (row?.decision?.primary_action !== 'BUY') continue;
    counts.buy_rows += 1;
    for (const code of decisionReasonCodes(row)) {
      if (codeMap.has(code)) continue;
      counts.unmapped_buy_codes += 1;
      const wouldDemote = SUPPRESSING_REASON_RE.test(code);
      if (wouldDemote) counts.suppressing_unmapped_buy_codes += 1;
      inc(byCode, code);
      if (samples.length < 50) samples.push(sampleDecision(row, { unmapped_code: code, would_demote: wouldDemote }));
    }
  }
  return {
    layer: '07-reason-code-coverage',
    status: counts.suppressing_unmapped_buy_codes ? 'FAIL' : counts.unmapped_buy_codes ? 'WARN' : 'OK',
    target_market_date: manifest.target_market_date,
    registry_path: path.relative(ROOT, registryPath),
    counts,
    by_code: topEntries(byCode),
    samples,
  };
}

export async function layer08CanBuyGateCliff() {
  const { rows, manifest } = loadDecisionRows();
  const counts = { decision_rows: rows.length, buy_rows: 0, cliff_cases: 0, best_setups_filter_fail_for_server_buy: 0 };
  const gateFailures = {};
  const cliffByGate = {};
  const bestFilterFailures = {};
  const cliff_samples = [];
  const filter_samples = [];
  for (const row of rows) {
    if (row?.decision?.primary_action === 'BUY') counts.buy_rows += 1;
    const failures = buyGateFailures(row);
    for (const failure of failures) inc(gateFailures, failure);
    if (failures.length === 1) {
      counts.cliff_cases += 1;
      inc(cliffByGate, failures[0]);
      if (cliff_samples.length < 50) cliff_samples.push(sampleDecision(row, { single_failure: failures[0] }));
    }
    if (row?.decision?.primary_action === 'BUY') {
      const filterFailures = bestSetupsFilterFailures(row);
      if (filterFailures.length) {
        counts.best_setups_filter_fail_for_server_buy += 1;
        for (const failure of filterFailures) inc(bestFilterFailures, failure);
        if (filter_samples.length < 50) filter_samples.push(sampleDecision(row, { filter_failures: filterFailures }));
      }
    }
  }
  return {
    layer: '08-canbuy-gate-cliff',
    status: counts.best_setups_filter_fail_for_server_buy ? 'FAIL' : 'OK',
    target_market_date: manifest.target_market_date,
    counts,
    gate_failures: topEntries(gateFailures),
    cliff_by_gate: topEntries(cliffByGate),
    best_setups_filter_failures_for_server_buy: topEntries(bestFilterFailures),
    cliff_samples,
    filter_samples,
  };
}

export async function layer09BuyEndToEndConsistency() {
  const { rows, manifest } = loadDecisionRows();
  const { registry } = loadReasonRegistry();
  const { rows: bestRows } = loadBestSetups();
  const serverBuy = new Map();
  const serverFilterPass = new Map();
  for (const row of rows) {
    const assetId = row?.meta?.asset_id;
    if (!assetId || row?.decision?.primary_action !== 'BUY') continue;
    serverBuy.set(assetId, row);
    if (bestSetupsFilterFailures(row).length === 0) serverFilterPass.set(assetId, row);
  }
  const bestSet = new Map(bestRows.map((row) => [row.canonical_id || row.canonical_asset_id, row]).filter(([id]) => id));
  const clientDemoted = [];
  for (const [assetId, best] of bestSet.entries()) {
    const core = serverBuy.get(assetId);
    if (!core) continue;
    const mapped = mapDecisionCoreToUi(core, registry);
    if (mapped.action !== 'BUY') clientDemoted.push(sampleDecision(core, { mapped_action: mapped.action, warnings: mapped.warnings }));
  }
  const droppedByBestSetups = [];
  for (const [assetId, row] of serverBuy.entries()) {
    if (bestSet.has(assetId)) continue;
    const reason = serverFilterPass.has(assetId) ? 'capacity_or_ranking_drop' : 'filter_predicate_drop';
    if (droppedByBestSetups.length < 50) droppedByBestSetups.push(sampleDecision(row, { drop_reason: reason, filter_failures: bestSetupsFilterFailures(row) }));
  }
  const counts = {
    server_buy: serverBuy.size,
    server_buy_filter_pass: serverFilterPass.size,
    best_setups_rows: bestSet.size,
    server_buy_in_best_setups: [...serverBuy.keys()].filter((id) => bestSet.has(id)).length,
    dropped_at_best_setups_total: [...serverBuy.keys()].filter((id) => !bestSet.has(id)).length,
    client_demoted_buy_rows: clientDemoted.length,
  };
  return {
    layer: '09-buy-end-to-end-consistency',
    status: clientDemoted.length ? 'FAIL' : 'OK',
    target_market_date: manifest.target_market_date,
    note: 'server BUY rows not emitted by Best-Setups are not automatically bugs because Best-Setups intentionally emits a capped top list.',
    counts,
    client_demoted_samples: clientDemoted.slice(0, 50),
    dropped_at_best_setups_samples: droppedByBestSetups,
  };
}

export const LAYERS = [
  ['01-cross-classifier-disagreement', layer01CrossClassifierDisagreement],
  ['02-server-vs-client-oracle', layer02ServerVsClientOracle],
  ['03-invariant-violations', layer03InvariantViolations],
  ['04-boundary-mutation', layer04BoundaryMutation],
  ['05-coverage-distribution', layer05CoverageDistribution],
  ['06-threshold-lint', layer06ThresholdLint],
  ['07-reason-code-coverage', layer07ReasonCodeCoverage],
  ['08-canbuy-gate-cliff', layer08CanBuyGateCliff],
  ['09-buy-end-to-end-consistency', layer09BuyEndToEndConsistency],
];

export function outputPathForLayer(layer) {
  return path.join(OUT_DIR, `${layer}-latest.json`);
}

export async function runLayer(layerName, options = {}) {
  const entry = LAYERS.find(([name]) => name === layerName);
  if (!entry) throw new Error(`unknown_layer:${layerName}`);
  const doc = await entry[1](options);
  doc.generated_at = new Date().toISOString();
  writeJsonAtomic(outputPathForLayer(layerName), doc);
  return doc;
}

function markdownSection(title, rows) {
  const lines = [`## ${title}`, ''];
  if (!rows?.length) return `${lines.join('\n')}No samples.\n`;
  for (const row of rows.slice(0, 50)) {
    lines.push(`- ${row.asset_id || row.key || 'n/a'} ${row.ticker || ''}: ${JSON.stringify(row).slice(0, 500)}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function runAll(options = {}) {
  const results = [];
  for (const [name] of LAYERS) results.push(await runLayer(name, options));
  const failed = results.filter((row) => row.status === 'FAIL');
  const warned = results.filter((row) => row.status === 'WARN');
  const summary = {
    schema: 'rv.buy_signal_classifier_audit_summary.v1',
    generated_at: new Date().toISOString(),
    status: failed.length ? 'FAIL' : warned.length ? 'WARN' : 'OK',
    output_dir: path.relative(ROOT, OUT_DIR),
    layer_statuses: results.map((row) => ({ layer: row.layer, status: row.status, counts: row.counts || {} })),
    tier1: {
      reason_code_coverage: results.find((row) => row.layer === '07-reason-code-coverage')?.counts || {},
      canbuy_gate_cliff: results.find((row) => row.layer === '08-canbuy-gate-cliff')?.counts || {},
      end_to_end: results.find((row) => row.layer === '09-buy-end-to-end-consistency')?.counts || {},
    },
    plan_assessment: {
      valid: true,
      correction: 'Layer 9 server BUY rows absent from Best-Setups are categorized as capacity/ranking drops unless they fail explicit Best-Setups predicates or client demotion.',
      product_code_changed: false,
    },
  };
  writeJsonAtomic(path.join(OUT_DIR, 'classifier-audit-summary-latest.json'), summary);
  const date = (results.find((row) => row.target_market_date)?.target_market_date || new Date().toISOString().slice(0, 10));
  const md = [
    `# BUY Signal Correctness Audit - ${date}`,
    '',
    `Status: ${summary.status}`,
    '',
    'Audit-only. No production BUY logic changed.',
    '',
    markdownSection('Tier 1: Client-Demoted BUY Samples', results.find((row) => row.layer === '09-buy-end-to-end-consistency')?.client_demoted_samples || []),
    markdownSection('Tier 1: Best-Setups Drops', results.find((row) => row.layer === '09-buy-end-to-end-consistency')?.dropped_at_best_setups_samples || []),
    markdownSection('Tier 1: Gate Cliff Samples', results.find((row) => row.layer === '08-canbuy-gate-cliff')?.cliff_samples || []),
    markdownSection('Tier 2: Classifier Disagreements', results.find((row) => row.layer === '01-cross-classifier-disagreement')?.samples || []),
    markdownSection('Tier 2: Invariant Violations', results.find((row) => row.layer === '03-invariant-violations')?.samples || []),
  ].join('\n');
  writeTextAtomic(path.join(ROOT, `docs/audit/buy-signal-audit-${date}.md`), md);
  return { summary, results };
}
