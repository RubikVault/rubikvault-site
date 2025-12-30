import { createTraceId } from "../_shared.js";
import { kvPutJson } from "../../_lib/kv-safe.js";

const SCHEMA = "RUBIKVAULT_DEBUG_BUNDLE_V1";
const EVENT_TTL = 24 * 60 * 60;

function redactKey(key) {
  return /api_key|token|secret|authorization|bearer/i.test(String(key || ""));
}

function redactValue(value) {
  if (typeof value !== "string") return value;
  if (/api_key|token|secret|authorization|bearer/i.test(value)) return "[REDACTED]";
  return value;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (redactKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitize(redactValue(val));
      }
    });
    return result;
  }
  return redactValue(value);
}

export async function onRequestPost({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  let payload = null;
  try {
    payload = await request.json();
  } catch (error) {
    payload = null;
  }

  const sanitized = sanitize(payload || {});
  const hasKV = env?.RV_KV && typeof env.RV_KV.put === "function";
  const key = `log:client:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (hasKV) {
    await kvPutJson(env, key, { ts: new Date().toISOString(), schema: SCHEMA, client: sanitized }, EVENT_TTL);
  }

  return new Response(
    JSON.stringify({ ok: !!hasKV, schema: SCHEMA, traceId, stored: !!hasKV, ts: new Date().toISOString() }),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
  );
}
