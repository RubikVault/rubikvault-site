/**
 * Full-universe hist_probs runner.
 */

import { runHistProbs } from './run-hist-probs.mjs';

const MAX_TICKERS_PER_RUN = 60000;

function parseArgs() {
  const args = process.argv.slice(2);
  const tickerArg = args.find((a) => a.startsWith('--ticker='))?.split('=')[1]
    || (args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null);
  const tickersArg = args.find((a) => a.startsWith('--tickers='))?.split('=')[1]
    || (args.includes('--tickers') ? args[args.indexOf('--tickers') + 1] : null);
  const assetClassesArg = args.find((a) => a.startsWith('--asset-classes='))?.split('=')[1]
    || (args.includes('--asset-classes') ? args[args.indexOf('--asset-classes') + 1] : null);
  const normalize = (value) => String(value || '').trim().toUpperCase();
  return {
    singleTicker: tickerArg ? normalize(tickerArg) : null,
    tickers: tickersArg ? tickersArg.split(',').map(normalize).filter(Boolean) : null,
    assetClasses: assetClassesArg ? assetClassesArg.split(',').map(normalize).filter(Boolean) : null,
    maxTickers: MAX_TICKERS_PER_RUN,
  };
}

runHistProbs(parseArgs())
  .then((result) => {
    if (!result?.ok) process.exit(1);
  })
  .catch((err) => {
    console.error('[run-hist-probs-full] Fatal error:', err);
    process.exit(1);
  });
