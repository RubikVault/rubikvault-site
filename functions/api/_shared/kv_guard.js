export function createKVGuard(env, { debugMode = false, debugKind = "", allowPrefixes = [] } = {}) {
  const kv = env?.RV_KV || null;
  const metrics = {
    reads: 0,
    writes: 0,
    deletes: 0,
    lists: 0,
    keys: new Set(),
    warnings: [],
    readsBypassed: 0
  };
  const allowed = Array.isArray(allowPrefixes)
    ? allowPrefixes.map((prefix) => String(prefix || "")).filter(Boolean)
    : [];
  const bypassReads = debugKind === "fresh";

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
      if (debugMode || !isAllowed(key) || !kv || typeof kv.put !== "function") {
        warnForbidden("write", key);
        return null;
      }
      return kv.put(key, value, opts);
    },
    delete: async (key) => {
      metrics.deletes += 1;
      recordKey(key);
      if (debugMode || !isAllowed(key) || !kv || typeof kv.delete !== "function") {
        warnForbidden("delete", key);
        return null;
      }
      return kv.delete(key);
    },
    list: async (opts = {}) => {
      metrics.lists += 1;
      const prefix = opts?.prefix || "";
      recordKey(prefix);
      if (debugMode || !isAllowed(prefix) || !kv || typeof kv.list !== "function") {
        warnForbidden("list", prefix);
        return { keys: [] };
      }
      return kv.list(opts);
    },
    headerValue: () => {
      const keys = Array.from(metrics.keys.values()).join(",");
      return `reads=${metrics.reads};writes=${metrics.writes};deletes=${metrics.deletes};lists=${metrics.lists};keys=${keys}`;
    },
    toDebugJSON: () => ({
      reads: metrics.reads,
      writes: metrics.writes,
      deletes: metrics.deletes,
      lists: metrics.lists,
      keys: Array.from(metrics.keys.values()),
      warnings: metrics.warnings,
      readsBypassed: metrics.readsBypassed,
      debugKind
    })
  };

  return guard;
}
