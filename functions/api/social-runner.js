import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse
} from "./_shared.js";
import { buildBrief } from "./social-daily-brief.js";

const FEATURE_ID = "social-runner";
const LOCK_TTL = 300;
const POSTED_TTL = 7 * 24 * 60 * 60;

function mask(value) {
  if (!value) return "";
  return `${String(value).slice(0, 4)}…`;
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const url = new URL(request.url);

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "required" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) {
    return bindingResponse;
  }

  const provided = url.searchParams.get("secret") || "";
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: 401, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "Unauthorized",
        details: { secret: mask(provided) }
      },
      status: 401
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 401,
      durationMs: Date.now() - started
    });
    return response;
  }

  const lockKey = "social:lock";
  const lock = await kvGetJson(env, lockKey);
  if (lock?.hit) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: { skipped: true, reason: "locked" },
      cache: { hit: true, ttl: LOCK_TTL, layer: "kv" },
      upstream: { url: lockKey, status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "kv",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  await kvPutJson(env, lockKey, { ts: new Date().toISOString() }, LOCK_TTL);

  const brief = await buildBrief(env);
  if (!brief.ok) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "kv:last_ok", status: null, snippet: "" },
      error: brief.error || {
        code: "SCHEMA_INVALID",
        message: "Brief generation failed",
        details: {}
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const idKey = `social:posted:${brief.data.idempotencyKey}`;
  const posted = await kvGetJson(env, idKey);
  if (posted?.hit) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: { skipped: true, reason: "idempotent", idempotencyKey: brief.data.idempotencyKey },
      cache: { hit: true, ttl: POSTED_TTL, layer: "kv" },
      upstream: { url: idKey, status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "kv",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  if (env.SOCIAL_AUTOPUBLISH !== "true" || !env.SOCIAL_WEBHOOK_URL) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: {
        skipped: true,
        reason: env.SOCIAL_AUTOPUBLISH !== "true" ? "autopublish_disabled" : "webhook_missing",
        idempotencyKey: brief.data.idempotencyKey
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "config", status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  let upstreamStatus = null;
  try {
    const res = await fetch(env.SOCIAL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text_short: brief.data.text_short,
        text_medium: brief.data.text_medium,
        idempotencyKey: brief.data.idempotencyKey
      })
    });
    upstreamStatus = res.status;
    if (!res.ok) {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "webhook", status: res.status, snippet: "" },
        error: {
          code: res.status === 429 ? "RATE_LIMITED" : "UPSTREAM_4XX",
          message: "Webhook failed",
          details: {}
        },
        status: res.status
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return response;
    }
  } catch (error) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "webhook", status: upstreamStatus, snippet: "" },
      error: {
        code: "UPSTREAM_TIMEOUT",
        message: error?.message || "Webhook request failed",
        details: {}
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: upstreamStatus ?? null,
      durationMs: Date.now() - started
    });
    return response;
  }

  await kvPutJson(env, idKey, { ts: new Date().toISOString() }, POSTED_TTL);
  await kvPutJson(env, "social:last_post_ts", { ts: new Date().toISOString() }, POSTED_TTL);

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: { posted: true, idempotencyKey: brief.data.idempotencyKey },
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "webhook", status: upstreamStatus, snippet: "" }
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: upstreamStatus ?? null,
    durationMs: Date.now() - started
  });
  return response;
}
