import fs from "node:fs/promises";
import path from "node:path";
import { readJson } from "./stable-io.mjs";

export async function loadUniverseAndMapping(rootDir) {
  const universePath = path.join(rootDir, "policies/universe/universe.v3.json");
  const mappingPath = path.join(rootDir, "policies/universe/symbol-mapping.v3.json");
  const universe = JSON.parse(await fs.readFile(universePath, "utf8"));
  const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
  return { universe, mapping };
}

export async function readLocalBars(rootDir, ticker) {
  const barPath = path.join(rootDir, "public/data/eod/bars", `${ticker}.json`);
  return readJson(barPath, []);
}

export function pickBarForTradingDate(rows, tradingDate) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let match = rows.find((r) => r?.date === tradingDate);
  if (match) return match;
  const sorted = [...rows].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const row = sorted[i];
    if (row?.date && row.date <= tradingDate) {
      return row;
    }
  }
  return sorted[sorted.length - 1] || null;
}

export function toEodRecord({ canonicalId, ticker, exchange, currency, provider, bar }) {
  if (!bar) return null;
  return {
    canonical_id: canonicalId,
    ticker,
    exchange,
    currency,
    trading_date: bar.date,
    open: Number(bar.open ?? 0),
    high: Number(bar.high ?? 0),
    low: Number(bar.low ?? 0),
    close: Number(bar.close ?? 0),
    adj_close: Number(bar.adjClose ?? bar.close ?? 0),
    volume: Number(bar.volume ?? 0),
    dividend: Number(bar.dividend ?? 0),
    split: Number(bar.split ?? 1),
    provider
  };
}
