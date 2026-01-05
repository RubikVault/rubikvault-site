export const EMPTY_REASONS = {
  NONE: null,
  EVENT_NO_EVENTS: "EVENT_NO_EVENTS",
  THRESHOLD_TOO_STRICT: "THRESHOLD_TOO_STRICT",
  CACHE_EMPTY: "CACHE_EMPTY",
  UPSTREAM_AUTH: "UPSTREAM_AUTH",
  UPSTREAM_4XX: "UPSTREAM_4XX",
  STALE: "STALE",
  MIRROR_FALLBACK: "MIRROR_FALLBACK",
  NO_SOURCE: "NO_SOURCE",
  NO_DATA: "NO_DATA",
  CLIENT_ONLY: "CLIENT_ONLY",
  MISSING_ENV: "MISSING_ENV",
  PARSE_ERROR: "PARSE_ERROR",
  CONTRACT_MISMATCH: "CONTRACT_MISMATCH",
  RATE_LIMITED: "RATE_LIMITED"
};

export const STATUS_CODES = {
  OK: "OK",
  OK_EMPTY: "OK_EMPTY",
  PARTIAL: "PARTIAL",
  LOCKED: "LOCKED",
  STALE_OK: "STALE_OK",
  ERROR: "ERROR",
  UNKNOWN: "UNKNOWN"
};

export const SECRETS_REGEX =
  /(sk-[a-z0-9]{8,}|bearer\\s+[a-z0-9._\\-]{8,}|token=\\s*[a-z0-9._\\-]{8,}|api[_-]?key=\\s*[a-z0-9._\\-]{8,}|authorization\\s*:\\s*[a-z0-9+\\/.=:_\\-]{8,})/gi;

const CAPS = {
  upstream: 10,
  issues: 20,
  samples: 5,
  string: 500
};

export function requireEnv(env, name, diag) {
  if (env && env[name] !== undefined && env[name] !== null && env[name] !== "") return env[name];
  if (diag) {
    diag.addMissingEnv(name);
    diag.setEmptyReason(EMPTY_REASONS.MISSING_ENV);
  }
  return null;
}

export class Diag {
  constructor() {
    this.startedAt = Date.now();
    this.emptyReason = null;
    this.truncated = false;
    this.truncationSummary = {};
    this.upstream = [];
    this.issues = [];
    this.samples = [];
    this.gateTimings = new Map();
    this.kvOps = { reads: 0, writes: 0, list: 0, deletes: 0 };
    this.missingEnv = [];
  }

  setEmptyReason(reason) {
    this.emptyReason = reason || null;
  }

  addMissingEnv(name) {
    if (!name) return;
    if (!this.missingEnv.includes(name)) {
      this.missingEnv.push(String(name));
    }
  }

  issue(code, details = {}) {
    const entry = { code: String(code || "ISSUE"), details };
    this.issues.push(entry);
  }

  addSample(sample) {
    this.samples.push(sample);
  }

  markUpstream(hostname, status, ms) {
    if (!hostname) return;
    this.upstream.push({
      host: String(hostname),
      status: typeof status === "number" ? status : null,
      ms: typeof ms === "number" && Number.isFinite(ms) ? ms : null
    });
  }

  gateStart(name) {
    if (!name) return;
    this.gateTimings.set(name, { start: Date.now(), duration: null });
  }

  gateEnd(name) {
    if (!name) return;
    const gate = this.gateTimings.get(name);
    if (!gate || gate.duration !== null) return;
    gate.duration = Date.now() - gate.start;
    this.gateTimings.set(name, gate);
  }

  incrementKv(op) {
    if (!op) return;
    if (this.kvOps[op] === undefined) this.kvOps[op] = 0;
    this.kvOps[op] += 1;
  }

  sanitizeString(value, summaryKey) {
    if (typeof value !== "string") return value;
    const redacted = value.replace(SECRETS_REGEX, "[REDACTED]");
    if (redacted.length > CAPS.string) {
      this.truncated = true;
      this.truncationSummary[summaryKey || "string"] = {
        total: redacted.length,
        kept: CAPS.string
      };
      return redacted.slice(0, CAPS.string);
    }
    return redacted;
  }

  capArray(arr, cap, type) {
    if (!Array.isArray(arr)) return arr;
    const total = arr.length;
    if (total <= cap) {
      this.truncationSummary[`${type}Total`] = total;
      this.truncationSummary[`${type}Kept`] = total;
      return arr;
    }
    this.truncated = true;
    this.truncationSummary[`${type}Total`] = total;
    this.truncationSummary[`${type}Kept`] = cap;
    return arr.slice(0, cap);
  }

  toObject() {
    const gateEntries = Array.from(this.gateTimings.entries()).map(([name, info]) => ({
      name,
      ms: info?.duration ?? null
    }));
    return {
      durationMs: Date.now() - this.startedAt,
      emptyReason: this.emptyReason,
      kvOps: { ...this.kvOps },
      missingEnv: this.missingEnv.slice(),
      upstream: this.upstream.slice(),
      issues: this.issues.slice(),
      samples: this.samples.slice(),
      gateTimings: gateEntries,
      truncated: this.truncated,
      truncationSummary: { ...this.truncationSummary }
    };
  }

  sanitizePayload(mode = "basic") {
    const base = this.toObject();
    const summary = base.truncationSummary || {};
    const sanitized = {
      durationMs: base.durationMs,
      kvOps: base.kvOps,
      emptyReason: base.emptyReason,
      truncated: base.truncated
    };

    if (base.missingEnv.length) sanitized.missingEnv = base.missingEnv;
    if (base.truncated) sanitized.truncationSummary = summary;

    if (mode === "deep") {
      sanitized.upstream = this.capArray(
        base.upstream.map((u) => ({
          host: this.sanitizeString(u.host, "upstreamHost"),
          status: u.status,
          ms: u.ms
        })),
        CAPS.upstream,
        "upstream"
      );
      sanitized.issues = this.capArray(
        base.issues.map((i) => sanitizeAny(i)),
        CAPS.issues,
        "issues"
      );
      sanitized.samples = this.capArray(
        base.samples.map((s) => sanitizeAny(s)),
        CAPS.samples,
        "samples"
      );
      sanitized.gateTimings = base.gateTimings.filter((g) => g.ms !== null);
    }
    return sanitized;
  }

  serialize(mode = "basic") {
    const payload = this.sanitizePayload(mode);
    return sanitizeAny(payload);
  }
}

export function sanitizeAny(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj.replace(SECRETS_REGEX, "[REDACTED]").slice(0, CAPS.string);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeAny(item));
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj).map(([k, v]) => [k, sanitizeAny(v)]);
    return Object.fromEntries(entries);
  }
  return obj;
}
