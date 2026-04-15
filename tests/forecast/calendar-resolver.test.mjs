import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveForecastCalendar, isCalendarTradingDay } from '../../scripts/forecast/calendar-resolver.mjs';

describe('calendar resolver', () => {
  it('supports simple US stock symbols', () => {
    const resolved = resolveForecastCalendar({ symbol: 'AAPL' });
    assert.equal(resolved.market, 'US');
    assert.equal(resolved.promotable, true);
  });

  it('marks unsupported non-US symbols as not promotable', () => {
    const resolved = resolveForecastCalendar({ symbol: 'VOW3.XETR' });
    assert.equal(resolved.promotable, false);
  });

  it('uses the US trading calendar for business-day checks', () => {
    assert.equal(isCalendarTradingDay('2026-04-09', 'US'), true);
    assert.equal(isCalendarTradingDay('2026-04-11', 'US'), false);
  });
});
