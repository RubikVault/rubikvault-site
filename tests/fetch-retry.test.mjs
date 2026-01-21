#!/usr/bin/env node
/**
 * Fetch Retry Tests
 * 
 * Deterministic tests for fetchWithRetry:
 * - Mock global fetch
 * - No real HTTP calls
 * - Verify retry behavior, backoff, metadata
 */

import { fetchWithRetry } from '../scripts/lib/fetch.js';

let passed = 0;
let failed = 0;
let originalFetch;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) {
        console.error(`   ${err.stack.split('\n').slice(1, 3).join('\n')}`);
      }
      failed++;
    }
  };
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

function makeSleepSpy() {
  const calls = [];
  const sleep = async (ms) => {
    calls.push(ms);
  };
  return { sleep, calls };
}

// Mock fetch helper
function mockFetch(responses) {
  let callCount = 0;
  return async (url, options) => {
    const response = responses[callCount] || responses[responses.length - 1];
    callCount++;
    
    if (response.error) {
      throw response.error;
    }
    
    return {
      ok: response.ok,
      status: response.status,
      headers: {
        get: (name) => response.headers?.[name.toLowerCase()] || null
      },
      text: async () => response.body || '',
      json: async () => JSON.parse(response.body || '{}')
    };
  };
}

// Test 1: HTTP 429 with Retry-After header
const test1 = test('HTTP 429 with Retry-After → uses header value', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 429, headers: { 'retry-after': '2' }, body: 'Rate limited' },
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(result.ok, 'Should succeed after retry');
  assertEqual(result.upstream.retry_count, 1, 'Should have 1 retry');
  assertEqual(result.upstream.rate_limited, true, 'Should mark as rate limited');
  assertEqual(result.upstream.http_status, 200, 'Should return final status');
  assertEqual(calls.length, 1, 'Should sleep exactly once');
  assertEqual(calls[0], 2000, 'Should sleep Retry-After seconds');
});

// Test 2: HTTP 429 without Retry-After → exponential backoff
const test2 = test('HTTP 429 without Retry-After → exponential backoff', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 429, body: 'Rate limited' },
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(result.ok, 'Should succeed after retry');
  assertEqual(result.upstream.retry_count, 1, 'Should have 1 retry');
  assertEqual(result.upstream.rate_limited, true, 'Should mark as rate limited');
  assertEqual(calls.length, 1, 'Should sleep exactly once');
  assertEqual(calls[0], 1000, 'Should sleep baseDelayMs for first retry');
});

// Test 3: Network error → retry
const test3 = test('Network error → retry succeeds', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { error: new Error('Network error') },
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(result.ok, 'Should succeed after retry');
  assertEqual(result.upstream.retry_count, 1, 'Should have 1 retry');
  assertEqual(result.upstream.http_status, 200, 'Should return final status');
  assertEqual(calls.length, 1, 'Should sleep exactly once');
  assertEqual(calls[0], 1000, 'Should use baseDelayMs for first network retry');
});

// Test 4: Retry limit reached → returns error
const test4 = test('Retry limit reached → ok=false with error', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 500, body: 'Server error' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { maxRetries: 2, sleep });
  
  assert(!result.ok, 'Should fail after max retries');
  assert(result.error !== null, 'Should have error object');
  assertEqual(result.upstream.retry_count, 2, 'Should have 2 retries');
  assertEqual(result.upstream.http_status, 500, 'Should return error status');
  assertEqual(calls.length, 2, 'Should sleep twice');
  assertEqual(calls[0], 1000, 'First retry backoff');
  assertEqual(calls[1], 2000, 'Second retry backoff');
});

// Test 5: HTTP 400 → no retry
const test5 = test('HTTP 400 → no retry', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 400, body: 'Bad request' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(!result.ok, 'Should fail immediately');
  assertEqual(result.upstream.retry_count, 0, 'Should have 0 retries');
  assertEqual(result.upstream.http_status, 400, 'Should return 400 status');
  assertEqual(result.upstream.rate_limited, false, 'Should not be rate limited');
  assertEqual(calls.length, 0, 'Should not sleep');
});

// Test 6: HTTP 500 → retries then succeeds
const test6 = test('HTTP 500 → retries then succeeds', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 500, body: 'Server error' },
    { ok: false, status: 500, body: 'Server error' },
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(result.ok, 'Should succeed after retries');
  assertEqual(result.upstream.retry_count, 2, 'Should have 2 retries');
  assertEqual(result.upstream.http_status, 200, 'Should return success status');
  assertEqual(calls.length, 2, 'Should sleep twice');
  assertEqual(calls[0], 1000, 'First retry backoff');
  assertEqual(calls[1], 2000, 'Second retry backoff');
});

// Test 7: Successful first attempt
const test7 = test('Successful first attempt → no retries', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { sleep });
  
  assert(result.ok, 'Should succeed');
  assertEqual(result.upstream.retry_count, 0, 'Should have 0 retries');
  assertEqual(result.upstream.http_status, 200, 'Should return 200 status');
  assertEqual(result.upstream.rate_limited, false, 'Should not be rate limited');
  assert(result.upstream.latency_ms >= 0, 'Should track latency');
  assertEqual(calls.length, 0, 'Should not sleep');
});

// Test 8: Network error exhausts retries
const test8 = test('Network error exhausts retries → ok=false', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { error: new Error('Network error') }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { maxRetries: 1, sleep });
  
  assert(!result.ok, 'Should fail after max retries');
  assert(result.error !== null, 'Should have error object');
  assertEqual(result.upstream.retry_count, 1, 'Should have 1 retry');
  assertEqual(result.upstream.http_status, null, 'Should have null status for network error');
  assertEqual(calls.length, 1, 'Should sleep once');
  assertEqual(calls[0], 1000, 'Should backoff before last retry');
});

// Test 9: Custom policy parameters
const test9 = test('Custom policy parameters → respected', async () => {
  const { sleep, calls } = makeSleepSpy();
  global.fetch = mockFetch([
    { ok: false, status: 500, body: 'Error' },
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com', {}, { maxRetries: 5, baseDelayMs: 500, sleep });
  
  assert(result.ok, 'Should succeed');
  assertEqual(result.upstream.retry_count, 1, 'Should have 1 retry');
  assertEqual(calls.length, 1, 'Should sleep once');
  assertEqual(calls[0], 500, 'Should use custom baseDelayMs');
});

// Test 10: Metadata always present
const test10 = test('Upstream metadata always present', async () => {
  global.fetch = mockFetch([
    { ok: true, status: 200, body: 'Success' }
  ]);
  
  const result = await fetchWithRetry('http://test.com');
  
  assert(result.upstream !== undefined, 'Should have upstream object');
  assert(typeof result.upstream.http_status === 'number' || result.upstream.http_status === null, 'Should have http_status');
  assert(typeof result.upstream.latency_ms === 'number', 'Should have latency_ms');
  assert(typeof result.upstream.retry_count === 'number', 'Should have retry_count');
  assert(typeof result.upstream.rate_limited === 'boolean', 'Should have rate_limited');
});

// Run all tests
async function runTests() {
  console.log('🧪 Running Fetch Retry Tests...\n');
  
  originalFetch = global.fetch;
  
  const tests = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10];
  
  for (const testFn of tests) {
    await testFn();
  }
  
  global.fetch = originalFetch;
  
  console.log('\n' + '='.repeat(50));
  console.log('FETCH RETRY TEST RESULTS');
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
}

runTests().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
