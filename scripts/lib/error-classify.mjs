const DEFAULT_HINTS = {
  NO_API_KEY: 'Missing upstream API key',
  UPSTREAM_TIMEOUT: 'Upstream request timed out',
  UPSTREAM_4XX: 'Upstream rejected the request',
  UPSTREAM_5XX: 'Upstream server error',
  RATE_LIMIT: 'Upstream rate limit hit',
  VALIDATION_FAILED: 'Record failed validation checks',
  WRITE_FAILED: 'Failed to write artifact'
};

function toLower(value) {
  return String(value || '').toLowerCase();
}

export function classifyError(err, context = {}) {
  const stage = context.stage || null;
  const httpStatus = Number.isFinite(Number(context.httpStatus))
    ? Number(context.httpStatus)
    : Number.isFinite(Number(err?.httpStatus))
      ? Number(err.httpStatus)
      : Number.isFinite(Number(err?.status))
        ? Number(err.status)
        : null;
  const code = String(err?.code || '').toUpperCase();
  const message = toLower(err?.message || err);

  if (context.missingApiKey || code === 'NO_API_KEY' || code === 'MISSING_API_KEY') {
    return { class: 'NO_API_KEY', hint: DEFAULT_HINTS.NO_API_KEY };
  }

  if (stage === 'write') {
    return { class: 'WRITE_FAILED', hint: DEFAULT_HINTS.WRITE_FAILED };
  }

  if (stage === 'validate') {
    return { class: 'VALIDATION_FAILED', hint: DEFAULT_HINTS.VALIDATION_FAILED };
  }

  if (httpStatus === 429 || message.includes('rate limit') || message.includes('too many')) {
    return { class: 'RATE_LIMIT', hint: DEFAULT_HINTS.RATE_LIMIT };
  }

  if (err?.name === 'AbortError' || message.includes('timeout') || message.includes('timed out')) {
    return { class: 'UPSTREAM_TIMEOUT', hint: DEFAULT_HINTS.UPSTREAM_TIMEOUT };
  }

  if (httpStatus && httpStatus >= 500) {
    return { class: 'UPSTREAM_5XX', hint: DEFAULT_HINTS.UPSTREAM_5XX };
  }

  if (httpStatus && httpStatus >= 400) {
    return { class: 'UPSTREAM_4XX', hint: DEFAULT_HINTS.UPSTREAM_4XX };
  }

  return { class: 'UPSTREAM_5XX', hint: DEFAULT_HINTS.UPSTREAM_5XX };
}
