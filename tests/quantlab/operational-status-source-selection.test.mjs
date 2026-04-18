import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('quantlab operational status prefers active feature-store manifests before legacy store paths', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/build_quantlab_v4_daily_report.mjs'), 'utf8');
  assert.match(content, /function resolveFeatureStoreManifest/);
  assert.match(content, /path\.join\(quantRoot, 'runs'\)/);
  assert.match(content, /path\.join\(quantRoot, 'ops'\)/);
  assert.match(content, /feature_store_version=\$\{expectedVersion\}\/feature_panel_manifest\.json/);
  assert.match(content, /__resolved_source/);
  assert.match(content, /manifestPath: featureStoreManifest\?.__resolved_path/);
});
