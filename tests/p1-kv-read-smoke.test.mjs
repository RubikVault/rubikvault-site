#!/usr/bin/env node
import assert from "node:assert/strict";
import { serveStaticJson } from "../functions/api/_shared/static-only.js";

async function run() {
  let callCount = 0;

  const moduleName = "market-health";
  const origin = "http://example.test";

  global.fetch = async (url) => {
    callCount += 1;

    if (String(url).endsWith("/data/manifest.json")) {
      return {
        ok: true,
        json: async () => ({
          active_build_id: "TEST_BUILD",
          modules: {
            [moduleName]: {
              cache: { kv_enabled: true, preferred_source: "KV" }
            }
          }
        })
      };
    }

    if (String(url).endsWith("/data/registry/modules.json")) {
      return {
        ok: true,
        json: async () => ({
          modules: {
            [moduleName]: { tier: "critical", domain: "stocks", ui_contract: { policy: "always" } }
          }
        })
      };
    }

    if (String(url).endsWith(`/data/snapshots/${moduleName}/latest.json`)) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema_version: "3.0",
            metadata: { validation: { passed: true }, published_at: "2026-01-01T00:00:00Z", source: "asset" },
            data: [{ items: [1] }],
            error: null
          })
      };
    }

    return { ok: false, text: async () => "" };
  };

  const env = {
    RV_KV: {
      get: async () => null
    }
  };

  const req = new Request(`${origin}/api/${moduleName}?debug=1`);
  const res = await serveStaticJson(req, env, {});
  assert.equal(res.status, 200);

  const body = JSON.parse(await res.text());

  assert.equal(body.debug, true);
  assert.equal(body.module, moduleName);
  assert.equal(body.kv_status, "MISS");
  assert.equal(body.asset_status, "HIT");
  assert.equal(body.served_from, "ASSET");
  assert.equal(body.manifest_ref, "TEST_BUILD");
  assert.equal(typeof body.suggested_action, "string");

  console.log("OK: P1 KV read smoke");
  assert(callCount > 0);
}

run().catch((err) => {
  console.error("FAIL: P1 KV read smoke", err);
  process.exit(1);
});
