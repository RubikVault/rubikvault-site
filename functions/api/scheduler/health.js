import { jsonEnvelopeResponse } from "../_shared/envelope.js";
import { getJsonKV, nowUtcIso, parseIsoDateToMs, todayUtcDate } from "../_shared/cache-law.js";
import { readSchedulerStatus } from "../_shared/scheduler-law.js";

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

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

export async function onRequestGet(context) {
  const env = context?.env || {};
  const maxAgeSeconds = Number(env?.SCHEDULER_HEALTH_MAX_SECONDS) || DEFAULT_MAX_AGE_SECONDS;

  const lastOk = await getJsonKV(env, "meta:scheduler:last_ok");
  const lastRun = await getJsonKV(env, "meta:scheduler:last_run");
  const status = await readSchedulerStatus(env);

  const lastOkValue = lastOk?.value ?? null;
  const lastRunValue = lastRun?.value ?? null;
  const lastOkMs = parseTimestamp(lastOkValue);
  const ageSeconds = lastOkMs ? Math.floor((Date.now() - lastOkMs) / 1000) : null;
  const healthy = typeof ageSeconds === "number" ? ageSeconds <= maxAgeSeconds : false;

  const data = {
    last_ok: lastOkValue,
    last_run: lastRunValue,
    age_s: ageSeconds,
    max_age_s: maxAgeSeconds,
    status
  };

  if (!healthy) {
    return jsonEnvelopeResponse({
      ok: false,
      data,
      error: {
        code: "SCHEDULER_STALE",
        message: "Scheduler heartbeat is stale",
        details: { age_s: ageSeconds, max_age_s: maxAgeSeconds }
      },
      meta: {
        status: "error",
        provider: "scheduler",
        data_date: todayUtcDate()
      },
      status: 503
    });
  }

  return jsonEnvelopeResponse({
    ok: true,
    data,
    meta: {
      status: "live",
      provider: "scheduler",
      data_date: todayUtcDate()
    },
    status: 200,
    headers: {
      "cache-control": "no-store, max-age=0"
    }
  });
}
