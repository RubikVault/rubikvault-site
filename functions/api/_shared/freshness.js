export function computeCacheStatus({ hasData, ageSeconds, ttlSeconds, pending }) {
  if (!hasData) {
    return {
      status: pending ? "pending" : "error",
      stale: true
    };
  }
  if (pending) {
    return {
      status: "pending",
      stale: true
    };
  }
  if (!Number.isFinite(ageSeconds)) {
    return {
      status: "stale",
      stale: true
    };
  }
  if (ageSeconds <= ttlSeconds) {
    return {
      status: "fresh",
      stale: false
    };
  }
  return {
    status: "stale",
    stale: true
  };
}
