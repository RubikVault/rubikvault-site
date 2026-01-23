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

const expectRealPrices = /^(1|true)$/i.test(String(process.env.RV_EXPECT_REAL_PRICES ?? '').trim());
const metadataSource = snapshot.metadata?.source ?? '';
const allowingStub = !expectRealPrices && metadataSource === 'stub';

if (allowingStub) {
  console.log('market-prices snapshot still stub; RV_EXPECT_REAL_PRICES not set -> stub allowed');
  process.exit(0);
}

if (snapshot.schema_version !== '3.0') {
  throw new Error(`unexpected schema_version=${snapshot.schema_version}`);
}

if (snapshot.metadata?.module !== 'market-prices') {
  throw new Error(`unexpected module=${snapshot.metadata?.module}`);
}

if (snapshot.meta?.source === 'stub') {
  throw new Error('meta.source cannot be stub when a real snapshot is expected');
}

if (metadataSource !== 'stooq') {
  throw new Error(`metadata.source=${metadataSource}; expected 'stooq' for market-prices`);
}

const metadataProvider = snapshot.metadata?.provider ?? '';
if (!metadataProvider || metadataProvider === 'stub') {
  throw new Error(`metadata.provider=${metadataProvider || 'missing'}; expected an upstream provider`);
}

if (!Array.isArray(snapshot.data) || snapshot.data.length === 0) {
  throw new Error('market-prices data missing or empty');
}

if (!snapshot.meta || typeof snapshot.meta.status !== 'string' || snapshot.meta.status.length === 0) {
  throw new Error('market-prices meta.status missing');
}

console.log('✅ market-prices snapshot source validation passed');
