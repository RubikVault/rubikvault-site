import fs from 'fs';
import path from 'path';
import { isBaseStructure } from './core.mjs';

const __dirname = path.resolve();
const DATA_DIR = path.join(__dirname, 'public/data/v3/series/adjusted');

async function readCompressedBars(filePath) {
  const { execSync } = await import('child_process');
  const buffer = execSync(`gunzip -c "${filePath}"`);
  const lines = buffer.toString().trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

async function main() {
  const filePath = path.join(DATA_DIR, 'US__AAPL.ndjson.gz');
  const bars = await readCompressedBars(filePath);
  
  console.log(`Testing AAPL, Total Bars: ${bars.length}`);

  for (let i = 60; i < 80; i++) {
    const check = isBaseStructure(bars, i, 60, 0.92);
    const slice = bars.slice(i - 60, i);
    const maxHigh = Math.max(...slice.map(b => b.high || b.close));
    const currentClose = bars[i].close;
    console.log(`Index: ${i} | Close: ${currentClose.toFixed(2)} | MaxHigh: ${maxHigh.toFixed(2)} | Threshold: ${(maxHigh * 0.92).toFixed(2)} | Result: ${check.is_base}`);
  }
}

main().catch(console.error);
