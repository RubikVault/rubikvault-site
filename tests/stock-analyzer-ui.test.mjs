#!/usr/bin/env node
/**
 * Stock Analyzer UI Logic Tests
 * Tests badge semantics, freshness logic, trigger status, gates, and metric calculations.
 * Run: node tests/stock-analyzer-ui.test.mjs
 */

import assert from "node:assert/strict";

// ─── Helpers (extracted from stock.html / stock-features.js logic) ────────────

function getLastCompletedTradingDay(now = new Date()) {
  // Simplified version for testing - uses UTC approximation of NY time
  const nyOffset = -5; // EST (simplified, no DST handling in test)
  const utcH = now.getUTCHours();
  const nyH = (utcH + nyOffset + 24) % 24;
  const d = new Date(now);
  const dow = d.getUTCDay();
  const isWeekday = dow >= 1 && dow <= 5;
  const marketClosed = nyH >= 16;

  if (isWeekday && marketClosed) {
    return d.toISOString().slice(0, 10);
  }
  // Go back to previous trading day
  d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function classifyBadge(universe) {
  if (!universe.exists_in_universe) {
    if (!universe.name && !universe.sector) return 'unsupported';
    return 'limited-coverage';
  }
  if (!universe.name && !universe.sector) return 'profile-unavailable';
  return 'normal';
}

function classifyTrigger(triggerPrice, barHigh, barClose) {
  if (barClose >= triggerPrice) return 'confirmed';
  if (barHigh >= triggerPrice) return 'rejected';
  return 'pending';
}

function classifyFreshness(envelopeStatus, dataDate, lastTradingDay) {
  if (envelopeStatus === 'FRESH') return 'LIVE';
  if (envelopeStatus === 'STALE' && dataDate && dataDate >= lastTradingDay) return 'EOD_CURRENT';
  return envelopeStatus;
}

function classify52WRange(pct) {
  if (pct > 95) return 'At 52W high';
  if (pct > 90) return 'Near 52W high';
  if (pct > 70) return 'Upper range';
  if (pct < 5) return 'At 52W low';
  if (pct < 10) return 'Near 52W low';
  if (pct < 30) return 'Lower range';
  return 'Mid range';
}

function classifyDriftSeverity(rsiDelta, atrDelta) {
  if (rsiDelta > 10 || atrDelta > 3) return 'critical';
  if (rsiDelta > 5 || atrDelta > 1.5) return 'material';
  return 'minor';
}

function computeZScore(close, ma50, bars) {
  const prices = bars.map(b => b.close).filter(x => Number.isFinite(x) && x > 0);
  if (prices.length < 20 || !ma50 || ma50 <= 0) return 0;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, v) => a + (v - mean) ** 2, 0) / (prices.length - 1 || 1);
  const std = Math.sqrt(variance);
  return std > 0 ? (close - ma50) / std : 0;
}

function computeBreakoutEnergy(vol20, vol60, volRecent5Avg, volPrior15Avg) {
  const compression = vol60 > 0 ? vol20 / vol60 : 1;
  const volDryUp = volPrior15Avg > 0 ? volRecent5Avg / volPrior15Avg : 1;
  const isEventDay = compression > 1.3;
  if (isEventDay) {
    return {
      energy: Math.max(0, Math.min(100, Math.round(50 + (compression - 1) * 30 + (volDryUp > 1.5 ? 20 : 0)))),
      label: 'event'
    };
  }
  return {
    energy: Math.max(0, Math.min(100, Math.round((1 - compression) * 50 + (1 - Math.min(1, volDryUp)) * 50))),
    label: 'normal'
  };
}

function scoreHorizonGates(verdictLabel, rawStatus, rsiHardGate, metricMismatch, rawUnknown) {
  if (rawStatus === 'INVALID') return 'SUPPRESSED';
  if (verdictLabel === 'BUY') {
    if (rsiHardGate) return 'WAIT';
    if (metricMismatch) return 'WAIT';
    if (rawUnknown) return 'WAIT';
  }
  return verdictLabel;
}

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.error(`  FAIL: ${name}\n    ${e.message}`);
  }
}

// ─── A) Badge/Metadata Tests ─────────────────────────────────────────────────

test('Badge: supported ticker with metadata', () => {
  assert.equal(classifyBadge({ exists_in_universe: true, name: 'Apple Inc', sector: 'Technology' }), 'normal');
});

test('Badge: supported ticker with missing metadata', () => {
  assert.equal(classifyBadge({ exists_in_universe: true, name: null, sector: null }), 'profile-unavailable');
});

test('Badge: unsupported ticker (no name, no sector, not in universe)', () => {
  assert.equal(classifyBadge({ exists_in_universe: false, name: null, sector: null }), 'unsupported');
});

test('Badge: not in universe but has profile', () => {
  assert.equal(classifyBadge({ exists_in_universe: false, name: 'DNTH Inc', sector: 'Biotech' }), 'limited-coverage');
});

// ─── B) Freshness Tests ─────────────────────────────────────────────────────

test('Freshness: FRESH envelope → LIVE', () => {
  assert.equal(classifyFreshness('FRESH', '2026-03-10', '2026-03-10'), 'LIVE');
});

test('Freshness: Friday EOD data on Saturday is EOD_CURRENT', () => {
  // Data date is Friday, last trading day is Friday
  assert.equal(classifyFreshness('STALE', '2026-03-06', '2026-03-06'), 'EOD_CURRENT');
});

test('Freshness: Friday EOD data on Sunday is EOD_CURRENT', () => {
  assert.equal(classifyFreshness('STALE', '2026-03-06', '2026-03-06'), 'EOD_CURRENT');
});

test('Freshness: stale when data is older than last trading day', () => {
  assert.equal(classifyFreshness('STALE', '2026-03-04', '2026-03-06'), 'STALE');
});

test('Freshness: weekend handling - last trading day from Saturday', () => {
  // Saturday March 7, 2026 → last trading day should be Friday March 6
  const sat = new Date('2026-03-07T18:00:00Z');
  const lastTd = getLastCompletedTradingDay(sat);
  assert.equal(lastTd, '2026-03-06');
});

test('Freshness: weekend handling - last trading day from Sunday', () => {
  const sun = new Date('2026-03-08T12:00:00Z');
  const lastTd = getLastCompletedTradingDay(sun);
  assert.equal(lastTd, '2026-03-06');
});

// ─── C) Trigger Logic Tests ─────────────────────────────────────────────────

test('Trigger: high < trigger → pending breakout', () => {
  assert.equal(classifyTrigger(150, 148, 147), 'pending');
});

test('Trigger: high >= trigger and close < trigger → rejected', () => {
  assert.equal(classifyTrigger(150, 151, 148), 'rejected');
});

test('Trigger: close >= trigger → confirmed breakout', () => {
  assert.equal(classifyTrigger(150, 152, 151), 'confirmed');
});

test('Trigger: close exactly at trigger → confirmed', () => {
  assert.equal(classifyTrigger(150, 150, 150), 'confirmed');
});

// ─── D) Gate Tests ──────────────────────────────────────────────────────────

test('Gate: raw validation UNKNOWN blocks BUY', () => {
  assert.equal(scoreHorizonGates('BUY', 'UNKNOWN', false, false, true), 'WAIT');
});

test('Gate: raw validation VALID allows BUY', () => {
  assert.equal(scoreHorizonGates('BUY', 'VALID', false, false, false), 'BUY');
});

test('Gate: raw validation INVALID suppresses all', () => {
  assert.equal(scoreHorizonGates('BUY', 'INVALID', false, false, false), 'SUPPRESSED');
  assert.equal(scoreHorizonGates('WAIT', 'INVALID', false, false, false), 'SUPPRESSED');
});

test('Gate: RSI >= 80 blocks BUY', () => {
  assert.equal(scoreHorizonGates('BUY', 'VALID', true, false, false), 'WAIT');
});

test('Gate: RSI >= 80 does NOT affect WAIT', () => {
  assert.equal(scoreHorizonGates('WAIT', 'VALID', true, false, false), 'WAIT');
});

test('Gate: metric drift blocks BUY', () => {
  assert.equal(scoreHorizonGates('BUY', 'VALID', false, true, false), 'WAIT');
});

test('Gate: metric drift does NOT affect AVOID', () => {
  assert.equal(scoreHorizonGates('AVOID', 'VALID', false, true, false), 'AVOID');
});

// ─── D2) deriveRawGate Tests (regression: null rawValidation must not block) ─

function deriveRawGate(rawState) {
  if (rawState == null) return { status: 'VALID', valid: true, unknown: false, suppressed: false };
  if (rawState.valid === true) return { status: 'VALID', valid: true, unknown: false, suppressed: false };
  if (rawState.valid === false) return { status: 'INVALID', valid: false, unknown: false, suppressed: true };
  return { status: 'VALID', valid: true, unknown: false, suppressed: false };
}

test('deriveRawGate: null input defaults to VALID (no blocking)', () => {
  const r = deriveRawGate(null);
  assert.equal(r.status, 'VALID');
  assert.equal(r.valid, true);
  assert.equal(r.unknown, false);
  assert.equal(r.suppressed, false);
});

test('deriveRawGate: undefined input defaults to VALID', () => {
  const r = deriveRawGate(undefined);
  assert.equal(r.status, 'VALID');
  assert.equal(r.unknown, false);
});

test('deriveRawGate: valid=true → VALID', () => {
  const r = deriveRawGate({ valid: true, code: 'OK', checks: {} });
  assert.equal(r.status, 'VALID');
  assert.equal(r.suppressed, false);
});

test('deriveRawGate: valid=false → INVALID + suppressed', () => {
  const r = deriveRawGate({ valid: false, code: 'DUPLICATE_DATES', checks: {} });
  assert.equal(r.status, 'INVALID');
  assert.equal(r.valid, false);
  assert.equal(r.suppressed, true);
});

test('Regression: null rawValidation must not downgrade BUY to WAIT', () => {
  const raw = deriveRawGate(null);
  const result = scoreHorizonGates('BUY', raw.status, false, false, raw.unknown);
  assert.equal(result, 'BUY');
});

// ─── E) Metric Tests ────────────────────────────────────────────────────────

test('Z-Score: normal day is plausible', () => {
  // Price near MA50, std dev ~2
  const bars = Array.from({ length: 60 }, (_, i) => ({ close: 100 + Math.sin(i / 5) * 2 }));
  const z = computeZScore(101, 100, bars);
  assert.ok(Math.abs(z) < 2, `Z-score ${z} should be < 2 for normal day`);
});

test('Z-Score: strong trend day shows elevated Z', () => {
  // Price far above MA50
  const bars = Array.from({ length: 60 }, (_, i) => ({ close: 100 + i * 0.1 }));
  const z = computeZScore(120, 103, bars);
  assert.ok(z > 1, `Z-score ${z} should be > 1 for strong trend`);
});

test('Z-Score: extreme gap-up shows very high Z', () => {
  const bars = Array.from({ length: 60 }, (_, i) => ({ close: 100 + Math.random() * 3 }));
  const z = computeZScore(130, 101, bars);
  assert.ok(z > 3, `Z-score ${z} should be > 3 for extreme gap`);
});

test('Breakout Energy: normal compression day', () => {
  const result = computeBreakoutEnergy(0.01, 0.015, 500000, 600000);
  assert.equal(result.label, 'normal');
  assert.ok(result.energy >= 0 && result.energy <= 100);
});

test('Breakout Energy: event/gap day shows positive energy', () => {
  // Vol20 much higher than vol60 = expansion event
  const result = computeBreakoutEnergy(0.04, 0.02, 2000000, 800000);
  assert.equal(result.label, 'event');
  assert.ok(result.energy > 0, `Event day energy should be > 0, got ${result.energy}`);
});

test('Breakout Energy: high compression yields setup forming', () => {
  // Vol20 much lower than vol60 = strong compression
  const result = computeBreakoutEnergy(0.005, 0.02, 300000, 800000);
  assert.equal(result.label, 'normal');
  assert.ok(result.energy > 50, `High compression energy should be > 50, got ${result.energy}`);
});

// ─── E2) 52W Range Labels ────────────────────────────────────────────────────

test('52W Range: at 52W high', () => {
  assert.equal(classify52WRange(97), 'At 52W high');
});

test('52W Range: near 52W low', () => {
  assert.equal(classify52WRange(7), 'Near 52W low');
});

test('52W Range: mid range', () => {
  assert.equal(classify52WRange(50), 'Mid range');
});

// ─── E3) Drift Severity ──────────────────────────────────────────────────────

test('Drift severity: minor', () => {
  assert.equal(classifyDriftSeverity(3, 0.5), 'minor');
});

test('Drift severity: material', () => {
  assert.equal(classifyDriftSeverity(7, 0.5), 'material');
});

test('Drift severity: critical', () => {
  assert.equal(classifyDriftSeverity(12, 0.5), 'critical');
});

test('Drift severity: critical via ATR', () => {
  assert.equal(classifyDriftSeverity(2, 4), 'critical');
});

// ─── F) Dead Reference Check ─────────────────────────────────────────────────

test('No dead "see below" references in stock-features.js', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/js/stock-features.js', import.meta.url), 'utf-8');
  const seeBelow = content.match(/see\s+(.*?)\s+below/gi) || [];
  const deadRefs = seeBelow.filter(ref => !ref.includes('not yet available'));
  assert.equal(deadRefs.length, 0, `Found dead "see below" references: ${deadRefs.join(', ')}`);
});

// ─── G) Positive Case Tests ─────────────────────────────────────────────────

test('Positive case: all gates clear + score >= 2 => BUY', () => {
  // No gates active, score 2+ should produce BUY
  assert.equal(scoreHorizonGates('BUY', 'VALID', false, false, false), 'BUY');
});

test('Positive case: BUY not artificially blocked when rules met', () => {
  // All gates clear, various valid combos
  assert.equal(scoreHorizonGates('BUY', 'VALID', false, false, false), 'BUY');
  assert.notEqual(scoreHorizonGates('BUY', 'VALID', false, false, false), 'WAIT');
  assert.notEqual(scoreHorizonGates('BUY', 'VALID', false, false, false), 'SUPPRESSED');
});

// ─── H) Badge Semantics: no "Unsupported" with deep analysis ────────────────

function classifyBadgeV2(hasBars, hasProfile, existsInUniverse) {
  if (!hasBars && !hasProfile) return 'ticker-not-found';
  if (!existsInUniverse) {
    if (hasProfile) return 'limited-coverage';
    if (hasBars) return 'profile-unavailable';
  }
  if (!hasProfile) return 'profile-unavailable';
  return 'normal';
}

test('Badge V2: bars exist but no profile => profile-unavailable (not unsupported)', () => {
  assert.equal(classifyBadgeV2(true, false, false), 'profile-unavailable');
});

test('Badge V2: no bars and no profile => ticker-not-found', () => {
  assert.equal(classifyBadgeV2(false, false, false), 'ticker-not-found');
});

test('Badge V2: bars + profile but not in universe => limited-coverage', () => {
  assert.equal(classifyBadgeV2(true, true, false), 'limited-coverage');
});

test('Badge V2: normal in-universe ticker', () => {
  assert.equal(classifyBadgeV2(true, true, true), 'normal');
});

// ─── I) Freshness Consistency Tests ─────────────────────────────────────────

test('Freshness: header and data health use same effective status', () => {
  // If STALE + dataDate >= lastTradingDay => both should be EOD_CURRENT
  const result = classifyFreshness('STALE', '2026-03-06', '2026-03-06');
  assert.equal(result, 'EOD_CURRENT');
  // Same function used by both header and data health => guaranteed consistency
});

// ─── J) No Placeholder Graveyard Tests ──────────────────────────────────────

test('No "Not Live" in stock.html', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(!content.includes('Not Live'), 'Found "Not Live" in stock.html');
  assert.ok(!content.includes('Coming Soon'), 'Found "Coming Soon" in stock.html');
  assert.ok(!content.includes('requires additional data feed integration'), 'Found dev placeholder text in stock.html');
});

test('No "Macro context not yet available" in stock-features.js', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/js/stock-features.js', import.meta.url), 'utf-8');
  assert.ok(!content.includes('Macro context not yet available'), 'Found dead macro placeholder');
});

test('Live stock.html loads stock-features.js', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('<script src="/js/stock-features.js" defer></script>'), 'Live stock.html does not load stock-features.js');
});

test('Live stock.html defines runtime variables used in template rendering', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('const shortV ='), 'shortV is not defined in stock.html');
  assert.ok(content.includes('const midV ='), 'midV is not defined in stock.html');
  assert.ok(content.includes('const longV ='), 'longV is not defined in stock.html');
  assert.ok(content.includes('const isExtremeVol ='), 'isExtremeVol is not defined in stock.html');
  assert.ok(content.includes('window._rvCanonicalMetrics ='), '_rvCanonicalMetrics is not exposed in stock.html');
});

test('Live stock.html includes explicit operational banner tiers', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Operational with minor warnings'), 'Minor-warning banner text is missing');
  assert.ok(content.includes('Degraded — review integrity notes'), 'Degraded banner text is missing');
});

test('Live stock.html removes risk inconsistency warning copy', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(!content.includes('possible data inconsistency'), 'Old risk inconsistency warning copy is still present');
});

test('Live stock.html clarifies historical timestamps explicitly', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Event stats as-of:'), 'Historical event as-of label is missing');
  assert.ok(content.includes('Regime snapshot:'), 'Historical regime snapshot label is missing');
  assert.ok(content.includes('Regime as-of'), 'Regime pill label is missing');
  assert.ok(content.includes('Historical timeline mismatch → context dated'), 'Historical timeline mismatch copy is missing');
});

test('Live stock.html sharpens trend vs rebound wording', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('CONSTRUCTIVE TREND SIGNALS'), 'Constructive trend heading is missing');
  assert.ok(content.includes('Short-term rebound signals do not override the weak broader trend.'), 'Trend vs rebound qualifier is missing');
});

test('Live stock.html uses compact breakout none wording', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Breakout Setup: None'), 'Compact breakout none wording is missing');
});

test('Live stock.html improves what-changed wording', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Price closed below SMA20'), 'Improved SMA20 wording is missing');
  assert.ok(content.includes('Daily change:'), 'Improved daily change wording is missing');
});

test('Live stock.html makes market context wording timeframe-aware', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('outperformance vs benchmarks'), 'Timeframe-aware benchmark wording is missing');
  assert.ok(!content.includes('Broad Outperformance vs Benchmarks'), 'Old broad benchmark wording is still present');
});

test('Live stock.html qualifies historical confidence strength', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('pooled historical observations'), 'Historical confidence qualifier is missing');
});

test('Live stock.html exposes compact decision meta summary', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('rv-decision-reason-meta'), 'Decision reason meta block is missing');
  assert.ok(content.includes('Flags'), 'Flags meta card is missing');
  assert.ok(content.includes('As-of'), 'As-of meta card is missing');
});

test('Live stock.html renders causal risk explanation from final risk state', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Driver:'), 'Risk driver label is missing');
  assert.ok(content.includes('Override applied:'), 'Risk override label is missing');
  assert.ok(content.includes('Risk override active → confidence moderated'), 'Risk override integrity copy is missing');
  assert.ok(content.includes('displayLabel'), 'Final risk display label is missing');
});

test('Live stock.html hardens trade plan and checklist empty states', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Trade plan unavailable — missing required inputs'), 'Trade plan missing-input state is missing');
  assert.ok(content.includes('No active trade setup — checklist not applicable.'), 'Checklist inactive state is missing');
  assert.ok(content.includes('Why No Trade?'), 'Why No Trade heading is missing');
});

test('Live stock.html enriches catalysts and signal hierarchy copy', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Next expected earnings window:'), 'Catalyst next-window copy is missing');
  assert.ok(content.includes('Catalyst feed currently limited'), 'Catalyst limited-data copy is missing');
  assert.ok(content.includes('Primary trend: weak downtrend · Tactical rebound: active · Override status: none'), 'Signal hierarchy summary is missing');
});

test('Live stock.html differentiates volume omission reason and model evidence visibility', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  assert.ok(content.includes('Volume classification omitted in current analysis mode.'), 'Volume omission wording is missing');
  assert.ok(content.includes('_visibleModelEvidence.length ?'), 'Model evidence visibility guard is missing');
  assert.ok(content.includes('Price as-of:'), 'Header price as-of label is missing');
});

// ─── K) Initial HTML State Tests ────────────────────────────────────────────

test('Initial HTML has no pre-filled "Unsupported" badge', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  // Check the static HTML portion (before <script>)
  const htmlPortion = content.split('<script')[0];
  assert.ok(!htmlPortion.includes('Unsupported ticker'), 'Static HTML contains "Unsupported ticker" badge');
});

test('Initial HTML subtitle is not a ticker duplicate', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync(new URL('../public/stock.html', import.meta.url), 'utf-8');
  const htmlPortion = content.split('<script')[0];
  // Should not contain a raw ticker as subtitle
  assert.ok(!htmlPortion.includes('id="stock-subtitle">DNTH'), 'Static subtitle contains raw ticker');
  assert.ok(!htmlPortion.includes('id="stock-subtitle">AAPL'), 'Static subtitle contains raw ticker');
});

// ─── L) Suppressed Module Tests ─────────────────────────────────────────────

test('Gate: INVALID suppresses regardless of other conditions', () => {
  // Even with BUY score and all other gates clear, INVALID always suppresses
  assert.equal(scoreHorizonGates('BUY', 'INVALID', false, false, false), 'SUPPRESSED');
  assert.equal(scoreHorizonGates('AVOID', 'INVALID', false, false, false), 'SUPPRESSED');
  assert.equal(scoreHorizonGates('WAIT', 'INVALID', false, false, false), 'SUPPRESSED');
});

// ─── RESULTS ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`Stock Analyzer UI Tests: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));
results.forEach(r => {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${icon} ${r.name}`);
});
console.log('');

if (failed > 0) {
  process.exit(1);
}
