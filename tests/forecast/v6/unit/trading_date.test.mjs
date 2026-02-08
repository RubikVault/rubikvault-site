import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadCalendar, isTradingDay, previousTradingDay, addTradingDays } from '../../../../scripts/forecast/v6/lib/trading_date.mjs';

const repoRoot = process.cwd();
const calendar = loadCalendar(repoRoot, 'scripts/forecast/v6/lib/calendar/nyse_holidays.json');

test('calendar marks weekend and holiday as non-trading', () => {
  assert.equal(isTradingDay('2026-02-16', calendar), false); // Presidents' Day 2026
  assert.equal(isTradingDay('2026-02-17', calendar), true);
  assert.equal(isTradingDay('2026-02-14', calendar), false); // Saturday
});

test('previousTradingDay and addTradingDays are deterministic', () => {
  const prev = previousTradingDay('2026-02-16', calendar);
  assert.equal(prev, '2026-02-13');

  const plusFive = addTradingDays('2026-02-13', 5, calendar);
  assert.equal(plusFive, '2026-02-23');
});
