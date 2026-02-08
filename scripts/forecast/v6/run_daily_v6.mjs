#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { sha256Json, hashFile, hashPolicyObject, stableSortRows } from './lib/hashing.mjs';
import {
  nowIso,
  readJson,
  writeJsonAtomic,
  fileExists,
  ensureDir,
  appendNdjsonUnique,
  readNdjson
} from './lib/io.mjs';
import { resolveTradingDate, previousTradingDay } from './lib/trading_date.mjs';
import { runDQChecks } from './lib/dq_checks.mjs';
import { buildPITUniverse } from './lib/pit_universe.mjs';
import { computeRegimeFromProxy } from './lib/market_proxy_regime.mjs';
import { buildCandidatesWithControl } from './lib/control_sampling.mjs';
import { buildFeaturesByDate } from './lib/feature_build.mjs';
import { enforceFeaturePolicy } from './lib/feature_enforce_policy.mjs';
import { syncFeatureBySymbolCache } from './lib/feature_cache_sync.mjs';
import { updateMoeState, readMoeState } from './lib/moe_router_state.mjs';
import { evaluateMonitoring } from './lib/monitoring.mjs';
import { evaluateFeasibility } from './lib/feasibility_eval.mjs';
import { runSecrecyScan } from './lib/secrecy_scan.mjs';
import { validateV6Bundle } from './lib/schema_validate.mjs';
import { buildPublishArtifacts, publishArtifactsAtomic } from './lib/publish.mjs';
import { publishLastGoodOrFallback, registerSuccessfulPublish, readPointers } from './lib/rollback.mjs';
import { runOutcomeMaturation, determineOutcomeRevision } from './lib/outcome_engine.mjs';

const POLICY_FILES = {
  root: 'policy.v6.json',
  feature: 'feature_policy.v6.json',
  feature_store: 'feature_store_policy.v6.json',
  split: 'split_policy.v6.json',
  outcome: 'outcome_policy.v6.0.json',
  corporate_actions: 'corporate_actions_policy.v6.json',
  calibration: 'calibration_policy.v6.json',
  moe: 'moe_policy.v6.json',
  moe_state: 'moe_state_policy.v6.json',
  monitoring: 'monitoring_policy.v6.json',
  promotion: 'promotion_policy.v6.json',
  feasibility: 'feasibility_policy.v6.json',
  secrecy: 'secrecy_policy.v6.json',
  memory: 'memory_policy.v6.json',
  disaster_recovery: 'disaster_recovery_policy.v6.json',
  trading_calendar: 'trading_calendar_policy.v6.json',
  stratification_fallback: 'stratification_fallback_policy.v6.json'
};

function parseArgs(argv) {
  const out = {
    date: null,
    mode: null,
    dryRun: false,
    inputDir: null
  };

  for (const arg of argv) {
    if (arg.startsWith('--date=')) out.date = arg.split('=')[1];
    else if (arg.startsWith('--mode=')) out.mode = arg.split('=')[1].toUpperCase();
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--input-dir=')) out.inputDir = arg.split('=')[1];
  }

  return out;
}

function resolveMode(requestedMode) {
  if (requestedMode === 'LOCAL' || requestedMode === 'CI') return requestedMode;
  return process.env.GITHUB_ACTIONS === 'true' ? 'CI' : 'LOCAL';
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function parseUniverseDoc(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) {
    return doc.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  }
  if (Array.isArray(doc.tickers)) return doc.tickers.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc.symbols)) return doc.symbols.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc.data)) {
    return doc.data.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  }
  return [];
}

function resolvePolicyPath(repoRoot, inputDir, fileName) {
  const candidates = [];
  if (inputDir) {
    candidates.push(path.join(inputDir, 'policies/forecast/v6', fileName));
    candidates.push(path.join(inputDir, 'policies', fileName));
  }
  candidates.push(path.join(repoRoot, 'policies/forecast/v6', fileName));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`POLICY_FILE_MISSING: ${fileName}`);
}

function loadPolicies(repoRoot, inputDir) {
  const policies = {};
  const policyHashes = {};
  const policyPaths = {};

  for (const [key, fileName] of Object.entries(POLICY_FILES)) {
    const p = resolvePolicyPath(repoRoot, inputDir, fileName);
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    const computed = hashPolicyObject(doc);
    if (doc.policy_hash && doc.policy_hash !== computed) {
      throw new Error(`POLICY_HASH_MISMATCH:${fileName}:${doc.policy_hash}!=${computed}`);
    }
    policies[key] = doc;
    policyHashes[key] = doc.policy_hash || computed;
    policyPaths[key] = path.relative(repoRoot, p);
  }

  return { policies, policyHashes, policyPaths };
}

function resolveUniversePath(repoRoot, inputDir) {
  const candidates = [];
  if (inputDir) {
    candidates.push(path.join(inputDir, 'universe/all.json'));
    candidates.push(path.join(inputDir, 'universe.json'));
  }
  candidates.push(path.join(repoRoot, 'public/data/universe/all.json'));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('UNIVERSE_NOT_FOUND');
}

function resolveBarsFile(repoRoot, inputDir, symbol) {
  const candidates = [];
  if (inputDir) candidates.push(path.join(inputDir, 'bars', `${symbol}.json`));
  candidates.push(path.join(repoRoot, 'public/data/eod/bars', `${symbol}.json`));

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadBarsRows(filePath, asofDate) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }

  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row?.date && row.date <= asofDate)
    .map((row) => ({
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close ?? row.adjClose),
      volume: Number(row.volume ?? 0)
    }))
    .filter((row) => Number.isFinite(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function resolveProviderRevision(repoRoot, provider, consumedRelPaths, hashesByPath) {
  const manifestPath = path.join(repoRoot, 'public/data/eod/manifest.latest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath, {});
    const digest = sha256Json(manifest);
    return `${provider}:${digest}`;
  }
  return `${provider}:${sha256Json({ consumedRelPaths, hashesByPath })}`;
}

function buildBarsManifest({ repoRoot, asofDate, provider, symbols, inputDir }) {
  const barsBySymbol = {};
  const consumedRelPaths = [];
  const hashesByPath = {};
  const missingSymbols = [];

  for (const symbol of symbols) {
    const filePath = resolveBarsFile(repoRoot, inputDir, symbol);
    if (!filePath) {
      missingSymbols.push(symbol);
      continue;
    }

    const rows = loadBarsRows(filePath, asofDate);
    if (!rows.length) {
      missingSymbols.push(symbol);
      continue;
    }

    barsBySymbol[symbol] = rows;
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    consumedRelPaths.push(rel);
    hashesByPath[rel] = hashFile(filePath);
  }

  consumedRelPaths.sort();

  const providerRevision = resolveProviderRevision(repoRoot, provider, consumedRelPaths, hashesByPath);
  const manifestCore = {
    asof_date: asofDate,
    provider,
    provider_revision: providerRevision,
    partitions: consumedRelPaths,
    hashes: hashesByPath
  };

  return {
    barsBySymbol,
    missingSymbols,
    manifest: {
      ...manifestCore,
      bars_manifest_hash: sha256Json(manifestCore)
    }
  };
}

function loadChampionModelCard(repoRoot) {
  const candidatePaths = [
    path.join(repoRoot, 'mirrors/forecast/models/champion/model_card.v6.json'),
    path.join(repoRoot, 'mirrors/forecast/models/champion/current.model_card.v6.json'),
    path.join(repoRoot, 'public/data/forecast/models/champion/current.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return readJson(p, null);
  }

  return {
    model_id: 'forecast-v6-default',
    strategy: 'baseline',
    horizon: '10d/20d',
    trained_on_window: 'rolling-252',
    policy_hashes: {},
    code_hash: sha256Json({ default: true }),
    feature_set_hash: sha256Json({ default: true }),
    weights_ref: {
      type: 'LOCAL_VAULT',
      vault_key: 'forecast/v6/default/weights.bin',
      content_hash: sha256Json({ empty: true }),
      env_var: 'RUBIKVAULT_MODELS_DIR'
    }
  };
}

function resolveWeightCoefficients(weightBytes, expectedHash) {
  let parsed = null;
  try {
    parsed = JSON.parse(weightBytes.toString('utf8'));
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === 'object' && parsed.coefficients && typeof parsed.coefficients === 'object') {
    return parsed.coefficients;
  }

  const seed = parseInt(expectedHash.slice(7, 15), 16) / 0xffffffff;
  return {
    log_ret_1d: 0.4 + seed * 0.2,
    log_ret_5d: 0.8 + seed * 0.3,
    log_ret_20d: 1.0 + seed * 0.25,
    ratio_ma20: 0.7,
    ratio_ma50: 0.5,
    zscore_volume_20d: 0.2,
    dist_ma50_atr: 0.35
  };
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

function normalizeSoftWeights(weights) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((acc, [, value]) => acc + Math.max(0, Number(value) || 0), 0) || 1;
  const out = {};
  for (const [key, value] of entries) {
    out[key] = Math.max(0, Number(value) || 0) / sum;
  }
  return out;
}

function computeSoftWeights({ pUp, regimeBucket }) {
  const base = {
    BULL: pUp,
    BEAR: 1 - pUp,
    NEUTRAL: 0.2 + (1 - Math.abs(pUp - 0.5) * 2) * 0.3
  };
  if (regimeBucket === 'BULL') base.BULL += 0.1;
  if (regimeBucket === 'BEAR') base.BEAR += 0.1;
  return normalizeSoftWeights(base);
}

function maxKeyByValue(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return 'NEUTRAL';
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0][0];
}

function generatePredictionsLocal({
  asofDate,
  featureRows,
  horizons,
  modelCard,
  barsManifestHash,
  policyHashes,
  mode,
  marketProxyHash,
  weightsHash,
  coefficients
}) {
  const rows = [];

  for (const row of featureRows) {
    const f = row.features || {};
    for (const horizon of horizons) {
      const horizonWeight = Number(horizon) >= 20 ? 1.1 : 0.9;
      const score = horizonWeight * (
        (Number(f.log_ret_1d) || 0) * (coefficients.log_ret_1d ?? 0) +
        (Number(f.log_ret_5d) || 0) * (coefficients.log_ret_5d ?? 0) +
        (Number(f.log_ret_20d) || 0) * (coefficients.log_ret_20d ?? 0) +
        (Number(f.ratio_ma20) || 0) * (coefficients.ratio_ma20 ?? 0) +
        (Number(f.ratio_ma50) || 0) * (coefficients.ratio_ma50 ?? 0) +
        (Number(f.zscore_volume_20d) || 0) * (coefficients.zscore_volume_20d ?? 0) +
        (Number(f.dist_ma50_atr) || 0) * (coefficients.dist_ma50_atr ?? 0)
      );

      const pUp = Math.max(0.001, Math.min(0.999, logistic(score)));
      const softWeights = computeSoftWeights({ pUp, regimeBucket: f.regime_bucket || 'NEUTRAL' });
      const loggedExpert = maxKeyByValue(softWeights);
      const confidence = Math.max(...Object.values(softWeights));

      const predictionCore = {
        symbol: row.symbol,
        asof_date: asofDate,
        horizon_days: Number(horizon),
        mode,
        model_id: modelCard.model_id,
        bars_manifest_hash: barsManifestHash,
        score,
        p_up: pUp,
        logged_expert: loggedExpert,
        soft_weights: softWeights,
        confidence,
        policy_hashes: policyHashes,
        input_hashes: {
          features_hash: sha256Json({ symbol: row.symbol, horizon, f }),
          market_proxy_hash: marketProxyHash,
          weights_hash: weightsHash
        },
        is_control: Boolean(row.is_control),
        y_true: Number(f.log_ret_1d) > 0 ? 1 : 0
      };

      rows.push({
        prediction_id: sha256Json(predictionCore),
        schema: 'forecast_prediction_v6_row',
        ...predictionCore
      });
    }
  }

  return stableSortRows(rows, ['symbol', 'asof_date']);
}

function readPredictionsForDate({ repoRoot, inputDir, asofDate }) {
  const candidates = [];
  if (inputDir) {
    candidates.push(path.join(inputDir, 'predictions', `${asofDate}.ndjson.zst`));
    candidates.push(path.join(inputDir, 'predictions', `${asofDate}.ndjson`));
    candidates.push(path.join(inputDir, 'predictions', `${asofDate}.json`));
  }
  candidates.push(path.join(repoRoot, 'mirrors/forecast/ledgers/predictions', `${asofDate}.ndjson.zst`));
  candidates.push(path.join(repoRoot, 'mirrors/forecast/ledgers/predictions', `${asofDate}.ndjson`));
  candidates.push(path.join(repoRoot, 'mirrors/forecast/ledgers/predictions', `${asofDate}.json`));

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    if (p.endsWith('.json')) {
      const json = readJson(p, null);
      if (json?.rows && Array.isArray(json.rows)) return { path: p, rows: json.rows };
      if (Array.isArray(json)) return { path: p, rows: json };
      return { path: p, rows: [] };
    }
    return { path: p, rows: readNdjson(p) };
  }

  return { path: null, rows: [] };
}

function buildTriggers(predictionsRows) {
  const rows = [...predictionsRows].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const hotset = rows.slice(0, 30).map((row) => ({
    symbol: row.symbol,
    horizon_days: row.horizon_days,
    p_up: row.p_up,
    score: row.score,
    logged_expert: row.logged_expert,
    confidence: row.confidence
  }));

  const watchlist = rows.slice(0, 100).map((row) => ({
    symbol: row.symbol,
    horizon_days: row.horizon_days,
    p_up: row.p_up,
    score: row.score
  }));

  const triggers = rows
    .filter((row) => row.p_up >= 0.6 || row.p_up <= 0.4)
    .slice(0, 60)
    .map((row) => ({
      symbol: row.symbol,
      action: row.p_up >= 0.6 ? 'BULLISH_TRIGGER' : 'BEARISH_TRIGGER',
      p_up: row.p_up,
      score: row.score,
      horizon_days: row.horizon_days
    }));

  const byHorizon = {};
  for (const row of rows) {
    const h = String(row.horizon_days);
    if (!byHorizon[h]) byHorizon[h] = { count: 0, mean_p_up: 0, mean_score: 0 };
    byHorizon[h].count += 1;
    byHorizon[h].mean_p_up += Number(row.p_up) || 0;
    byHorizon[h].mean_score += Number(row.score) || 0;
  }
  for (const entry of Object.values(byHorizon)) {
    if (entry.count > 0) {
      entry.mean_p_up /= entry.count;
      entry.mean_score /= entry.count;
    }
  }

  const scorecard = {
    total_predictions: rows.length,
    by_horizon: byHorizon,
    top_confidence: hotset.slice(0, 10)
  };

  return { hotset, watchlist, triggers, scorecard };
}

function averageSoftWeights(predictionsRows) {
  const sum = {};
  let n = 0;
  for (const row of predictionsRows) {
    if (!row.soft_weights || typeof row.soft_weights !== 'object') continue;
    n += 1;
    for (const [k, v] of Object.entries(row.soft_weights)) {
      sum[k] = (sum[k] || 0) + Number(v || 0);
    }
  }
  if (n === 0) return { NEUTRAL: 1 };
  const avg = {};
  for (const [k, v] of Object.entries(sum)) avg[k] = v / n;
  return normalizeSoftWeights(avg);
}

function getDateSeed(asofDate, baseSeed) {
  const numeric = Number(asofDate.replace(/-/g, ''));
  return Number(baseSeed || 42) + numeric;
}

function ensureModeInvariants(mode) {
  if (mode === 'CI' && process.env.RUBIKVAULT_MODELS_DIR) {
    throw new Error('CI_MODE_FORBIDS_RUBIKVAULT_MODELS_DIR');
  }
  if (mode === 'LOCAL' && !process.env.RUBIKVAULT_MODELS_DIR) {
    throw new Error('LOCAL_MODE_REQUIRES_RUBIKVAULT_MODELS_DIR');
  }
}

function loadWeightsForLocal(modelCard) {
  const envVar = modelCard?.weights_ref?.env_var || 'RUBIKVAULT_MODELS_DIR';
  const base = process.env[envVar];
  if (!base) throw new Error(`LOCAL_MODE_REQUIRES_${envVar}`);

  const vaultKey = modelCard?.weights_ref?.vault_key;
  if (!vaultKey) throw new Error('MODEL_CARD_MISSING_VAULT_KEY');

  const abs = path.join(base, vaultKey);
  if (!fs.existsSync(abs)) throw new Error(`WEIGHTS_MISSING:${abs}`);

  const expected = modelCard?.weights_ref?.content_hash;
  const actual = hashFile(abs);
  if (expected && expected !== actual) {
    throw new Error(`WEIGHT_HASH_MISMATCH:${expected}!=${actual}`);
  }

  const bytes = fs.readFileSync(abs);
  return {
    path: abs,
    hash: actual,
    coefficients: resolveWeightCoefficients(bytes, actual)
  };
}

function writeDiagnosticsSummary(repoRoot, asofDate, summaryDoc) {
  const outPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/monitoring', `${asofDate}.summary.json`);
  writeJsonAtomic(outPath, summaryDoc);
  return path.relative(repoRoot, outPath);
}

async function runDailyV6(options = {}) {
  const startedAt = Date.now();
  const repoRoot = options.repoRoot || process.cwd();
  const inputDir = options.inputDir || null;
  const mode = resolveMode(options.mode);
  const dryRun = Boolean(options.dryRun);
  ensureModeInvariants(mode);

  const { policies, policyHashes, policyPaths } = loadPolicies(repoRoot, inputDir);

  const trading = resolveTradingDate({
    repoRoot,
    requestedDate: options.date || null,
    timestamp: new Date(),
    timeZone: 'America/New_York',
    calendarRelPath: policies.trading_calendar.holiday_source
  });

  const asofDate = trading.asof_date;
  const generatedAt = nowIso();
  const provider = process.env.FORECAST_PROVIDER || policies.root.defaults?.provider || 'EODHD';

  const diagnostics = {
    checks: {
      dq: null,
      pit_universe: null,
      monitoring: null,
      schema: null,
      secrecy: null
    },
    data: {
      policy_paths: policyPaths,
      mode,
      dry_run: dryRun
    }
  };

  const universeDoc = readJson(resolveUniversePath(repoRoot, inputDir), []);
  const universeSymbols = parseUniverseDoc(universeDoc);

  const barsDataset = buildBarsManifest({
    repoRoot,
    asofDate,
    provider,
    symbols: universeSymbols,
    inputDir
  });

  const barsManifest = barsDataset.manifest;
  const barsManifestPath = path.join(repoRoot, 'mirrors/forecast/ledgers/bars_manifest', `${asofDate}.json`);
  if (!dryRun) {
    writeJsonAtomic(barsManifestPath, barsManifest);
  }

  const outcomeRevisionPeek = determineOutcomeRevision(repoRoot, asofDate, false).revision;

  const degrade = async (reason, extras = {}) => {
    const summaryDoc = {
      schema: 'forecast_diagnostics_summary_v6',
      meta: {
        asof_date: asofDate,
        mode,
        circuitOpen: true,
        reason,
        policy_hashes: policyHashes,
        bars_manifest_hash: barsManifest.bars_manifest_hash,
        outcome_revision: outcomeRevisionPeek,
        last_good_date_used: null,
        generated_at: generatedAt
      },
      checks: {
        ...diagnostics.checks,
        ...extras.checks
      },
      data: {
        ...diagnostics.data,
        ...extras.data
      }
    };

    const summaryPath = writeDiagnosticsSummary(repoRoot, asofDate, summaryDoc);

    let rollbackResult = { last_good_date_used: null, fallback_used: true, published: null };
    if (!dryRun) {
      rollbackResult = publishLastGoodOrFallback({
        repoRoot,
        asofDate,
        mode,
        policyHashes,
        barsManifestHash: barsManifest.bars_manifest_hash,
        outcomeRevision: outcomeRevisionPeek,
        reason,
        generatedAt,
        modelIds: [loadChampionModelCard(repoRoot).model_id]
      });
    }

    return {
      ok: true,
      degraded: true,
      circuitOpen: true,
      reason,
      asofDate,
      mode,
      summary_path: summaryPath,
      last_good_date_used: rollbackResult.last_good_date_used,
      published: rollbackResult.published,
      hashes: extras.hashes || {}
    };
  };

  // (3) Data quality checks
  const dq = runDQChecks({
    universeSymbols,
    barsBySymbol: barsDataset.barsBySymbol,
    asofDate,
    monitoringPolicy: policies.monitoring
  });
  diagnostics.checks.dq = dq;

  const dqPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/dq', `${asofDate}.json`);
  writeJsonAtomic(dqPath, {
    schema: 'forecast_dq_v6',
    asof_date: asofDate,
    ...dq
  });

  if (!dq.pass) {
    return degrade(dq.reason || 'DQ_FAILURE');
  }

  // (4) PIT universe reconstruction
  const pit = buildPITUniverse({
    repoRoot,
    asofDate,
    barsBySymbol: barsDataset.barsBySymbol,
    fallbackPolicy: policies.stratification_fallback
  });
  diagnostics.checks.pit_universe = {
    fallback_action: pit.fallback_action,
    gap_pct: pit.gap_pct,
    symbol_count: pit.rows.length,
    delisted_count: pit.delisted_symbols.length
  };

  writeJsonAtomic(path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/splits', `${asofDate}.json`), {
    schema: 'forecast_pit_universe_v6',
    asof_date: asofDate,
    ...pit
  });

  writeJsonAtomic(path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/universe_cache', `${asofDate}.json`), {
    schema: 'forecast_pit_universe_cache_v6',
    asof_date: asofDate,
    rows: pit.rows
  });

  if (pit.fallback_action === 'CIRCUIT_OPEN' || pit.rows.length === 0) {
    return degrade('PIT_UNIVERSE_GAP_CIRCUIT_OPEN');
  }

  // (5) Market proxy regime
  const regime = computeRegimeFromProxy({ repoRoot, asofDate });

  // (6) Stage1 candidates + deterministic control sampling
  const baseSeed = getDateSeed(asofDate, policies.root.determinism?.global_seed ?? 42);
  const candidateBuild = buildCandidatesWithControl({
    asofDate,
    symbols: pit.rows.map((row) => row.symbol),
    barsBySymbol: barsDataset.barsBySymbol,
    regimeBucket: regime.regime_bucket,
    baseSeed,
    featurePolicy: policies.feature,
    controlRatio: 0.2
  });

  const candidatesDoc = {
    schema: 'forecast_candidates_v6',
    asof_date: asofDate,
    rows: candidateBuild.rows,
    warnings: candidateBuild.warnings
  };

  if (!dryRun) {
    writeJsonAtomic(path.join(repoRoot, 'mirrors/forecast/ledgers/candidates', `${asofDate}.json`), candidatesDoc);
  }

  // (7) Stage2 features build (SSOT by_date)
  const featuresResult = buildFeaturesByDate({
    repoRoot,
    asofDate,
    candidates: candidateBuild.rows,
    barsBySymbol: barsDataset.barsBySymbol,
    memoryPolicy: policies.memory,
    featurePolicy: policies.feature,
    featureStorePolicy: policies.feature_store,
    dryRun
  });

  const featureGate = enforceFeaturePolicy({
    repoRoot,
    asofDate,
    featureRows: featuresResult.doc.rows,
    featurePolicy: policies.feature
  });

  if (!featureGate.ok) {
    return degrade(featureGate.reason || 'FEATURE_POLICY_VIOLATION', {
      hashes: {
        candidates: sha256Json(candidatesDoc),
        features: sha256Json(featuresResult.doc)
      }
    });
  }

  if (mode === 'LOCAL' && !dryRun) {
    syncFeatureBySymbolCache({
      repoRoot,
      mode,
      asofDate,
      featureRows: featuresResult.doc.rows
    });
  }

  // (8) Inference + calibration + fusion
  let predictionsRows = [];
  const modelCard = loadChampionModelCard(repoRoot);

  if (mode === 'LOCAL') {
    const localWeights = loadWeightsForLocal(modelCard);
    predictionsRows = generatePredictionsLocal({
      asofDate,
      featureRows: featuresResult.doc.rows,
      horizons: policies.root.horizons || [10, 20],
      modelCard,
      barsManifestHash: barsManifest.bars_manifest_hash,
      policyHashes,
      mode,
      marketProxyHash: regime.market_proxy_hash,
      weightsHash: localWeights.hash,
      coefficients: localWeights.coefficients
    });

    const avgSoftWeights = averageSoftWeights(predictionsRows.filter((row) => row.horizon_days === Number((policies.root.horizons || [10])[0])));
    const prevDate = previousTradingDay(asofDate, trading.calendar);
    const prevState = readMoeState(repoRoot, prevDate);
    const confidence = Math.max(...Object.values(avgSoftWeights));

    if (!dryRun) {
      updateMoeState({
        repoRoot,
        asofDate,
        calendar: trading.calendar,
        softWeights: avgSoftWeights,
        confidence,
        policyHash: policyHashes.moe_state,
        inputHashes: {
          market_proxy_hash: regime.market_proxy_hash,
          features_hash: featuresResult.features_hash,
          prev_state_hash: prevState?.state_hash || null
        },
        hysteresisPolicy: policies.moe?.hysteresis
      });

      const predPath = path.join(repoRoot, 'mirrors/forecast/ledgers/predictions', `${asofDate}.ndjson.zst`);
      appendNdjsonUnique(predPath, predictionsRows, 'prediction_id');
    }
  } else {
    const pred = readPredictionsForDate({ repoRoot, inputDir, asofDate });
    predictionsRows = pred.rows;
    diagnostics.data.ci_prediction_source = pred.path ? path.relative(repoRoot, pred.path) : null;

    if (!predictionsRows.length) {
      return degrade('MISSING_PREDICTIONS_OPTION_A', {
        hashes: {
          candidates: sha256Json(candidatesDoc),
          features: sha256Json(featuresResult.doc)
        }
      });
    }
  }

  const predictionsDoc = {
    schema: 'forecast_predictions_v6',
    asof_date: asofDate,
    rows: predictionsRows
  };

  // (9) Trigger engine
  const triggerPack = buildTriggers(predictionsRows);

  // (10) Monitoring + drift + shadow eval
  const monitoring = evaluateMonitoring({
    repoRoot,
    asofDate,
    predictions: predictionsRows,
    candidates: candidateBuild.rows,
    thresholds: policies.monitoring,
    shadowMetrics: mode === 'LOCAL' ? { logloss_delta: 0 } : null,
    backlogDays: 0
  });
  diagnostics.checks.monitoring = monitoring;

  // (11) Monitoring failure => rollback
  if (!monitoring.pass) {
    return degrade('MONITORING_THRESHOLD_BREACH', {
      data: { monitoring_breaches: monitoring.breaches },
      hashes: {
        candidates: sha256Json(candidatesDoc),
        features: sha256Json(featuresResult.doc),
        predictions: sha256Json(predictionsDoc),
        publish_inputs: sha256Json({ hotset: triggerPack.hotset, watchlist: triggerPack.watchlist, triggers: triggerPack.triggers, scorecard: triggerPack.scorecard })
      }
    });
  }

  // Secrecy gate before publish
  const secrecy = runSecrecyScan({ repoRoot, mode });
  diagnostics.checks.secrecy = secrecy;
  if (!secrecy.pass) {
    return degrade('SECRECY_SCAN_FAILED', {
      data: { secrecy_findings: secrecy.findings },
      hashes: {
        candidates: sha256Json(candidatesDoc),
        features: sha256Json(featuresResult.doc),
        predictions: sha256Json(predictionsDoc),
        publish_inputs: sha256Json({ hotset: triggerPack.hotset, watchlist: triggerPack.watchlist, triggers: triggerPack.triggers, scorecard: triggerPack.scorecard })
      }
    });
  }

  const diagnosticsSummary = {
    schema: 'forecast_diagnostics_summary_v6',
    meta: {
      asof_date: asofDate,
      mode,
      circuitOpen: false,
      reason: null,
      policy_hashes: policyHashes,
      bars_manifest_hash: barsManifest.bars_manifest_hash,
      outcome_revision: outcomeRevisionPeek,
      last_good_date_used: null,
      generated_at: generatedAt
    },
    checks: {
      dq,
      pit_universe: diagnostics.checks.pit_universe,
      monitoring,
      secrecy
    },
    data: {
      bars_missing_symbols: barsDataset.missingSymbols.slice(0, 100),
      candidate_count: candidateBuild.rows.length,
      feature_count: featuresResult.doc.rows.length,
      prediction_count: predictionsRows.length,
      warnings: candidateBuild.warnings
    }
  };

  const schemaBundle = {
    bars_manifest: barsManifest,
    candidates: candidatesDoc,
    features: featuresResult.doc,
    predictions: predictionsDoc,
    model_card: modelCard,
    diagnostics_summary: diagnosticsSummary
  };

  const schemaResult = validateV6Bundle({ repoRoot, bundle: schemaBundle });
  diagnostics.checks.schema = schemaResult;
  if (!schemaResult.ok) {
    return degrade('SCHEMA_VALIDATION_FAILED', {
      data: {
        schema_errors: schemaResult.failed
      },
      hashes: {
        candidates: sha256Json(candidatesDoc),
        features: sha256Json(featuresResult.doc),
        predictions: sha256Json(predictionsDoc),
        diagnostics_summary: sha256Json(diagnosticsSummary),
        publish_inputs: sha256Json({ hotset: triggerPack.hotset, watchlist: triggerPack.watchlist, triggers: triggerPack.triggers, scorecard: triggerPack.scorecard })
      }
    });
  }

  const summaryPath = writeDiagnosticsSummary(repoRoot, asofDate, diagnosticsSummary);

  // (12) Publish contract (atomic)
  let publishResult = {
    target_dir: null,
    files: []
  };

  if (!dryRun) {
    const publishDocs = buildPublishArtifacts({
      asofDate,
      mode,
      policyHashes,
      modelIds: [modelCard.model_id],
      barsManifestHash: barsManifest.bars_manifest_hash,
      outcomeRevision: outcomeRevisionPeek,
      circuitOpen: false,
      reason: null,
      lastGoodDateUsed: null,
      generatedAt,
      hotset: triggerPack.hotset,
      watchlist: triggerPack.watchlist,
      triggers: triggerPack.triggers,
      scorecard: triggerPack.scorecard,
      modelCard,
      diagnosticsSummary
    });

    publishResult = publishArtifactsAtomic({
      repoRoot,
      asofDate,
      artifacts: publishDocs
    });
  }

  // (13) Update last_good + feasibility metrics
  let feasibility = null;
  if (!dryRun) {
    registerSuccessfulPublish({ repoRoot, asofDate, reason: 'SUCCESS' });

    const pointerStats = readPointers(repoRoot).stats || {};
    feasibility = evaluateFeasibility({
      repoRoot,
      asofDate,
      policy: policies.feasibility,
      metrics: {
        training_time_minutes: (Date.now() - startedAt) / 60000,
        rollback_rate_week: Number(pointerStats.total_rollbacks_30d || 0) / 4,
        backlog_days: 0,
        memory_peak_mb: 0
      }
    });
  }

  // (14) Outcomes maturation pass (manifest-bound + revisioned stream)
  let outcomePass = {
    revision: outcomeRevisionPeek,
    matured_rows: [],
    pending_rows: [],
    backlog_days: 0,
    stream_writes: []
  };
  if (!dryRun) {
    outcomePass = runOutcomeMaturation({
      repoRoot,
      asofDate,
      predictionsRows,
      barsManifestHash: barsManifest.bars_manifest_hash,
      calendar: trading.calendar,
      outcomePolicy: policies.outcome,
      algorithmHash: sha256Json({ module: 'outcome_engine_v6', version: '1' })
    });
  }

  return {
    ok: true,
    degraded: false,
    circuitOpen: false,
    reason: null,
    asofDate,
    mode,
    dryRun,
    bars_manifest_hash: barsManifest.bars_manifest_hash,
    outcome_revision: outcomePass.revision,
    summary_path: summaryPath,
    published: publishResult,
    feasibility: feasibility?.action || null,
    hashes: {
      candidates: sha256Json(candidatesDoc),
      features: sha256Json(featuresResult.doc),
      predictions: sha256Json(predictionsDoc),
      diagnostics_summary: sha256Json(diagnosticsSummary),
      publish_inputs: sha256Json({ hotset: triggerPack.hotset, watchlist: triggerPack.watchlist, triggers: triggerPack.triggers, scorecard: triggerPack.scorecard })
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  runDailyV6({
    repoRoot: process.cwd(),
    date: args.date,
    mode: args.mode,
    dryRun: args.dryRun,
    inputDir: args.inputDir
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FORECAST_V6_FAILED: ${err.message}`);
      process.exit(1);
    });
}

export { runDailyV6 };
export default { runDailyV6 };
