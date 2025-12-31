import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirror } from "./mirror-io.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WATCHLIST_PATH = path.resolve(__dirname, "../../public/mirrors/watchlist.json");

const DEFAULT_UNIVERSE = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "SPY", "QQQ"]; 
const REQUIRED_BENCHMARKS = ["SPY", "QQQ", "IWM"];
const MAX_UNIVERSE = 20;

export function selectUniverse() {
  let symbols = [];
  const watchlist = loadMirror(WATCHLIST_PATH);
  if (watchlist && Array.isArray(watchlist.symbols)) {
    symbols = watchlist.symbols.map((s) => String(s).toUpperCase());
  }
  if (!symbols.length) symbols = [...DEFAULT_UNIVERSE];
  const normalized = Array.from(new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)));
  let selected = normalized.slice(0, MAX_UNIVERSE);
  REQUIRED_BENCHMARKS.forEach((bench) => {
    if (!selected.includes(bench)) {
      if (selected.length < MAX_UNIVERSE) {
        selected.push(bench);
      } else {
        selected[selected.length - 1] = bench;
      }
    }
  });
  const skipped = normalized.filter((s) => !selected.includes(s));
  return { selected, skipped };
}
