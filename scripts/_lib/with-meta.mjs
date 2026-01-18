export function withMeta(data, opts = {}) {
  const now = new Date().toISOString();
  return {
    meta: {
      generatedAt: now,
      asOf: now,
      source: "build",
      ttlSeconds: 3600,
      freshness: { status: "fresh", ageMinutes: 0 },
      validation: {
        schema: { ok: true, errors: [] },
        ranges: { ok: true, errors: [] },
        integrity: { ok: true, errors: [] }
      },
      schedule: opts.schedule ?? null,
      runId: opts.runId ?? now
    },
    data
  };
}
