#!/usr/bin/env node

import { kvPutSnapshotIfChanged } from "../scripts/lib/kv-write.js";

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

async function testSkipWhenDigestSame() {
  const calls = { get: [], put: [] };
  const kv = {
    get: async (key) => {
      calls.get.push(key);
      if (key.endsWith("/latest.digest")) return "sha256:abc";
      return null;
    },
    put: async (key, value) => {
      calls.put.push({ key, value });
      return true;
    }
  };

  const key = "/data/snapshots/market-health/latest.json";
  const digest = "sha256:abc";
  const payload = "{\"schema_version\":\"3.0\"}\n";

  const result = await kvPutSnapshotIfChanged(kv, key, payload, digest, { timeoutMs: 500 });
  assert(result.ok === true, "expected ok=true");
  assert(result.status === "KV_WRITE_SKIPPED_NO_CHANGE", "expected KV_WRITE_SKIPPED_NO_CHANGE");
  assert(calls.put.length === 0, "expected no KV.put calls");
}

async function testWriteWhenDigestDiffers() {
  const calls = { get: [], put: [] };
  const kv = {
    get: async (key) => {
      calls.get.push(key);
      if (key.endsWith("/latest.digest")) return "sha256:old";
      return null;
    },
    put: async (key, value) => {
      calls.put.push({ key, value });
      return true;
    }
  };

  const key = "/data/snapshots/market-health/latest.json";
  const digest = "sha256:new";
  const payload = "{\"schema_version\":\"3.0\"}\n";

  const result = await kvPutSnapshotIfChanged(kv, key, payload, digest, { timeoutMs: 500 });
  assert(result.ok === true, "expected ok=true");
  assert(result.status === "KV_WRITE_OK", "expected KV_WRITE_OK");
  assert(calls.put.length === 2, "expected 2 KV.put calls (snapshot + digest)");
  assert(calls.put[0].key === key, "expected first put to snapshot key");
  assert(calls.put[1].key === "/data/snapshots/market-health/latest.digest", "expected second put to digest key");
  assert(String(calls.put[1].value) === digest, "expected digest value stored");
}

async function main() {
  await testSkipWhenDigestSame();
  await testWriteWhenDigestDiffers();
  process.stdout.write("p3 kv-write dedupe tests: OK\n");
}

main().catch((error) => {
  process.stderr.write(`p3 kv-write dedupe tests: FAIL\n${error.stack || error.message || String(error)}\n`);
  process.exit(1);
});
