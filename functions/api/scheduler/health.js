import { getJsonKV, nowUtcIso, parseIsoDateToMs, todayUtcDate } from "../_shared/cache-law.js";
import { readSchedulerStatus } from "../_shared/scheduler-law.js";

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const SCHEDULER_OK_STATUS = "ok";
const SCHEDULER_STALE_STATUS = "stale";
const SCHEDULER_NEVER_STATUS = "never_ran";

function parseTimestamp(value) {
  if (typeof value === "string") return parseIsoDateToMs(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (value && typeof value === "object") {
    return parseIsoDateToMs(
      value.last_ok || value.lastOk || value.generated_at || value.ts || value.time || ""
    );
  }
  return 0;
}

async function readFirstKV(env, keys) {
  const list = Array.isArray(keys) ? keys : [];
  for (const key of list) {
    const result = await getJsonKV(env, key);
    if (result?.meta?.hit) {
      return { value: result.value ?? null, key };
    }
  }
  return { value: null, key: list[0] || null };
}

export async function onRequestGet(context) {
  const env = context?.env || {};
  const maxAgeSeconds = Number(env?.SCHEDULER_HEALTH_MAX_SECONDS) || DEFAULT_MAX_AGE_SECONDS;

  const lastOk = await readFirstKV(env, ["meta:scheduler:last_ok", "rv:scheduler:last_ok"]);
  const lastRun = await readFirstKV(env, ["meta:scheduler:last_run", "rv:scheduler:last_run"]);
  const status = await readSchedulerStatus(env);

  const lastOkValue = lastOk?.value ?? null;
  const lastRunValue = lastRun?.value ?? null;
  const lastOkMs = parseTimestamp(lastOkValue);
  const ageSeconds = lastOkMs ? Math.floor((Date.now() - lastOkMs) / 1000) : null;
  const hasLastOk = lastOkValue !== null && lastOkValue !== undefined;
  const healthy = typeof ageSeconds === "number" ? ageSeconds <= maxAgeSeconds : false;
  const healthStatus = hasLastOk
    ? healthy
      ? SCHEDULER_OK_STATUS
      : SCHEDULER_STALE_STATUS
    : SCHEDULER_NEVER_STATUS;

  const data = {
    last_ok: lastOkValue,
    last_run: lastRunValue,
    age_s: ageSeconds,
    max_age_s: maxAgeSeconds,
    status: healthStatus,
    now: nowUtcIso(),
    key: lastOk?.key || "meta:scheduler:last_ok",
    note: hasLastOk ? null : "no_heartbeat_recorded",
    scheduler: status
  };

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0"
  };

  if (!healthy) {
    const payload = {
      ok: false,
      data,
      error: {
        code: "SCHEDULER_STALE",
        message: hasLastOk ? "Scheduler heartbeat is stale" : "Scheduler heartbeat not recorded",
        details: { age_s: ageSeconds, max_age_s: maxAgeSeconds }
      },
      meta: {
        status: "error",
        provider: "scheduler",
        data_date: todayUtcDate()
      }
    };
    return new Response(JSON.stringify(payload), { status: 503, headers });
  }

  const payload = {
    ok: true,
    data,
    error: null,
    meta: {
      status: "live",
      provider: "scheduler",
      data_date: todayUtcDate()
    }
  };
  return new Response(JSON.stringify(payload), { status: 200, headers });
}
