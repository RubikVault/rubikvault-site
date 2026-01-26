function isEmptyItems(value) {
  const items =
    value?.data?.items ||
    value?.items ||
    value?.data?.data?.items ||
    value?.data?.signals ||
    value?.signals ||
    [];
  return Array.isArray(items) && items.length === 0;
}

export async function getJSON(env, key) {
  if (!env?.RV_KV || typeof env.RV_KV.get !== "function") {
    return { value: null, hit: false, error: { code: "ERR_BINDING_MISSING" } };
  }
  try {
    const value = await env.RV_KV.get(key, "json");
    return { value, hit: value !== null, error: null };
  } catch (error) {
    return {
      value: null,
      hit: false,
      error: { code: "ERR_KV_READ", message: error?.message || "KV read failed" }
    };
  }
}

export async function putJSON(env, key, obj, { ttlSeconds, allowEmpty = true } = {}) {
  if (!env?.RV_KV || typeof env.RV_KV['put'] !== "function") {
    return { ok: false, skipped: true, reason: "ERR_BINDING_MISSING" };
  }
  if (!allowEmpty && isEmptyItems(obj)) {
    return { ok: false, skipped: true, reason: "NO_DATA" };
  }
  try {
    await env.RV_KV['put'](key, JSON.stringify(obj), {
      expirationTtl: ttlSeconds
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: "ERR_KV_WRITE",
      details: { message: error?.message || "KV write failed" }
    };
  }
}
