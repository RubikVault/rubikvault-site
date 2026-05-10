import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGlobalAssetClasses,
  resolveGlobalAssetClasses,
} from '../functions/api/_shared/global-asset-classes.mjs';

test('global asset classes default to STOCK, ETF, and INDEX', () => {
  assert.deepEqual(parseGlobalAssetClasses(''), ['STOCK', 'ETF', 'INDEX']);
});

test('global asset classes accept INDEX aliases and de-duplicate', () => {
  assert.deepEqual(parseGlobalAssetClasses('stock,etf,indices,INDEX'), ['STOCK', 'ETF', 'INDEX']);
});

test('global asset classes reject unsupported types', () => {
  assert.throws(() => parseGlobalAssetClasses('stock,crypto'), /unsupported_asset_class:CRYPTO/);
});

test('global asset classes resolve from RV_GLOBAL_ASSET_CLASSES env', () => {
  assert.deepEqual(resolveGlobalAssetClasses({ RV_GLOBAL_ASSET_CLASSES: 'STOCK,ETF,INDEX' }), ['STOCK', 'ETF', 'INDEX']);
});
