#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();
const DEFAULT_PUBLIC_OUT = path.join(REPO_ROOT, 'public/data/quantlab/stock-insights/latest.json');
const DEFAULT_MIRROR_OUT = path.join(REPO_ROOT, 'mirrors/quantlab/stock-insights/latest.json');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonGzip(filePath) {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath), 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload, spaces = 2) {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, spaces)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function round(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeTicker(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const parts = raw.split(':');
  return parts[parts.length - 1] || raw;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function verdictWeight(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'strong buy') return 5;
  if (key === 'good buy') return 4;
  if (key === 'interesting') return 3;
  if (key === 'neutral') return 2;
  if (key === 'rather no') return 1;
  if (key === 'no buy') return 0;
  // Legacy German fallbacks
  if (key === 'sehr guter kauf') return 5;
  if (key === 'guter kauf') return 4;
  if (key === 'interessant') return 3;
  if (key === 'eher nein') return 1;
  if (key === 'kein kauf') return 0;
  return -1;
}

function tierWeight(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'super strong') return 3;
  if (key === 'strong') return 2;
  if (key === 'medium') return 1;
  // Legacy German fallbacks
  if (key === 'super stark') return 3;
  if (key === 'stark') return 2;
  if (key === 'mittel') return 1;
  return 0;
}

function exchangeWeight(value) {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'US') return 40;
  if (key === 'XNSA') return 30;
  if (key === 'LSE') return 24;
  if (key === 'TW' || key === 'TWO') return 18;
  if (key === 'KO' || key === 'KQ') return 18;
  if (key === 'SHE' || key === 'SHG') return 18;
  return 0;
}

function hasDrName(name) {
  return /\b(?:adr|ads|drc|depositary)\b/i.test(String(name || ''));
}

function opinionScore(opinion) {
  return (
    verdictWeight(opinion?.verdict) * 1000 +
    tierWeight(opinion?.tierLabel || opinion?.tier) * 100 +
    Number(opinion?.percentile || 0)
  );
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return null;
  const pct = round(Number(value) * 100, digits);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

function cleanSentence(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowercaseStart(value) {
  const text = cleanSentence(value);
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function shardKeyForTicker(ticker) {
  const first = normalizeTicker(ticker).charAt(0);
  return /[A-Z0-9]/.test(first) ? first : '_';
}

function registryTypeToAssetClass(typeNorm) {
  const key = String(typeNorm || '').trim().toUpperCase();
  if (key === 'ETF') return 'etf';
  if (key === 'STOCK') return 'stock';
  return 'other';
}

function loadRegistryTypeMap(filePath) {
  const doc = String(filePath || '').endsWith('.gz') ? readJsonGzip(filePath) : readJson(filePath);
  const records = toArray(doc?.records);
  const out = new Map();
  for (const row of records) {
    const canonicalId = String(row?.canonical_id || '');
    if (canonicalId) out.set(canonicalId, String(row?.type_norm || ''));
  }
  return out;
}

function sortOpinions(opinions) {
  return toArray(opinions)
    .map((item) => ({ ...item }))
    .sort((a, b) => opinionScore(b) - opinionScore(a));
}

function summarizeOpinionCounts(opinions) {
  const out = {
    buyExperts: 0,
    watchExperts: 0,
    neutralExperts: 0,
    avoidExperts: 0,
    superStrongExperts: 0,
    strongOrBetterExperts: 0,
  };
  for (const item of opinions) {
    const verdict = String(item?.verdict || '').trim().toLowerCase();
    const tier = String(item?.tierLabel || item?.tier || '').trim().toLowerCase();
    if (verdict === 'strong buy' || verdict === 'good buy' || verdict === 'sehr guter kauf' || verdict === 'guter kauf') out.buyExperts += 1;
    else if (verdict === 'interesting' || verdict === 'interessant') out.watchExperts += 1;
    else if (verdict === 'neutral') out.neutralExperts += 1;
    else if (verdict === 'rather no' || verdict === 'no buy' || verdict === 'eher nein' || verdict === 'kein kauf') out.avoidExperts += 1;
    if (tier === 'super strong' || tier === 'super stark') out.superStrongExperts += 1;
    if (tier === 'super strong' || tier === 'strong' || tier === 'super stark' || tier === 'stark') out.strongOrBetterExperts += 1;
  }
  return out;
}

function representativeScore(row) {
  const opinions = sortOpinions(row.expertOpinions);
  const counts = summarizeOpinionCounts(opinions);
  const avgTopPercentile = average(opinions.slice(0, 3).map((item) => Number(item.percentile || 0)));
  let score = 0;
  score += counts.buyExperts * 140;
  score += counts.watchExperts * 35;
  score -= counts.avoidExperts * 45;
  score += counts.superStrongExperts * 10;
  score += Number(avgTopPercentile || 0);
  score += exchangeWeight(row.exchange);
  score += row.scoredToday ? 8 : 0;
  score += hasDrName(row.name) ? -20 : 0;
  return score;
}

function selectRepresentative(rows) {
  return [...rows].sort((a, b) => representativeScore(b) - representativeScore(a))[0] || null;
}

function metricReasons(metrics = {}) {
  const out = [];
  const trendGate = Number(metrics.trendGate || 0);
  const ret5d = Number(metrics.ret5d || 0);
  const ret20d = Number(metrics.ret20d || 0);
  const macdHist = Number(metrics.macdHist || 0);
  const rsi14 = Number(metrics.rsi14 || 0);
  if (ret20d >= 0.08 && ret5d >= 0) out.push('Multi-week uptrend with continuing momentum.');
  else if (ret20d >= 0.05) out.push('The trend over several weeks clearly points upward.');
  if (macdHist > 0) out.push('MACD remains positive or is turning upward.');
  if (trendGate >= 0.67) out.push('The trend structure is currently cleanly confirmed.');
  if (rsi14 >= 42 && rsi14 <= 68) out.push('The RSI does not appear overheated.');
  if (ret5d > 0.02) out.push('Recent days also confirm upward pressure.');
  return out;
}

function metricRisks(metrics = {}) {
  const out = [];
  const ret5d = Number(metrics.ret5d || 0);
  const ret20d = Number(metrics.ret20d || 0);
  const macdHist = Number(metrics.macdHist || 0);
  const rsi14 = Number(metrics.rsi14 || 0);
  if (ret20d < -0.04) out.push('The 20-day trend is still negative.');
  if (ret5d < -0.02) out.push('In the short term, the stock has recently been weak.');
  if (macdHist <= 0) out.push('MACD does not yet cleanly confirm the push.');
  if (rsi14 > 72) out.push('The RSI is already overheated.');
  if (rsi14 > 0 && rsi14 < 35) out.push('The RSI is weak and needs stabilization first.');
  return out;
}

function mapOutcome(counts, avgTopPercentile) {
  if (counts.buyExperts >= 2 || (counts.buyExperts >= 1 && avgTopPercentile >= 92 && counts.avoidExperts === 0)) {
    return { label: 'Top Buy Opportunity', tone: 'good' };
  }
  if (counts.buyExperts >= 1 || counts.watchExperts >= 2) {
    return { label: 'Interesting for Watchlist', tone: 'warn' };
  }
  if (counts.avoidExperts >= 3) {
    return { label: 'No Buy Currently', tone: 'bad' };
  }
  return { label: 'No Clear Setup Yet', tone: 'info' };
}

function buildAggregateMaps(marketData) {
  const globalMap = new Map();
  toArray(marketData.aggregateTop10).forEach((entry, index) => {
    globalMap.set(String(entry.assetId || ''), { rank: index + 1, ...entry });
  });
  const continentMaps = new Map();
  for (const [continentKey, doc] of Object.entries(marketData.aggregateTopByContinent || {})) {
    const localMap = new Map();
    toArray(doc?.top10).forEach((entry, index) => {
      localMap.set(String(entry.assetId || ''), { rank: index + 1, ...entry });
    });
    continentMaps.set(continentKey, localMap);
  }
  return { globalMap, continentMaps };
}

function buildWhyNow(row, counts, avgTopPercentile, aggregateEntry, topOpinions) {
  const reasons = [];
  if (aggregateEntry?.mentions >= 3) {
    reasons.push(`${aggregateEntry.mentions} strong experts flag this stock simultaneously.`);
  } else if (counts.buyExperts >= 1) {
    reasons.push(`${counts.buyExperts} strong expert${counts.buyExperts > 1 ? 's' : ''} currently see${counts.buyExperts === 1 ? 's' : ''} a buy.`);
  } else if (counts.watchExperts >= 2) {
    reasons.push(`${counts.watchExperts} strong experts find this stock interesting right now.`);
  }
  if (avgTopPercentile >= 95) reasons.push('Top experts rank it among the best picks of the day.');
  for (const item of metricReasons(row.metrics)) {
    if (reasons.length >= 3) break;
    reasons.push(item);
  }
  if (!reasons.length && topOpinions[0]?.reason) reasons.push(cleanSentence(topOpinions[0].reason));
  return reasons.slice(0, 3);
}

function buildWhyNotNow(row, counts) {
  const reasons = [];
  if (counts.avoidExperts >= 2) reasons.push(`${counts.avoidExperts} strong experts currently see no clean buy signal.`);
  for (const item of metricRisks(row.metrics)) {
    if (reasons.length >= 3) break;
    reasons.push(item);
  }
  return reasons.slice(0, 3);
}

function buildSummaryShort(label, whyNow, whyNotNow) {
  if (label === 'Top Buy Opportunity' && whyNow[0]) return `Currently a top setup because ${lowercaseStart(whyNow[0])}`;
  if (label === 'Interesting for Watchlist' && whyNow[0]) return `Worth watching because ${lowercaseStart(whyNow[0])}`;
  if (label === 'No Buy Currently' && whyNotNow[0]) return `No buy yet because ${lowercaseStart(whyNotNow[0])}`;
  return 'No clear Quant Lab signal yet.';
}

function loadV3Consensus() {
  const v3Path = path.join(REPO_ROOT, 'public/data/quantlab/v3-consensus/recommendations.json');
  const doc = readJson(v3Path);
  if (!doc?.recommendations) return new Map();
  const out = new Map();
  for (const [ticker, rec] of Object.entries(doc.recommendations)) {
    out.set(ticker.toUpperCase(), rec);
  }
  return out;
}

let _v3ConsensusCache = null;
function getV3Consensus() {
  if (_v3ConsensusCache === null) _v3ConsensusCache = loadV3Consensus();
  return _v3ConsensusCache;
}

function mapV3Verdict(value) {
  const key = String(value || '').toUpperCase();
  if (key === 'STRONG_BUY' || key === 'BUY') return 'BUY';
  if (key === 'STRONG_SELL' || key === 'SELL') return 'SELL';
  return 'WAIT';
}

function buildTickerRow(row, aggregateMaps, featureSlice, assetClass) {
  const opinions = sortOpinions(row.expertOpinions);
  const counts = summarizeOpinionCounts(opinions);
  const topOpinions = opinions.slice(0, 4).map((item) => ({
    candidateId: String(item.candidateId || ''),
    family: String(item.family || ''),
    title: String(item.title || item.family || 'Expert'),
    purpose: String(item.shortPurpose || ''),
    tierLabel: String(item.tierLabel || item.tier || ''),
    verdict: String(item.verdict || ''),
    percentile: round(Number(item.percentile || 0), 2),
    rank: Number(item.rank || 0),
    reason: cleanSentence(item.reason),
  }));
  const avgTopPercentile = round(average(topOpinions.map((item) => item.percentile)), 2) || 0;
  const outcome = mapOutcome(counts, avgTopPercentile);
  const globalEntry = aggregateMaps.globalMap.get(String(row.assetId || '')) || null;
  const continentEntry = aggregateMaps.continentMaps.get(String(row.continentKey || ''))?.get(String(row.assetId || '')) || null;
  const whyNow = buildWhyNow(row, counts, avgTopPercentile, globalEntry || continentEntry, topOpinions);
  const whyNotNow = buildWhyNotNow(row, counts);

  // Merge v3 consensus if available for this ticker
  const tickerNorm = normalizeTicker(row.symbol || row.assetId);
  const v3Rec = getV3Consensus().get(tickerNorm) || null;
  const v3Consensus = v3Rec ? {
    short: mapV3Verdict(v3Rec.short),
    medium: mapV3Verdict(v3Rec.medium),
    long: mapV3Verdict(v3Rec.long),
    overall: mapV3Verdict(v3Rec.overall),
    confidence: round(Number(v3Rec.confidence || 0), 4),
    regime: String(v3Rec.regime || ''),
    forecastLabel: String(v3Rec.forecast_label || ''),
  } : null;

  return {
    ticker: tickerNorm,
    assetId: String(row.assetId || ''),
    assetClass,
    exchange: String(row.exchange || ''),
    name: String(row.name || tickerNorm),
    continentLabel: String(row.continentLabel || ''),
    asOfDate: String(featureSlice?.asofDate || row.lastTradeDate || ''),
    scoredToday: Boolean(row.scoredToday),
    state: {
      label: outcome.label,
      tone: outcome.tone,
      consensusLabel: String(globalEntry?.overallVerdict || continentEntry?.overallVerdict || outcome.label),
    },
    ranking: {
      globalTop10Rank: globalEntry?.rank || null,
      continentTop10Rank: continentEntry?.rank || null,
      avgTopPercentile,
    },
    consensus: {
      buyExperts: counts.buyExperts,
      watchExperts: counts.watchExperts,
      neutralExperts: counts.neutralExperts,
      avoidExperts: counts.avoidExperts,
      superStrongExperts: counts.superStrongExperts,
      strongOrBetterExperts: counts.strongOrBetterExperts,
      mentions: Number(globalEntry?.mentions || continentEntry?.mentions || counts.buyExperts + counts.watchExperts),
    },
    metrics: {
      macdHist: round(Number(row.metrics?.macdHist || 0), 4),
      rsi14: round(Number(row.metrics?.rsi14 || 0), 2),
      trendGate: round(Number(row.metrics?.trendGate || 0), 3),
      ret5dLabel: formatPct(row.metrics?.ret5d, 1),
      ret20dLabel: formatPct(row.metrics?.ret20d, 1),
    },
    v3Consensus,
    whyNowSimple: whyNow,
    whyNotNowSimple: whyNotNow,
    strongestExperts: topOpinions,
    summary: {
      short: buildSummaryShort(outcome.label, whyNow, whyNotNow),
    },
  };
}

function buildShardDoc(assetClass, shardKey, rows, generatedAt, asOfDate) {
  const byTicker = {};
  for (const row of rows) {
    byTicker[row.ticker] = row;
  }
  return {
    schema: 'rv_quantlab_stock_publish_shard_v2',
    generatedAt,
    asOfDate,
    assetClass,
    shardKey,
    count: rows.length,
    byTicker,
  };
}

export function buildQuantLabStockPublish(marketData, options = {}) {
  const generatedAt = String(options.generatedAt || marketData?.generatedAt || new Date().toISOString());
  const featureSlice = marketData?.featureSlice || {};
  const freshness = options.freshness && typeof options.freshness === 'object' ? options.freshness : null;
  const aggregateMaps = buildAggregateMaps(marketData || {});
  const registryTypeMap = loadRegistryTypeMap(options.registryBrowsePath || marketData?.sources?.registryBrowse);
  const grouped = new Map();

  for (const row of Object.values(marketData?.assetOpinions || {})) {
    const ticker = normalizeTicker(row?.symbol || row?.assetId);
    if (!ticker) continue;
    if (!grouped.has(ticker)) grouped.set(ticker, []);
    grouped.get(ticker).push(row);
  }

  const shards = { stock: new Map(), etf: new Map() };
  const classCounts = {
    stock: { publishedTickers: 0, topBuyTickers: 0, scoredTodayTickers: 0 },
    etf: { publishedTickers: 0, topBuyTickers: 0, scoredTodayTickers: 0 },
  };
  let skippedOtherAssets = 0;

  for (const [ticker, rows] of grouped.entries()) {
    const selected = selectRepresentative(rows);
    if (!selected) continue;
    const registryType = registryTypeMap.get(String(selected.canonicalId || selected.assetId || '')) || '';
    const assetClass = registryTypeToAssetClass(registryType);
    if (assetClass !== 'stock' && assetClass !== 'etf') {
      skippedOtherAssets += 1;
      continue;
    }
    const outRow = buildTickerRow(selected, aggregateMaps, featureSlice, assetClass);
    const shardKey = shardKeyForTicker(ticker);
    if (!shards[assetClass].has(shardKey)) shards[assetClass].set(shardKey, []);
    shards[assetClass].get(shardKey).push(outRow);
    classCounts[assetClass].publishedTickers += 1;
    if (outRow.scoredToday) classCounts[assetClass].scoredTodayTickers += 1;
    if (outRow.state?.label === 'Top Buy Opportunity') classCounts[assetClass].topBuyTickers += 1;
  }

  for (const assetClass of ['stock', 'etf']) {
    for (const [shardKey, rows] of shards[assetClass].entries()) {
      rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
      shards[assetClass].set(shardKey, buildShardDoc(assetClass, shardKey, rows, generatedAt, String(featureSlice?.asofDate || '')));
    }
  }

  const meta = {
    schema: 'rv_quantlab_stock_publish_meta_v2',
    generatedAt,
    asOfDate: String(featureSlice?.asofDate || ''),
    publishMode: 'results_only_no_model_code',
    freshness,
    coverage: {
      inputAssets: Object.keys(marketData?.assetOpinions || {}).length,
      skippedOtherAssets,
      stocks: classCounts.stock,
      etfs: classCounts.etf,
    },
    classes: {
      stocks: {
        shardKeys: [...shards.stock.keys()].sort(),
        shardPathTemplate: '/data/quantlab/stock-insights/stocks/{shard}.json',
      },
      etfs: {
        shardKeys: [...shards.etf.keys()].sort(),
        shardPathTemplate: '/data/quantlab/stock-insights/etfs/{shard}.json',
      },
    },
  };

  return { meta, shards };
}

export function writeQuantLabStockPublishBundle(bundle, options = {}) {
  const publicMetaPath = options.publicMetaPath || DEFAULT_PUBLIC_OUT;
  const mirrorMetaPath = options.mirrorMetaPath || DEFAULT_MIRROR_OUT;
  const publicBaseDir = options.publicBaseDir || path.dirname(publicMetaPath);
  const mirrorBaseDir = options.mirrorBaseDir || path.dirname(mirrorMetaPath);

  writeJsonAtomic(publicMetaPath, bundle.meta, 0);
  writeJsonAtomic(mirrorMetaPath, bundle.meta);

  for (const assetClass of ['stock', 'etf']) {
    cleanupShardDir(path.join(publicBaseDir, `${assetClass}s`), new Set([...bundle.shards[assetClass].keys()].map((key) => `${key}.json`)));
    cleanupShardDir(path.join(mirrorBaseDir, `${assetClass}s`), new Set([...bundle.shards[assetClass].keys()].map((key) => `${key}.json`)));
    for (const [shardKey, doc] of bundle.shards[assetClass].entries()) {
      writeJsonAtomic(path.join(publicBaseDir, `${assetClass}s`, `${shardKey}.json`), doc, 0);
      writeJsonAtomic(path.join(mirrorBaseDir, `${assetClass}s`, `${shardKey}.json`), doc);
    }
  }
}

function cleanupShardDir(dirPath, keepFiles) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      if (keepFiles.has(entry.name)) continue;
      fs.unlinkSync(path.join(dirPath, entry.name));
    }
  } catch {
    // best effort cleanup
  }
}

function parseArgs(argv) {
  const out = {
    input: path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-market.json'),
    publicOut: DEFAULT_PUBLIC_OUT,
    mirrorOut: DEFAULT_MIRROR_OUT,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) out.input = argv[++i];
    else if (arg === '--public-out' && argv[i + 1]) out.publicOut = argv[++i];
    else if (arg === '--mirror-out' && argv[i + 1]) out.mirrorOut = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const marketData = readJson(args.input);
  if (!marketData) {
    process.stderr.write(`Unable to read Quant Lab market input: ${args.input}\n`);
    process.exit(1);
  }
  const bundle = buildQuantLabStockPublish(marketData, {
    generatedAt: marketData.generatedAt || new Date().toISOString(),
    registryBrowsePath: marketData?.sources?.registryBrowse,
  });
  writeQuantLabStockPublishBundle(bundle, {
    publicMetaPath: args.publicOut,
    mirrorMetaPath: args.mirrorOut,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    publicOut: path.relative(REPO_ROOT, args.publicOut),
    mirrorOut: path.relative(REPO_ROOT, args.mirrorOut),
    stockShards: bundle.meta.classes.stocks.shardKeys.length,
    etfShards: bundle.meta.classes.etfs.shardKeys.length,
    publishedStocks: bundle.meta.coverage.stocks.publishedTickers,
    publishedEtfs: bundle.meta.coverage.etfs.publishedTickers,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
