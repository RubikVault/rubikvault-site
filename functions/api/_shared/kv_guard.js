export function createKVGuard(env, { debugMode = false, debugKind = "", allowPrefixes = [] } = {}) {
  const kv = env?.RV_KV || null;
  const simulateKv429 = env?.RV_SIMULATE_KV_429 === "1";
  const SIM_FLAG = "__RV_SIMULATE_KV_429_FIRED";
  const isGlobalWriteDisabled = () => Boolean(env?.__RV_KV_WRITE_DISABLED__);
  const flagOn = (value) => {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return false;
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
    return true;
  };
  const allowWriteOnView = flagOn(env?.RV_ALLOW_WRITE_ON_VIEW);
  const metrics = {
    reads: 0,
    writes: 0,
    deletes: 0,
    lists: 0,
    keys: new Set(),
    warnings: [],
    readsBypassed: 0,
    writesBypassed: 0,
    writeDisabled: false,
    writeDisabledReason: "",
    writeDisabledStatus: null
  };
  const allowed = Array.isArray(allowPrefixes)
    ? allowPrefixes.map((prefix) => String(prefix || "")).filter(Boolean)
    : [];
  const bypassReads = debugKind === "fresh";

  const isRateLimitError = (error) => {
    const status = error?.status ?? error?.code;
    if (status === 429) return true;
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (name.includes("rate") && name.includes("limit")) return true;
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("too many") ||
      message.includes("exceeded")
    );
  };

  const disableWrites = (error) => {
    metrics.writeDisabled = true;
    metrics.writeDisabledReason = String(error?.message || "rate_limited");
    metrics.writeDisabledStatus = error?.status ?? error?.code ?? 429;
    addWarning("KV_WRITE_DISABLED", metrics.writeDisabledReason);
  };

  const maybeSimulate429 = () => {
    if (!simulateKv429) return;
    if (globalThis[SIM_FLAG]) return;
    globalThis[SIM_FLAG] = true;
    const err = new Error("SIMULATED_KV_429");
    err.status = 429;
    throw err;
  };

  const recordKey = (key) => {
    if (key !== undefined && key !== null) metrics.keys.add(String(key));
  };

  const addWarning = (code, key) => {
    if (!debugMode) return;
    const entry = { code: String(code || "") };
    if (key !== undefined && key !== null) entry.key = String(key);
    metrics.warnings.push(entry);
  };

  const isAllowed = (key) => {
    if (!allowed.length) return false;
    const value = String(key || "");
    return allowed.some((prefix) => value.startsWith(prefix));
  };

  const warnForbidden = (op, key) => {
    console.warn(`[KV-GUARD] forbidden ${op}`, key);
    addWarning(`KV_${op.toUpperCase()}_BLOCKED`, key);
  };

  const guard = {
    metrics,
    get: async (key, opts) => {
      metrics.reads += 1;
      recordKey(key);
      if (bypassReads) {
        metrics.readsBypassed += 1;
        addWarning("KV_READ_BYPASSED", key);
        return null;
      }
      if (!kv || typeof kv.get !== "function") return null;
      return kv.get(key, opts);
    },
    put: async (key, value, opts) => {
      metrics.writes += 1;
      recordKey(key);
      if (metrics.writeDisabled) {
        metrics.writesBypassed += 1;
        addWarning("KV_WRITE_BYPASSED", key);
        return null;
      }
      if (debugMode || !isAllowed(key) || !kv || typeof kv.put !== "function") {
        warnForbidden("write", key);
        return null;
      }
      try {
        maybeSimulate429();
        return await kv.put(key, value, opts);
      } catch (error) {
        if (isRateLimitError(error)) {
          disableWrites(error);
          metrics.writesBypassed += 1;
          return null;
        }
        throw error;
      }
    },
    delete: async (key) => {
      metrics.deletes += 1;
      recordKey(key);
      if (metrics.writeDisabled) {
        metrics.writesBypassed += 1;
        addWarning("KV_DELETE_BYPASSED", key);
        return null;
      }
      if (debugMode || !isAllowed(key) || !kv || typeof kv.delete !== "function") {
        warnForbidden("delete", key);
        return null;
      }
      try {
        maybeSimulate429();
        return await kv.delete(key);
      } catch (error) {
        if (isRateLimitError(error)) {
          disableWrites(error);
          metrics.writesBypassed += 1;
          return null;
        }
        throw error;
      }
    },
    list: async (opts = {}) => {
      metrics.lists += 1;
      const prefix = opts?.prefix || "";
      recordKey(prefix);
      if (metrics.writeDisabled) {
        addWarning("KV_LIST_BYPASSED", prefix);
        return { keys: [] };
      }
      if (debugMode || !isAllowed(prefix) || !kv || typeof kv.list !== "function") {
        warnForbidden("list", prefix);
        return { keys: [] };
      }
      try {
        maybeSimulate429();
        return await kv.list(opts);
      } catch (error) {
        if (isRateLimitError(error)) {
          disableWrites(error);
          return { keys: [] };
        }
        throw error;
      }
    },
    headerValue: () => {
      const keys = Array.from(metrics.keys.values()).join(",");
      return `reads=${metrics.reads};writes=${metrics.writes};deletes=${metrics.deletes};lists=${metrics.lists};writeDisabled=${metrics.writeDisabled ? 1 : 0};writesBypassed=${metrics.writesBypassed};globalWriteDisabled=${isGlobalWriteDisabled() ? 1 : 0};allowWriteOnView=${allowWriteOnView ? 1 : 0};simulateKv429=${flagOn(env?.RV_SIMULATE_KV_429) ? 1 : 0};keys=${keys}`;
    },
    toDebugJSON: () => ({
      reads: metrics.reads,
      writes: metrics.writes,
      deletes: metrics.deletes,
      lists: metrics.lists,
      keys: Array.from(metrics.keys.values()),
      warnings: metrics.warnings,
      readsBypassed: metrics.readsBypassed,
      writesBypassed: metrics.writesBypassed,
      writeDisabled: metrics.writeDisabled,
      writeDisabledReason: metrics.writeDisabledReason,
      writeDisabledStatus: metrics.writeDisabledStatus,
      globalWriteDisabled: isGlobalWriteDisabled(),
      globalWriteDisabledReason: env?.__RV_KV_WRITE_DISABLED_REASON__ || "",
      globalWriteDisabledUntil: env?.__RV_KV_WRITE_DISABLED_UNTIL__ || null,
      allowWriteOnView,
      simulateKv429: flagOn(env?.RV_SIMULATE_KV_429),
      debugKind
    })
  };

  return guard;
}
