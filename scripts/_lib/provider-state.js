import fs from "node:fs";
import { atomicWriteJson } from "../utils/mirror-io.mjs";

const DEFAULT_ENTRY = {
  cooldownUntil: null,
  circuitState: "closed",
  openUntil: null,
  failures: {},
  lastReason: null,
  lastHttpStatus: null,
  lastSeen: null
};

function nowIso() {
  return new Date().toISOString();
}

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_ENTRY));
}

export function loadProviderState(filePath, providerIds = []) {
  let state = {
    schemaVersion: "v1",
    updatedAt: nowIso(),
    providers: {}
  };

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state = {
            schemaVersion: parsed.schemaVersion || "v1",
            updatedAt: parsed.updatedAt || nowIso(),
            providers: parsed.providers || {}
          };
        }
      }
    } catch (error) {
      state = {
        schemaVersion: "v1",
        updatedAt: nowIso(),
        providers: {}
      };
    }
  }

  for (const id of providerIds) {
    if (!state.providers[id]) {
      state.providers[id] = cloneDefault();
    }
  }

  return state;
}

export function createProviderStateManager(filePath, providerIds = []) {
  const state = loadProviderState(filePath, providerIds);
  const halfOpenUsed = new Set();

  function ensure(providerId) {
    if (!state.providers[providerId]) {
      state.providers[providerId] = cloneDefault();
    }
    return state.providers[providerId];
  }

  function markSeen(entry) {
    entry.lastSeen = nowIso();
  }

  function openCircuit(entry, durationMs) {
    const until = new Date(Date.now() + durationMs).toISOString();
    entry.circuitState = "open";
    entry.openUntil = until;
    return until;
  }

  function shouldSkip(providerId) {
    const entry = ensure(providerId);
    const now = Date.now();
    const cooldownUntil = entry.cooldownUntil ? Date.parse(entry.cooldownUntil) : null;
    if (cooldownUntil && now < cooldownUntil) {
      return {
        skip: true,
        reason: "RATE_LIMITED",
        details: {
          openUntil: null,
          cooldownUntil: entry.cooldownUntil,
          lastReason: entry.lastReason,
          lastHttpStatus: entry.lastHttpStatus
        }
      };
    }

    if (entry.circuitState === "open") {
      const openUntil = entry.openUntil ? Date.parse(entry.openUntil) : null;
      if (openUntil && now < openUntil) {
        return {
          skip: true,
          reason: "CIRCUIT_OPEN",
          details: {
            openUntil: entry.openUntil,
            lastReason: entry.lastReason,
            lastHttpStatus: entry.lastHttpStatus
          }
        };
      }
      entry.circuitState = "half_open";
      entry.openUntil = null;
      halfOpenUsed.delete(providerId);
    }

    if (entry.circuitState === "half_open") {
      if (halfOpenUsed.has(providerId)) {
        return {
          skip: true,
          reason: "CIRCUIT_OPEN",
          details: {
            openUntil: entry.openUntil,
            lastReason: entry.lastReason,
            lastHttpStatus: entry.lastHttpStatus
          }
        };
      }
      halfOpenUsed.add(providerId);
    }

    return { skip: false, reason: null, details: null };
  }

  function recordSuccess(providerId) {
    const entry = ensure(providerId);
    markSeen(entry);
    entry.failures = {};
    entry.lastReason = "OK";
    entry.lastHttpStatus = null;
    entry.cooldownUntil = null;
    entry.circuitState = "closed";
    entry.openUntil = null;
  }

  function recordFailure(providerId, reason, details = {}) {
    const entry = ensure(providerId);
    markSeen(entry);
    entry.failures[reason] = (entry.failures[reason] || 0) + 1;
    entry.lastReason = reason;
    entry.lastHttpStatus = Number.isFinite(details.httpStatus) ? details.httpStatus : null;

    if (reason === "RATE_LIMITED" && Number.isFinite(details.retryAfterSec)) {
      entry.cooldownUntil = new Date(Date.now() + details.retryAfterSec * 1000).toISOString();
    }

    if (reason === "UNAUTHORIZED") {
      if (entry.failures[reason] >= 3) {
        openCircuit(entry, 60 * 60 * 1000);
      }
    }

    if (reason === "PROVIDER_HTTP_ERROR" && Number(details.httpStatus) >= 500) {
      if (entry.failures[reason] >= 3) {
        openCircuit(entry, 15 * 60 * 1000);
      }
    }

    if (entry.circuitState === "half_open") {
      openCircuit(entry, 15 * 60 * 1000);
    }
  }

  function recordSkip(providerId, reason, details = {}) {
    const entry = ensure(providerId);
    markSeen(entry);
    entry.lastReason = reason;
    entry.lastHttpStatus = Number.isFinite(details.httpStatus) ? details.httpStatus : null;
  }

  function save() {
    state.updatedAt = nowIso();
    atomicWriteJson(filePath, state);
  }

  return {
    state,
    ensure,
    shouldSkip,
    recordSuccess,
    recordFailure,
    recordSkip,
    save
  };
}
