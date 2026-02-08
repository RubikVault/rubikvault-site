import path from 'node:path';
import { readJson, writeJsonAtomic } from './io.mjs';

export function syncFeatureBySymbolCache({ repoRoot, mode, asofDate, featureRows }) {
  if (mode === 'CI') {
    throw new Error('CI_CACHE_WRITE_FORBIDDEN: by_symbol cache writes are local-only');
  }

  const root = path.join(repoRoot, 'mirrors/forecast/cache/features/by_symbol');
  const touched = [];

  for (const row of featureRows) {
    const target = path.join(root, `${row.symbol}.json`);
    const existing = readJson(target, {
      schema: 'forecast_feature_cache_by_symbol_v6',
      symbol: row.symbol,
      rows: []
    });

    const dedup = new Map();
    for (const item of existing.rows || []) dedup.set(item.date, item);
    dedup.set(asofDate, { date: asofDate, features: row.features });

    const nextRows = [...dedup.values()].sort((a, b) => a.date.localeCompare(b.date));
    writeJsonAtomic(target, {
      schema: 'forecast_feature_cache_by_symbol_v6',
      symbol: row.symbol,
      rows: nextRows
    });
    touched.push(path.relative(repoRoot, target));
  }

  return { touched_count: touched.length, touched };
}

export default { syncFeatureBySymbolCache };
