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

function main() {
  testOkEnvelope();
  testErrorEnvelope();
  testEnsureEnvelopePayload();
  testInvalidEnvelope();
  console.log("✅ envelope tests passed");
}

main();
