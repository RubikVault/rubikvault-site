import fs from 'fs';
import path from 'path';
import { calculateRvol } from './core.mjs';

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
  
  const rvols = calculateRvol(bars, 20);
  
  console.log(`RVOL values for AAPL:`);
  console.log(`First 5: ${rvols.slice(0, 5)}`);
  console.log(`Some Middle 5: ${rvols.slice(100, 105)}`);
  console.log(`Last 5: ${rvols.slice(-5)}`);
}

main().catch(console.error);
