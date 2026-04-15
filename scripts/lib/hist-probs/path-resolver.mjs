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
  return [histProbsFlatPath(baseDir, ticker), histProbsShardPath(baseDir, ticker)];
}

export function histProbsWriteTargets(baseDir, ticker) {
  return {
    flatPath: histProbsFlatPath(baseDir, ticker),
    shardPath: histProbsShardPath(baseDir, ticker),
  };
}

