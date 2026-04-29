import path from 'node:path';

export function normalizeHistTicker(value) {
  return String(value || '').trim().toUpperCase();
}

export function histProbsShardPrefix(ticker) {
  const normalized = normalizeHistTicker(ticker).replace(/[^A-Z0-9]/g, '');
  const prefix = (normalized.slice(0, 2) || normalized.slice(0, 1) || '__').padEnd(2, '_');
  return prefix;
}

export function histProbsFlatPath(baseDir, ticker) {
  return path.join(baseDir, `${normalizeHistTicker(ticker)}.json`);
}

export function histProbsShardPath(baseDir, ticker) {
  const normalized = normalizeHistTicker(ticker);
  return path.join(baseDir, histProbsShardPrefix(normalized), `${normalized}.json`);
}

export function histProbsReadCandidates(baseDir, ticker) {
  return [histProbsShardPath(baseDir, ticker), histProbsFlatPath(baseDir, ticker)];
}

export function resolveHistProbsWriteMode(value = process.env.HIST_PROBS_WRITE_MODE || process.env.RV_HIST_PROBS_WRITE_MODE || 'bucket_only') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'flat_only' || normalized === 'flat') return 'flat_only';
  if (normalized === 'dual' || normalized === 'both') return 'dual';
  return 'bucket_only';
}

export function histProbsWriteTargets(baseDir, ticker, { mode = resolveHistProbsWriteMode() } = {}) {
  const flatPath = histProbsFlatPath(baseDir, ticker);
  const shardPath = histProbsShardPath(baseDir, ticker);
  const writeMode = resolveHistProbsWriteMode(mode);
  return {
    mode: writeMode,
    primaryPath: writeMode === 'flat_only' ? flatPath : shardPath,
    flatPath: writeMode === 'bucket_only' ? null : flatPath,
    shardPath: writeMode === 'flat_only' ? null : shardPath,
  };
}
