import { sleep } from "../utils/mirror-io.mjs";

export function buildProviderError(code, message, details = {}) {
  const error = new Error(message || code);
  error.reason = code;
  error.details = details;
  return error;
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const waitMs = parsed - Date.now();
    if (waitMs > 0) return waitMs;
  }
  return null;
}

function shouldRetryStatus(status) {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

export async function fetchWithRetry(url, ctx, { headers = {}, timeoutMs = 10000 } = {}) {
  const maxRetries = 2;
  let attempt = 0;
  let totalBackoff = 0;

  while (true) {
    if (ctx?.budget?.reserve && !ctx.budget.reserve(ctx.providerId)) {
      throw buildProviderError("BUDGET_EXCEEDED", "budget exceeded", { provider: ctx.providerId });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const text = await res.text();
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      const bytesIn = Buffer.byteLength(text || "", "utf8");
      if (ctx?.usage?.record) {
        ctx.usage.record(ctx.providerId, { requests: 1, credits: 0, bytesIn, latencyMs });
      }

      if (res.ok) {
        return { res, text, latencyMs, bytesIn };
      }

      if (!shouldRetryStatus(res.status)) {
        throw buildProviderError("PROVIDER_HTTP_ERROR", `http_${res.status}`, {
          status: res.status,
          contentType: res.headers.get("content-type") || ""
        });
      }

      if (attempt >= maxRetries) {
        throw buildProviderError("PROVIDER_HTTP_ERROR", `http_${res.status}`, {
          status: res.status,
          contentType: res.headers.get("content-type") || ""
        });
      }

      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      const backoffMs = retryAfter ?? 1000 * Math.pow(2, attempt);
      totalBackoff += backoffMs;
      if (totalBackoff > 30000) {
        throw buildProviderError("PROVIDER_TIMEOUT", "retry_backoff_exceeded", { status: res.status });
      }
      await sleep(backoffMs);
    } catch (error) {
      clearTimeout(timer);
      const isAbort = error?.name === "AbortError";
      if (ctx?.usage?.record) {
        ctx.usage.record(ctx.providerId, { requests: 1, credits: 0, bytesIn: 0, latencyMs: 0 });
      }
      if (isAbort) {
        if (attempt >= maxRetries) {
          throw buildProviderError("PROVIDER_TIMEOUT", "timeout", { url });
        }
      } else if (error?.reason) {
        throw error;
      } else if (attempt >= maxRetries) {
        throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "fetch_failed", { url });
      }
      const backoffMs = 1000 * Math.pow(2, attempt);
      totalBackoff += backoffMs;
      if (totalBackoff > 30000) {
        throw buildProviderError("PROVIDER_TIMEOUT", "retry_backoff_exceeded", { url });
      }
      await sleep(backoffMs);
    }

    attempt += 1;
  }
}
