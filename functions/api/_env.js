export function isProduction(env, request) {
  const host = String(request?.headers?.get("host") || "").toLowerCase();
  if (host.endsWith(".pages.dev")) return false;
  const envHint = String(env?.CF_PAGES_ENVIRONMENT || "").toLowerCase();
  if (envHint === "production") return true;
  const branch = String(env?.CF_PAGES_BRANCH || "").toLowerCase();
  if (branch === "main" && !host.endsWith(".pages.dev")) return true;
  if (host === "rubikvault.com" || host.endsWith(".rubikvault.com")) return true;
  return false;
}

function hasInternalToken(env, request) {
  const internal = env?.RV_INTERNAL_TOKEN || "";
  if (!internal) return false;
  try {
    const url = new URL(request?.url || "");
    const provided =
      request?.headers?.get("x-rv-internal-token") || url.searchParams.get("token") || "";
    return Boolean(provided) && provided === internal;
  } catch {
    return false;
  }
}

export function requireDebugToken(env, request) {
  const token = env?.RV_DEBUG_TOKEN || env?.DEBUG_TOKEN || env?.RV_DEBUG_BUNDLE_TOKEN;
  if (!isProduction(env, request)) return true;
  if (hasInternalToken(env, request)) return true;
  if (!token) return false;
  const header = request?.headers?.get("x-rv-debug-token") || "";
  return header === token;
}
