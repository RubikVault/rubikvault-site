import { getShadowPayload, markStalePayload } from "./store.js";

function defaultMissingCheck(payload) {
  return !payload || payload.ok === false;
}

export function resolveWithShadow(featureId, payload, { logger, isMissing, reason } = {}) {
  const missingCheck = isMissing || defaultMissingCheck;
  if (!missingCheck(payload)) {
    return payload;
  }

  const shadow = getShadowPayload(featureId, logger);
  if (!shadow) {
    return payload;
  }

  const merged = markStalePayload(shadow, reason || "STALE_FALLBACK");
  return {
    ...merged,
    error: payload?.error || merged.error
  };
}

