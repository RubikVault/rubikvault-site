/**
 * TEST: V2.0 Pivot Logic (Point 5)
 */

export function calculatePivots(bars, left = 3, right = 3) {
  const pivots = new Array(bars.length).fill(null).map(() => ({
    high: null,
    low: null
  }));

  for (let i = 0; i < bars.length; i++) {
    if (i < left || i + right >= bars.length) continue;

    const start = Math.max(0, i - left);
    const end = Math.min(bars.length - 1, i + right);

    const currentBar = bars[i];
    const highVal = currentBar.high ?? currentBar.close;
    const lowVal = currentBar.low ?? currentBar.close;

    let isPivotHigh = true;
    let isPivotLow = true;

    for (let j = start; j <= end; j++) {
      if (j === i) continue;
      const b = bars[j];
      const h = b.high ?? b.close;
      const l = b.low ?? b.close;

      if (h >= highVal) isPivotHigh = false;
      if (l <= lowVal) isPivotLow = false;
    }

    if (isPivotHigh) pivots[i].high = highVal;
    if (isPivotLow) pivots[i].low = lowVal;
  }

  return pivots;
}

// === MOCK RUN / VERIFICATION ===
const mockBars = [
  { date: 'T-5', high: 10, low: 8, close: 9 },
  { date: 'T-4', high: 12, low: 9, close: 10 },
  { date: 'T-3', high: 15, low: 11, close: 14 }, // Potential Pivot High 
  { date: 'T-2', high: 13, low: 9, close: 11 },
  { date: 'T-1', high: 11, low: 8, close: 9 },
  { date: 'T',   high: 12, low: 6, close: 7 }, // Potential Pivot Low
  { date: 'T+1', high: 13, low: 8, close: 12 },
  { date: 'T+2', high: 14, low: 9, close: 13 },
  { date: 'T+3', high: 15, low: 11, close: 14 }
];

if (process.argv[1] && process.argv[1].endsWith('test_pivots.mjs')) {
    console.log("--- Testing Pivot Logic ---");
    const results = calculatePivots(mockBars, 2, 2); // left=2, right=2

    let highCount = 0;
    let lowCount = 0;

    results.forEach((p, i) => {
        if (p.high) {
             console.log(`[PASS] Found Pivot High at ${mockBars[i].date} - Value: ${p.high}`);
             highCount++;
        }
        if (p.low) {
             console.log(`[PASS] Found Pivot Low at ${mockBars[i].date} - Value: ${p.low}`);
             lowCount++;
        }
    });

    if (highCount === 1 && lowCount === 1) {
         console.log("✅ Verification 100% Correct: correctly identified high and low.");
    } else {
         console.error("❌ Verification Failed. Count mismatch.");
    }
}
