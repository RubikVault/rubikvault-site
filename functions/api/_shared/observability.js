const DROP_KEYS = new Set([
  "cache_key",
  "swr_key",
  "kv_key",
  "kv_keys",
  "provider_url",
  "providerurl"
]);

const MASK_KEYS = new Set([
  "token",
  "api_key",
  "apikey",
  "authorization",
  "password",
  "secret"
]);

const MASK_SUBSTRINGS = ["token", "secret", "apikey", "api_key", "auth"];

function shouldDropKey(key) {
  return DROP_KEYS.has(key);
}

function shouldMaskKey(key) {
  if (MASK_KEYS.has(key)) return true;
  return MASK_SUBSTRINGS.some((part) => key.includes(part));
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (shouldDropKey(lowerKey)) continue;
      if (shouldMaskKey(lowerKey)) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = redactValue(entry);
    }
    return output;
  }
  return value;
}

export function isPublicDebug(url) {
  if (!url) return false;
  try {
    const parsed = url instanceof URL ? url : new URL(url);
    return parsed.searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

export function isPrivilegedDebug(request, env) {
  const token = String(env?.ADMIN_TOKEN || env?.RV_ADMIN_TOKEN || "").trim();
  if (!token) return false;
  const header = request?.headers?.get?.("X-Admin-Token");
  if (header && header === token) return true;
  const auth = request?.headers?.get?.("Authorization") || request?.headers?.get?.("authorization");
  if (!auth) return false;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === token;
}

export function redact(obj) {
  return redactValue(obj);
}

export async function withTimings(fn) {
  const started = Date.now();
  const timings = {
    t_total_ms: 0,
    t_kv_ms: null,
    t_origin_ms: null,
    t_build_ms: null
  };
  const mark = (key, value) => {
    if (!Number.isFinite(value)) return;
    timings[key] = value;
  };
  const result = await fn({ mark, timings });
  timings.t_total_ms = Date.now() - started;
  return { result, timings };
}
