import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { HIST_PROBS_PUBLIC_LATEST, ROOT, finiteNumber, normalizeId, readJsonMaybe } from './shared.mjs';

export function loadHistProbsPublic() {
  const latest = readJsonMaybe(HIST_PROBS_PUBLIC_LATEST);
  if (!latest?.shards_path) return { latest, profiles: new Map(), available: false };
  return { latest, profiles: new Map(), shards: new Map(), available: true };
}

export function evidenceBootstrap({ assetId, horizon, setup, histProbs, features } = {}) {
  const raw = lookupHistProbsProfile(assetId, histProbs);
  const profile = summarizeHistProfile(raw, horizon);
  const fallbackN = setup?.primary_setup !== 'none' && features?.bars_count >= 252 ? 24 : 0;
  const horizonAllowed = horizon === 'long_term' ? false : true;
  const observations = finiteNumber(profile?.observations ?? raw?.observations ?? raw?.sample_size ?? raw?.n) ?? (horizonAllowed ? fallbackN : 0);
  const effective = observations ? Number(Math.max(0, observations * 0.75).toFixed(2)) : 0;
  let scope = observations ? 'asset_type' : 'none';
  let method = observations ? 'hist_probs_v2_bootstrap' : 'unavailable';
  if (horizon === 'long_term' && !profile?.long_horizon_supported && !raw?.long_horizon_supported) {
    scope = 'none';
    method = 'unavailable';
  }
  return {
    evidence_raw_n: observations,
    evidence_effective_n: method === 'unavailable' ? 0 : effective,
    evidence_scope: scope,
    evidence_method: method,
    raw_profile: profile || raw,
  };
}

function lookupHistProbsProfile(assetId, histProbs) {
  if (!histProbs?.available) return null;
  const canonical = normalizeId(assetId);
  if (histProbs.profiles.has(canonical)) return histProbs.profiles.get(canonical);
  const latest = histProbs.latest;
  const shardCount = Number(latest?.shard_count || 0);
  if (!shardCount) return null;
  let profile = null;
  for (const key of histProfileKeys(canonical)) {
    const shard = readHistShard(histProbs, key, shardCount);
    if (!shard) continue;
    profile = lookupProfileInShard(shard, key, canonical);
    if (profile) {
      profile = { ...profile, lookup_key: key };
      break;
    }
  }
  histProbs.profiles.set(canonical, profile);
  return profile;
}

function histProfileKeys(canonical) {
  const keys = new Set([String(canonical || '').toUpperCase()]);
  const symbol = String(canonical || '').split(':').pop();
  if (symbol) keys.add(symbol.toUpperCase());
  if (canonical?.includes(':')) keys.add(canonical.replace(':', '.').toUpperCase());
  return [...keys].filter(Boolean);
}

function shardIndexForKey(key, count) {
  const hash = createHash('sha256').update(String(key || '').toUpperCase()).digest();
  return hash.readUInt32BE(0) % count;
}

function readHistShard(histProbs, key, shardCount) {
  const index = shardIndexForKey(key, shardCount);
  if (histProbs.shards?.has(index)) return histProbs.shards.get(index);
  const name = String(index).padStart(3, '0');
  const candidates = [
    path.join(ROOT, 'public/data/hist-probs-public', histProbs.latest.shards_path, `${name}.json`),
    path.join(ROOT, 'public/data/hist-probs-public', histProbs.latest.shards_path, `${name}.json.gz`),
    path.join(ROOT, 'public/data/hist-probs-public', histProbs.latest.shards_path, `part-${name}.json.gz`),
    path.join(ROOT, 'public/data/hist-probs-public', histProbs.latest.shards_path, `shard-${name}.json.gz`),
  ];
  let doc = null;
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const body = fs.readFileSync(filePath);
      const text = filePath.endsWith('.gz') ? zlib.gunzipSync(body).toString('utf8') : body.toString('utf8');
      doc = JSON.parse(text);
      break;
    } catch {
      doc = null;
    }
  }
  if (histProbs.shards) histProbs.shards.set(index, doc);
  return doc;
}

function lookupProfileInShard(shard, key, canonical) {
  const normalizedKey = String(key || '').toUpperCase();
  if (shard && !Array.isArray(shard) && typeof shard === 'object') {
    return shard[normalizedKey] || null;
  }
  const rows = Array.isArray(shard?.profiles) ? shard.profiles : Array.isArray(shard) ? shard : [];
  return rows.find((row) => {
    const id = normalizeId(row?.canonical_id || row?.asset_id || row?.symbol || row?.ticker);
    return id === canonical || id === normalizedKey;
  }) || null;
}

function summarizeHistProfile(raw, horizon) {
  if (!raw?.events || typeof raw.events !== 'object') return raw || null;
  const horizonKey = horizon === 'short_term' ? 'h5d' : horizon === 'long_term' ? 'h60d' : 'h20d';
  let best = null;
  let longSupported = false;
  for (const [event, values] of Object.entries(raw.events)) {
    const longN = finiteNumber(values?.h60d?.n);
    if (longN && longN > 0) longSupported = true;
    const item = values?.[horizonKey];
    const n = finiteNumber(item?.n);
    if (!n || n <= 0) continue;
    if (!best || n > best.observations) {
      best = {
        event,
        observations: n,
        win_rate: finiteNumber(item?.win_rate),
        avg_return: finiteNumber(item?.avg_return),
        mae: finiteNumber(item?.mae),
        mfe: finiteNumber(item?.mfe),
        max_drawdown: finiteNumber(item?.max_drawdown),
      };
    }
  }
  if (!best) return {
    ticker: raw.ticker || null,
    lookup_key: raw.lookup_key || null,
    source: raw.source || 'hist_probs_public_projection',
    long_horizon_supported: longSupported,
  };
  return {
    ticker: raw.ticker || null,
    lookup_key: raw.lookup_key || null,
    source: raw.source || 'hist_probs_public_projection',
    horizon_key: horizonKey,
    long_horizon_supported: longSupported,
    ...best,
  };
}
