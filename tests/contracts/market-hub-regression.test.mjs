#!/usr/bin/env node
/**
 * Contract Test: Market Hub Regression Guards (P8)
 *
 * Validates:
 * 1. Narrative dictionary completeness — all codes used by backend are defined
 * 2. Artifact contract graduated states work correctly
 * 3. Global-market-hub cards have structured narrative payload (no freeform tldr)
 * 4. Frontend dictionary file exists and matches source
 * 5. Trading-day awareness functions return sane values
 * 6. Ops-grid schema is valid
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ArtifactState,
  validateArtifact,
  tradingDaysBetween,
  isTradingDay,
} from '../../scripts/lib/v3/artifact-contract.mjs';

const ROOT = process.cwd();
let failures = 0;
let passes = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failures++;
  } else {
    passes++;
  }
}

async function readJson(relPath) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return null;
  }
}

// ─── Test 1: Narrative Dictionary Completeness ──────────────────────────

async function testNarrativeDictionary() {
  console.log('Testing narrative dictionary...');
  const dict = await readJson('config/market-hub/narrative-dictionary.json');
  assert(dict !== null, 'narrative-dictionary.json must exist');
  if (!dict) return;

  assert(dict.schema === 'rv.config.narrative-dictionary.v1', 'schema must be rv.config.narrative-dictionary.v1');

  // All phase codes used by backend must be defined
  const requiredPhases = ['EARLY', 'MID', 'LATE', 'EXHAUSTED', 'REVERSAL_RISK', 'NEUTRAL'];
  for (const p of requiredPhases) {
    assert(dict.phase?.[p], `phase.${p} must be defined`);
    assert(dict.phase?.[p]?.label, `phase.${p}.label must exist`);
    assert(dict.phase?.[p]?.tooltip, `phase.${p}.tooltip must exist`);
    assert(dict.phase?.[p]?.short, `phase.${p}.short must exist`);
  }

  // Confidence levels
  for (const c of ['HIGH', 'MEDIUM', 'LOW']) {
    assert(dict.confidence?.[c], `confidence.${c} must be defined`);
    assert(dict.confidence?.[c]?.tooltip, `confidence.${c}.tooltip must exist`);
  }

  // Regime modes
  for (const r of ['NORMAL', 'STRESS', 'CRISIS']) {
    assert(dict.regime?.[r], `regime.${r} must be defined`);
    assert(dict.regime?.[r]?.tooltip, `regime.${r}.tooltip must exist`);
  }

  // Score bands
  for (const b of ['bullish', 'neutral', 'bearish']) {
    assert(dict.score_bands?.[b], `score_bands.${b} must be defined`);
  }

  // Flow direction
  for (const d of ['bullish', 'bearish', 'neutral']) {
    assert(dict.flow_direction?.[d], `flow_direction.${d} must be defined`);
  }

  // Phase reason codes — all backend codes must be documented
  const requiredReasons = [
    'MOMENTUM_SHORT_POSITIVE', 'MEDIUM_NOT_YET', 'MOMENTUM_STACKED_POSITIVE',
    'SHORT_MOMENTUM_FADING', 'TREND_OVERHEATED', 'VOLATILITY_SPIKE',
    'MOMENTUM_DIVERGENCE', 'TREND_BREAKDOWN', 'FLOWZ_POSITIVE', 'FLOWZ_NEGATIVE'
  ];
  for (const code of requiredReasons) {
    assert(dict.phase_reason_codes?.[code], `phase_reason_codes.${code} must be defined`);
  }

  // Setup quality
  for (const sq of ['bullish-reversal', 'bullish-continuation', 'caution-overextended', 'bearish-continuation', 'neutral']) {
    assert(dict.setup_quality?.[sq], `setup_quality.${sq} must be defined`);
  }

  // Data status
  for (const ds of ['fresh', 'stale_warning', 'stale_degraded', 'fallback', 'missing']) {
    assert(dict.data_status?.[ds], `data_status.${ds} must be defined`);
  }
}

// ─── Test 2: Frontend Dictionary Exists ─────────────────────────────────

async function testFrontendDictionary() {
  console.log('Testing frontend dictionary...');
  const pubDict = await readJson('public/config/narrative-dictionary.json');
  const srcDict = await readJson('config/market-hub/narrative-dictionary.json');
  assert(pubDict !== null, 'public/config/narrative-dictionary.json must exist');
  if (!pubDict || !srcDict) return;
  assert(pubDict.schema === srcDict.schema, 'public and source dictionary schemas must match');
  // Check key sections exist in public copy
  assert(pubDict.phase?.EARLY?.label === srcDict.phase?.EARLY?.label, 'phase labels must match between source and public');
}

// ─── Test 3: Graduated Artifact States ──────────────────────────────────

async function testArtifactStates() {
  console.log('Testing artifact contract graduated states...');

  // ArtifactState must have graduated levels
  assert(ArtifactState.FRESH === 'FRESH', 'FRESH state must exist');
  assert(ArtifactState.STALE_WARNING === 'STALE_WARNING', 'STALE_WARNING state must exist');
  assert(ArtifactState.STALE_DEGRADED === 'STALE_DEGRADED', 'STALE_DEGRADED state must exist');
  assert(ArtifactState.MISSING === 'MISSING', 'MISSING state must exist');
  assert(ArtifactState.INVALID === 'INVALID', 'INVALID state must exist');
  assert(ArtifactState.UNTIMED === 'UNTIMED', 'UNTIMED state must exist');

  // Ensure old STALE state is gone (replaced by graduated states)
  assert(!ArtifactState.STALE, 'Legacy STALE state must not exist (use STALE_WARNING/STALE_DEGRADED)');
}

// ─── Test 4: Trading-Day Awareness ──────────────────────────────────────

function testTradingDays() {
  console.log('Testing trading-day awareness...');

  // Monday to Friday = 4 trading days
  assert(tradingDaysBetween('2025-01-06', '2025-01-10') === 4, 'Mon-Fri should be 4 trading days');

  // Friday to Monday = 0 trading days (weekend)
  assert(tradingDaysBetween('2025-01-10', '2025-01-12') === 0, 'Fri-Sun should be 0 trading days');

  // Friday to next Monday = 1 trading day
  assert(tradingDaysBetween('2025-01-10', '2025-01-13') === 1, 'Fri-Mon should be 1 trading day');

  // Same day = 0
  assert(tradingDaysBetween('2025-01-10', '2025-01-10') === 0, 'Same day should be 0');

  // Weekend day check
  assert(!isTradingDay('2025-01-11'), 'Saturday should not be a trading day');
  assert(!isTradingDay('2025-01-12'), 'Sunday should not be a trading day');
  assert(isTradingDay('2025-01-13'), 'Monday should be a trading day');
}

// ─── Test 5: Global Market Cards Have Structured Narrative ──────────────

async function testCardNarrative() {
  console.log('Testing card narrative structure...');
  const doc = await readJson('public/data/v3/derived/market/global-latest.json');
  if (!doc) { console.log('SKIP: global-latest.json not found'); return; }

  const cards = doc.data?.cards || {};
  const cardEntries = Object.entries(cards);
  if (!cardEntries.length) { console.log('SKIP: no cards in global-latest.json'); return; }

  for (const [id, card] of cardEntries.slice(0, 5)) { // sample first 5
    // New cards should have narrative object (not tldr string)
    if (card.narrative) {
      assert(typeof card.narrative.phase_code === 'string', `Card ${id} narrative.phase_code must be string`);
      assert(typeof card.narrative.confidence_code === 'string', `Card ${id} narrative.confidence_code must be string`);
      assert(typeof card.narrative.score_band === 'string', `Card ${id} narrative.score_band must be string`);
      assert(Array.isArray(card.narrative.reason_codes), `Card ${id} narrative.reason_codes must be array`);
      assert(typeof card.narrative.severity === 'string', `Card ${id} narrative.severity must be string`);
      // Must NOT have tldr (freeform text should be gone)
      assert(!card.tldr, `Card ${id} should not have tldr (replaced by narrative)`);
    }
    // score_band must exist on new cards
    if (card.score_band) {
      assert(['bullish', 'neutral', 'bearish'].includes(card.score_band),
        `Card ${id} score_band must be bullish/neutral/bearish, got: ${card.score_band}`);
    }
  }
}

// ─── Test 6: Ops Grid Schema ────────────────────────────────────────────

async function testOpsGrid() {
  console.log('Testing ops-grid schema...');
  const grid = await readJson('public/data/v3/system/ops-grid.json');
  if (!grid) { console.log('SKIP: ops-grid.json not found (first run)'); return; }

  assert(grid.schema === 'rv.ops-grid.v1', 'ops-grid schema must be rv.ops-grid.v1');
  assert(typeof grid.pipelines === 'object', 'ops-grid.pipelines must be object');
  assert(grid.updated_at, 'ops-grid.updated_at must exist');

  if (grid.pipelines['dp8-market-hub']) {
    const entry = grid.pipelines['dp8-market-hub'];
    assert(entry.last_run, 'dp8-market-hub.last_run must exist');
    assert(typeof entry.healthy === 'boolean', 'dp8-market-hub.healthy must be boolean');
    assert(typeof entry.fresh === 'number', 'dp8-market-hub.fresh must be number');
    assert(typeof entry.total === 'number', 'dp8-market-hub.total must be number');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  await testNarrativeDictionary();
  await testFrontendDictionary();
  await testArtifactStates();
  testTradingDays();
  await testCardNarrative();
  await testOpsGrid();

  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures > 0) {
    console.error(`\n${failures} regression(s) found.`);
    process.exitCode = 1;
  } else {
    console.log('All regression guards passed.');
  }
}

main().catch((e) => {
  console.error(`REGRESSION_TEST_FAILED: ${e.message}`);
  process.exitCode = 1;
});
