#!/usr/bin/env node

import { readLedgerRangeAsync, writeOutcomeRecords } from './ledger_writer.mjs';
import { createOutcomeRecord, computeOutcome } from './evaluator.mjs';
import { loadPriceHistory } from './snapshot_ingest.mjs';
import { getHorizonOutcomeDate } from './trading_date.mjs';

const ROOT = process.cwd();

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function shiftDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.find((arg) => arg.startsWith('--date='));
  const lookbackArg = args.find((arg) => arg.startsWith('--lookback-days='));
  const endDate = dateArg ? dateArg.split('=')[1] : isoDate(new Date());
  const lookbackDays = Math.max(30, Number(lookbackArg?.split('=')[1] || 120));
  const startDate = shiftDays(endDate, -lookbackDays);

  const forecasts = (await readLedgerRangeAsync(ROOT, 'forecasts', startDate, endDate)).filter((row) => row?.provenance === 'live');
  const existingOutcomes = (await readLedgerRangeAsync(ROOT, 'outcomes', startDate, endDate)).filter((row) => row?.provenance === 'live');
  const existingForecastIds = new Set(existingOutcomes.map((row) => String(row?.forecast_id || '')).filter(Boolean));

  const maturedForecasts = forecasts.filter((forecast) => {
    if (existingForecastIds.has(String(forecast?.forecast_id || ''))) return false;
    const horizonDays = Number(String(forecast?.horizon || '').replace('d', '')) || 1;
    const outcomeDate = getHorizonOutcomeDate(String(forecast?.trading_date || ''), horizonDays);
    return outcomeDate && outcomeDate <= endDate;
  });

  const tickers = Array.from(new Set(maturedForecasts.map((row) => String(row?.ticker || '').toUpperCase()).filter(Boolean)));
  const priceHistory = await loadPriceHistory(ROOT, tickers, endDate);
  const outcomes = [];

  for (const forecast of maturedForecasts) {
    const ticker = String(forecast?.ticker || '').toUpperCase();
    const horizonDays = Number(String(forecast?.horizon || '').replace('d', '')) || 1;
    const outcomeDate = getHorizonOutcomeDate(String(forecast?.trading_date || ''), horizonDays);
    const tickerPrices = priceHistory[ticker];
    if (!tickerPrices?.dates?.length) continue;
    const forecastIdx = tickerPrices.dates.indexOf(String(forecast?.trading_date || ''));
    const outcomeIdx = tickerPrices.dates.indexOf(outcomeDate);
    if (forecastIdx === -1 || outcomeIdx === -1) continue;
    const y = computeOutcome(tickerPrices.closes[forecastIdx], tickerPrices.closes[outcomeIdx]);
    if (y == null) continue;
    outcomes.push(createOutcomeRecord(forecast, y, outcomeDate));
  }

  if (outcomes.length) {
    writeOutcomeRecords(ROOT, outcomes);
  }

  const counts = outcomes.reduce((acc, row) => {
    const key = String(row?.horizon || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    ok: true,
    start_date: startDate,
    end_date: endDate,
    forecasts_scanned: forecasts.length,
    matured_missing: maturedForecasts.length,
    outcomes_written: outcomes.length,
    by_horizon: counts,
  }));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
