export type MetaStatus = "fresh" | "stale" | "closed" | "pending" | "error";

export type EnvelopeError = {
  code: string;
  message: string;
  details?: unknown;
};

export type EnvelopeMeta = {
  status: MetaStatus;
  generated_at: string;
  data_date: string;
  provider: string;
  quality_flags?: string[];
  warnings?: string[];
  timings_ms?: Record<string, number>;
  version?: string;
};

export type Envelope<T> = {
  ok: boolean;
  data: T | null;
  error?: EnvelopeError | null;
  meta: EnvelopeMeta;
};

const STATUS_SET = new Set<MetaStatus>([
  "fresh",
  "stale",
  "closed",
  "pending",
  "error"
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isIsoString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function assertEnvelope(value: unknown): asserts value is Envelope<unknown> {
  assert(typeof value === "object" && value !== null, "Envelope must be an object");
  const obj = value as Envelope<unknown>;
  assert(typeof obj.ok === "boolean", "Envelope.ok must be boolean");
  assert("data" in obj, "Envelope.data missing");
  assert("meta" in obj && typeof obj.meta === "object" && obj.meta !== null, "Envelope.meta missing");

  const meta = obj.meta as EnvelopeMeta;
  assert(typeof meta.status === "string", "Envelope.meta.status missing");
  assert(STATUS_SET.has(meta.status), `Envelope.meta.status invalid: ${meta.status}`);
  assert(typeof meta.generated_at === "string" && isIsoString(meta.generated_at), "Envelope.meta.generated_at must be ISO string");
  assert(typeof meta.data_date === "string", "Envelope.meta.data_date must be string");
  if (meta.data_date) {
    assert(ISO_DATE_RE.test(meta.data_date), "Envelope.meta.data_date must be YYYY-MM-DD");
  }
  assert(typeof meta.provider === "string" && meta.provider.length > 0, "Envelope.meta.provider missing");

  if (obj.error != null) {
    assert(typeof obj.error === "object", "Envelope.error must be object or null");
    const err = obj.error as EnvelopeError;
    assert(typeof err.code === "string", "Envelope.error.code missing");
    assert(typeof err.message === "string", "Envelope.error.message missing");
  }
}

export function okEnvelope<T>(data: T, metaPartial: Partial<EnvelopeMeta> & { provider: string }): Envelope<T> {
  const provider = metaPartial.provider;
  assert(typeof provider === "string" && provider.length > 0, "meta.provider is required");
  const envelope: Envelope<T> = {
    ok: true,
    data: data ?? null,
    error: null,
    meta: {
      status: metaPartial.status ?? "fresh",
      generated_at: new Date().toISOString(),
      data_date: metaPartial.data_date ?? "",
      provider,
      quality_flags: metaPartial.quality_flags,
      warnings: metaPartial.warnings,
      timings_ms: metaPartial.timings_ms,
      version: metaPartial.version
    }
  };
  assertEnvelope(envelope);
  return envelope;
}

export function errorEnvelope(
  code: string,
  message: string,
  metaPartial: Partial<EnvelopeMeta> & { provider: string },
  details?: unknown
): Envelope<null> {
  const provider = metaPartial.provider;
  assert(typeof provider === "string" && provider.length > 0, "meta.provider is required");
  const envelope: Envelope<null> = {
    ok: false,
    data: null,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    },
    meta: {
      status: metaPartial.status ?? "error",
      generated_at: new Date().toISOString(),
      data_date: metaPartial.data_date ?? "",
      provider,
      quality_flags: metaPartial.quality_flags,
      warnings: metaPartial.warnings,
      timings_ms: metaPartial.timings_ms,
      version: metaPartial.version
    }
  };
  assertEnvelope(envelope);
  return envelope;
}
