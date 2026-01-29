import { jsonEnvelopeResponse } from "../_shared/envelope.js";
import { nowUtcIso, todayUtcDate } from "../_shared/cache-law.js";
import { runSchedulerJob } from "../_shared/scheduler-law.js";
import { isPrivilegedDebug, redact } from "../_shared/observability.js";

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_MAX_CONCURRENCY = 3;

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function onRequestPost(context) {
  const { request } = context;
  const env = context?.env || {};

  if (!isPrivilegedDebug(request, env)) {
    return jsonEnvelopeResponse({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Admin token required" },
      meta: {
        status: "error",
        provider: "scheduler",
        data_date: todayUtcDate()
      },
      status: 403
    });
  }

  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return jsonEnvelopeResponse({
      ok: false,
      error: { code: "BAD_REQUEST", message: "Invalid JSON payload" },
      meta: {
        status: "error",
        provider: "scheduler",
        data_date: todayUtcDate()
      },
      status: 400
    });
  }

  const job = typeof payload?.job === "string" ? payload.job : "eod_stock";
  const mode = payload?.mode === "s2" ? "s2" : "s3";
  const assets = Array.isArray(payload?.assets) ? payload.assets : null;
  const universe = payload?.universe || null;
  const chunkSize = clampNumber(payload?.chunk_size || payload?.chunkSize, DEFAULT_CHUNK_SIZE, 1, 200);
  const maxConcurrency = clampNumber(
    payload?.max_concurrency || payload?.maxConcurrency,
    DEFAULT_MAX_CONCURRENCY,
    1,
    5
  );

  const prevAllowWrite = env.__RV_ALLOW_WRITE__;
  env.__RV_ALLOW_WRITE__ = true;

  const result = await runSchedulerJob({
    env,
    job,
    assets,
    universe,
    mode,
    chunkSize,
    maxConcurrency
  });
  env.__RV_ALLOW_WRITE__ = prevAllowWrite;

  const responsePayload = {
    job,
    mode,
    run_id: result.status?.run_id || null,
    started_at: result.status?.started_at || nowUtcIso(),
    finished_at: result.status?.finished_at || nowUtcIso(),
    summary: result.summary,
    timing_ms: result.timing_ms,
    status: result.status
  };

  const safePayload = redact(responsePayload);

  const metaStatus = result.ok ? (result.partial ? "partial" : "fresh") : "error";
  return jsonEnvelopeResponse({
    ok: result.ok,
    data: safePayload,
    error: result.ok ? null : result.error || { code: "SCHEDULER_FAILED", message: "Scheduler failed" },
    meta: {
      status: metaStatus,
      provider: "scheduler",
      data_date: todayUtcDate()
    },
    status: result.ok ? 200 : 500
  });
}
