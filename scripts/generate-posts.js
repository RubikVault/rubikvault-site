#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.argv[2] || process.env.RV_BASE_URL || "http://localhost:8788";
const outDir = path.join(process.cwd(), "public", "posts");
const dateTag = new Date().toISOString().slice(0, 10);

const FEATURES = [
  { id: "market-cockpit", label: "Market Cockpit", endpoint: "/api/market-cockpit" },
  { id: "market-health", label: "Market Health", endpoint: "/api/market-health" },
  { id: "yield-curve", label: "Yield Curve", endpoint: "/api/yield-curve" },
  { id: "sector-rotation", label: "Sector Rotation", endpoint: "/api/sector-rotation" },
  { id: "central-bank-watch", label: "Central Bank Watch", endpoint: "/api/central-bank-watch" },
  { id: "sp500-sectors", label: "S&P 500 Sectors", endpoint: "/api/sp500-sectors" },
  { id: "news", label: "News Headlines", endpoint: "/api/news" },
  { id: "news-intelligence", label: "News Intelligence", endpoint: "/api/news-intelligence" },
  { id: "macro-rates", label: "Macro & Rates", endpoint: "/api/macro-rates" },
  { id: "crypto-snapshot", label: "Crypto Snapshot", endpoint: "/api/crypto-snapshot" },
  { id: "sentiment", label: "Sentiment Barometer", endpoint: "/api/sentiment" },
  { id: "tech-signals", label: "Tech Signals", endpoint: "/api/tech-signals" },
  { id: "alpha-radar", label: "Alpha Radar", endpoint: "/api/alpha-radar" },
  { id: "market-regime", label: "Market Regime Radar", endpoint: "/api/market-regime" },
  { id: "why-moved", label: "Why This Stock Moved", endpoint: "/api/why-moved" },
  { id: "volume-anomaly", label: "Volume Anomaly", endpoint: "/api/volume-anomaly" },
  { id: "hype-divergence", label: "Inverse Hype Detector", endpoint: "/api/hype-divergence" },
  { id: "congress-trading", label: "Congress Trading Tracker", endpoint: "/api/congress-trading" },
  { id: "insider-cluster", label: "Insider Cluster", endpoint: "/api/insider-cluster" },
  { id: "analyst-stampede", label: "Analyst Stampede", endpoint: "/api/analyst-stampede" },
  { id: "smart-money", label: "Smart Money Score", endpoint: "/api/smart-money" },
  { id: "alpha-performance", label: "Alpha Consistency", endpoint: "/api/alpha-performance" },
  { id: "earnings-reality", label: "Earnings Reality Check", endpoint: "/api/earnings-reality" }
];

function ensureDir() {
  fs.mkdirSync(outDir, { recursive: true });
}

function safeNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toFixed(digits);
}

function resolveDataQuality(payload) {
  return payload?.data?.dataQuality || payload?.dataQuality || (payload?.ok ? "LIVE" : "NO_DATA");
}

function summarize(featureId, payload) {
  const data = payload?.data?.data || payload?.data || {};
  switch (featureId) {
    case "market-regime":
      return `${data.label || "Regime"} (${safeNumber(data.riskOnScore, 0)})`;
    case "why-moved":
      return data.movers?.[0]
        ? `${data.movers[0].symbol}: ${data.movers[0].reasonLabel || "Move"}`
        : "No movers";
    case "volume-anomaly":
      return data.signals?.[0]
        ? `${data.signals[0].symbol}: ${data.signals[0].signal}`
        : "No signals";
    case "hype-divergence":
      return data.signals?.[0]
        ? `${data.signals[0].symbol}: ${data.signals[0].signal}`
        : "No signals";
    case "congress-trading":
      return data.trades?.[0]
        ? `${data.trades[0].symbol} ${data.trades[0].action}`
        : "No trades";
    case "insider-cluster":
      return data.items?.[0]
        ? `${data.items[0].symbol}: ${data.items[0].insiderCount} insiders`
        : "No clusters";
    case "analyst-stampede":
      return data.items?.[0]
        ? `${data.items[0].symbol}: ${data.items[0].delta} changes`
        : "No analyst moves";
    case "smart-money":
      return `Score ${safeNumber(data.score, 0)}`;
    case "alpha-radar":
      return data.picks?.top?.[0]
        ? `Top: ${data.picks.top[0].symbol} (${safeNumber(data.picks.top[0].totalScore, 0)})`
        : "No picks";
    case "alpha-performance":
      return `Hit rate ${safeNumber(data.hitRate * 100, 1)}%`;
    case "earnings-reality":
      return data.items?.[0]
        ? `${data.items[0].symbol}: ${data.items[0].flag || "Check"}`
        : "No earnings";
    default:
      return `${payload?.feature || featureId}`;
  }
}

async function fetchPayload(endpoint) {
  const url = `${baseUrl}${endpoint}`;
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { ok: res.ok, json, url };
  } catch (error) {
    return { ok: false, json: null, url: endpoint, error: error?.message || "fetch_failed" };
  }
}

async function writeSummary(feature) {
  const payload = await fetchPayload(feature.endpoint);
  const data = payload.json || { ok: false, feature: feature.id };
  const dataQuality = resolveDataQuality(data);
  const headline = summarize(feature.id, data);
  const baseLine = `${feature.label}: ${headline}`;
  const summary = {
    feature: feature.id,
    label: feature.label,
    date: dateTag,
    generatedAt: new Date().toISOString(),
    endpoint: feature.endpoint,
    dataQuality,
    traceId: data?.traceId || "",
    updatedAt: data?.data?.updatedAt || data?.ts || null,
    summary: {
      text_short: `${baseLine} · ${dataQuality}`,
      text_medium: `${baseLine}. Quality: ${dataQuality}. Updated: ${data?.data?.updatedAt || data?.ts || ""}`,
      text_linkedin: `${baseLine}\nQuality: ${dataQuality}\nUpdated: ${data?.data?.updatedAt || data?.ts || ""}`,
      text_instagram: `${baseLine}\n#RubikVault #Markets`
    }
  };

  const filename = `${feature.id}_${dateTag}.json`;
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(summary, null, 2));
  return filename;
}

async function main() {
  ensureDir();
  const written = [];
  for (const feature of FEATURES) {
    const file = await writeSummary(feature);
    written.push(file);
  }
  console.log(`Generated ${written.length} posts in ${outDir}`);
}

main();
