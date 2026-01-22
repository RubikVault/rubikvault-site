#!/usr/bin/env node

import { buildSearchIndex, filterUniverse } from '../public/search.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

const universeFixture = {
  SPY: { name: 'SPDR S&P 500 ETF', indexes: ['DJ30', 'SP500'] },
  STAR: { name: 'Starline Systems', indexes: ['NDX100'] },
  STELLAR: { name: 'Stellar Labs', indexes: ['RUT2000'] },
  APPLE: { name: 'Apple Inc', indexes: ['NDX100', 'SP500'] },
  AAPLX: { name: 'AAPLX Research', indexes: ['NDX100'] },
  BETA: { name: 'Beta Systems', indexes: ['RUT2000'] }
};

const index = buildSearchIndex(universeFixture);

function testExactTicker() {
  const results = filterUniverse(index, 'SPY');
  assert(results[0]?.ticker === 'SPY', 'Exact ticker should win');
}

function testTickerPrefixBeatsName() {
  const results = filterUniverse(index, 'ST');
  assert(results[0]?.ticker === 'STAR', 'Ticker prefix should outrank name');
}

function testNamePrefixBeatsSubstring() {
  const results = filterUniverse(index, 'Apple');
  assert(results[0]?.ticker === 'APPLE', 'Name prefix should outrank substring');
}

function testSubstringMatch() {
  const results = filterUniverse(index, 'lar');
  assert(results.some((entry) => entry.ticker === 'STELLAR'), 'Substring found STELLAR');
}

function testNoMatches() {
  const results = filterUniverse(index, 'ZZZ');
  assert(results.length === 0, 'No matches should yield empty array');
}

async function main() {
  testExactTicker();
  testTickerPrefixBeatsName();
  testNamePrefixBeatsSubstring();
  testSubstringMatch();
  testNoMatches();
  console.log('✅ search-universe filtering tests passed');
}

main().catch((err) => {
  console.error('❌ search-universe filtering tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
