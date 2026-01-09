import { sleep } from "../utils/mirror-io.mjs";

export function buildProviderError(code, message, details = {}) {
  const error = new Error(message || code);
  error.reason = code;
  error.details = details;
  return error;
}

export function normalizeProviderDetails(url, details = {}) {
  let urlHost = "";
  try {
    urlHost = new URL(url).host;
  } catch (error) {
    urlHost = "";
  }
  const httpStatus = details.httpStatus ?? details.status ?? null;
  const retryAfterSec = details.retryAfterSec ?? null;
  const snippet = String(details.snippet || "").slice(0, 200);
  return { httpStatus, retryAfterSec, snippet, urlHost, at: new Date().toISOString() };
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const waitMs = parsed - Date.now();
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

export async function fetchWithRetry(url, ctx, { headers = {}, timeoutMs = 10000 } = {}) {
  const maxRetries = 2;
  let attempt = 0;
  let totalBackoff = 0;

  while (true) {
    if (ctx?.budget?.reserve && !ctx.budget.reserve(ctx.providerId)) {
      throw buildProviderError("BUDGET_EXHAUSTED", "budget exhausted", { provider: ctx.providerId });
    }

    try {
      const { res, text, latencyMs, bytesIn } = await fetchWithTimeout(url, { headers, timeoutMs });
      if (ctx?.usage?.record) {
        ctx.usage.record(ctx.providerId, { requests: 1, credits: 0, bytesIn, latencyMs });
      }

      if (res.ok) {
        return { res, text, latencyMs, bytesIn };
      }

      const snippet = (text || "").slice(0, 200);
      const retryAfterSec = parseRetryAfter(res.headers.get("retry-after"));
      const urlHost = normalizeProviderDetails(url).urlHost;
      const errorDetails = {
        httpStatus: res.status,
        retryAfterSec,
        snippet,
        urlHost,
        at: new Date().toISOString()
      };

      if (res.status === 401 || res.status === 403) {
        throw buildProviderError("UNAUTHORIZED", `http_${res.status}`, errorDetails);
      }
      if (res.status === 429) {
        throw buildProviderError("RATE_LIMITED", `http_${res.status}`, errorDetails);
      }
      if (!shouldRetryStatus(res.status) || attempt >= maxRetries) {
        throw buildProviderError("PROVIDER_HTTP_ERROR", `http_${res.status}`, errorDetails);
      }

      const backoffMs = (retryAfterSec ? retryAfterSec * 1000 : null) ?? 1000 * Math.pow(2, attempt);
      totalBackoff += backoffMs;
      if (totalBackoff > 30000) {
        throw buildProviderError("TIMEOUT", "retry_backoff_exceeded", { httpStatus: res.status, urlHost });
      }
      await sleep(backoffMs);
    } catch (error) {
      const isAbort = error?.name === "AbortError";
      if (ctx?.usage?.record) {
        ctx.usage.record(ctx.providerId, { requests: 1, credits: 0, bytesIn: 0, latencyMs: 0 });
      }
      if (isAbort) {
        if (attempt >= maxRetries) {
          throw buildProviderError("TIMEOUT", "timeout", normalizeProviderDetails(url, { timeoutMs }));
        }
      } else if (error?.reason) {
        throw error;
      } else if (attempt >= maxRetries) {
        throw buildProviderError(
          "PROVIDER_BAD_PAYLOAD",
          error?.message || "fetch_failed",
          normalizeProviderDetails(url)
        );
      }
      const backoffMs = 1000 * Math.pow(2, attempt);
      totalBackoff += backoffMs;
      if (totalBackoff > 30000) {
        throw buildProviderError("TIMEOUT", "retry_backoff_exceeded", normalizeProviderDetails(url));
      }
      await sleep(backoffMs);
    }

    attempt += 1;
  }
}
