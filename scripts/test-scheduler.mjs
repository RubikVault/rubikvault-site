#!/usr/bin/env node
import { onRequest as apiMiddleware } from "../functions/api/_middleware.js";
import { onRequestGet as schedulerHealth } from "../functions/api/scheduler/health.js";
import { onRequestPost as schedulerRun } from "../functions/api/scheduler/run.js";

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion_failed");
}

function createKv() {
  const store = new Map();
  return {
    async get(key, opts) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (opts === "json" || opts?.type === "json") {
        return JSON.parse(value);
      }
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

async function runWithMiddleware(request, env, handler) {
  const context = {
    request,
    env,
    next: () => handler({ request, env })
  };
  return apiMiddleware(context);
}

async function testSchedulerHealthStale() {
  const env = { RV_KV: createKv() };
  const request = new Request("https://example.com/api/scheduler/health");
  const response = await runWithMiddleware(request, env, schedulerHealth);
  const body = JSON.parse(await response.text());
  assert(body.ok === false, "health should be ok=false when missing heartbeat");
  assert(body.error?.code === "SCHEDULER_STALE", "health stale should return SCHEDULER_STALE");
  assert(body.meta?.status === "error", "health stale should set meta.status=error");
  assert(typeof body.meta?.data_date === "string" && body.meta.data_date.length === 10, "data_date required");
  assert(body.data && typeof body.data === "object", "health stale should include data object");
  assert("last_ok" in body.data, "health stale data.last_ok required");
  assert("age_s" in body.data, "health stale data.age_s required");
  assert(typeof body.data.max_age_s === "number", "health stale data.max_age_s required");
  console.log("✅ scheduler health stale");
}

async function testSchedulerRunAuth() {
  const env = { RV_KV: createKv(), RV_ADMIN_TOKEN: "secret" };
  const payload = { job: "eod_stock", mode: "s2", assets: [{ ticker: "SPY" }] };
  const request = new Request("https://example.com/api/scheduler/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const response = await runWithMiddleware(request, env, schedulerRun);
  const body = JSON.parse(await response.text());
  assert(body.ok === false, "scheduler run without token should be ok=false");
  assert(body.error?.code === "UNAUTHORIZED", "scheduler run without token should be unauthorized");
  console.log("✅ scheduler run rejects without token");
}

async function testSchedulerRunAndHealthOk() {
  const env = { RV_KV: createKv(), RV_ADMIN_TOKEN: "secret" };
  const payload = { job: "eod_stock", mode: "s2", assets: [{ ticker: "SPY" }] };
  const request = new Request("https://example.com/api/scheduler/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": "secret"
    },
    body: JSON.stringify(payload)
  });
  const response = await runWithMiddleware(request, env, schedulerRun);
  const body = JSON.parse(await response.text());
  assert(body.ok === true, "scheduler run with token should be ok=true");
  assert(body.meta?.status, "meta.status required");
  assert(typeof body.meta?.data_date === "string" && body.meta.data_date.length === 10, "data_date required");

  const healthReq = new Request("https://example.com/api/scheduler/health");
  const healthRes = await runWithMiddleware(healthReq, env, schedulerHealth);
  const healthBody = JSON.parse(await healthRes.text());
  assert(healthBody.ok === true, "health should be ok after scheduler run");
  assert(healthBody.meta?.status, "health meta.status required");
  assert(healthBody.data && typeof healthBody.data === "object", "health ok should include data object");
  assert("last_ok" in healthBody.data, "health ok data.last_ok required");
  assert(typeof healthBody.data.max_age_s === "number", "health ok data.max_age_s required");
  console.log("✅ scheduler run updates health");
}

async function main() {
  await testSchedulerHealthStale();
  await testSchedulerRunAuth();
  await testSchedulerRunAndHealthOk();
  console.log("✅ scheduler tests passed");
}

main().catch((err) => {
  console.error("❌ scheduler tests failed");
  console.error(err.stack || err.message);
  process.exit(1);
});
