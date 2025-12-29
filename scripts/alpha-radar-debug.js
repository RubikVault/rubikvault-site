#!/usr/bin/env node
const symbol = (process.argv[2] || "AAPL").toUpperCase();
const base = process.argv[3] || process.env.RV_BASE_URL || "http://localhost:8788";
const url = `${base}/api/alpha-radar?debug=1&symbol=${encodeURIComponent(symbol)}`;

async function main() {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const json = await res.json();
    const pick = json?.data?.picks?.top?.[0] || json?.data?.picks?.shortterm?.[0];
    console.log(`Debug URL: ${url}`);
    console.log(JSON.stringify(pick?.debug || json, null, 2));
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error?.message || error);
    process.exitCode = 1;
  }
}

main();
