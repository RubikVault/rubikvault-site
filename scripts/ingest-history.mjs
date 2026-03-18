import fs from 'fs';
import path from 'path';
import https from 'https';

/**
 * Bulk History Ingestor for RubikVault (Parallel Version)
 */

const SYMBOLS_PATH = './public/data/universe/v7/ssot/stocks.max.symbols.json';
const SHARDS_DIR = './public/data/eod/history/shards';
const API_TOKEN = process.env.EODHD_API_KEY || process.env.EODHD_API_TOKEN;
if (!API_TOKEN) { console.error('EODHD_API_KEY or EODHD_API_TOKEN must be set'); process.exit(1); }
const MAX_DAYS = 100;
const CONCURRENCY = 8;

function getShard(ticker) {
  const first = ticker[0].toUpperCase();
  if (/^[A-Z0-9]$/.test(first)) return first;
  return '_';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) return resolve(null);
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function run() {
  console.log('--- RubikVault Bulk Ingestor (Parallel) ---');
  
  if (!fs.existsSync(SYMBOLS_PATH)) {
    console.error('Symbols file not found:', SYMBOLS_PATH);
    process.exit(1);
  }

  let { symbols } = JSON.parse(fs.readFileSync(SYMBOLS_PATH, 'utf8'));
  const priority = ['MALLPLAZA.SN', 'AAPL', 'TSLA', 'BTC-USD', 'EURUSD'];
  symbols = [...new Set([...priority, ...symbols])];

  if (!fs.existsSync(SHARDS_DIR)) fs.mkdirSync(SHARDS_DIR, { recursive: true });

  const shardBuffers = {};
  const allowedShards = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("");
  allowedShards.forEach(s => {
    const shardPath = path.join(SHARDS_DIR, `${s}.json`);
    shardBuffers[s] = fs.existsSync(shardPath) ? JSON.parse(fs.readFileSync(shardPath, 'utf8')) : {};
  });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - MAX_DAYS);
  const fromStr = startDate.toISOString().split('T')[0];

  let success = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;
  const maxSuccess = parseInt(process.argv.find(arg => arg.startsWith('--max-success='))?.split('=')[1] || "999999");

  async function worker() {
    while (index < symbols.length && success < maxSuccess) {
      const ticker = symbols[index++];
      const s = getShard(ticker);
      
      if (shardBuffers[s][ticker] && shardBuffers[s][ticker].length > 50) {
        skipped++;
        continue;
      }

      const url = `https://eodhd.com/api/eod/${ticker}?from=${fromStr}&api_token=${API_TOKEN}&fmt=json`;
      const data = await fetchJson(url);
      
      if (Array.isArray(data) && data.length > 0) {
        shardBuffers[s][ticker] = data.map(b => [
          b.date, b.open, b.high, b.low, b.close, b.adjusted_close ?? b.close, b.volume
        ]);
        success++;
        
        if (success % 20 === 0) {
           fs.writeFileSync(path.join(SHARDS_DIR, `${s}.json`), JSON.stringify(shardBuffers[s]));
        }
      } else {
        failed++;
      }

      if ((success + skipped + failed) % 100 === 0) {
        console.log(`Progress: ${success + skipped + failed}/${symbols.length} | Success: ${success} | Skipped: ${skipped} | Failed: ${failed}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }).map(() => worker()));

  allowedShards.forEach(s => {
    fs.writeFileSync(path.join(SHARDS_DIR, `${s}.json`), JSON.stringify(shardBuffers[s]));
  });

  console.log('--- Finished ---');
  console.log(`Total Success: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
}

run();
