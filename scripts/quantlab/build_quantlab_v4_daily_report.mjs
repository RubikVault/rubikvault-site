#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { buildExpertLayer } from './quantlab_v4_daily_agents.mjs';
import { buildQuantLabStockPublish, writeQuantLabStockPublishBundle } from './build_quantlab_stock_publish.mjs';

const REPO_ROOT = process.cwd();
const DEFAULT_QUANT_ROOT = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';
const MIRROR_DIR = path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily');
const PUBLIC_REPORT = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-latest.json');
const PUBLIC_HISTORY = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-history.json');
const PUBLIC_REPORT_JS = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-latest.js');
const PUBLIC_MARKET = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-market.json');
const PUBLIC_MARKET_JS = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-market.js');
const PUBLIC_STOCK_PUBLISH = path.join(REPO_ROOT, 'public/data/quantlab/stock-insights/latest.json');
const PUBLIC_OPERATIONAL_STATUS = path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json');
const MIRROR_LATEST = path.join(MIRROR_DIR, 'latest.json');
const MIRROR_MARKET_LATEST = path.join(MIRROR_DIR, 'latest.market.json');
const MIRROR_STOCK_PUBLISH_LATEST = path.join(REPO_ROOT, 'mirrors/quantlab/stock-insights/latest.json');
const MIRROR_OPERATIONAL_STATUS = path.join(REPO_ROOT, 'mirrors/quantlab/status/operational-status.json');

function parseArgs(argv) {
  const out = { quantRoot: DEFAULT_QUANT_ROOT, reportDate: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quant-root' && argv[i + 1]) {
      out.quantRoot = argv[++i];
    } else if (arg === '--date' && argv[i + 1]) {
      out.reportDate = argv[++i];
    }
  }
  return out;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch {
      const sanitized = raw
        .replace(/\bNaN\b/g, 'null')
        .replace(/\b-Infinity\b/g, 'null')
        .replace(/\bInfinity\b/g, 'null');
      return JSON.parse(sanitized);
    }
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeShards(dir, marketData) {
  const assetOpinions = marketData.assetOpinions || {};
  // Create aggregate index (without giant assetOpinions dictionary)
  const aggregate = { ...marketData, assetOpinions: {} };
  
  const aggregatePath = path.join(dir, 'aggregate.json');
  const assetsDir = path.join(dir, 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  
  // 1. Write the aggregate index
  writeJsonAtomic(aggregatePath, aggregate);
  
  // 2. Write individual assets
  for (const [assetId, opinion] of Object.entries(assetOpinions)) {
    const safeId = assetId.replace(/:/g, '_');
    writeJsonAtomic(path.join(assetsDir, `${safeId}.json`), opinion);
  }
}


function writeJsAssignment(filePath, globalName, payload) {
  ensureDir(filePath);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `window.${globalName} = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function walkFind(rootDir, targetName) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === targetName) out.push(full);
    }
  }
  return out;
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nowLocal() {
  return new Date();
}

function localDateId(date = nowLocal()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function startOfDay(date = nowLocal()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfMonth(date = nowLocal()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function startOfWeek(date = nowLocal()) {
  const out = startOfDay(date);
  const offset = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - offset);
  return out;
}

function daysAgo(count, date = nowLocal()) {
  const out = startOfDay(date);
  out.setDate(out.getDate() - count);
  return out;
}

function sortByGeneratedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aa = toDate(a.generatedAt)?.getTime() ?? 0;
    const bb = toDate(b.generatedAt)?.getTime() ?? 0;
    return bb - aa;
  });
}

function latestBy(items, keyFn) {
  const map = new Map();
  for (const item of sortByGeneratedAtDesc(items)) {
    const key = keyFn(item);
    if (!key || map.has(key)) continue;
    map.set(key, item);
  }
  return map;
}

function summarizeFailReasons(histogram = {}) {
  return Object.entries(histogram)
    .map(([gate, count]) => ({ gate, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function parseDateId(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const stamp = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(stamp) ? stamp : null;
}

function ageCalendarDaysFromDateId(value, referenceDateId = localDateId()) {
  const stamp = parseDateId(value);
  const referenceStamp = parseDateId(referenceDateId);
  if (!Number.isFinite(stamp) || !Number.isFinite(referenceStamp)) return null;
  return Math.max(0, Math.round((referenceStamp - stamp) / 86400000));
}

function lagCalendarDays(olderDateId, newerDateId) {
  const olderStamp = parseDateId(olderDateId);
  const newerStamp = parseDateId(newerDateId);
  if (!Number.isFinite(olderStamp) || !Number.isFinite(newerStamp)) return null;
  return Math.max(0, Math.round((newerStamp - olderStamp) / 86400000));
}

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return 0;
  return round((Number(numerator || 0) / Number(denominator || 1)) * 100, digits);
}

function toStatus(value, good = 80, warn = 55) {
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}

function readDirSizeGb(targetPath) {
  try {
    const raw = execSync(`du -sk "${targetPath}"`, { encoding: 'utf8' }).trim().split(/\s+/)[0];
    return round(Number(raw || 0) / 1024 / 1024, 2);
  } catch {
    return null;
  }
}

function countFilesInDir(targetPath, suffix = '') {
  try {
    return fs.readdirSync(targetPath).filter((name) => !suffix || name.endsWith(suffix)).length;
  } catch {
    return 0;
  }
}

function buildRawBarsFreshnessSummaryFallback(quantRoot, reportDate, assetTypes = ['stock', 'etf'], staleAfterCalendarDays = 3) {
  const providerRoot = path.join(quantRoot, 'data/raw/provider=EODHD');
  const latestCanonicalByType = Object.fromEntries(assetTypes.map((assetType) => [assetType, '']));
  const latestAnyByType = Object.fromEntries(assetTypes.map((assetType) => [assetType, '']));
  const latestBridgeByType = Object.fromEntries(assetTypes.map((assetType) => [assetType, '']));
  const coverageByType = Object.fromEntries(assetTypes.map((assetType) => [assetType, {
    canonical_part_dates: [],
    any_parquet_dates: [],
    bridge_only_dates: [],
  }]));
  if (fs.existsSync(providerRoot)) {
    const ingestDirs = fs.readdirSync(providerRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('ingest_date='))
      .map((entry) => entry.name)
      .sort();
    for (const dirName of ingestDirs) {
      const ingestDate = dirName.split('ingest_date=')[1] || '';
      for (const assetType of assetTypes) {
        const assetClassDir = path.join(providerRoot, dirName, `asset_class=${assetType}`);
        const assetTypeDir = path.join(providerRoot, dirName, `asset_type=${assetType}`);
        const targetDir = [assetClassDir, assetTypeDir].find((dir) => fs.existsSync(dir)) || '';
        if (!targetDir) continue;
        const names = fs.readdirSync(targetDir);
        const hasCanonicalPart = names.some((name) => /^part_.*\.parquet$/i.test(name));
        const hasBridge = names.some((name) => String(name).toLowerCase() === 'manual_bridge.parquet');
        const hasAny = names.some((name) => name.endsWith('.parquet'));
        if (hasCanonicalPart) {
          latestCanonicalByType[assetType] = ingestDate;
          coverageByType[assetType].canonical_part_dates.push(ingestDate);
        }
        if (hasAny) {
          latestAnyByType[assetType] = ingestDate;
          coverageByType[assetType].any_parquet_dates.push(ingestDate);
        }
        if (hasBridge) {
          latestBridgeByType[assetType] = ingestDate;
          coverageByType[assetType].bridge_only_dates.push(ingestDate);
        }
      }
    }
  }
  const availableRequired = assetTypes.filter((assetType) => latestCanonicalByType[assetType]);
  const missingRequired = assetTypes.filter((assetType) => !latestCanonicalByType[assetType]);
  const availableAnyRequired = assetTypes.filter((assetType) => latestAnyByType[assetType]);
  const availableCanonicalDates = Object.values(latestCanonicalByType).filter(Boolean).sort();
  const availableAnyDates = Object.values(latestAnyByType).filter(Boolean).sort();
  const latestCanonicalAny = availableCanonicalDates[availableCanonicalDates.length - 1] || '';
  const latestAny = availableAnyDates[availableAnyDates.length - 1] || '';
  const latestRequired = availableRequired.length
    ? availableRequired.map((assetType) => latestCanonicalByType[assetType]).sort()[0]
    : '';
  const latestRequiredAny = availableAnyRequired.length
    ? availableAnyRequired.map((assetType) => latestAnyByType[assetType]).sort()[0]
    : '';
  const refDate = new Date(`${reportDate || localDateId()}T00:00:00Z`);
  const latestRequiredAgeCalendarDays = latestRequired
    ? Math.max(0, Math.round((refDate.getTime() - new Date(`${latestRequired}T00:00:00Z`).getTime()) / 86400000))
    : null;
  const latestRequiredAnyAgeCalendarDays = latestRequiredAny
    ? Math.max(0, Math.round((refDate.getTime() - new Date(`${latestRequiredAny}T00:00:00Z`).getTime()) / 86400000))
    : null;
  const requiredAssetTypesFresh = missingRequired.length === 0
    && latestRequiredAgeCalendarDays != null
    && latestRequiredAgeCalendarDays <= staleAfterCalendarDays;
  const bridgeOnlyAdvanceCalendarDays = lagCalendarDays(latestRequired, latestRequiredAny);
  const reasonCodes = [];
  if (missingRequired.length) {
    reasonCodes.push(`RAW_BARS_MISSING_REQUIRED_TYPES:${missingRequired.join(',')}`);
  }
  if (latestRequiredAgeCalendarDays == null) {
    reasonCodes.push('RAW_BARS_REQUIRED_INGEST_DATE_UNKNOWN');
  } else if (latestRequiredAgeCalendarDays > staleAfterCalendarDays) {
    reasonCodes.push(`RAW_BARS_REQUIRED_TYPES_STALE:latest_required_ingest_date=${latestRequired}:age_days=${latestRequiredAgeCalendarDays}`);
  }
  if (bridgeOnlyAdvanceCalendarDays != null && bridgeOnlyAdvanceCalendarDays > 0) {
    reasonCodes.push(`RAW_BARS_ONLY_BRIDGE_ADVANCED:latest_required_ingest_date=${latestRequired}:latest_required_any_ingest_date=${latestRequiredAny}:lag_days=${bridgeOnlyAdvanceCalendarDays}`);
  }
  return {
    provider: 'EODHD',
    asset_types_required: assetTypes,
    latest_ingest_by_asset_type: latestCanonicalByType,
    latest_any_ingest_by_asset_type: latestAnyByType,
    latest_bridge_ingest_by_asset_type: latestBridgeByType,
    available_required_asset_types: availableRequired,
    available_required_asset_types_any: availableAnyRequired,
    missing_required_asset_types: missingRequired,
    latest_canonical_any_ingest_date: latestCanonicalAny,
    latest_any_ingest_date: latestAny,
    latest_required_ingest_date: latestRequired,
    latest_required_any_ingest_date: latestRequiredAny,
    reference_date: reportDate || localDateId(),
    stale_after_calendar_days: staleAfterCalendarDays,
    latest_required_age_calendar_days: latestRequiredAgeCalendarDays,
    latest_required_any_age_calendar_days: latestRequiredAnyAgeCalendarDays,
    bridge_only_advance_calendar_days: bridgeOnlyAdvanceCalendarDays,
    required_asset_types_fresh: requiredAssetTypesFresh,
    canonical_part_required_asset_types_fresh: requiredAssetTypesFresh,
    coverage_by_asset_type: coverageByType,
    reason_codes: reasonCodes,
  };
}

function buildRawBarsFreshnessSummary(quantRoot, reportDate, assetTypes = ['stock', 'etf'], staleAfterCalendarDays = 3) {
  const helperPath = path.join(REPO_ROOT, 'scripts/quantlab/print_quantlab_raw_bars_truth.py');
  const venvPython = path.join(REPO_ROOT, 'quantlab/.venv/bin/python');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';
  try {
    const stdout = execFileSync(
      pythonBin,
      [
        helperPath,
        '--quant-root',
        String(quantRoot),
        '--asset-types',
        assetTypes.join(','),
        '--reference-date',
        reportDate || localDateId(),
        '--stale-after-calendar-days',
        String(staleAfterCalendarDays),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(String(stdout || '').trim() || '{}');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Fall back to the directory-name summary if Python truth extraction is unavailable.
  }
  return buildRawBarsFreshnessSummaryFallback(quantRoot, reportDate, assetTypes, staleAfterCalendarDays);
}

function buildQuantLabDataFreshnessSummary({
  generatedAt,
  reportDate,
  rawFreshness,
  featureStoreManifest,
  featureStoreCandidates,
  marketData,
}) {
  const rawCanonicalAsof = String(rawFreshness?.latest_required_data_date || rawFreshness?.latest_required_ingest_date || '');
  const rawAnyAsof = String(
    rawFreshness?.latest_required_any_data_date
    || rawFreshness?.latest_required_any_ingest_date
    || rawFreshness?.latest_any_data_date
    || rawFreshness?.latest_any_ingest_date
    || '',
  );
  const featureAsof = String(featureStoreManifest?.ranges?.panel_max_asof_date || marketData?.featureSlice?.asofDate || '');
  const featureSnapshotAsof = String(featureStoreManifest?.ranges?.snapshot_asof_date || '');
  const stockPublishAsof = String(marketData?.featureSlice?.asofDate || '');

  const featureAgeCalendarDays = ageCalendarDaysFromDateId(featureAsof, reportDate);
  const stockPublishAgeCalendarDays = ageCalendarDaysFromDateId(stockPublishAsof, reportDate);
  const rawCanonicalAgeCalendarDays = rawFreshness?.latest_required_age_calendar_days ?? ageCalendarDaysFromDateId(rawCanonicalAsof, reportDate);
  const rawAnyAgeCalendarDays = rawFreshness?.latest_required_any_age_calendar_days ?? ageCalendarDaysFromDateId(rawAnyAsof, reportDate);
  const featureSnapshotAgeCalendarDays = ageCalendarDaysFromDateId(featureSnapshotAsof, reportDate);
  const featureLagVsRawCanonicalCalendarDays = lagCalendarDays(featureAsof, rawCanonicalAsof);
  const featureLagVsRawAnyCalendarDays = lagCalendarDays(featureAsof, rawAnyAsof);
  const publishLagVsFeatureCalendarDays = lagCalendarDays(stockPublishAsof, featureAsof);
  const marketPlaneFresh = (rawAnyAgeCalendarDays ?? 999) <= 3 && (featureSnapshotAgeCalendarDays ?? 999) <= 3;
  const labelHorizonLagLooksExpected = (featureLagVsRawAnyCalendarDays ?? -1) >= 10 && (featureLagVsRawAnyCalendarDays ?? 999) <= 35;

  const reasons = [];
  let severity = 'ok';

  if (!featureAsof || !stockPublishAsof) {
    severity = 'critical';
    reasons.push('FEATURE_OR_PUBLISH_ASOF_MISSING');
  } else if (marketPlaneFresh && labelHorizonLagLooksExpected) {
    reasons.push(`MODEL_CUTOFF_EXPECTED:publish_asof=${stockPublishAsof || 'unknown'}:raw_any=${rawAnyAsof || 'unknown'}:lag_days=${featureLagVsRawAnyCalendarDays}`);
  }
  if (severity !== 'critical' && !marketPlaneFresh && ((featureAgeCalendarDays ?? 999) > 7 || (stockPublishAgeCalendarDays ?? 999) > 7)) {
    severity = 'critical';
    reasons.push(`QUANTLAB_DATA_STALE:feature_asof=${featureAsof || 'unknown'}:publish_asof=${stockPublishAsof || 'unknown'}`);
  } else if (severity !== 'critical' && !marketPlaneFresh && ((featureAgeCalendarDays ?? 999) > 3 || (stockPublishAgeCalendarDays ?? 999) > 3)) {
    severity = severity === 'critical' ? severity : 'warning';
    reasons.push(`QUANTLAB_DATA_AGING:feature_asof=${featureAsof || 'unknown'}:publish_asof=${stockPublishAsof || 'unknown'}`);
  }
  if (!marketPlaneFresh && (featureLagVsRawAnyCalendarDays ?? 0) > 3) {
    severity = severity === 'critical' ? severity : 'warning';
    reasons.push(`FEATURE_STORE_LAGS_RAW_ANY:feature_asof=${featureAsof || 'unknown'}:raw_any=${rawAnyAsof || 'unknown'}:lag_days=${featureLagVsRawAnyCalendarDays}`);
  }
  if ((rawFreshness?.bridge_only_advance_calendar_days ?? 0) > 0) {
    reasons.push(`RAW_ONLY_BRIDGE_ADVANCED:raw_canonical=${rawCanonicalAsof || 'unknown'}:raw_any=${rawAnyAsof || 'unknown'}:lag_days=${rawFreshness.bridge_only_advance_calendar_days}`);
  }

  const label = severity === 'critical'
    ? 'kritisch veraltet'
    : severity === 'warning'
      ? 'alternd'
      : 'aktuell';
  const message = severity === 'ok'
    ? marketPlaneFresh && labelHorizonLagLooksExpected
      ? `QuantLab-Marktdaten sind aktuell bis ${rawAnyAsof || featureSnapshotAsof || 'unbekannt'}; der Modell-Cutoff ${stockPublishAsof || featureAsof || 'unbekannt'} ist im erwarteten 20T-Labelfenster.`
      : `QuantLab-Datenstand ist aktuell auf ${stockPublishAsof || featureAsof || rawCanonicalAsof || 'unbekannt'}.`
    : `QuantLab-Datenstand ist ${label}: Publish ${stockPublishAsof || 'unbekannt'}, Feature-Store ${featureAsof || 'unbekannt'}, Raw canonical ${rawCanonicalAsof || 'unbekannt'}, Raw any ${rawAnyAsof || 'unbekannt'}.`;

  return {
    schema: 'rv_quantlab_operational_status_v1',
    generatedAt,
    reportDate,
    summary: {
      severity,
      label,
      message,
      reasons,
      healthy: severity === 'ok',
      reportFreshButDataStale: reportDate === localDateId() && severity !== 'ok',
    },
    rawBars: {
      provider: rawFreshness?.provider || 'EODHD',
      assetTypesRequired: rawFreshness?.asset_types_required || ['stock', 'etf'],
      latestCanonicalIngestByAssetType: rawFreshness?.latest_ingest_by_asset_type || {},
      latestAnyIngestByAssetType: rawFreshness?.latest_any_ingest_by_asset_type || {},
      latestBridgeIngestByAssetType: rawFreshness?.latest_bridge_ingest_by_asset_type || {},
      latestCanonicalDataDateByAssetType: rawFreshness?.latest_canonical_data_by_asset_type || rawFreshness?.latest_ingest_by_asset_type || {},
      latestAnyDataDateByAssetType: rawFreshness?.latest_any_data_by_asset_type || rawFreshness?.latest_any_ingest_by_asset_type || {},
      latestBridgeDataDateByAssetType: rawFreshness?.latest_bridge_data_by_asset_type || rawFreshness?.latest_bridge_ingest_by_asset_type || {},
      latestCanonicalIngestPartitionByAssetType: rawFreshness?.latest_canonical_partition_by_asset_type || {},
      latestAnyIngestPartitionByAssetType: rawFreshness?.latest_any_partition_by_asset_type || {},
      latestBridgeIngestPartitionByAssetType: rawFreshness?.latest_bridge_partition_by_asset_type || {},
      latestCanonicalRequiredIngestDate: rawCanonicalAsof || null,
      latestAnyRequiredIngestDate: rawAnyAsof || null,
      latestCanonicalRequiredDataDate: rawCanonicalAsof || null,
      latestAnyRequiredDataDate: rawAnyAsof || null,
      latestCanonicalAgeCalendarDays: rawCanonicalAgeCalendarDays,
      latestAnyAgeCalendarDays: rawAnyAgeCalendarDays,
      bridgeOnlyAdvanceCalendarDays: rawFreshness?.bridge_only_advance_calendar_days ?? null,
      requiredAssetTypesFresh: Boolean(rawFreshness?.required_asset_types_fresh),
      coverageByAssetType: rawFreshness?.coverage_by_asset_type || {},
      reasonCodes: rawFreshness?.reason_codes || [],
    },
    featureStore: {
      version: String(featureStoreManifest?.feature_store_version || marketData?.featureSlice?.featureStoreVersion || 'v4_q1panel_overnight'),
      snapshotId: String(featureStoreManifest?.snapshot_id || ''),
      snapshotAsOfDate: featureSnapshotAsof || null,
      snapshotAgeCalendarDays: featureSnapshotAgeCalendarDays,
      asOfDate: featureAsof || null,
      ageCalendarDays: featureAgeCalendarDays,
      lagVsRawCanonicalCalendarDays: featureLagVsRawCanonicalCalendarDays,
      lagVsRawAnyCalendarDays: featureLagVsRawAnyCalendarDays,
      rowsTotal: Number(featureStoreManifest?.counts?.rows_total || 0),
      asofDatesTotal: Number(featureStoreManifest?.counts?.asof_dates_total || 0),
      manifestPath: featureStoreManifest?.feature_store_version
        ? path.join(`features/store/feature_store_version=${featureStoreManifest.feature_store_version}`, 'feature_panel_manifest.json')
        : null,
      availableVersions: Array.isArray(featureStoreCandidates)
        ? featureStoreCandidates.filter((item) => item?.available).map((item) => ({
            version: item.version,
            asOfDate: item.panelMaxAsofDate,
            snapshotAsOfDate: item.snapshotAsofDate,
          }))
        : [],
    },
    stockPublish: {
      asOfDate: stockPublishAsof || null,
      ageCalendarDays: stockPublishAgeCalendarDays,
      lagVsFeatureStoreCalendarDays: publishLagVsFeatureCalendarDays,
      latestPath: '/data/quantlab/stock-insights/latest.json',
    },
    report: {
      generatedAt,
      reportDate,
      latestPath: '/data/quantlab/reports/v4-daily-latest.json',
    },
  };
}

function summarizeFeatureStoreCandidate(version, manifest) {
  return {
    version,
    available: Boolean(manifest),
    manifest,
    panelMaxAsofDate: String(manifest?.ranges?.panel_max_asof_date || ''),
    snapshotAsofDate: String(manifest?.ranges?.snapshot_asof_date || ''),
    rowsTotal: Number(manifest?.counts?.rows_total || 0),
  };
}

function selectOperationalFeatureStore(candidates, marketData) {
  const preferredVersion = String(marketData?.featureSlice?.featureStoreVersion || '');
  const available = (candidates || []).filter((item) => item?.available);
  if (preferredVersion) {
    const matched = available.find((item) => item.version === preferredVersion);
    if (matched) return matched;
  }
  return available.sort((a, b) => (
    String(b.panelMaxAsofDate).localeCompare(String(a.panelMaxAsofDate))
    || String(b.snapshotAsofDate).localeCompare(String(a.snapshotAsofDate))
    || Number(b.rowsTotal || 0) - Number(a.rowsTotal || 0)
  ))[0] || null;
}

function extractDateFromPath(text) {
  const match = String(text || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function parseStagebReport(filePath) {
  const doc = readJson(filePath);
  if (!doc) return null;
  const method = doc.method || {};
  const final = doc.stage_b_q1_final || {};
  return {
    kind: 'stageb',
    reportPath: filePath,
    runId: String(doc.run_id || ''),
    stageARunId: String(doc.stage_a_run_id || ''),
    generatedAt: String(doc.generated_at || ''),
    asofDate: String(doc.asof_date || final.effective_asof_end_date || ''),
    ok: Boolean(doc.ok),
    exitCode: Number(doc.exit_code || 0),
    v4FinalProfile: Boolean(method.v4_final_profile),
    featureStoreVersion: String(final.feature_store_version || ''),
    panelOutputTag: String(final.panel_output_tag || ''),
    strictPassTotal: Number(final.strict_pass_total || 0),
    survivorsBQ1Total: Number(final.survivors_B_q1_total || 0),
    stageASurvivorsATotal: Number(doc.counts?.stage_b_prep?.stage_a_survivors_A_total || 0),
    topSurvivor: final.top_survivor || null,
    survivorsPath: String(doc.artifacts?.survivors_B_q1 || ''),
    failReasons: summarizeFailReasons(doc.counts?.stage_b_light_fail_reason_counts || {}),
  };
}

function parseRegistryReport(filePath) {
  const doc = readJson(filePath);
  if (!doc) return null;
  return {
    kind: 'registry',
    reportPath: filePath,
    generatedAt: String(doc.generated_at || doc.decision?.ts || ''),
    stagebRunId: String(doc.decision?.stage_b_run_id || ''),
    asofDate: extractDateFromPath(doc.decision?.artifacts?.stage_b_q1_run_report || ''),
    ok: Boolean(doc.decision),
    decision: String(doc.decision?.decision || ''),
    reasonCodes: Array.isArray(doc.decision?.reason_codes) ? doc.decision.reason_codes : [],
    championLive: doc.champion_slots?.live || doc.champion_slots?.default || null,
    championSlots: doc.champion_slots || {},
    strictPassTotal: Number(doc.counts?.stage_b_candidates_strict_pass_total || 0),
    hardFailTotal: Number(doc.counts?.top_survivor_hard_failed_gate_total || 0),
  };
}

function parsePortfolioReport(filePath) {
  const doc = readJson(filePath);
  if (!doc) return null;
  return {
    kind: 'portfolio',
    reportPath: filePath,
    runId: String(doc.run_id || ''),
    generatedAt: String(doc.generated_at || ''),
    asofDate: String(doc.asof_date || ''),
    ok: Boolean(doc.ok),
    exitCode: Number(doc.exit_code || 0),
    stagebReport: String(doc.inputs?.stage_b_report || ''),
    registryReport: String(doc.inputs?.registry_report || ''),
    candidate: doc.candidate || null,
    governance: doc.governance || {},
    failures: Array.isArray(doc.gates?.failures) ? doc.gates.failures : [],
    positionsTotal: Number(doc.counts?.positions_total || 0),
    ordersTotal: Number(doc.counts?.orders_total || 0),
  };
}

function parseGateReport(filePath) {
  const doc = readJson(filePath);
  if (!doc) return null;
  const checks = Array.isArray(doc.checks) ? doc.checks : [];
  return {
    kind: 'gate',
    reportPath: filePath,
    runId: String(doc.run_id || ''),
    generatedAt: String(doc.generated_at || ''),
    ok: Boolean(doc.ok),
    exitCode: Number(doc.exit_code || 0),
    stagebReport: String(doc.artifacts?.stageb_report || ''),
    asofDate: extractDateFromPath(doc.artifacts?.stageb_report || ''),
    failedChecks: checks.filter((item) => !item.ok).map((item) => item.name),
    requirements: doc.requirements || {},
  };
}

function parseTrainingJob(filePath) {
  const doc = readJson(filePath);
  if (!doc || doc.schema !== 'quantlab_q1_overnight_training_sweep_state_v1') return null;
  const summary = doc.summary || {};
  return {
    kind: 'job',
    filePath,
    jobName: String(doc.job_name || path.basename(path.dirname(filePath))),
    createdAt: String(doc.created_at || ''),
    updatedAt: String(doc.updated_at || ''),
    snapshotId: String(doc.snapshot_id || ''),
    featureStoreVersion: String(doc.feature_store_version || ''),
    v4FinalProfile: Boolean(doc.config?.v4_final_profile),
    tasksTotal: Number(summary.done || 0) + Number(summary.failed || 0) + Number(summary.pending || 0) + Number(summary.running || 0),
    tasksDone: Number(summary.done || 0),
    tasksFailed: Number(summary.failed || 0),
    tasksPending: Number(summary.pending || 0),
    tasksRunning: Number(summary.running || 0),
    stoppedDueToTimeLimit: Boolean(summary.stopped_due_to_time_limit),
    stoppedDueToConsecutiveFailures: Boolean(summary.stopped_due_to_consecutive_failures),
    stoppedDueToSystemGuardrails: Boolean(summary.stopped_due_to_system_guardrails),
    failedByClass: summary.failed_by_class || {},
  };
}

function summarizeJobs(items) {
  const jobsTotal = items.length;
  const tasksTotal = items.reduce((sum, item) => sum + item.tasksTotal, 0);
  const tasksDone = items.reduce((sum, item) => sum + item.tasksDone, 0);
  const tasksFailed = items.reduce((sum, item) => sum + item.tasksFailed, 0);
  const tasksPending = items.reduce((sum, item) => sum + item.tasksPending, 0);
  const jobsWithFailures = items.filter((item) => item.tasksFailed > 0).length;
  return {
    jobsTotal,
    jobsWithFailures,
    tasksTotal,
    tasksDone,
    tasksFailed,
    tasksPending,
    taskSuccessRatePct: pct(tasksDone, tasksDone + tasksFailed, 1),
  };
}

function summarizeStageb(items) {
  const runsTotal = items.length;
  const strictPositiveRuns = items.filter((item) => item.ok && item.strictPassTotal > 0).length;
  const uniqueAsofs = new Set(items.map((item) => item.asofDate).filter(Boolean)).size;
  const strictPassAvg = runsTotal ? round(items.reduce((sum, item) => sum + item.strictPassTotal, 0) / runsTotal, 2) : 0;
  return {
    runsTotal,
    strictPositiveRuns,
    strictPositiveRatioPct: pct(strictPositiveRuns, runsTotal, 1),
    uniqueAsofs,
    strictPassAvg,
  };
}

function summarizeGate(items) {
  const runsTotal = items.length;
  const passedRuns = items.filter((item) => item.ok).length;
  return {
    runsTotal,
    passedRuns,
    passRatioPct: pct(passedRuns, runsTotal, 1),
  };
}

function filterSince(items, field, startTime) {
  return items.filter((item) => {
    const ts = toDate(item[field])?.getTime();
    return ts != null && ts >= startTime.getTime();
  });
}

function aggregateGateFailures(items) {
  const counts = new Map();
  for (const item of items) {
    for (const name of item.failedChecks || []) {
      counts.set(name, Number(counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateTopGatesFromZeroStrict(zeroStrict = []) {
  const counts = new Map();
  for (const item of zeroStrict) {
    for (const gate of item.top_fail_reasons || []) {
      counts.set(gate.gate, Number(counts.get(gate.gate) || 0) + Number(gate.count || 0));
    }
  }
  return [...counts.entries()]
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count);
}

function buildRecommendationSet({ stagebStability, targetRows, zeroStrictGates, overnightStability, portfolioRows, gateRows }) {
  const actions = [];
  const strictRatio = Number(stagebStability?.summary?.strict_positive_ratio_all || 0);
  const gatePassRatio = gateRows.length ? gateRows.filter((item) => item.finalGate?.ok).length / gateRows.length : 0;
  const portfolioPassRatio = portfolioRows.length ? portfolioRows.filter((item) => item.portfolio?.ok).length / portfolioRows.length : 0;
  const cpcvGate = zeroStrictGates.find((item) => item.gate === 'g_cpcv_light_effective_paths');
  if (cpcvGate && cpcvGate.count > 0) {
    actions.push({
      priority: 1,
      title: 'Restliche Zero-Strict-As-ofs auf die fixe top3500-Lane rerunnen',
      why: 'Die Zieltrios 2026-02-15/16/17 kippen nach der CPCV-light-Korrektur auf strict-gruen, die alten Zero-Strict-As-ofs aber noch nicht.',
      impact: 'Erhoeht die 10-As-of-Stabilitaetsquote direkt und ersetzt veraltete Methodik-Artefakte durch aktuelle Wahrheitsdaten.',
    });
  }
  if (portfolioPassRatio < 1) {
    actions.push({
      priority: 2,
      title: 'Registry-zu-Portfolio-Fall fuer 2026-02-15 stabilisieren',
      why: 'Der aktuelle Portfolio-Fail kommt nicht aus Stage B, sondern aus einem nicht-live Registry-Champion (`shadow`) trotz positiver Strict-Survivors.',
      impact: 'Bringt die End-to-End-Kette von 2/3 auf 3/3 fuer den Zielblock und verbessert den Readiness-Score sofort.',
    });
  }
  if (strictRatio < 0.6) {
    actions.push({
      priority: 3,
      title: 'Kanonische v4-final-Serie ueber alle 10 As-ofs erweitern',
      why: `Die aktuelle Strict-Positive-Quote liegt erst bei ${round(strictRatio * 100, 1)}%.`,
      impact: 'Macht Fortschritt messbar ueber die komplette Release-Serie statt nur ueber den reparierten Zielblock.',
    });
  }
  if (Number(overnightStability?.summary?.stability_score_0_100 || 0) < 70) {
    actions.push({
      priority: 4,
      title: 'Night-Job-Stabilitaet anheben',
      why: `Die Overnight-Stabilitaet liegt nur bei ${overnightStability?.summary?.stability_score_0_100 ?? 0}/100, mit vielen Pending-Tasks und Restart-Ereignissen.`,
      impact: 'Senkt Monitoring-/Restart-Verlust und macht den taeglichen Trainingsfortschritt berechenbarer.',
    });
  }
  if (gatePassRatio >= 0.66) {
    actions.push({
      priority: 5,
      title: 'Gruene Gate-Kette fuer 2026-02-16 und 2026-02-17 wiederholen',
      why: 'Zwei frische As-ofs sind jetzt end-to-end gate-gruen und eignen sich als Repro-Basis.',
      impact: 'Schafft belastbare Wiederholbarkeit statt Einzelgruenen.',
    });
  }
  return actions.slice(0, 6);
}

function buildAgentReadiness({ latestRegistry, focus, zeroStrict, overnightManifest, fullchunkManifest }) {
  const familyTemplates = [
    {
      family: 'QUALITY',
      title: 'Quality Trend',
      candidateIds: ['quality_trend_liq_lowvol', 'quality_liq_lowvol', 'quality_liq_lowvol_macd'],
      purpose: 'Robuste liquide Trendaktien mit moeglichst ruhigem Risikoprofil.',
      bestFor: 'stabile Long-Ideen, robuste Daily-Selektion, Qualitaet plus Trend',
      todayUse: 'Heute der produktionsnaechste Expertenblock.',
    },
    {
      family: 'BREAKOUT',
      title: 'Breakout',
      candidateIds: ['breakout_trend', 'breakout_trend_volfilter', 'breakout_trend_macd_liq', 'breakout_trend_macd_liq_v2', 'breakout_trend_macd_liq_v3'],
      purpose: 'Ausbrueche mit Trend-, MACD- und teils Volatilitaetsfilter.',
      bestFor: 'Breakout-Screens, Momentum-Acceleration, MACD-getriebene Fortsetzungen',
      todayUse: 'Heute als Shadow-Experte vorhanden, also nah an echtem Einsatz.',
    },
    {
      family: 'TSMOM',
      title: 'Time-Series Momentum',
      candidateIds: ['tsmom_20', 'tsmom_20_macd', 'tsmom_20_riskadj', 'tsmom_trend_quality', 'tsmom_trend_quality_v2', 'tsmom_trend_macd_lowvol', 'tsmom_ret_macd_liq', 'tsmom_trend_quality_v3', 'tsmom_trend_defensive'],
      purpose: 'Trendfolger auf Zeitreihenbasis mit Ret/MACD/Trend-Gewichten.',
      bestFor: 'saubere Trendfolger, Folgebewegungen, Trend-Continuation',
      todayUse: 'Im Training stark sichtbar, aber heute nicht der Live-Champion.',
    },
    {
      family: 'CSMOM',
      title: 'Cross-Sectional Momentum',
      candidateIds: ['csmom_20_liq', 'csmom_20_trend_liq', 'csmom_20_macd_liq', 'csmom_trend_liq_v2', 'csmom_trend_macd_liq', 'csmom_ret5_ret20_liq', 'csmom_20_trend_liq_soft', 'csmom_ret5_trend_liq_soft', 'csmom_ret5_macd_liq_soft', 'csmom_trend_macd_liq_v2', 'csmom_trend_macd_liq_v3'],
      purpose: 'Relative-Staerke-Experten fuer Gewinnerrotation, Momentum und Liquiditaet.',
      bestFor: 'Relative-Strength-Rankings, Rotationsideen, Momentum-Leader',
      todayUse: 'Der wichtigste aktuelle Entwicklungsblock fuer den letzten roten v4-Punkt.',
    },
    {
      family: 'MEANREV',
      title: 'RSI / Mean Reversion',
      candidateIds: ['mr_rsi', 'mr_rsi_boll', 'mr_rsi_trendfilter', 'mr_boll_vol'],
      purpose: 'Oversold-Rebounds ueber RSI, Bollinger und Trendfilter.',
      bestFor: 'RSI-Screens, Gegenbewegungen, Rebound nach Ueberverkauf',
      todayUse: 'Bausteine sind da, aber noch kein finaler Live-Agent.',
    },
    {
      family: 'VOL',
      title: 'Volatility Contraction',
      candidateIds: ['vol_contraction'],
      purpose: 'Squeeze- und Volatilitaetskompression vor Bewegungen.',
      bestFor: 'Volatility-Squeeze-Setups',
      todayUse: 'Aktuell nicht aktiv im Vordergrund.',
    },
  ];
  const slotOrder = ['live', 'live_alt_1', 'live_alt_2', 'shadow', 'shadow_alt_1', 'shadow_alt_2', 'retired'];
  const slotLabels = {
    live: 'Live',
    live_alt_1: 'Live Alt 1',
    live_alt_2: 'Live Alt 2',
    shadow: 'Shadow',
    shadow_alt_1: 'Shadow Alt 1',
    shadow_alt_2: 'Shadow Alt 2',
    retired: 'Retired',
  };
  const readinessByStatus = {
    live: 'hoch',
    shadow: 'mittel-hoch',
    training: 'mittel',
    available: 'niedrig',
    retired: 'niedrig',
  };
  const slotRows = slotOrder
    .map((slot) => {
      const rec = latestRegistry?.championSlots?.[slot];
      if (!rec?.candidate_id) return null;
      return {
        slot,
        slotLabel: slotLabels[slot] || slot,
        candidateId: String(rec.candidate_id || ''),
        family: String(rec.family || ''),
        state: String(rec.state || ''),
        registryScore: rec.q1_registry_score == null ? null : round(rec.q1_registry_score, 6),
      };
    })
    .filter(Boolean);

  const focusFamilies = focus?.summary?.focus_families || {};
  const nearPassRows = (zeroStrict?.zero_strict_asofs || []).flatMap((item) =>
    (item.near_pass_candidates || []).map((candidate) => ({
      asofDate: item.asof_date,
      candidateId: String(candidate.candidate_id || ''),
      family: String(candidate.family || ''),
      strictGapTotal: round(Number(candidate.strict_gap_total || 0), 6),
      failedGateNames: candidate.failed_gate_names || [],
    }))
  );
  const nearPassByFamily = new Map();
  for (const row of nearPassRows) {
    const key = row.family;
    if (!key) continue;
    const list = nearPassByFamily.get(key) || [];
    list.push(row);
    nearPassByFamily.set(key, list);
  }

  const familyRows = familyTemplates.map((template) => {
    const familySlots = slotRows.filter((item) => item.family === template.family);
    const familyNearPasses = [...(nearPassByFamily.get(template.family) || [])].sort((a, b) => a.strictGapTotal - b.strictGapTotal);
    const familyFocusCount = Number(focusFamilies[template.family] || 0);
    let deploymentStatus = 'available';
    if (familySlots.some((item) => item.state === 'live')) deploymentStatus = 'live';
    else if (familySlots.some((item) => item.state === 'shadow')) deploymentStatus = 'shadow';
    else if (familySlots.some((item) => item.state === 'retired')) deploymentStatus = 'retired';
    else if (familyFocusCount > 0 || familyNearPasses.length > 0) deploymentStatus = 'training';
    const headline =
      deploymentStatus === 'live'
        ? 'sofort einsetzbar'
        : deploymentStatus === 'shadow'
          ? 'fast einsatzbereit'
          : deploymentStatus === 'training'
            ? 'im Training'
            : deploymentStatus === 'retired'
              ? 'aktuell nicht aktiv'
              : 'im System vorhanden';
    const bestAgentsToday = familySlots.length
      ? familySlots.map((item) => item.candidateId)
      : familyNearPasses.length
        ? familyNearPasses.slice(0, 3).map((item) => item.candidateId)
        : template.candidateIds.slice(0, 3);
    const evidenceLines = [];
    if (familySlots.length) {
      evidenceLines.push(`Registry jetzt: ${familySlots.map((item) => `${item.slotLabel} ${item.candidateId}`).join(' · ')}`);
    }
    if (familyFocusCount > 0) {
      evidenceLines.push(`Aktueller Trainingsfokus: ${familyFocusCount} Kandidaten im Fokus.`);
    }
    if (familyNearPasses.length) {
      evidenceLines.push(`Naechste Near-Passes: ${familyNearPasses.slice(0, 3).map((item) => `${item.candidateId} (Gap ${item.strictGapTotal})`).join(' · ')}`);
    }
    return {
      family: template.family,
      title: template.title,
      purpose: template.purpose,
      bestFor: template.bestFor,
      todayUse: template.todayUse,
      deploymentStatus,
      headline,
      readiness: readinessByStatus[deploymentStatus] || 'niedrig',
      activeSlots: familySlots,
      focusCount: familyFocusCount,
      bestAgentsToday,
      definedExpertsTotal: template.candidateIds.length,
      evidence: evidenceLines,
    };
  });

  const liveSlotsTotal = slotRows.filter((item) => item.state === 'live').length;
  const shadowSlotsTotal = slotRows.filter((item) => item.state === 'shadow').length;
  const retiredSlotsTotal = slotRows.filter((item) => item.state === 'retired').length;
  const expertsDefinedTotal = familyTemplates.reduce((sum, item) => sum + item.candidateIds.length, 0);
  const familiesReadyNowTotal = new Set(slotRows.filter((item) => ['live', 'shadow'].includes(item.state)).map((item) => item.family)).size;
  const quickAnswer = [
    `Heute direkt nutzbar sind ${liveSlotsTotal + shadowSlotsTotal} Registry-Slots aus ${familiesReadyNowTotal} Familien.`,
    liveSlotsTotal > 0
      ? `Live laeuft aktuell ${slotRows.filter((item) => item.state === 'live').map((item) => item.candidateId).join(', ')}.`
      : 'Es gibt aktuell keinen Live-Slot.',
    shadowSlotsTotal > 0
      ? `Shadow bereit stehen ${slotRows.filter((item) => item.state === 'shadow').map((item) => item.candidateId).join(', ')}.`
      : 'Es gibt aktuell keine Shadow-Slots.',
    'Dein RSI-plus-MACD-plus-hoehere-Hochs-Setup ist noch kein einzelner finaler Live-Agent. Die Bausteine dafuer sind aber schon im System.',
  ];

  const requestPlaybook = [
    {
      task: 'Ich will robuste Trendaktien sofort automatisch finden.',
      readiness: 'hoch',
      answer: 'Nimm zuerst QUALITY. Das ist heute der produktionsnaechste Block.',
      bestAgents: ['quality_trend_liq_lowvol', 'quality_liq_lowvol'],
      truth: 'QUALITY ist live plus shadow im Registry-Stand und damit heute der klarste Soforteinsatz.',
    },
    {
      task: 'Ich will Breakouts mit Trend und MACD-Bestaetigung.',
      readiness: 'mittel-hoch',
      answer: 'Nimm BREAKOUT. Der Block ist schon shadow-faehig und damit nah am Live-Einsatz.',
      bestAgents: ['breakout_trend_volfilter', 'breakout_trend_macd_liq', 'breakout_trend_macd_liq_v3'],
      truth: 'BREAKOUT hat heute einen Shadow-Slot und ist damit belastbarer als reine Diagnose-Kandidaten.',
    },
    {
      task: 'Ich will Relative-Strength-Leader oder Momentum-Rotation.',
      readiness: 'mittel',
      answer: 'Nimm CSMOM. Das ist der heisseste Trainingsblock fuer den letzten roten v4-Punkt.',
      bestAgents: ['csmom_20_liq', 'csmom_ret5_ret20_liq', 'csmom_20_macd_liq'],
      truth: 'CSMOM liefert die aktuellen Near-Passes auf 2026-02-26, ist aber noch nicht final live.',
    },
    {
      task: 'Ich will RSI unter 20 plus MACD cross up plus hoehere Hochs und Tiefs.',
      readiness: 'mittel-niedrig',
      answer: 'Heute noch nicht als ein einzelner finaler Experten-Agent. Nutze eine Kette aus RSI-Rebound, Breakout und Trendfilter.',
      bestAgents: ['mr_rsi_trendfilter', 'mr_rsi_boll', 'breakout_trend_volfilter', 'quality_trend_liq_lowvol'],
      truth: 'MEANREV deckt RSI/Oversold ab, BREAKOUT den MACD-Impuls, QUALITY oder TSMOM den Trendfilter. Genau diese Hybrid-Suche ist aber noch kein einzelner Live-Champion.',
    },
  ];

  return {
    summary: {
      expertsDefinedTotal,
      familiesTotal: familyTemplates.length,
      liveSlotsTotal,
      shadowSlotsTotal,
      retiredSlotsTotal,
      familiesReadyNowTotal,
      releaseLaneScope: `Release-Lane heute: top3500 Deploy-Slice, ${Number(overnightManifest?.counts?.asof_dates_total || 0)} As-ofs.`,
      broaderStoreScope: `Breiterer Full-Store lokal vorhanden: ${fmtInt(Number(fullchunkManifest?.counts?.rows_total || 0))} Zeilen, ${Number(fullchunkManifest?.counts?.asof_dates_total || 0)} As-ofs.`,
    },
    quickAnswer,
    activeSlots: slotRows,
    families: familyRows,
    requestPlaybook,
  };
}

function fmtInt(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function main() {
  const args = parseArgs(process.argv);
  const quantRoot = args.quantRoot;
  const reportDate = args.reportDate || localDateId();
  const now = nowLocal();

  const opsRoot = path.join(quantRoot, 'ops');
  const runsRoot = path.join(quantRoot, 'runs');
  const jobsRoot = path.join(quantRoot, 'jobs');

  const preflight = readJson(path.join(opsRoot, 'preflight/night_preflight_latest.json'));
  const overnightStability = readJson(path.join(opsRoot, 'overnight_stability/latest.json'));
  const stagebStability = readJson(path.join(opsRoot, 'stage_b_stability/latest_v4_final.json'));
  const zeroStrict = readJson(path.join(opsRoot, 'stage_b_stability/zero_strict_near_pass_latest_v4_final.json'));
  const focus = readJson(path.join(opsRoot, 'stage_b_diagnostics/focus_latest_v4_final.json'));
  const laneComparison = readJson(path.join(opsRoot, 'stage_b_diagnostics/lane_comparison_latest.json'));
  const redFlags = readJson(path.join(opsRoot, 'red_flags/latest.json'));

  const overnightManifest = readJson(path.join(quantRoot, 'features/store/feature_store_version=v4_q1panel_overnight/feature_panel_manifest.json'));
  const fullchunkManifest = readJson(path.join(quantRoot, 'features/store/feature_store_version=v4_q1panel_fullchunk_daily/feature_panel_manifest.json'));
  const legacyQuantLatest = readJson(path.join(REPO_ROOT, 'public/data/quantlab/latest.json'));
  const featureStoreCandidates = [
    summarizeFeatureStoreCandidate('v4_q1panel_overnight', overnightManifest),
    summarizeFeatureStoreCandidate('v4_q1panel_fullchunk_daily', fullchunkManifest),
  ];

  const stagebReports = sortByGeneratedAtDesc(
    walkFind(runsRoot, 'stage_b_q1_run_report.json')
      .map(parseStagebReport)
      .filter((item) => item && item.v4FinalProfile)
  );
  const registryReports = sortByGeneratedAtDesc(
    walkFind(runsRoot, 'q1_registry_update_report.json')
      .map(parseRegistryReport)
      .filter(Boolean)
  );
  const portfolioReports = sortByGeneratedAtDesc(
    walkFind(runsRoot, 'q1_portfolio_risk_execution_report.json')
      .map(parsePortfolioReport)
      .filter(Boolean)
  );
  const gateReports = sortByGeneratedAtDesc(
    walkFind(runsRoot, 'q1_v4_final_gate_matrix_report.json')
      .map(parseGateReport)
      .filter(Boolean)
  );
  const trainingJobs = sortByGeneratedAtDesc(
    walkFind(jobsRoot, 'state.json')
      .map(parseTrainingJob)
      .filter(Boolean)
  );

  const registryByStageb = latestBy(registryReports, (item) => item.stagebRunId);
  const portfolioByStagebReport = latestBy(portfolioReports, (item) => item.stagebReport);
  const gateByStagebReport = latestBy(gateReports, (item) => item.stagebReport);

  const targetRows = (laneComparison?.asof_reports || []).map((entry) => {
    const top3500 = (entry.lanes || []).find((lane) => lane.lane === 'top3500') || null;
    const top5000 = (entry.lanes || []).find((lane) => lane.lane === 'top5000') || null;
    const registry = top3500 ? registryByStageb.get(top3500.run_id) || null : null;
    const portfolio = top3500 ? portfolioByStagebReport.get(top3500.report_path) || null : null;
    const finalGate = top3500 ? gateByStagebReport.get(top3500.report_path) || null : null;
    return {
      asofDate: entry.asof_date,
      stageb: top3500 ? {
        ok: Boolean(top3500.ok),
        strictPassTotal: Number(top3500.strict_pass_total || 0),
        survivorsBQ1Total: Number(top3500.survivors_B_q1_total || 0),
        stageASurvivorsATotal: Number(top3500.stage_a_survivors_A_total || 0),
        cpcvPathsEffective: Number(top3500.cpcv_light?.combos_effective_total || 0),
        cpcvPathsTotal: Number(top3500.cpcv_light?.paths_total || 0),
        topFailReasons: top3500.top_fail_reasons || [],
        nearPassCandidates: top3500.near_pass_candidates || [],
      } : null,
      comparison: top5000 ? {
        strictPassTotal: Number(top5000.strict_pass_total || 0),
        cpcvPathsEffective: Number(top5000.cpcv_light?.combos_effective_total || 0),
      } : null,
      registry,
      portfolio,
      finalGate,
    };
  });

  const targetStagebPositiveRatio = targetRows.length
    ? targetRows.filter((row) => Number(row.stageb?.strictPassTotal || 0) > 0).length / targetRows.length
    : 0;
  const portfolioTargetRatio = targetRows.length
    ? targetRows.filter((row) => Boolean(row.portfolio?.ok)).length / targetRows.length
    : 0;
  const gateTargetRatio = targetRows.length
    ? targetRows.filter((row) => Boolean(row.finalGate?.ok)).length / targetRows.length
    : 0;

  const implementationChecks = [
    {
      id: 'raw_truth',
      label: 'Provider-Raw Truth',
      ok: Boolean(preflight?.checks?.find((item) => item.name === 'raw_bars_freshness')?.ok),
      detail: 'Night preflight confirms fresh raw bars for stock/etf.',
    },
    {
      id: 'feature_store',
      label: 'Feature Store',
      ok: Boolean(overnightManifest?.counts?.rows_total),
      detail: 'Canonical v4_q1panel_overnight panel manifest is present.',
    },
    {
      id: 'stagea',
      label: 'Stage A Pipeline',
      ok: targetRows.every((row) => row.stageb),
      detail: 'Target asofs have canonical Stage-A derived Stage-B artifacts.',
    },
    {
      id: 'stageb',
      label: 'Stage B Pipeline',
      ok: Number(stagebStability?.summary?.asof_points_total || 0) > 0,
      detail: 'Profile-aware v4-final Stage-B truth reports exist.',
    },
    {
      id: 'registry',
      label: 'Registry Ladder',
      ok: targetRows.filter((row) => row.registry).length >= 3,
      detail: 'Registry updates exist for the current target trio.',
    },
    {
      id: 'portfolio',
      label: 'Portfolio Engine',
      ok: portfolioReports.length > 0,
      detail: 'Portfolio execution reports are generated locally.',
    },
    {
      id: 'final_gates',
      label: 'Final Gates',
      ok: gateReports.length > 0,
      detail: 'Q1 v4 final gate matrix is wired and producing reports.',
    },
    {
      id: 'report_truth',
      label: 'Release Truth Split',
      ok: Boolean(stagebStability && zeroStrict && focus && laneComparison),
      detail: 'Preferred truth and v4-final truth are separated.',
    },
    {
      id: 'training_jobs',
      label: 'Training Sweeps',
      ok: trainingJobs.length > 0,
      detail: 'Daily and overnight training sweep state files are present.',
    },
    {
      id: 'daily_report',
      label: 'Daily Reporting',
      ok: true,
      detail: 'This report generator and local dashboard are now in place.',
    },
  ];

  const implementationDone = implementationChecks.filter((item) => item.ok).length;
  const implementationPct = pct(implementationDone, implementationChecks.length, 1);

  const readinessChecks = [
    {
      id: 'data_ready',
      label: 'Data Freshness',
      weight: 10,
      score: Boolean(preflight?.ok) ? 1 : 0,
      detail: 'Snapshot, disk, RSS and raw-bar freshness are green in night preflight.',
    },
    {
      id: 'canonical_reporting',
      label: 'Canonical Reporting',
      weight: 10,
      score: Boolean(stagebStability && laneComparison && focus) ? 1 : 0,
      detail: 'Canonical v4-final truth artifacts exist and were refreshed today.',
    },
    {
      id: 'target_trio',
      label: 'Target Trio',
      weight: 20,
      score: targetStagebPositiveRatio,
      detail: 'Current focus block is 2026-02-15 / 2026-02-16 / 2026-02-17.',
    },
    {
      id: 'stability_series',
      label: '10-As-of Stability',
      weight: 40,
      score: Number(stagebStability?.summary?.strict_positive_ratio_all || 0),
      detail: 'Release readiness requires repeated positive Stage-B results across the tracked as-of series.',
    },
    {
      id: 'downstream_chain',
      label: 'Registry/Portfolio/Gates',
      weight: 20,
      score: (1 + portfolioTargetRatio + gateTargetRatio) / 3,
      detail: 'Downstream chain tracks whether strict Stage-B results also clear registry, portfolio and final gates.',
    },
  ];

  const readinessPct = round(
    readinessChecks.reduce((sum, item) => sum + item.weight * item.score, 0),
    1
  );

  const jobAll = summarizeJobs(trainingJobs);
  const jobMonth = summarizeJobs(filterSince(trainingJobs, 'createdAt', startOfMonth(now)));
  const jobWeek = summarizeJobs(filterSince(trainingJobs, 'createdAt', startOfWeek(now)));
  const jobDay = summarizeJobs(filterSince(trainingJobs, 'createdAt', startOfDay(now)));

  const stagebAll = summarizeStageb(stagebReports);
  const stagebMonth = summarizeStageb(filterSince(stagebReports, 'generatedAt', startOfMonth(now)));
  const stagebWeek = summarizeStageb(filterSince(stagebReports, 'generatedAt', startOfWeek(now)));
  const stagebDay = summarizeStageb(filterSince(stagebReports, 'generatedAt', startOfDay(now)));

  const gateAll = summarizeGate(gateReports);
  const gateMonth = summarizeGate(filterSince(gateReports, 'generatedAt', startOfMonth(now)));
  const gateWeek = summarizeGate(filterSince(gateReports, 'generatedAt', startOfWeek(now)));
  const gateDay = summarizeGate(filterSince(gateReports, 'generatedAt', startOfDay(now)));

  const historyFiles = fs.existsSync(MIRROR_DIR)
    ? fs.readdirSync(MIRROR_DIR)
        .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort()
        .map((name) => path.join(MIRROR_DIR, name))
    : [];

  const currentHistoryPoint = {
    date: reportDate,
    implementationPct,
    readinessPct,
    strictPositiveRatioAllPct: round(Number(stagebStability?.summary?.strict_positive_ratio_all || 0) * 100, 1),
    targetStagebPositiveRatioPct: round(targetStagebPositiveRatio * 100, 1),
    portfolioTargetRatioPct: round(portfolioTargetRatio * 100, 1),
    gateTargetRatioPct: round(gateTargetRatio * 100, 1),
    overnightStabilityScore: round(Number(overnightStability?.summary?.stability_score_0_100 || 0), 2),
    trainingJobsToday: jobDay.jobsTotal,
    stagebRunsToday: stagebDay.runsTotal,
  };

  const historyMap = new Map();
  for (const filePath of historyFiles) {
    const doc = readJson(filePath);
    if (doc?.historyPoint?.date) historyMap.set(doc.historyPoint.date, doc.historyPoint);
  }
  historyMap.set(reportDate, currentHistoryPoint);
  const history = [...historyMap.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const zeroStrictGates = aggregateTopGatesFromZeroStrict(zeroStrict?.zero_strict_asofs || []);
  const targetGateCounts = new Map();
  for (const report of focus?.asof_reports || []) {
    if (report.target_group !== 'target') continue;
    for (const [gate, count] of Object.entries(report.stage_b_light_fail_reason_counts || {})) {
      targetGateCounts.set(gate, Number(targetGateCounts.get(gate) || 0) + Number(count || 0));
    }
  }
  const targetBlockers = [...targetGateCounts.entries()]
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recommendationSet = buildRecommendationSet({
    stagebStability,
    targetRows,
    zeroStrictGates,
    overnightStability,
    portfolioRows: targetRows,
    gateRows: targetRows,
  });

  const preflightRawFreshness = preflight?.checks?.find((item) => item.name === 'raw_bars_freshness')?.freshness || {};
  const computedRawFreshness = buildRawBarsFreshnessSummary(quantRoot, reportDate, ['stock', 'etf']);
  const rawFreshness = computedRawFreshness.latest_required_ingest_date
    ? computedRawFreshness
    : preflightRawFreshness;
  const rawRoot = path.join(quantRoot, 'data/raw/provider=EODHD');
  const snapshotsRoot = path.join(quantRoot, 'data/snapshots');
  const featureStoreRoot = path.join(quantRoot, 'features/store');
  const v7HistoryRoot = '/Users/michaelpuchowezki/QuantLabHot/storage/universe-v7-history/history';

  const latestRegistry = registryReports[0] || null;
  const latestPortfolio = portfolioReports[0] || null;
  const latestGate = gateReports[0] || null;
  const { agentReadiness, marketData } = buildExpertLayer({
    quantRoot,
    repoRoot: REPO_ROOT,
    stagebReports,
    registryReports,
    latestRegistry,
    focus,
    overnightManifest,
    fullchunkManifest,
    generatedAt: now.toISOString(),
  });
  const operationalFeatureStore = selectOperationalFeatureStore(featureStoreCandidates, marketData);
  const operationalStatus = buildQuantLabDataFreshnessSummary({
    generatedAt: now.toISOString(),
    reportDate,
    rawFreshness,
    featureStoreManifest: operationalFeatureStore?.manifest || null,
    featureStoreCandidates,
    marketData,
  });

  const report = {
    schema: 'rv_quantlab_v4_daily_report_v1',
    generatedAt: now.toISOString(),
    reportDate,
    quantRoot,
    objective: {
      title: 'Quant Lab System v4.0 Daily Report',
      implementationGoal: 'Systemisch 100% fertig bedeutet: Datenpfade, Feature-Store, Stage A/B, Registry, Portfolio, Final Gates, Truth-Reports und taegliche Ops sind lokal belastbar implementiert.',
      releaseGoal: 'Release-ready bedeutet: die aktuelle kanonische v4-final-Lane erzeugt ueber die As-of-Serie wiederholt strict-positive Stage-B-Ergebnisse und gruene End-to-End-Gates.',
      canonicalLane: {
        featureStoreVersion: 'v4_q1panel_overnight',
        snapshotId: String(overnightManifest?.snapshot_id || ''),
        panelDays: Number(overnightManifest?.panel_calendar_days || 90),
        topLiquidN: Number(overnightManifest?.counts?.allowlist_assets_total || 3500),
        foldCount: 4,
        candidateProfile: 'core24',
      },
    },
    progress: {
      implementation: {
        pct: implementationPct,
        done: implementationDone,
        total: implementationChecks.length,
        status: implementationPct >= 100 ? 'implemented' : 'in_progress',
        checks: implementationChecks,
      },
      readiness: {
        pct: readinessPct,
        status: toStatus(readinessPct, 85, 60),
        checks: readinessChecks.map((item) => ({
          ...item,
          weightedPct: round(item.weight * item.score, 1),
        })),
      },
    },
    currentState: {
      preflight: {
        ok: Boolean(rawFreshness.required_asset_types_fresh),
        generatedAt: preflight?.generated_at || now.toISOString(),
        rawFreshness,
      },
      dataFreshness: operationalStatus,
      stagebStability: stagebStability?.summary || {},
      overnightStability: overnightStability?.summary || {},
      focusSummary: focus?.summary || {},
      laneComparisonGeneratedAt: laneComparison?.generated_at || null,
    },
    activity: {
      allTime: { jobs: jobAll, stageb: stagebAll, gates: gateAll },
      thisMonth: { jobs: jobMonth, stageb: stagebMonth, gates: gateMonth },
      thisWeek: { jobs: jobWeek, stageb: stagebWeek, gates: gateWeek },
      today: { jobs: jobDay, stageb: stagebDay, gates: gateDay },
    },
    momentum: {
      history,
      proofPoints: targetRows.map((row) => ({
        asofDate: row.asofDate,
        top3500StrictPassTotal: Number(row.stageb?.strictPassTotal || 0),
        top5000StrictPassTotal: Number(row.comparison?.strictPassTotal || 0),
        strictPassDelta: Number(row.stageb?.strictPassTotal || 0) - Number(row.comparison?.strictPassTotal || 0),
        top3500EffectiveCpcvPaths: Number(row.stageb?.cpcvPathsEffective || 0),
        top5000EffectiveCpcvPaths: Number(row.comparison?.cpcvPathsEffective || 0),
        finalGateOk: Boolean(row.finalGate?.ok),
      })),
    },
    trainingScope: {
      trainingIsPartOfCompletion: true,
      why: 'v4.0 ist nicht fertig, wenn nur der Code existiert; die kanonische Release-Lane muss empirisch bestehen.',
      whatIsBeingTrained: [
        'Q1 panel features auf snapshot 2026-02-26_670417f6fae7_q1step2bars',
        'Kanonische overnight panels (90 Tage, top3500, stock/etf)',
        'Stage-B Selektion ueber TSMOM / CSMOM / BREAKOUT / MEANREV Kandidaten',
        'Registry-Ladder und Slot-Blend Portfolio auf den Strict-Survivors',
      ],
      currentFocusFamilies: focus?.summary?.focus_families || {},
    },
    agentReadiness,
    targetAsofs: targetRows,
    intelligence: {
      currentChampion: latestRegistry?.championLive || null,
      latestRegistryDecision: latestRegistry ? {
        generatedAt: latestRegistry.generatedAt,
        decision: latestRegistry.decision,
        reasonCodes: latestRegistry.reasonCodes,
      } : null,
      latestPortfolio: latestPortfolio ? {
        asofDate: latestPortfolio.asofDate,
        ok: latestPortfolio.ok,
        candidate: latestPortfolio.candidate,
        failures: latestPortfolio.failures,
      } : null,
      latestFinalGate: latestGate ? {
        asofDate: latestGate.asofDate,
        ok: latestGate.ok,
        failedChecks: latestGate.failedChecks,
      } : null,
      legacyLatestQuantlab: legacyQuantLatest || null,
    },
    dataSafety: {
      rawBars: {
        provider: rawFreshness.provider || 'EODHD',
        latestIngestByAssetType: rawFreshness.latest_ingest_by_asset_type || {},
        latestAnyIngestByAssetType: rawFreshness.latest_any_ingest_by_asset_type || {},
        latestBridgeIngestByAssetType: rawFreshness.latest_bridge_ingest_by_asset_type || {},
        latestRequiredAgeCalendarDays: rawFreshness.latest_required_age_calendar_days ?? null,
        latestRequiredAnyAgeCalendarDays: rawFreshness.latest_required_any_age_calendar_days ?? null,
        bridgeOnlyAdvanceCalendarDays: rawFreshness.bridge_only_advance_calendar_days ?? null,
        requiredAssetTypesFresh: Boolean(rawFreshness.required_asset_types_fresh),
        stockFiles: countFilesInDir(path.join(rawRoot, 'asset_type=stock'), '.parquet'),
        etfFiles: countFilesInDir(path.join(rawRoot, 'asset_type=etf'), '.parquet'),
      },
      freshness: operationalStatus,
      storage: [
        { name: 'raw_provider_eodhd', sizeGb: readDirSizeGb(rawRoot), path: rawRoot },
        { name: 'snapshots', sizeGb: readDirSizeGb(snapshotsRoot), path: snapshotsRoot },
        { name: 'feature_store', sizeGb: readDirSizeGb(featureStoreRoot), path: featureStoreRoot },
        { name: 'universe_v7_history', sizeGb: readDirSizeGb(v7HistoryRoot), path: v7HistoryRoot },
      ],
      featureStores: [
        {
          name: 'v4_q1panel_overnight',
          rowsTotal: Number(overnightManifest?.counts?.rows_total || 0),
          asofDatesTotal: Number(overnightManifest?.counts?.asof_dates_total || 0),
          allowlistAssetsTotal: Number(overnightManifest?.counts?.allowlist_assets_total || 0),
        },
        {
          name: 'v4_q1panel_fullchunk_daily',
          rowsTotal: Number(fullchunkManifest?.counts?.rows_total || 0),
          asofDatesTotal: Number(fullchunkManifest?.counts?.asof_dates_total || 0),
          allowlistAssetsTotal: Number(fullchunkManifest?.counts?.allowlist_assets_total || 0),
        },
      ],
      reportArchive: {
        mirrorDir: MIRROR_DIR,
        publicLatest: PUBLIC_REPORT,
        dailySnapshotsTotal: historyMap.size,
        latestHash: sha256(JSON.stringify(currentHistoryPoint)),
      },
    },
    blockers: {
      zeroStrictTopGates: zeroStrictGates.slice(0, 10),
      targetTopGates: targetBlockers,
      gateFailuresRecent: aggregateGateFailures(gateReports.slice(0, 10)).slice(0, 10),
      recommendedActions: recommendationSet,
    },
    sources: {
      preflight: path.join(opsRoot, 'preflight/night_preflight_latest.json'),
      overnightStability: path.join(opsRoot, 'overnight_stability/latest.json'),
      stagebStability: path.join(opsRoot, 'stage_b_stability/latest_v4_final.json'),
      zeroStrict: path.join(opsRoot, 'stage_b_stability/zero_strict_near_pass_latest_v4_final.json'),
      focus: path.join(opsRoot, 'stage_b_diagnostics/focus_latest_v4_final.json'),
      laneComparison: path.join(opsRoot, 'stage_b_diagnostics/lane_comparison_latest.json'),
      redFlags: path.join(opsRoot, 'red_flags/latest.json'),
      operationalStatus: PUBLIC_OPERATIONAL_STATUS,
      marketData: PUBLIC_MARKET,
      stockPublish: PUBLIC_STOCK_PUBLISH,
      expertSearchUniverse: marketData?.sources?.registryBrowse || null,
      expertFeatureSlice: marketData?.sources?.featureSlice || null,
    },
    historyPoint: currentHistoryPoint,
  };

  const datedMirror = path.join(MIRROR_DIR, `${reportDate}.json`);
  const stockPublish = buildQuantLabStockPublish(marketData, {
    generatedAt: report.generatedAt,
    registryBrowsePath: marketData?.sources?.registryBrowse,
    freshness: operationalStatus,
  });
  writeJsonAtomic(datedMirror, report);
  writeJsonAtomic(MIRROR_LATEST, report);
  writeJsonAtomic(MIRROR_MARKET_LATEST, marketData);
  writeJsonAtomic(MIRROR_OPERATIONAL_STATUS, operationalStatus);
  writeQuantLabStockPublishBundle(stockPublish, {
    publicMetaPath: PUBLIC_STOCK_PUBLISH,
    mirrorMetaPath: MIRROR_STOCK_PUBLISH_LATEST,
  });
  writeJsonAtomic(PUBLIC_REPORT, report);
  writeJsonAtomic(PUBLIC_MARKET, marketData);
  writeJsonAtomic(PUBLIC_OPERATIONAL_STATUS, operationalStatus);
  
  // Parallel Sharding Output for Safety & Cloudflare compatibility
  const shardsDir = path.join(REPO_ROOT, 'public/data/quantlab/reports/shards');
  console.log(`Sharding marketData with ${Object.keys(marketData.assetOpinions || {}).length} assets to ${shardsDir}...`);
  writeShards(shardsDir, marketData);

  writeJsAssignment(PUBLIC_REPORT_JS, '__RV_QUANTLAB_V4_DAILY_REPORT__', report);

  writeJsAssignment(PUBLIC_MARKET_JS, '__RV_QUANTLAB_V4_DAILY_MARKET__', marketData);
  writeJsonAtomic(PUBLIC_HISTORY, {
    schema: 'rv_quantlab_v4_daily_report_history_v1',
    generatedAt: report.generatedAt,
    reportDate,
    points: history,
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    report: path.relative(REPO_ROOT, PUBLIC_REPORT),
    market: path.relative(REPO_ROOT, PUBLIC_MARKET),
    stock_publish: path.relative(REPO_ROOT, PUBLIC_STOCK_PUBLISH),
    history: path.relative(REPO_ROOT, PUBLIC_HISTORY),
    mirror: path.relative(REPO_ROOT, datedMirror),
    readiness_pct: readinessPct,
    implementation_pct: implementationPct,
  }, null, 2)}\n`);
}

main();
