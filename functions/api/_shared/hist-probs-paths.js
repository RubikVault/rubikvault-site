function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

export function histProbsShardPrefix(ticker) {
  const normalized = normalizeTicker(ticker).replace(/[^A-Z0-9]/g, '');
  const prefix = (normalized.slice(0, 2) || normalized.slice(0, 1) || '__').padEnd(2, '_');
  return prefix;
}

export function buildHistProbsCandidatePaths(ticker) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return [];
  const shard = histProbsShardPrefix(normalized);
  return [
    `/data/hist-probs/${encodeURIComponent(normalized)}.json`,
    `/public/data/hist-probs/${encodeURIComponent(normalized)}.json`,
    `/data/hist-probs/${encodeURIComponent(shard)}/${encodeURIComponent(normalized)}.json`,
    `/public/data/hist-probs/${encodeURIComponent(shard)}/${encodeURIComponent(normalized)}.json`,
  ];
}

