#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const REGISTRY_BROWSE = path.join(ROOT, 'public/data/universe/v7/registry/registry.browse.json.gz');
const QUANTLAB_MARKET = path.join(ROOT, 'public/data/quantlab/reports/v4-daily-market.json');
const QUANTLAB_PUBLISH_META = path.join(ROOT, 'public/data/quantlab/stock-insights/latest.json');
const SNAPSHOT_PATH = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
const MIRROR_OUT = path.join(ROOT, 'mirrors/learning/reports/best-setups-etf-diagnostic-latest.json');
const PUBLIC_OUT = path.join(ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonGz(filePath) {
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function countBy(arr, fn) {
  const out = {};
  for (const item of arr) {
    const key = fn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function determineDropStage(stageCounts, etfRejectionBreakdown = {}) {
  if ((stageCounts.registry_etf_total || 0) > 0 && (stageCounts.asset_opinions_etf_total || 0) === 0) {
    return {
      code: 'AGENT_LAYER_STOCK_ONLY',
      severity: 'high',
      explanation: 'ETFs exist in the universe registry but do not enter QuantLab assetOpinions. The current drop happens before publish/snapshot gating.',
    };
  }
  if ((stageCounts.asset_opinions_etf_total || 0) > 0 && (stageCounts.publish_etf_total || 0) === 0) {
    return {
      code: 'PUBLISH_LAYER_FILTER',
      severity: 'high',
      explanation: 'ETF asset opinions exist, but publish emits zero ETF rows. The drop happens in publish filtering or class mapping.',
    };
  }
  if ((stageCounts.publish_etf_total || 0) > 0 && (stageCounts.snapshot_etf_total || 0) === 0) {
    const rejectionTotals = Object.values(etfRejectionBreakdown || {}).reduce((acc, row) => {
      for (const [key, value] of Object.entries(row || {})) {
        acc[key] = (acc[key] || 0) + Number(value || 0);
      }
      return acc;
    }, {});
    if ((rejectionTotals.rejected_non_buy_total || 0) > 0 && (rejectionTotals.rejected_non_high_total || 0) === 0 && (rejectionTotals.rejected_gated_total || 0) === 0) {
      return {
        code: 'SNAPSHOT_NO_ETF_BUY_SIGNALS',
        severity: 'medium',
        explanation: 'ETFs now reach snapshot evaluation, but none currently satisfy BUY verdicts in the shared decision core.',
      };
    }
    return {
      code: 'SNAPSHOT_GATE_REJECTION',
      severity: 'medium',
      explanation: 'ETFs reach publish output but none survive best-setups snapshot gating.',
    };
  }
  return {
    code: 'NO_ETF_DROP_DETECTED',
    severity: 'info',
    explanation: 'No ETF-specific drop was detected in the inspected stages.',
  };
}

function main() {
  const registryDoc = readJsonGz(REGISTRY_BROWSE) || {};
  const quantlabMarket = readJson(QUANTLAB_MARKET) || {};
  const publishMeta = readJson(QUANTLAB_PUBLISH_META) || {};
  const snapshot = readJson(SNAPSHOT_PATH) || {};

  const registryRecords = Array.isArray(registryDoc.records) ? registryDoc.records : [];
  const registryTypeByCanonical = new Map();
  for (const row of registryRecords) {
    const canonicalId = String(row?.canonical_id || '');
    if (canonicalId) registryTypeByCanonical.set(canonicalId, String(row?.type_norm || '').toUpperCase());
  }

  const assetOpinionRows = Object.values(quantlabMarket.assetOpinions || {});
  const assetOpinionTypeCounts = countBy(assetOpinionRows, (row) => registryTypeByCanonical.get(String(row?.canonicalId || row?.assetId || '')) || 'UNKNOWN');

  const snapshotCounts = {
    stocks: {
      short: (snapshot?.data?.stocks?.short || []).length,
      medium: (snapshot?.data?.stocks?.medium || []).length,
      long: (snapshot?.data?.stocks?.long || []).length,
    },
    etfs: {
      short: (snapshot?.data?.etfs?.short || []).length,
      medium: (snapshot?.data?.etfs?.medium || []).length,
      long: (snapshot?.data?.etfs?.long || []).length,
    },
  };

  const rejectionCounts = snapshot?.meta?.rejection_counts || {};
  const etfRejectionBreakdown = Object.fromEntries(
    ['short', 'medium', 'long'].map((horizon) => [
      horizon,
      rejectionCounts?.[horizon]?.by_asset_class?.etf || null,
    ]),
  );

  const stageCounts = {
    registry_etf_total: registryRecords.filter((row) => String(row?.type_norm || '').toUpperCase() === 'ETF').length,
    registry_stock_total: registryRecords.filter((row) => String(row?.type_norm || '').toUpperCase() === 'STOCK').length,
    asset_opinions_total: assetOpinionRows.length,
    asset_opinions_etf_total: Number(assetOpinionTypeCounts.ETF || 0),
    asset_opinions_stock_total: Number(assetOpinionTypeCounts.STOCK || 0),
    publish_etf_total: Number(publishMeta?.coverage?.etfs?.publishedTickers || 0),
    publish_stock_total: Number(publishMeta?.coverage?.stocks?.publishedTickers || 0),
    snapshot_etf_total: snapshotCounts.etfs.short + snapshotCounts.etfs.medium + snapshotCounts.etfs.long,
    snapshot_stock_total: snapshotCounts.stocks.short + snapshotCounts.stocks.medium + snapshotCounts.stocks.long,
  };

  const report = {
    schema_version: 'rv.best-setups.etf-diagnostic.v1',
    generated_at: new Date().toISOString(),
    inputs: {
      registry_browse: path.relative(ROOT, REGISTRY_BROWSE),
      quantlab_market: path.relative(ROOT, QUANTLAB_MARKET),
      quantlab_publish_meta: path.relative(ROOT, QUANTLAB_PUBLISH_META),
      best_setups_snapshot: path.relative(ROOT, SNAPSHOT_PATH),
    },
    stage_counts: stageCounts,
    registry_type_counts: countBy(registryRecords, (row) => String(row?.type_norm || '').toUpperCase() || 'UNKNOWN'),
    asset_opinion_type_counts: assetOpinionTypeCounts,
    publish_coverage: publishMeta?.coverage || null,
    snapshot_counts: snapshotCounts,
    etf_snapshot_rejection_breakdown: etfRejectionBreakdown,
    diagnosis: determineDropStage(stageCounts, etfRejectionBreakdown),
    evidence: {
      quantlab_market_generated_at: quantlabMarket?.generatedAt || null,
      quantlab_market_asof: quantlabMarket?.featureSlice?.asofDate || null,
      quantlab_publish_generated_at: publishMeta?.generatedAt || null,
      quantlab_publish_asof: publishMeta?.asOfDate || null,
      snapshot_generated_at: snapshot?.generated_at || null,
    },
  };

  writeJson(MIRROR_OUT, report);
  writeJson(PUBLIC_OUT, report);

  console.log(`[etf-diagnostic] wrote ${path.relative(ROOT, MIRROR_OUT)}`);
  console.log(`[etf-diagnostic] diagnosis=${report.diagnosis.code} registryETF=${stageCounts.registry_etf_total} assetOpinionsETF=${stageCounts.asset_opinions_etf_total} publishETF=${stageCounts.publish_etf_total} snapshotETF=${stageCounts.snapshot_etf_total}`);
}

main();
