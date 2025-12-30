const ERROR_CODES = {
  LIMIT_SUBREQUESTS: {
    code: "LIMIT_SUBREQUESTS",
    message: "Too many subrequests",
    severity: "high",
    uiHint: "Reduce upstream fan-out or use caching."
  },
  UPSTREAM_BLOCKED: {
    code: "UPSTREAM_BLOCKED",
    message: "Upstream returned 403",
    severity: "high",
    uiHint: "Upstream blocked the request; check headers and rate limits."
  },
  UPSTREAM_RATE_LIMIT: {
    code: "UPSTREAM_RATE_LIMIT",
    message: "Upstream rate limited the request",
    severity: "medium",
    uiHint: "Back off and increase TTL."
  },
  UPSTREAM_TIMEOUT: {
    code: "UPSTREAM_TIMEOUT",
    message: "Upstream request timed out",
    severity: "medium",
    uiHint: "Increase timeout or reduce upstream load."
  },
  PARSE_ERROR: {
    code: "PARSE_ERROR",
    message: "Upstream response could not be parsed",
    severity: "medium",
    uiHint: "Upstream returned invalid JSON or HTML."
  },
  SCHEMA_INVALID: {
    code: "SCHEMA_INVALID",
    message: "Response schema invalid",
    severity: "medium",
    uiHint: "Check upstream payload shape."
  },
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    message: "Internal error",
    severity: "high",
    uiHint: "Inspect server logs."
  }
};

function isTimeoutError(message, name) {
  const text = String(message || "").toLowerCase();
  return name === "AbortError" || text.includes("timeout") || text.includes("timed out");
}

function isParseError(message, name) {
  const text = String(message || "");
  return name === "SyntaxError" || text.includes("Unexpected token") || text.includes("JSON");
}

export function normalizeError(error, upstreamStatus) {
  const message = error?.message || String(error || "");
  const name = error?.name || "";
  if (error?.code && ERROR_CODES[error.code]) {
    return {
      code: error.code,
      message: error.message || ERROR_CODES[error.code].message,
      details: { ...(error.details || {}) }
    };
  }
  if (message.includes("Too many subrequests") || message.toLowerCase().includes("subrequest")) {
    return {
      code: ERROR_CODES.LIMIT_SUBREQUESTS.code,
      message: ERROR_CODES.LIMIT_SUBREQUESTS.message,
      details: { raw: message }
    };
  }
  if (upstreamStatus === 403) {
    return {
      code: ERROR_CODES.UPSTREAM_BLOCKED.code,
      message: ERROR_CODES.UPSTREAM_BLOCKED.message,
      details: { upstreamStatus }
    };
  }
  if (upstreamStatus === 429) {
    return {
      code: ERROR_CODES.UPSTREAM_RATE_LIMIT.code,
      message: ERROR_CODES.UPSTREAM_RATE_LIMIT.message,
      details: { upstreamStatus }
    };
  }
  if (isTimeoutError(message, name)) {
    return {
      code: ERROR_CODES.UPSTREAM_TIMEOUT.code,
      message: ERROR_CODES.UPSTREAM_TIMEOUT.message,
      details: { raw: message }
    };
  }
  if (isParseError(message, name)) {
    return {
      code: ERROR_CODES.PARSE_ERROR.code,
      message: ERROR_CODES.PARSE_ERROR.message,
      details: { raw: message }
    };
  }
  if (error?.code === "SCHEMA_INVALID") {
    return {
      code: ERROR_CODES.SCHEMA_INVALID.code,
      message: ERROR_CODES.SCHEMA_INVALID.message,
      details: { raw: message }
    };
  }
  return {
    code: ERROR_CODES.INTERNAL_ERROR.code,
    message: ERROR_CODES.INTERNAL_ERROR.message,
    details: { raw: message }
  };
}

export { ERROR_CODES };
