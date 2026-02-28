#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFeatureSnapshot } from '../forecast/build_features.mjs';
import { loadChampion } from '../forecast/forecast_engine.mjs';
import { loadPriceHistory } from '../forecast/snapshot_ingest.mjs';
import { resolveSsotPath } from './lib/ssot-paths.mjs';

const REPO_ROOT = process.cwd();

const SSOT_ROWS_PATH = resolveSsotPath(REPO_ROOT, 'stocks.max.rows.json');
const MARKETPHASE_DEEP_SUMMARY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
const FORECAST_LATEST_PATH = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const OUT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_gap_reasons_report.json');
const OUT_SUMMARY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_gap_reasons_summary.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function countBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([key, count]) => ({ key, count }));
}

function loadSsotRows(doc) {
  const items = Array.isArray(doc?.items) ? doc.items : [];
  const out = [];
  const seen = new Set();
  for (const row of items) {
    const symbol = normalizeTicker(row?.symbol);
    const canonical_id = String(row?.canonical_id || '').trim().toUpperCase();
    if (!symbol || !canonical_id || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      canonical_id,
      exchange: String(row?.exchange || '').trim().toUpperCase() || null,
      bars_count: Number(row?.bars_count || 0) || 0,
      history_pack: String(row?.pointers?.history_pack || '').trim() || null,
      row
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

function forecastTickerSet(latest) {
  const rows = Array.isArray(latest?.data?.forecasts) ? latest.data.forecasts : [];
  const set = new Set();
  for (const row of rows) {
    const t = normalizeTicker(row?.ticker || row?.symbol);
    if (t) set.add(t);
  }
  return set;
}

function deepTickerSet(summary) {
  const rows = Array.isArray(summary?.items) ? summary.items : [];
  const set = new Set();
  for (const row of rows) {
    const t = normalizeTicker(row?.symbol);
    if (t) set.add(t);
  }
  return set;
}

async function buildMarketphaseGapReasons(ssotRows, deepSet) {
  const missing = [];
  for (const row of ssotRows) {
    if (deepSet.has(row.symbol)) continue;
    let reason = 'UNCLASSIFIED';
    if (!Number.isFinite(row.bars_count) || row.bars_count < 200) {
      reason = row.history_pack ? 'INSUFFICIENT_HISTORY_REGISTRY_LT_200' : 'INSUFFICIENT_HISTORY_NO_PACK_LT_200';
    } else if (!row.history_pack) {
      reason = 'NO_HISTORY_PACK_WITH_SUFFICIENT_BARS_UNEXPECTED';
    }
    else reason = 'UNEXPECTED_DEEP_MISSING_WITH_SUFFICIENT_BARS';
    missing.push({
      symbol: row.symbol,
      canonical_id: row.canonical_id,
      bars_count: row.bars_count,
      reason
    });
  }

  return {
    target_count: ssotRows.length,
    covered_count: ssotRows.length - missing.length,
    gap_count: missing.length,
    reason_counts: countBy(missing, (r) => r.reason),
    samples: {
      insufficient_history: missing.filter((r) => r.reason === 'INSUFFICIENT_HISTORY_REGISTRY_LT_200').slice(0, 25),
      no_history_pack: missing.filter((r) => String(r.reason).includes('NO_PACK')).slice(0, 25),
      unexpected: missing.filter((r) => r.reason.startsWith('UNEXPECTED')).slice(0, 25)
    },
    missing
  };
}

function featureMissingDiagnostics(closes, featureSnapshot) {
  const recent = Array.isArray(closes) ? closes.slice(-250) : [];
  let nonPositive = 0;
  let nonFinite = 0;
  for (const v of recent) {
    if (!Number.isFinite(v)) nonFinite += 1;
    else if (v <= 0) nonPositive += 1;
  }
  return {
    missing_features: Array.isArray(featureSnapshot?.missing_features) ? featureSnapshot.missing_features : [],
    recent_non_positive_closes_250: nonPositive,
    recent_non_finite_closes_250: nonFinite
  };
}

async function buildForecastGapReasons(ssotRows, forecastSet, tradingDate) {
  const champion = loadChampion(REPO_ROOT);
  const enabledGroups = Array.isArray(champion?.enabled_feature_groups) ? champion.enabled_feature_groups : [];
  const threshold = enabledGroups.length * 0.3;

  const missingRows = ssotRows.filter((row) => !forecastSet.has(row.symbol));
  console.log(`[GapReasons] Forecast missing tickers to inspect: ${missingRows.length}`);
  const universeEntries = missingRows.map((r) => ({
    symbol: r.symbol,
    canonical_id: r.canonical_id,
    exchange: r.exchange,
    bars_count: r.bars_count
  }));
  if (!universeEntries.some((r) => normalizeTicker(r.symbol) === 'SPY')) {
    universeEntries.push({ symbol: 'SPY', canonical_id: 'US:SPY', exchange: 'US', bars_count: 0 });
  }

  console.log(`[GapReasons] Loading price history for ${universeEntries.length} entries (missing subset + SPY)...`);
  const priceHistory = await loadPriceHistory(REPO_ROOT, universeEntries, tradingDate, { keyBy: 'canonical' });
  const spyEntry = universeEntries.find((r) => r.symbol === 'SPY');
  const spyCanonical = String(spyEntry?.canonical_id || '').trim().toUpperCase();
  const spyPrices = (spyCanonical && priceHistory[spyCanonical]) || priceHistory.SPY || null;

  const missing = [];
  for (const row of missingRows) {
    const historyKey = row.canonical_id || row.symbol;
    const series = priceHistory[historyKey] || priceHistory[row.symbol] || {};
    const closes = Array.isArray(series?.closes) ? series.closes : [];
    const volumes = Array.isArray(series?.volumes) ? series.volumes : [];

    let reason = null;
    const details = {
      registry_bars_count: row.bars_count,
      actual_closes_count: closes.length
    };

    if (closes.length < 200) {
      reason = 'INSUFFICIENT_HISTORY_ACTUAL_LT_200';
    } else {
      const featureSnapshot = buildFeatureSnapshot({
        ticker: row.symbol,
        tradingDate,
        closes,
        volumes,
        spyCloses: spyPrices?.closes ?? null,
        eventFlags: null,
        enabledGroups
      });

      if ((featureSnapshot?.missing_features?.length || 0) > threshold) {
        reason = 'MISSING_FEATURES_THRESHOLD';
        Object.assign(details, featureMissingDiagnostics(closes, featureSnapshot));
      } else {
        reason = 'UNEXPECTED_NOT_IN_FORECAST_LATEST';
        Object.assign(details, featureMissingDiagnostics(closes, featureSnapshot));
      }
    }

    missing.push({
      symbol: row.symbol,
      canonical_id: row.canonical_id,
      reason,
      details
    });
  }

  const missingFeatureRows = missing.filter((r) => r.reason === 'MISSING_FEATURES_THRESHOLD');
  const missingFeatureNames = [];
  for (const row of missingFeatureRows) {
    for (const name of row?.details?.missing_features || []) missingFeatureNames.push(name);
  }

  return {
    target_count: ssotRows.length,
    covered_count: ssotRows.length - missing.length,
    gap_count: missing.length,
    trading_date: tradingDate,
    champion_feature_groups_enabled: enabledGroups,
    missing_features_threshold: threshold,
    reason_counts: countBy(missing, (r) => r.reason),
    missing_feature_name_counts: countBy(missingFeatureNames.map((name) => ({ name })), (r) => r.name),
    samples: {
      insufficient_history: missing.filter((r) => r.reason === 'INSUFFICIENT_HISTORY_ACTUAL_LT_200').slice(0, 25),
      missing_features: missing.filter((r) => r.reason === 'MISSING_FEATURES_THRESHOLD').slice(0, 25),
      unexpected: missing.filter((r) => r.reason === 'UNEXPECTED_NOT_IN_FORECAST_LATEST').slice(0, 25)
    },
    missing
  };
}

async function main() {
  const [ssotDoc, deepDoc, forecastLatest] = await Promise.all([
    readJson(SSOT_ROWS_PATH, {}),
    readJson(MARKETPHASE_DEEP_SUMMARY_PATH, {}),
    readJson(FORECAST_LATEST_PATH, {})
  ]);

  const ssotRows = loadSsotRows(ssotDoc);
  if (ssotRows.length === 0) throw new Error('SSOT_ROWS_EMPTY');

  const marketphaseSet = deepTickerSet(deepDoc);
  const forecastSet = forecastTickerSet(forecastLatest);
  const tradingDate = String(forecastLatest?.data?.asof || forecastLatest?.meta?.asof || nowIso().slice(0, 10)).slice(0, 10);

  const [marketphase, forecast] = await Promise.all([
    buildMarketphaseGapReasons(ssotRows, marketphaseSet),
    buildForecastGapReasons(ssotRows, forecastSet, tradingDate)
  ]);

  const marketphaseHistoryOnly = marketphase.reason_counts.every((r) => String(r.key).startsWith('INSUFFICIENT_HISTORY'));
  const summary = {
    schema: 'rv_v7_feature_gap_reasons_summary_v1',
    generated_at: nowIso(),
    ssot_stocks_max: ssotRows.length,
    marketphase_elliott_gap: {
      count: marketphase.gap_count,
      top_reasons: marketphase.reason_counts.slice(0, 10),
      interpretation: marketphaseHistoryOnly
        ? 'Gap is fully explained by <200 bars in SSOT rows (expected for young listings / insufficient history).'
        : 'Gap contains non-history reasons; inspect detailed report.'
    },
    forecast_gap: {
      count: forecast.gap_count,
      top_reasons: forecast.reason_counts.slice(0, 10),
      top_missing_features: forecast.missing_feature_name_counts.slice(0, 10)
    }
  };

  const report = {
    schema: 'rv_v7_feature_gap_reasons_report_v1',
    generated_at: nowIso(),
    inputs: {
      ssot_rows: path.relative(REPO_ROOT, SSOT_ROWS_PATH),
      marketphase_deep_summary: path.relative(REPO_ROOT, MARKETPHASE_DEEP_SUMMARY_PATH),
      forecast_latest: path.relative(REPO_ROOT, FORECAST_LATEST_PATH)
    },
    summary,
    marketphase_elliott: marketphase,
    forecast
  };

  await writeJsonAtomic(OUT_REPORT_PATH, report);
  await writeJsonAtomic(OUT_SUMMARY_PATH, summary);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    out_report: path.relative(REPO_ROOT, OUT_REPORT_PATH),
    out_summary: path.relative(REPO_ROOT, OUT_SUMMARY_PATH),
    marketphase_gap: marketphase.gap_count,
    forecast_gap: forecast.gap_count,
    marketphase_top_reason: marketphase.reason_counts[0] || null,
    forecast_top_reason: forecast.reason_counts[0] || null
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message || 'feature_gap_reasons_failed' })}\n`);
  process.exit(1);
});
