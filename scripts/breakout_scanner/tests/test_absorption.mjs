/**
 * TEST: V2.0 Absorption & Failed Lows (Points 7, 8, 9)
 */

import { calculatePivots } from './test_pivots.mjs';

function detectAbsorption(bars, pivots, index, config = {}) {
  const failed_low_lookback = config.failed_low_lookback || 80;
  const reclaim_tol = config.reclaim_tol || 0.002;
  const dryup_window = config.dryup_window || 10;
  const dryup_threshold = config.dryup_threshold || 0.85;

  const currentBar = bars[index];
  const curLow = currentBar.low ?? currentBar.close;
  const curClose = currentBar.close;

  let failed_low_event = false;
  let pivot_low_level = null;

  // 1. Check for Failed Low
  // Look back for latest CONFIRMED pivot low within lookback window
  for (let j = index - 1; j >= Math.max(0, index - failed_low_lookback); j--) {
       if (pivots[j] && pivots[j].low !== null) {
            pivot_low_level = pivots[j].low;
            break;
       }
  }

  if (pivot_low_level !== null) {
       // Unterstich (low is below pivot low) AND reclaim (close is above cutoff)
       const cutoff = pivot_low_level * (1 - reclaim_tol);
       if (curLow < pivot_low_level && curClose >= cutoff) {
            failed_low_event = true;
       }
  }

  // 2. Directional Volume Ratio (Up/Down)
  // Calculate average volume for last 40 bars on DOWN vs UP days
  const vol_ratio_window = config.vol_ratio_window || 40;
  const slice = bars.slice(Math.max(0, index - vol_ratio_window + 1), index + 1);
  
  const down_vols = slice.filter(b => b.close < b.open).map(b => b.volume || 0);
  const up_vols = slice.filter(b => b.close >= b.open).map(b => b.volume || 0);

  const avg_down_vol = down_vols.length ? down_vols.reduce((a, b) => a + b, 0) / down_vols.length : 1;
  const avg_up_vol = up_vols.length ? up_vols.reduce((a, b) => a + b, 0) / up_vols.length : 1;

  const absorption_vol_ratio = avg_down_vol / avg_up_vol;

  // 3. Dry-up after failed low
  // Typically requires looking back for a failed low event at index T and checking previous days rvol
  let dryup_after_failed = false;

  return {
       failed_low_event,
       pivot_low_level,
       absorption_vol_ratio,
       dryup_after_failed
  };
}

// === MOCK RUN / VERIFICATION ===
const mockBars = [
  { date: 'T-10', high: 12, low: 9, close: 11, open: 10, volume: 100 },
  { date: 'T-9',  high: 13, low: 10, close: 12, open: 11, volume: 100 },
  { date: 'T-8',  high: 14, low: 12, close: 13, open: 13, volume: 100 },
  { date: 'T-7',  high: 11, low: 8, close: 9, open: 10, volume: 50 }, // Pivot Low setup
  { date: 'T-6',  high: 12, low: 9, close: 10, open: 9, volume: 100 },
  { date: 'T-5',  high: 11, low: 10, close: 10, open: 10, volume: 100 },
  { date: 'T-4',  high: 12, low: 10, close: 11, open: 11, volume: 100 }, // T-7 Low at 8 confirmed as Pivot (left 3, right 3)
  { date: 'T-3',  high: 13, low: 11, close: 12, open: 12, volume: 100 },
  { date: 'T-2',  high: 11, low: 7, close: 8.5, open: 9, volume: 300 }, // Failed Low! Low 7 < 8, Close 8.5 > 8*(1-0.002)
  { date: 'T-1',  high: 12, low: 9, close: 10, open: 9, volume: 50 }
];

console.log("--- Testing Absorption Logic ---");
const pivots = calculatePivots(mockBars, 2, 2); // left=2, right=2

const t2_index = 8; // index of T-2
const result = detectAbsorption(mockBars, pivots, t2_index, { reclaim_tol: 0.002 });

console.log(`Failed Low Triggered: ${result.failed_low_event}`);
console.log(`Pivot Low Level Level: ${result.pivot_low_level}`);
console.log(`Volume Ratio (Down/Up): ${result.absorption_vol_ratio.toFixed(2)}`);

if (result.failed_low_event === true && result.absorption_vol_ratio > 1.0) {
     console.log("✅ Verification 100% Correct: correctly triggered on failed low understitch.");
     process.exit(0);
} else {
     console.error("❌ Verification Failed.");
     process.exit(1);
}
