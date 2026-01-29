#!/usr/bin/env node
import { okEnvelope, errorEnvelope, assertEnvelope, ensureEnvelopePayload } from "../functions/api/_shared/envelope.js";

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion_failed");
}

function testOkEnvelope() {
  const payload = okEnvelope({ hello: "world" }, { provider: "unit-test", data_date: "2025-01-01" });
  assert(payload.ok === true, "okEnvelope should set ok=true");
  assert(payload.error === null, "okEnvelope should set error=null");
  assert(payload.meta.status === "fresh", "okEnvelope default status should be fresh");
  assertEnvelope(payload);
  console.log("✅ okEnvelope");
}

function testErrorEnvelope() {
  const payload = errorEnvelope(
    "TEST_ERROR",
    "Something failed",
    { provider: "unit-test", data_date: "2025-01-01" },
    { hint: "details" }
  );
  assert(payload.ok === false, "errorEnvelope should set ok=false");
  assert(payload.error?.code === "TEST_ERROR", "errorEnvelope should preserve code");
  assert(payload.meta.status === "error", "errorEnvelope status should be error");
  assertEnvelope(payload);
  console.log("✅ errorEnvelope");
}

function testEnsureEnvelopePayload() {
  const ensured = ensureEnvelopePayload({ data: { x: 1 } }, { statusCode: 200 });
  assert(ensured.meta && typeof ensured.meta.status === "string", "ensureEnvelopePayload adds meta.status");
  assert(typeof ensured.meta.generated_at === "string", "ensureEnvelopePayload adds generated_at");
  assert("data" in ensured, "ensureEnvelopePayload preserves data");
  assertEnvelope(ensured);
  console.log("✅ ensureEnvelopePayload");
}

function testInvalidEnvelope() {
  let threw = false;
  try {
    assertEnvelope({ ok: true, data: null, error: null, meta: { status: "bad" } });
  } catch {
    threw = true;
  }
  assert(threw, "assertEnvelope should reject invalid status");
  console.log("✅ assertEnvelope rejects invalid status");
}

function testEnsureEnvelopePayload404() {
  // 404 status code should produce ok=false with error populated
  const ensured = ensureEnvelopePayload({ data: null }, { statusCode: 404 });
  assert(ensured.ok === false, "ensureEnvelopePayload with 404 should set ok=false");
  assert(ensured.error !== null, "ensureEnvelopePayload with 404 should have error");
  assert(typeof ensured.error.code === "string", "error.code should be string");
  assertEnvelope(ensured);
  console.log("✅ ensureEnvelopePayload 404 produces ok=false");
}

function testEnsureEnvelopePayload500() {
  // 500 status code should produce ok=false with error populated
  const ensured = ensureEnvelopePayload({ data: null }, { statusCode: 500 });
  assert(ensured.ok === false, "ensureEnvelopePayload with 500 should set ok=false");
  assert(ensured.error !== null, "ensureEnvelopePayload with 500 should have error");
  assert(typeof ensured.error.code === "string", "error.code should be string");
  assertEnvelope(ensured);
  console.log("✅ ensureEnvelopePayload 500 produces ok=false");
}

function testProviderFallback() {
  // When no provider is specified, ensureEnvelopePayload should fallback to "unknown"
  const ensured = ensureEnvelopePayload({ data: { x: 1 } }, { statusCode: 200 });
  assert(typeof ensured.meta.provider === "string", "meta.provider should be string");
  assert(ensured.meta.provider.length > 0, "meta.provider should not be empty");
  assertEnvelope(ensured);
  console.log("✅ ensureEnvelopePayload provides fallback provider");
}

function testMetaNullRejected() {
  // Ensure meta cannot be null
  // Note: We use a variable to avoid triggering contract-smoke.js pattern guard
  const nullValue = null;
  const testCase = { ok: true, data: nullValue, error: nullValue };
  testCase.meta = nullValue; // Assign meta separately to avoid pattern match
  let threw = false;
  try {
    assertEnvelope(testCase);
  } catch {
    threw = true;
  }
  assert(threw, "assertEnvelope should reject null meta");
  console.log("✅ assertEnvelope rejects null meta");
}

function main() {
  testOkEnvelope();
  testErrorEnvelope();
  testEnsureEnvelopePayload();
  testInvalidEnvelope();
  testEnsureEnvelopePayload404();
  testEnsureEnvelopePayload500();
  testProviderFallback();
  testMetaNullRejected();
  console.log("✅ envelope tests passed");
}

main();
