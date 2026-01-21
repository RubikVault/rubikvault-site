#!/usr/bin/env node
/**
 * Drop Threshold Validation Tests
 * 
 * Tests that drop threshold enforcement works correctly:
 * - PASS when below thresholds
 * - FAIL when thresholds exceeded
 */

import { validateDropThreshold, computeValidationMetadata, MAX_DROP_ABS, MAX_DROP_RATIO } from '../scripts/lib/drop-threshold.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Test 1: Zero drops should always pass
test('Zero drops always passes', () => {
  const result = validateDropThreshold(100, 0);
  assert(result.passed, 'Should pass with zero drops');
  assertEqual(result.drop_ratio, 0, 'Drop ratio should be 0');
  assertEqual(result.reason, null, 'Should have no reason');
});

// Test 2: Drops below absolute threshold should pass
test('Drops below absolute threshold (5) should pass', () => {
  const result = validateDropThreshold(10000, 3);
  assert(result.passed, 'Should pass with 3 drops out of 10000');
  assertEqual(result.dropped_records, undefined); // Not in return value
  assert(result.drop_ratio < MAX_DROP_RATIO, 'Drop ratio should be below threshold');
});

// Test 3: Drops at absolute threshold should pass
test('Drops at absolute threshold (5) should pass', () => {
  const result = validateDropThreshold(10000, 5);
  assert(result.passed, 'Should pass with exactly 5 drops');
});

// Test 4: Drops above absolute threshold should fail
test('Drops above absolute threshold (5) should fail', () => {
  const result = validateDropThreshold(10000, 6);
  assert(!result.passed, 'Should fail with 6 drops');
  assert(result.reason !== null, 'Should have failure reason');
  assert(result.reason.includes('DROP_THRESHOLD_EXCEEDED'), 'Reason should mention threshold');
});

// Test 5: Small dataset with ratio threshold
test('Small dataset uses ratio threshold', () => {
  // For 1000 records, ratio threshold = 1000 * 0.001 = 1
  // So min(5, 1) = 1
  const result1 = validateDropThreshold(1000, 1);
  assert(result1.passed, 'Should pass with 1 drop out of 1000');
  
  const result2 = validateDropThreshold(1000, 2);
  assert(!result2.passed, 'Should fail with 2 drops out of 1000');
});

// Test 6: Large dataset uses absolute threshold
test('Large dataset uses absolute threshold', () => {
  // For 100000 records, ratio threshold = 100000 * 0.001 = 100
  // So min(5, 100) = 5
  const result1 = validateDropThreshold(100000, 5);
  assert(result1.passed, 'Should pass with 5 drops out of 100000');
  
  const result2 = validateDropThreshold(100000, 6);
  assert(!result2.passed, 'Should fail with 6 drops out of 100000');
});

// Test 7: computeValidationMetadata integrates correctly
test('computeValidationMetadata passes when below threshold', () => {
  const result = computeValidationMetadata(10000, 9997, 3, true);
  assert(result.drop_check_passed, 'Drop check should pass');
  assertEqual(result.dropped_records, 3, 'Should track dropped records');
  assert(result.drop_ratio === 3/10000, 'Should calculate drop ratio');
  assert(result.checks.drop_threshold.passed, 'Drop threshold check should pass');
});

// Test 8: computeValidationMetadata fails when threshold exceeded
test('computeValidationMetadata fails when threshold exceeded', () => {
  const result = computeValidationMetadata(1000, 990, 10, true);
  assert(!result.drop_check_passed, 'Drop check should fail');
  assertEqual(result.dropped_records, 10, 'Should track dropped records');
  assert(!result.checks.drop_threshold.passed, 'Drop threshold check should fail');
  assert(result.checks.drop_threshold.reason !== null, 'Should have failure reason');
});

// Test 9: computeValidationMetadata fails when other validation fails
test('computeValidationMetadata fails when other validation fails', () => {
  const result = computeValidationMetadata(10000, 9998, 2, false);
  assert(result.drop_check_passed, 'Drop threshold itself should pass');
  assert(result.checks.provided_validation.passed === false, 'Other validation should be represented separately');
});

// Test 10: Edge case - single record
test('Single record dataset', () => {
  const result1 = validateDropThreshold(1, 0);
  assert(result1.passed, 'Should pass with 0 drops out of 1');
  
  const result2 = validateDropThreshold(1, 1);
  assert(!result2.passed, 'Should fail with 1 drop out of 1 (ratio = 100%)');
});

// Test 11: Edge case - zero records
test('Zero records dataset', () => {
  const result = validateDropThreshold(0, 0);
  assert(result.passed, 'Should pass with 0 drops out of 0');
  assertEqual(result.drop_ratio, 0, 'Drop ratio should be 0');
});

// Test 12: Invalid inputs
test('Invalid inputs throw errors', () => {
  let threw = false;
  try {
    validateDropThreshold(-1, 0);
  } catch (err) {
    threw = true;
    assert(err.message.includes('Invalid rawCount'), 'Should mention invalid rawCount');
  }
  assert(threw, 'Should throw on negative rawCount');
  
  threw = false;
  try {
    validateDropThreshold(100, -1);
  } catch (err) {
    threw = true;
    assert(err.message.includes('Invalid droppedRecords'), 'Should mention invalid droppedRecords');
  }
  assert(threw, 'Should throw on negative droppedRecords');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('DROP THRESHOLD VALIDATION TEST RESULTS');
console.log('='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total:  ${passed + failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  console.error('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
