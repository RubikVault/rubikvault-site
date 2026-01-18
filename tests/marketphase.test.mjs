import test from "node:test";
import assert from "node:assert/strict";
import { evaluateElliott } from "../scripts/marketphase-core.mjs";

function makeSwings(prices) {
  return prices.map((price, idx) => ({
    index: idx,
    date: `2026-01-${String(idx + 1).padStart(2, "0")}`,
    price,
    type: idx % 2 === 0 ? "low" : "high"
  }));
}

test("valid 5-wave passes all rules", () => {
  const swings = makeSwings([100, 110, 105, 130, 120, 140]);
  const result = evaluateElliott(swings);
  assert.equal(result.completedPattern.valid, true);
  assert.equal(result.completedPattern.rules.r1, true);
  assert.equal(result.completedPattern.rules.r2, true);
  assert.equal(result.completedPattern.rules.r3, true);
});

test("wave 4 overlap fails rule 3", () => {
  const swings = makeSwings([100, 110, 105, 130, 108, 135]);
  const result = evaluateElliott(swings);
  assert.equal(result.completedPattern.rules.r3, false);
});

test("short wave 3 fails rule 2", () => {
  const swings = makeSwings([100, 110, 105, 112, 108, 125]);
  const result = evaluateElliott(swings);
  assert.equal(result.completedPattern.rules.r2, false);
});

test("fib conformance stays above 80 for near ratios", () => {
  const swings = makeSwings([100, 110, 105, 121.18, 115, 125]);
  const result = evaluateElliott(swings);
  assert.ok(result.fib.conformanceScore > 80);
});

test("random swings keep confidence under 40", () => {
  const swings = makeSwings([100, 110, 95, 100, 90, 120]);
  const result = evaluateElliott(swings);
  assert.ok(result.completedPattern.confidence0_100 < 40);
});
