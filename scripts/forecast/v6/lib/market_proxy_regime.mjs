import fs from 'node:fs';
import path from 'node:path';
import { sha256Json } from './hashing.mjs';

function loadBars(repoRoot, symbol) {
  const p = path.join(repoRoot, 'public/data/eod/bars', `${symbol}.json`);
  if (!fs.existsSync(p)) return [];
  const rows = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r?.date && Number.isFinite(r?.close)).sort((a, b) => a.date.localeCompare(b.date));
}

function closeOnOrBefore(rows, asofDate) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date <= asofDate) return rows[i].close;
  }
  return null;
}

function closeNTradingDaysAgo(rows, asofDate, n = 20) {
  const eligible = rows.filter((row) => row.date <= asofDate);
  if (eligible.length <= n) return null;
  return eligible[eligible.length - 1 - n].close;
}

function safeReturn(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return 0;
  return (curr - prev) / prev;
}

export function computeRegimeFromProxy({ repoRoot, asofDate }) {
  const spyBars = loadBars(repoRoot, 'SPY');
  const qqqBars = loadBars(repoRoot, 'QQQ');

  const spyNow = closeOnOrBefore(spyBars, asofDate);
  const qqqNow = closeOnOrBefore(qqqBars, asofDate);
  const spy20 = closeNTradingDaysAgo(spyBars, asofDate, 20);
  const qqq20 = closeNTradingDaysAgo(qqqBars, asofDate, 20);

  const spyRet20 = safeReturn(spyNow, spy20);
  const qqqRet20 = safeReturn(qqqNow, qqq20);
  const avgRet20 = (spyRet20 + qqqRet20) / 2;

  let regimeBucket = 'NEUTRAL';
  if (avgRet20 >= 0.02) regimeBucket = 'BULL';
  else if (avgRet20 <= -0.02) regimeBucket = 'BEAR';

  const payload = {
    asof_date: asofDate,
    proxies: {
      SPY: { close: spyNow, ret20: spyRet20 },
      QQQ: { close: qqqNow, ret20: qqqRet20 }
    },
    regime_bucket: regimeBucket
  };

  return {
    ...payload,
    market_proxy_hash: sha256Json(payload)
  };
}

export default { computeRegimeFromProxy };
