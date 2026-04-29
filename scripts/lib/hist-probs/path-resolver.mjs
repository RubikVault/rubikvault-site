import path from 'node:path';

const VALID_WRITE_MODES = new Set(['dual', 'flat', 'bucket_only']);
export const DEFAULT_HIST_PROBS_WRITE_MODE = 'bucket_only';

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

export function resolveHistProbsWriteMode(value = process.env.HIST_PROBS_WRITE_MODE) {
  const mode = String(value || DEFAULT_HIST_PROBS_WRITE_MODE).trim().toLowerCase();
  return VALID_WRITE_MODES.has(mode) ? mode : DEFAULT_HIST_PROBS_WRITE_MODE;
}

export function histProbsWriteTargets(baseDir, ticker, options = {}) {
  const mode = resolveHistProbsWriteMode(options.mode);
  const flatPath = histProbsFlatPath(baseDir, ticker);
  const shardPath = histProbsShardPath(baseDir, ticker);
  const writePaths = mode === 'flat'
    ? [flatPath]
    : mode === 'bucket_only'
      ? [shardPath]
      : [flatPath, shardPath];
  return {
    flatPath,
    shardPath,
    mode,
    writePaths,
  };
}
