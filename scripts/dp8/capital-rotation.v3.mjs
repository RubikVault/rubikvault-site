#!/usr/bin/env node
/**
 * Capital Rotation Monitor — Data Generation Script (dp8)
 *
 * Fetches EOD data for rotation universe symbols via EODHD,
 * computes ratios, RAM, z-scores, percentiles, block scores,
 * cycle, confirmations, divergences, and narrative.
 *
 * Outputs:
 *   public/data/v3/derived/market/capital-rotation/latest.json
 *   public/data/v3/derived/market/capital-rotation/summary.json
 *   public/data/v3/derived/market/capital-rotation/ratios/index.json
 *   public/data/v3/derived/market/capital-rotation/ratios/<id>.json
 *   public/data/snapshots/capital-rotation/latest.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';
import { buildEnvelope } from '../lib/envelope.js';

import { PARAMS_V1 } from '../lib/capital-rotation/params.js';
import { RATIO_UNIVERSE, getUniqueSymbols, getSymbolMeta, BLOCK_DEFS } from '../lib/capital-rotation/config.js';
import { isCrypto, alignToLastTradingDay } from '../lib/capital-rotation/calendars.js';
import { alignPair } from '../lib/capital-rotation/alignment.js';
import { computeRatioSeries, computeReturns, computeRollingVol, computeTrendSlope } from '../lib/capital-rotation/ratios.js';
import { winsorize, rollingZScore, mapZScoreToScore, computePercentileWindow } from '../lib/capital-rotation/standardize.js';
import { computeRAM, ramToScore, trendToScore, computeRatioComposite, computeBlockScore, computeGlobalScore, classifyRegime, computeConfidence, classifyConfidence, resolveNeutralMode, factorConcentrationPenalty } from '../lib/capital-rotation/scoring.js';
import { detectCyclePosition } from '../lib/capital-rotation/cycle.js';
import { checkCredit, checkDollar, checkRealRates, checkVIX } from '../lib/capital-rotation/confirmations.js';
import { detectDivergences } from '../lib/capital-rotation/divergences.js';
import { generateNarrative } from '../lib/capital-rotation/narrative.js';
import { checkStaleness, checkCoverage, validateOutputDoc } from '../lib/capital-rotation/validation.js';
import { fetchEodBars } from '../lib/v3/eodhd-fetch.mjs';

async function readJsonSafe(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return fallback; }
}

/**
 * Fetch historical bars from EODHD for a given symbol (via resilient fetch).
 */
async function fetchEodhdHistory(symbol, fromDate, toDate, apiKey) {
  const rawBars = await fetchEodBars(symbol, fromDate, toDate, apiKey);
  if (!rawBars || !rawBars.length) return null;
  return rawBars.map(bar => ({
    date: String(bar.date || '').slice(0, 10),
    open: Number(bar.open),
    close: Number(bar.adjusted_close ?? bar.close),
    volume: Number(bar.volume) || null
  })).filter(b => b.date && Number.isFinite(b.close) && b.close > 0);
}

/**
 * Main: generate capital rotation data.
 */
async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const apiKey = process.env.EODHD_API_KEY || process.env.EODHD_API_TOKEN;

  if (!apiKey) {
    console.error('[capital-rotation] EODHD_API_KEY not set. Exiting.');
    process.exit(1);
  }

  const now = new Date();
  const toDate = alignToLastTradingDay(now.toISOString().slice(0, 10));
  const fromD = new Date(now);
  fromD.setDate(fromD.getDate() - PARAMS_V1.maxCalendarDaysLookback);
  const fromDate = fromD.toISOString().slice(0, 10);

  console.log(`[capital-rotation] Generating data. Range: ${fromDate} → ${toDate}`);

  // Step 1: Fetch all symbol bars
  const symbols = getUniqueSymbols();
  console.log(`[capital-rotation] Fetching ${symbols.length} symbols from EODHD...`);

  const barCache = {};
  const fetchErrors = [];
  for (const sym of symbols) {
    const bars = await fetchEodhdHistory(sym, fromDate, toDate, apiKey);
    if (bars && bars.length > 0) {
      barCache[sym] = bars;
      console.log(`  ${sym}: ${bars.length} bars`);
    } else {
      fetchErrors.push(sym);
      console.warn(`  ${sym}: NO DATA`);
    }
  }

  // Step 2: Compute ratios
  const enabledRatios = RATIO_UNIVERSE.filter(r => r.enabled);
  const ratioResults = {};
  const ratioDetails = {};
  const warnings = [];

  for (const spec of enabledRatios) {
    const barsA = barCache[spec.symbolA];
    const barsB = barCache[spec.symbolB];

    if (!barsA || !barsB) {
      warnings.push(`${spec.id}: missing bars for ${!barsA ? spec.symbolA : spec.symbolB}`);
      ratioResults[spec.id] = { composite: null, status: 'unavailable', riskCluster: spec.riskCluster };
      continue;
    }

    const alignment = alignPair(barsA, barsB, spec.symbolA, spec.symbolB, { maxGapDays: PARAMS_V1.maxGapTradingDays });
    if (!alignment.aligned.length) {
      warnings.push(`${spec.id}: no aligned bars`);
      ratioResults[spec.id] = { composite: null, status: 'unavailable', riskCluster: spec.riskCluster };
      continue;
    }

    const ratioSeries = computeRatioSeries(alignment.aligned);
    const ratioValues = ratioSeries.map(r => r.value);
    const returns = computeReturns(ratioSeries, PARAMS_V1.returnWindows);
    const rollingVol = computeRollingVol(ratioSeries, PARAMS_V1.volatilityWindow);
    const slope = computeTrendSlope(ratioSeries, 60);

    // Standardize
    const winsorized = winsorize(ratioValues, PARAMS_V1.winsorLowerPct, PARAMS_V1.winsorUpperPct);
    const zScore = rollingZScore(winsorized, PARAMS_V1.zScoreWindow, PARAMS_V1.zScoreCapAbs);
    const zScoreMapped = mapZScoreToScore(zScore, PARAMS_V1.zScoreCapAbs);

    // Percentiles
    const pct5y = computePercentileWindow(ratioValues, 5);
    const pctLong = computePercentileWindow(ratioValues, 20);

    // RAM
    const ram = computeRAM(returns, rollingVol);
    const ramScore = ramToScore(ram.composite);
    const trendScore = trendToScore(slope);

    // Composite
    const composite = computeRatioComposite(ramScore, pct5y.percentile, zScoreMapped, trendScore);

    // Cycle
    const cycle = detectCyclePosition(pct5y.percentile, pctLong.percentile, zScore, ram.composite, slope);

    const isPartial = alignment.maxGap > PARAMS_V1.maxGapTradingDays || alignment.coverage < 0.8;
    if (isPartial) warnings.push(`${spec.id}: partial alignment (coverage: ${(alignment.coverage * 100).toFixed(0)}%, max gap: ${alignment.maxGap}d)`);

    ratioResults[spec.id] = {
      composite,
      ramComposite: ram.composite,
      ramScore,
      zScore,
      zScoreMapped,
      percentile5y: pct5y.percentile,
      percentileLong: pctLong.percentile,
      trendScore,
      slope,
      cycle: cycle.state,
      cycleConfidence: cycle.confidence,
      returns,
      category: spec.category,
      riskCluster: spec.riskCluster,
      status: isPartial ? 'partial' : 'ok',
      alignmentCoverage: alignment.coverage,
      barsUsed: alignment.aligned.length,
      windowYearsUsed5y: pct5y.windowYearsUsed,
      windowYearsUsedLong: pctLong.windowYearsUsed,
      limitedHistory: pct5y.limited
    };

    // Per-ratio detail (for lazy-load drilldown)
    const last60 = ratioSeries.slice(-60);
    ratioDetails[spec.id] = {
      id: spec.id,
      displayName: spec.displayName,
      symbolA: spec.symbolA,
      symbolB: spec.symbolB,
      category: spec.category,
      composite,
      returns,
      ram: ram.composite,
      zScore,
      percentile5y: pct5y.percentile,
      percentileLong: pctLong.percentile,
      windowYearsUsed5y: pct5y.windowYearsUsed,
      windowYearsUsedLong: pctLong.windowYearsUsed,
      limitedHistory: pct5y.limited,
      trendSlope: slope,
      cycle,
      sparkline: last60.map(r => ({ d: r.date, v: Math.round(r.value * 10000) / 10000 })),
      alignmentWarnings: alignment.warnings,
      barsUsed: alignment.aligned.length,
      asOfDate: toDate
    };
  }

  // Step 3: Block scores
  const blockScores = {};
  for (const [blockId, def] of Object.entries(BLOCK_DEFS)) {
    blockScores[blockId] = computeBlockScore(ratioResults, def.ratioIds);
    blockScores[blockId].label = def.label;
  }

  // Step 4: Global score
  const globalScore = computeGlobalScore(blockScores);
  const regime = classifyRegime(globalScore);

  // Step 5: Confirmations
  const hygLqd = ratioResults['HYG_LQD'];
  const uupBars = barCache['UUP.US'];
  const tipBars = barCache['TIP.US'];

  // For dollar/rates, compute simple returns from raw bars
  function simpleReturns(bars) {
    if (!bars || bars.length < 252) return null;
    const result = {};
    const latest = bars[bars.length - 1].close;
    for (const w of [21, 63]) {
      const idx = bars.length - 1 - w;
      if (idx >= 0 && bars[idx].close > 0) result[w] = (latest - bars[idx].close) / bars[idx].close;
    }
    return Object.keys(result).length ? result : null;
  }

  // Vol Z from global-latest if available, else null
  const globalLatest = await readJsonSafe(path.join(rootDir, 'public/data/v3/derived/market/global-latest.json'), null);
  const volZ = globalLatest?.data?.regime_details?.vol_z ?? null;

  const confirmations = {
    credit: checkCredit(hygLqd),
    dollar: checkDollar(simpleReturns(uupBars)),
    realRates: checkRealRates(simpleReturns(tipBars)),
    vix: checkVIX(volZ)
  };

  // Step 6: Divergences
  const divergences = detectDivergences({
    ratioResults, globalScore, blockScores, confirmations, asOfDate: toDate
  });

  // Step 7: Confidence
  const coverage = checkCoverage(ratioResults, enabledRatios.length);
  const staleDays = 0; // We just generated it
  const concentrationPenalty = factorConcentrationPenalty(ratioResults);
  const confidenceRaw = computeConfidence(blockScores, coverage, staleDays, divergences.length);
  const confidence = Math.max(0, confidenceRaw - concentrationPenalty);
  const confidenceLabel = classifyConfidence(confidence);
  const neutralMode = resolveNeutralMode(globalScore, blockScores);

  // Step 8: Narrative
  const narrative = generateNarrative({
    globalScore, regime, confidence, confidenceLabel, neutralMode,
    blockScores, cycle: detectCyclePosition(
      blockScores.macroRegime?.score, null, null, 0, null
    ), confirmations, divergences
  });

  // Step 9: Sector relative data for scatter plot
  const sectorRelative = {};
  for (const spec of enabledRatios.filter(r => r.category === 'sector')) {
    const r = ratioResults[spec.id];
    if (!r || r.composite == null) continue;
    // RS = composite, Momentum = ramScore
    const quadrant = (r.composite >= 50 && r.ramScore >= 50) ? 'Leading'
      : (r.composite < 50 && r.ramScore >= 50) ? 'Improving'
      : (r.composite >= 50 && r.ramScore < 50) ? 'Weakening'
      : 'Lagging';
    sectorRelative[spec.id] = {
      displayName: spec.displayName,
      rsScore: r.composite,
      momScore: r.ramScore,
      quadrant,
      cycle: r.cycle
    };
  }

  // Step 10: Key cards
  const sortedRatios = Object.entries(ratioResults)
    .filter(([, r]) => r.composite != null)
    .sort(([, a], [, b]) => b.composite - a.composite);

  const keyCards = [
    { title: 'Top Rotation', value: sortedRatios[0]?.[0] || '—', direction: 'up', detail: `Score: ${sortedRatios[0]?.[1]?.composite || '—'}` },
    { title: 'Weakest', value: sortedRatios[sortedRatios.length - 1]?.[0] || '—', direction: 'down', detail: `Score: ${sortedRatios[sortedRatios.length - 1]?.[1]?.composite || '—'}` },
    { title: divergences.length ? 'Key Divergence' : 'Key Risk', value: divergences[0]?.title || (confidenceLabel === 'Low' ? 'Low Confidence' : 'None'), direction: divergences.length ? 'alert' : 'neutral', detail: divergences[0]?.explanation?.slice(0, 80) || '' }
  ];

  // Step 11: Build ratios output (slim)
  const ratiosSlim = {};
  for (const [id, r] of Object.entries(ratioResults)) {
    ratiosSlim[id] = {
      composite: r.composite,
      ram: r.ramComposite != null ? Math.round(r.ramComposite * 1000) / 1000 : null,
      zScore: r.zScore != null ? Math.round(r.zScore * 100) / 100 : null,
      percentile5y: r.percentile5y,
      trendScore: r.trendScore,
      cycle: r.cycle,
      category: r.category,
      status: r.status,
      returns: r.returns ? { '21': r.returns[21] != null ? Math.round(r.returns[21] * 10000) / 10000 : null, '63': r.returns[63] != null ? Math.round(r.returns[63] * 10000) / 10000 : null, '126': r.returns[126] != null ? Math.round(r.returns[126] * 10000) / 10000 : null, '252': r.returns[252] != null ? Math.round(r.returns[252] * 10000) / 10000 : null } : null
    };
  }

  const staleStatus = checkStaleness(toDate);

  // Assemble data payload
  const dataPayload = {
    globalScore: {
      value: globalScore,
      regime,
      confidence: Math.round(confidence * 100) / 100,
      confidenceLabel,
      neutralMode
    },
    blocks: blockScores,
    cycle: detectCyclePosition(
      blockScores.macroRegime?.score, null, null, 0, null
    ),
    confirmations,
    divergences,
    narrative,
    ratios: ratiosSlim,
    keyCards,
    sectorRelative,
    meta: {
      status: coverage < 0.5 ? 'partial' : 'ok',
      coverage,
      staleStatus,
      warnings,
      asOfDate: toDate,
      timezone: 'US/Eastern',
      tradingCalendar: 'NYSE',
      dataSourcesUsed: ['eodhd'],
      fetchErrors,
      longWindowYearsUsed: null,
      scoreComponentsVersion: PARAMS_V1.scoreVersion,
      paramsVersion: PARAMS_V1.paramsVersion,
      returnType: 'price-return',
      returnTypeLimitation: 'V1 uses price return, not total return. Dividends not reflected in ratio calculations.'
    }
  };

  // Validate
  const latestDoc = buildEnvelope(dataPayload, {
    module: 'capital-rotation',
    tier: 'derived',
    domain: 'market',
    source: 'eodhd-derived',
    expected_count: enabledRatios.length
  });

  const validation = validateOutputDoc({ data: dataPayload, metadata: latestDoc.metadata });
  if (!validation.valid) {
    console.error('[capital-rotation] Validation errors:', validation.errors);
  }

  // Step 12: Write outputs
  const outBase = 'public/data/v3/derived/market/capital-rotation';
  await fs.mkdir(path.join(rootDir, outBase, 'ratios'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'public/data/snapshots/capital-rotation'), { recursive: true });

  // latest.json (full)
  const latestResult = await writeJsonArtifact(rootDir, `${outBase}/latest.json`, latestDoc);
  console.log(`[capital-rotation] latest.json: ${latestResult.bytes} bytes`);

  // summary.json (lean)
  const summaryDoc = {
    globalScore: dataPayload.globalScore,
    blocks: Object.fromEntries(Object.entries(blockScores).map(([k, v]) => [k, { score: v.score, label: v.label }])),
    narrative: dataPayload.narrative,
    keyCards: dataPayload.keyCards,
    sectorRelative: dataPayload.sectorRelative,
    cycle: dataPayload.cycle,
    confirmations: Object.fromEntries(Object.entries(confirmations).map(([k, v]) => [k, { direction: v.direction, strength: v.strength, supportsRotation: v.supportsRotation, state: v.state }])),
    divergenceCount: divergences.length,
    topDivergence: divergences[0] || null,
    meta: { asOfDate: toDate, staleStatus, coverage, paramsVersion: PARAMS_V1.paramsVersion, generatedAt: runContext.generatedAt }
  };
  const summaryResult = await writeJsonArtifact(rootDir, `${outBase}/summary.json`, summaryDoc);
  console.log(`[capital-rotation] summary.json: ${summaryResult.bytes} bytes`);

  // ratios/index.json
  const ratioIndex = enabledRatios.map(spec => {
    const r = ratioResults[spec.id];
    return {
      id: spec.id,
      displayName: spec.displayName,
      category: spec.category,
      composite: r?.composite ?? null,
      ram: r?.ramComposite != null ? Math.round(r.ramComposite * 1000) / 1000 : null,
      cycle: r?.cycle || null,
      status: r?.status || 'unavailable'
    };
  });
  const indexResult = await writeJsonArtifact(rootDir, `${outBase}/ratios/index.json`, ratioIndex);
  console.log(`[capital-rotation] ratios/index.json: ${indexResult.bytes} bytes`);

  // Individual ratio detail files
  for (const [id, detail] of Object.entries(ratioDetails)) {
    await writeJsonArtifact(rootDir, `${outBase}/ratios/${id}.json`, detail);
  }
  console.log(`[capital-rotation] Wrote ${Object.keys(ratioDetails).length} ratio detail files`);

  // Snapshot copy for API serving
  await writeJsonArtifact(rootDir, 'public/data/snapshots/capital-rotation/latest.json', latestDoc);

  console.log(`[capital-rotation] Done. Global score: ${globalScore}/100 (${regime}), Confidence: ${confidenceLabel}, Ratios: ${Object.keys(ratiosSlim).length}/${enabledRatios.length}`);
}

main().catch(err => {
  console.error('[capital-rotation] Fatal error:', err);
  process.exit(1);
});
