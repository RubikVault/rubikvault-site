import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { HIST_PROBS_PUBLIC_LATEST, ROOT, finiteNumber, normalizeId, readJsonMaybe } from './shared.mjs';

export function loadHistProbsPublic() {
  const latest = readJsonMaybe(HIST_PROBS_PUBLIC_LATEST);
  if (!latest?.shards_path) return { latest, profiles: new Map(), available: false };
  return { latest, profiles: new Map(), available: true };
}

export function evidenceBootstrap({ assetId, horizon, setup, histProbs, features } = {}) {
  const raw = lookupHistProbsProfile(assetId, histProbs);
  const fallbackN = setup?.primary_setup !== 'none' && features?.bars_count >= 252 ? 24 : 0;
  const horizonAllowed = horizon === 'long_term' ? false : true;
  const observations = finiteNumber(raw?.observations ?? raw?.sample_size ?? raw?.n) ?? (horizonAllowed ? fallbackN : 0);
  const effective = observations ? Number(Math.max(0, observations * 0.75).toFixed(2)) : 0;
  let scope = observations ? 'asset_type' : 'none';
  let method = observations ? 'hist_probs_v2_bootstrap' : 'unavailable';
  if (horizon === 'long_term' && !raw?.long_horizon_supported) {
    scope = 'none';
    method = 'unavailable';
  }
  return {
    evidence_raw_n: observations,
    evidence_effective_n: method === 'unavailable' ? 0 : effective,
    evidence_scope: scope,
    evidence_method: method,
    raw_profile: raw,
  };
}

function lookupHistProbsProfile(assetId, histProbs) {
  if (!histProbs?.available) return null;
  const canonical = normalizeId(assetId);
  if (histProbs.profiles.has(canonical)) return histProbs.profiles.get(canonical);
  const latest = histProbs.latest;
  const shardCount = Number(latest?.shard_count || 0);
  if (!shardCount) return null;
  const shardIndex = Number.parseInt(canonical ? canonical.charCodeAt(0).toString(16) : '0', 16) % shardCount;
  const candidates = [
    path.join(ROOT, 'public/data/hist-probs-public', latest.shards_path, `part-${String(shardIndex).padStart(3, '0')}.json.gz`),
    path.join(ROOT, 'public/data/hist-probs-public', latest.shards_path, `shard-${String(shardIndex).padStart(3, '0')}.json.gz`),
  ];
  let profile = null;
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
      const rows = Array.isArray(doc?.profiles) ? doc.profiles : Array.isArray(doc) ? doc : [];
      profile = rows.find((row) => normalizeId(row?.canonical_id || row?.asset_id || row?.symbol) === canonical) || null;
      break;
    } catch {
      profile = null;
    }
  }
  histProbs.profiles.set(canonical, profile);
  return profile;
}
