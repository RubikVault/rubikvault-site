#!/usr/bin/env node

import { buildSearchIndex, filterUniverse } from '../public/search.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

const universeFixture = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF" },
  { symbol: "STAR", name: "Starline Systems" },
  { symbol: "STELLAR", name: "Stellar Labs" },
  { symbol: "APPLE", name: "Apple Inc" },
  { symbol: "AAPL", name: "Apple Inc" },
  { symbol: "AAPLX", name: "AAPLX Research" },
  { symbol: "BETA", name: "Beta Systems" }
];

const index = universeFixture.map((entry) => ({
  ticker: entry.symbol,
  name: entry.name,
  nameLower: entry.name.toLowerCase(),
  membership: {},
  indexes: []
}));

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

function testAutocompleteSmokeAAP() {
  const results = filterUniverse(index, 'AAP');
  assert(results[0]?.ticker === 'AAPL', 'AAP should suggest AAPL');
}

async function main() {
  testExactTicker();
  testTickerPrefixBeatsName();
  testNamePrefixBeatsSubstring();
  testSubstringMatch();
  testNoMatches();
  testAutocompleteSmokeAAP();
  console.log('✅ search-universe filtering tests passed');
}

main().catch((err) => {
  console.error('❌ search-universe filtering tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
