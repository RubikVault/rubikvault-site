import fs from 'node:fs';
import path from 'node:path';

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

export function buildBreakoutV12Candidates({ ticker = '', canonicalId = '', exchange = '' } = {}) {
  const out = new Set();
  for (const raw of [ticker, canonicalId]) {
    const value = upper(raw);
    if (!value) continue;
    out.add(value);
    out.add(value.replace('.', ':'));
    out.add(value.replace(':', '.'));
    if (!value.includes(':') && !value.includes('.')) out.add(`US:${value}`);
  }
  const cleanTicker = upper(ticker);
  const cleanExchange = upper(exchange);
  if (cleanTicker && cleanExchange) {
    out.add(`${cleanExchange}:${cleanTicker}`);
    out.add(`${cleanTicker}.${cleanExchange}`);
  }
  return out;
}

export function findBreakoutV12Item(top500, candidates) {
  const candidateSet = candidates instanceof Set ? candidates : new Set(candidates || []);
  const items = Array.isArray(top500?.items) ? top500.items : [];
  return items.find((item) => {
    const assetId = upper(item?.asset_id);
    const symbol = upper(item?.symbol);
    return candidateSet.has(assetId) || candidateSet.has(symbol) || candidateSet.has(assetId.replace(':', '.'));
  }) || null;
}

function normalizeBreakoutStatus(item) {
  const raw = item?.breakout_status
    || item?.status
    || item?.ui?.status
    || item?.ui?.label
    || item?.label
    || null;
  return raw ? String(raw).trim().toUpperCase() : null;
}

function normalizeBreakoutLegacyState(item) {
  const raw = item?.legacy_state
    || item?.ui?.legacy_state
    || item?.state
    || item?.ui?.label
    || item?.label
    || item?.breakout_status
    || item?.status
    || null;
  return raw ? String(raw).trim().toUpperCase() : null;
}

export function shapeBreakoutV12Result({ manifest = null, top500 = null, item = null, candidates = new Set() } = {}) {
  const asOf = item?.as_of || manifest?.as_of || top500?.as_of || null;
  if (!item) {
    return {
      status: manifest ? 'not_in_current_signal_set' : 'unavailable',
      source: 'breakout_v12_static',
      as_of: asOf,
      manifest: manifest ? {
        as_of: manifest.as_of || null,
        content_hash: manifest.content_hash || null,
        score_version: manifest.score_version || top500?.score_version || null,
      } : null,
      candidates: Array.from(candidates || []),
    };
  }
  const finalScore = Number(item?.scores?.final_signal_score ?? item?.final_signal_score ?? NaN);
  const breakoutStatus = normalizeBreakoutStatus(item);
  const legacyState = normalizeBreakoutLegacyState(item);
  return {
    status: 'ok',
    source: 'breakout_v12_static',
    asset_id: item.asset_id || null,
    symbol: item.symbol || null,
    name: item.name || null,
    as_of: asOf,
    score_version: item.score_version || manifest?.score_version || top500?.score_version || null,
    breakout_status: breakoutStatus,
    legacy_state: legacyState,
    status_reasons: Array.isArray(item.status_reasons) ? item.status_reasons : [],
    status_explanation: item.status_explanation || null,
    support_zone: item.support_zone || null,
    invalidation: item.invalidation || null,
    scores: item.scores || {},
    features: item.features || {},
    risk: item.risk || {},
    ui: item.ui || {},
    reasons: Array.isArray(item.reasons) ? item.reasons : [],
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    final_signal_score: Number.isFinite(finalScore) ? finalScore : null,
    rank: Number.isFinite(Number(item?.ui?.rank)) ? Number(item.ui.rank) : null,
    rank_percentile: Number.isFinite(Number(item?.ui?.rank_percentile)) ? Number(item.ui.rank_percentile) : null,
    label: item?.ui?.label || null,
    manifest: {
      as_of: manifest?.as_of || null,
      content_hash: manifest?.content_hash || null,
      score_version: manifest?.score_version || top500?.score_version || null,
    },
  };
}

export function toBreakoutV2Compat(v12) {
  if (!v12 || v12.status !== 'ok') return null;
  const score = Number(v12.final_signal_score);
  const total = Number.isFinite(score) ? Math.round(score * 100) : 0;
  return {
    state: String(v12.legacy_state || v12.breakout_status || v12.label || 'breakout_candidate').toUpperCase(),
    as_of: v12.as_of || null,
    source: 'breakout_v12_compat',
    legacy: false,
    breakout_status: v12.breakout_status || null,
    legacy_state: v12.legacy_state || null,
    status_explanation: v12.status_explanation || null,
    support_zone: v12.support_zone || null,
    invalidation: v12.invalidation || null,
    scores: {
      total,
      final_signal_score: v12.final_signal_score,
      structure: v12.scores?.structure_score ?? null,
      volume: v12.scores?.volume_score ?? null,
      compression: v12.scores?.compression_score ?? null,
      selling_exhaustion: v12.scores?.selling_exhaustion_score ?? null,
      accumulation_proxy: v12.scores?.accumulation_proxy_score ?? null,
    },
    rank: v12.rank,
    rank_percentile: v12.rank_percentile,
    explanation: v12.status_explanation || v12.label || 'Static Breakout V12 score',
    trigger_confirmed: v12.breakout_status === 'BREAKOUT_CONFIRMED',
  };
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readBreakoutV12StaticForTicker({
  repoRoot = process.cwd(),
  publicRoot = '',
  ticker = '',
  canonicalId = '',
  exchange = '',
} = {}) {
  const root = publicRoot || path.join(repoRoot, 'public/data/breakout');
  const latest = readJsonIfExists(path.join(root, 'manifests/latest.json'));
  const lastGood = readJsonIfExists(path.join(root, 'manifests/last_good.json'));
  const manifest = latest?.validation?.publishable === true ? latest : lastGood;
  if (!manifest?.files?.top500) return shapeBreakoutV12Result({ manifest: null });
  const candidates = buildBreakoutV12Candidates({ ticker, canonicalId, exchange });
  // Coverage extension: prefer all_scored (full scope ~3000+ items) when present so non-top500
  // assets like AAPL/SPY still expose V1.3 breakout fields. Fallback to top500.
  let dataset = null;
  if (manifest.files.all_scored) {
    dataset = readJsonIfExists(path.join(root, manifest.files.all_scored));
  }
  if (!dataset) {
    dataset = readJsonIfExists(path.join(root, manifest.files.top500));
  }
  const item = findBreakoutV12Item(dataset, candidates);
  return shapeBreakoutV12Result({ manifest, top500: dataset, item, candidates });
}
