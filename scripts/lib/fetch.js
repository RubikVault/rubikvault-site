import { sleep as defaultSleep } from "../utils/mirror-io.mjs";

function parseRetryAfter(value, nowMs) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const waitMs = parsed - nowMs;
    if (waitMs > 0) return Math.ceil(waitMs / 1000);
  }
  return null;
}

function shouldRetryStatus(status) {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

export async function fetchWithTimeout(url, { headers = {}, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const bytesIn = Buffer.byteLength(text || "", "utf8");
    return { res, text, latencyMs, bytesIn };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function fetchWithRetry(url, options = {}, policy = {}) {
  const { headers = {}, timeoutMs = 10000 } = options;
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    sleep = defaultSleep
  } = policy;

  let retryCount = 0;
  let rateLimited = false;

  const overallStarted = Date.now();
  let lastAttemptLatencyMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();

    try {
      const { res, text, latencyMs } = await fetchWithTimeout(url, { headers, timeoutMs });
      lastAttemptLatencyMs = latencyMs;

      if (res.ok) {
        return {
          ok: true,
          res,
          response: res,
          text,
          error: null,
          upstream: {
            http_status: res.status,
            latency_ms: Date.now() - overallStarted,
            retry_count: retryCount,
            rate_limited: rateLimited
          }
        };
      }

      const httpStatus = res.status;
      if (httpStatus === 429) {
        rateLimited = true;
      }

      const shouldRetry = shouldRetryStatus(httpStatus) && attempt < maxRetries;
      if (!shouldRetry) {
        const error = new Error(`HTTP ${httpStatus}`);
        error.status = httpStatus;
        error.response = res;
        return {
          ok: false,
          res,
          response: res,
          text,
          error,
          upstream: {
            http_status: httpStatus,
            latency_ms: Date.now() - overallStarted,
            retry_count: retryCount,
            rate_limited: rateLimited
          }
        };
      }

      const retryAfterSec = parseRetryAfter(res.headers.get("retry-after"), Date.now());
      const backoffMs = retryAfterSec ? retryAfterSec * 1000 : baseDelayMs * Math.pow(2, attempt);

      retryCount++;
      await sleep(backoffMs);
    } catch (error) {
      lastAttemptLatencyMs = Date.now() - attemptStart;

      const shouldRetry = attempt < maxRetries;
      if (!shouldRetry) {
        return {
          ok: false,
          res: null,
          response: null,
          text: "",
          error,
          upstream: {
            http_status: null,
            latency_ms: Date.now() - overallStarted,
            retry_count: retryCount,
            rate_limited: rateLimited
          }
        };
      }

      const backoffMs = baseDelayMs * Math.pow(2, attempt);
      retryCount++;
      await sleep(backoffMs);
    }
  }

  return {
    ok: false,
    res: null,
    response: null,
    text: "",
    error: new Error("Max retries exceeded"),
    upstream: {
      http_status: null,
      latency_ms: Date.now() - overallStarted,
      retry_count: retryCount,
      rate_limited: rateLimited
    }
  };
}
