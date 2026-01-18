import fs from "node:fs";
import path from "node:path";

function ensureObject(value) {
  return value && typeof value === "object" ? value : {};
}

export function loadBudgetsConfig(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, "config", "rv-budgets.json");
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function createUsageCollector(limits = {}) {
  const providers = {};
  const notes = [];

  function ensureProvider(providerId) {
    if (!providers[providerId]) {
      const limit = limits?.providers?.[providerId] || {};
      providers[providerId] = {
        requests: 0,
        credits: 0,
        bytesIn: 0,
        latencyMs: 0,
        errors: {},
        endpoints: {},
        limit: {
          daily: limit.dailyRequests ?? null,
          monthly: limit.monthlyRequests ?? null
        }
      };
    }
    return providers[providerId];
  }

  function ensureEndpoint(providerEntry, endpointId) {
    if (!endpointId) return null;
    if (!providerEntry.endpoints[endpointId]) {
      providerEntry.endpoints[endpointId] = {
        requests: 0,
        credits: 0,
        bytesIn: 0,
        latencyMs: 0,
        errors: {}
      };
    }
    return providerEntry.endpoints[endpointId];
  }

  function record(providerId, { requests = 0, credits = 0, bytesIn = 0, latencyMs = 0, endpoint } = {}) {
    const entry = ensureProvider(providerId);
    entry.requests += requests;
    entry.credits += credits;
    entry.bytesIn += bytesIn;
    entry.latencyMs += latencyMs;
    const endpointEntry = ensureEndpoint(entry, endpoint);
    if (endpointEntry) {
      endpointEntry.requests += requests;
      endpointEntry.credits += credits;
      endpointEntry.bytesIn += bytesIn;
      endpointEntry.latencyMs += latencyMs;
    }
  }

  function recordError(providerId, reason, { endpoint } = {}) {
    const entry = ensureProvider(providerId);
    entry.errors[reason] = (entry.errors[reason] || 0) + 1;
    const endpointEntry = ensureEndpoint(entry, endpoint);
    if (endpointEntry) {
      endpointEntry.errors[reason] = (endpointEntry.errors[reason] || 0) + 1;
    }
  }

  function getProvider(providerId) {
    return ensureProvider(providerId);
  }

  function addNote(note) {
    if (!note) return;
    notes.push(note);
  }

  function snapshot(day) {
    const totals = Object.values(providers).reduce(
      (acc, entry) => {
        acc.requests += entry.requests;
        acc.credits += entry.credits;
        return acc;
      },
      { requests: 0, credits: 0 }
    );
    const daily = { providers, totals };
    const monthly = { providers, totals };
    return {
      day,
      providers,
      totals,
      notes,
      daily,
      monthly
    };
  }

  return { record, recordError, getProvider, addNote, snapshot };
}

function pickUsage(usage, endpoint) {
  if (!usage) return 0;
  if (endpoint && usage.endpoints && usage.endpoints[endpoint]) {
    return usage.endpoints[endpoint].requests || 0;
  }
  return usage.requests || 0;
}

export function createBudgetState(limits = {}, usage) {
  const providers = ensureObject(limits.providers);
  return {
    reserve(providerId, endpoint) {
      const entry = providers?.[providerId];
      if (!entry || entry.dailyRequests === undefined) return true;
      const usageEntry = usage.getProvider(providerId);
      const endpointLimits = entry.endpoints?.[endpoint] || null;
      const limitValue =
        endpointLimits && endpointLimits.dailyRequests !== undefined
          ? endpointLimits.dailyRequests
          : entry.dailyRequests;
      if (!Number.isFinite(limitValue)) return true;
      const current = pickUsage(usageEntry, endpoint);
      if (current >= limitValue) {
        usage.recordError(providerId, "BUDGET_EXHAUSTED", { endpoint });
        return false;
      }
      return true;
    },
    remaining(providerId, endpoint) {
      const entry = providers?.[providerId];
      if (!entry || entry.dailyRequests === undefined) return null;
      const usageEntry = usage.getProvider(providerId);
      const endpointLimits = entry.endpoints?.[endpoint] || null;
      const limitValue =
        endpointLimits && endpointLimits.dailyRequests !== undefined
          ? endpointLimits.dailyRequests
          : entry.dailyRequests;
      if (!Number.isFinite(limitValue)) return null;
      const current = pickUsage(usageEntry, endpoint);
      return Math.max(0, limitValue - current);
    }
  };
}
