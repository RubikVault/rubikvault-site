import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { processTickerSeries } from './core.mjs';

const __dirname = path.resolve();
const DATA_DIR = path.join(__dirname, 'public/data/v3/series/adjusted');
const CONFIG_PATH = path.join(__dirname, 'config/runblock/breakout_config.yaml');

// Load Config
const config = yaml.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
console.log("Loaded Config:", JSON.stringify(config, null, 2));
console.log("Config State Machine:", config.state_machine);

async function readCompressedBars(filePath) {
  const { execSync } = await import('child_process');
  const buffer = execSync(`gunzip -c "${filePath}"`);
  const lines = buffer.toString().trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

async function debugTicker(symbol) {
  const filePath = path.join(DATA_DIR, `US__${symbol}.ndjson.gz`);
  if (!fs.existsSync(filePath)) {
    console.log(`[${symbol}] File not found`);
    return;
  }

  const bars = await readCompressedBars(filePath);
  const processing = processTickerSeries(bars, config, { regime_tag: 'UP' });

  console.log(`\n=== Debugging ${symbol} ===`);
  console.log(`Total Bars: ${bars.length}`);
  console.log(`Final State: ${processing.state}`);

  const counts = {};
  processing.history.forEach(h => {
    counts[h.state] = (counts[h.state] || 0) + 1;
  });
  console.log("State Occurrences in History:", counts);

  // Print last 10 bars
  console.log("\nLast 10 Bars:");
  processing.history.slice(-10).forEach(h => {
    console.log(`Date: ${h.date} | Close: ${h.close.toFixed(2)} | Level: ${h.max_level ? h.max_level.toFixed(2) : '-'} | State: ${h.state} | Supp: ${h.is_suppressed}`);
  });
}

async function main() {
  const tickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD'];
  for (const t of tickers) {
    await debugTicker(t);
  }
}

main().catch(console.error);
