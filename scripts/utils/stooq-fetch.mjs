import path from "node:path";
import { fetchStooqDaily as fetchStooqProvider } from "../providers/stooq.js";
import { createBudgetState, createUsageCollector, loadBudgetsConfig } from "../_lib/usage.js";

const limits = loadBudgetsConfig(path.resolve(process.cwd()));
const usage = createUsageCollector(limits);
const budget = createBudgetState(limits, usage);
const DEFAULT_CTX = { providerId: "stooq", endpoint: "daily", usage, budget };

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 3 || !lines[0].startsWith("Date")) return null;
  const dates = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volumes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const open = Number(parts[1]);
    const high = Number(parts[2]);
    const low = Number(parts[3]);
    const close = Number(parts[4]);
    const volume = Number(parts[5]);
    if (!Number.isFinite(close)) continue;
    dates.push(parts[0]);
    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(Number.isFinite(volume) ? volume : 0);
  }
  return { dates, opens, highs, lows, closes, volumes };
}

export async function fetchStooqDaily(symbol, ctx = DEFAULT_CTX) {
  const result = await fetchStooqProvider(ctx, symbol);
  const rows = Array.isArray(result?.data) ? result.data : [];
  const parsed = parseCsv(
    [
      "Date,Open,High,Low,Close,Volume",
      ...rows.map((row) => `${row.date},${row.open},${row.high},${row.low},${row.close},${row.volume}`)
    ].join("\n")
  );
  if (!parsed) throw new Error("stooq_parse_error");
  return parsed;
}
