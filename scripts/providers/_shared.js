import { sleep } from "../utils/mirror-io.mjs";
import {
  fetchWithRetry as fetchWithRetryCore,
  fetchWithTimeout as fetchWithTimeoutCore
} from "../lib/fetch.js";

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

export async function fetchWithTimeout(url, { headers = {}, timeoutMs = 10000 } = {}) {
  return fetchWithTimeoutCore(url, { headers, timeoutMs });
}

export async function fetchWithRetry(url, ctxOrOptions = {}, optsOrPolicy = {}, policyMaybe = {}) {
  const hasCtx =
    ctxOrOptions &&
    typeof ctxOrOptions === "object" &&
    !Array.isArray(ctxOrOptions) &&
    ("endpoint" in ctxOrOptions || "providerId" in ctxOrOptions || "provider" in ctxOrOptions);

  const options = hasCtx ? optsOrPolicy : ctxOrOptions;
  const policy = hasCtx ? policyMaybe : optsOrPolicy;

  const result = await fetchWithRetryCore(url, options, { ...policy, sleep });
  return result;
}
