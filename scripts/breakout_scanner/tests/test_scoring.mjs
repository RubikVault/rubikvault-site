/**
 * TEST: V2.0 Numerical Scoring (Point 18)
 */

function calculateScores(bar, stateContext, stats = {}) {
  // 1. Structure Score (0 - 30)
  let structure = 0;
  if (stats.is_base) structure += 10;
  if (bar.close > stats.ema20) structure += 5;
  if (stats.ema20_slope > 0) structure += 5;
  if (stats.weekly_trend_up) structure += 10;

  // 2. Absorption Score (0 - 30)
  let absorption = 0;
  const failed_count = stats.failed_low_count || 0;
  if (failed_count >= 1) absorption += 10;
  if (failed_count >= 2) absorption += 10; // total 20 for count
  if (stats.absorption_vol_ratio > 1.25) absorption += 10;

  // 3. Trigger Score (0 - 25)
  let trigger = 0;
  if (stateContext.state === 'TRIGGERED' || stateContext.state === 'CONFIRMED') {
       if (bar.close > stats.breakout_level) trigger += 10;
       if (stats.rvol20 > 1.5) trigger += 10;
       if (stats.close_pos_in_bar > 0.70) trigger += 5;
  }

  // 4. Validation Score (0 - 15)
  let validation = 0;
  if (stateContext.state === 'CONFIRMED') {
       if (stats.holds_breakout_level) validation += 10;
       if (stats.follow_through) validation += 5;
  }

  const total = structure + absorption + trigger + validation;

  return {
       structure,
       absorption,
       trigger,
       validation,
       total
  };
}

// === MOCK RUN / VERIFICATION ===
console.log("--- Testing Scoring Logic ---");

// Mock BAR and Stats simulating a fully validated absorption setup TRIGGERED
const mockBar = { close: 105, high: 106, low: 100, open: 101, volume: 500 };
const mockState = { state: 'TRIGGERED' };
const mockStats = {
  is_base: true,
  ema20: 100,
  ema20_slope: 0.5,
  weekly_trend_up: true,
  failed_low_count: 2,
  absorption_vol_ratio: 1.5,
  breakout_level: 102,
  rvol20: 2.0,
  close_pos_in_bar: 0.83 // (105-100)/(106-100) = 5/6 = 0.83
};

const result = calculateScores(mockBar, mockState, mockStats);

console.log("Structure Score:", result.structure, "/ 30");
console.log("Absorption Score:", result.absorption, "/ 30");
console.log("Trigger Score:", result.trigger, "/ 25");
console.log("Validation Score:", result.validation, "/ 15");
console.log("Total Score:", result.total);

// Expected: 
// Struct: 10+5+5+10 = 30
// Absorp: 10+10+10 = 30
// Trigg: 10+10+5 = 25
// Valid: 0 (state is TRIGGERED, not CONFIRMED)
// Total = 30 + 30 + 25 = 85

if (result.structure === 30 && result.absorption === 30 && result.total === 85) {
     console.log("✅ Verification 100% Correct: correctly scored full setup categories.");
     process.exit(0);
} else {
     console.error("❌ Verification Failed. Score Mismatch.");
     process.exit(1);
}
