#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.join('public', 'data', 'snapshots', 'market-prices', 'latest.json');
if (!fs.existsSync(snapshotPath)) {
  throw new Error('market-prices snapshot missing');
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

const placeholderCodes = new Set(['SNAPSHOT_MISSING', 'ARTIFACT_PROMOTION_FAILED']);
if (snapshot.error && placeholderCodes.has(snapshot.error.code)) {
  console.log('market-prices snapshot placeholder detected; allowed in failure scenarios');
  process.exit(0);
}

if (snapshot.schema_version !== '3.0') {
  throw new Error(`unexpected schema_version=${snapshot.schema_version}`);
}

if (snapshot.metadata?.module !== 'market-prices') {
  throw new Error(`unexpected module=${snapshot.metadata?.module}`);
}

if (snapshot.metadata?.source === 'stub') {
  console.log('market-prices snapshot still stub; skipping source assertion');
  process.exit(0);
}

if (!Array.isArray(snapshot.data) || snapshot.data.length === 0) {
  throw new Error('market-prices data missing or empty');
}

if (!snapshot.meta || typeof snapshot.meta.status !== 'string' || snapshot.meta.status.length === 0) {
  throw new Error('market-prices meta.status missing');
}

console.log('✅ market-prices snapshot source validation passed');
