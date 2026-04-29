import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEodhdFundamentalsSymbol } from '../functions/api/_shared/eodhd-symbols.mjs';

test('EODHD fundamentals symbol maps US common stocks to .US', () => {
  assert.equal(resolveEodhdFundamentalsSymbol({ symbol: 'AAPL', exchange: 'US' }), 'AAPL.US');
});

test('EODHD fundamentals symbol maps US class shares to dash .US', () => {
  assert.equal(resolveEodhdFundamentalsSymbol({ symbol: 'BRK.B', exchange: 'US' }), 'BRK-B.US');
});

test('EODHD fundamentals symbol does not force non-US symbols to .US', () => {
  assert.equal(resolveEodhdFundamentalsSymbol({ symbol: 'SAP', exchange: 'XETR' }), 'SAP.XETR');
});

test('EODHD fundamentals symbol preserves provider/exchange-qualified Asian symbols', () => {
  assert.equal(resolveEodhdFundamentalsSymbol({ symbol: '7203.T', exchange: 'TO' }), '7203.T');
  assert.equal(resolveEodhdFundamentalsSymbol({ symbol: '005930.KO', exchange: 'KO' }), '005930.KO');
});

test('EODHD fundamentals symbol prefers registry provider_symbol', () => {
  assert.equal(
    resolveEodhdFundamentalsSymbol({ symbol: 'SAP', exchange: 'XETR', providerSymbol: 'SAP.XETRA' }),
    'SAP.XETRA',
  );
});
