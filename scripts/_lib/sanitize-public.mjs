const REDACTION_TOKEN = "<redacted>";
const SENSITIVE_PATTERNS = [
  /\/Users\/[^/]+/i,
  /\/home\/[^/]+/i,
  /[A-Za-z]:\\Users\\[^\\]+/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  /\b[A-Za-z0-9-]+\.local\b/i,
  /\b[A-Za-z0-9-]+\.lan\b/i,
  /\b[A-Za-z0-9-]+\.internal\b/i
];

function sanitizeString(value) {
  let next = value;
  const redactions = [
    { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replace: REDACTION_TOKEN },
    { pattern: /\/Users\/[^/]+/g, replace: "$HOME    { pattern: /\/home\/[^/]+/g, replace: "$HOME    { pattern: /[A-Za-z]:\\Users\\[^\\]+/g, replace: "%USERPROFILE%    { pattern: /\\Users\\[^\\]+/g, replace: "\\Users\\<redacted>" },
    { pattern: /\b[A-Za-z0-9-]+\.local\b/gi, replace: REDACTION_TOKEN },
    { pattern: /\b[A-Za-z0-9-]+\.lan\b/gi, replace: REDACTION_TOKEN },
    { pattern: /\b[A-Za-z0-9-]+\.internal\b/gi, replace: REDACTION_TOKEN }
  ];
  for (const rule of redactions) {
    next = next.replace(rule.pattern, rule.replace);
  }
  if (!/https?:\/\//i.test(next) && /^(mirrors|public|internal|\.artifacts)\//i.test(next)) {
    next = REDACTION_TOKEN;
  }
  if (!/https?:\/\//i.test(next) && /^(\/|[A-Za-z]:\\)/.test(next)) {
    next = REDACTION_TOKEN;
  }
  return next;
}

export function sanitizeForPublic(payload, state = { redactions: 0 }, seen = new WeakSet()) {
  if (payload === null || payload === undefined) return payload;
  const valueType = typeof payload;
  if (valueType === "string") {
    const sanitized = sanitizeString(payload);
    if (sanitized !== payload) state.redactions += 1;
    return sanitized;
  }
  if (valueType !== "object") return payload;
  if (seen.has(payload)) {
    throw new Error("sanitize_failed:circular_reference");
  }
  seen.add(payload);
  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizeForPublic(entry, state, seen));
  }
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = sanitizeForPublic(value, state, seen);
  }
  return out;
}

export function assertPublicSafe(payload, label = "payload") {
  const violations = [];
  function walk(node) {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (/https?:\/\//i.test(node)) return;
      for (const regex of SENSITIVE_PATTERNS) {
        if (regex.test(node)) {
          violations.push(regex.toString());
          return;
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  }
  walk(payload);
  if (violations.length) {
    throw new Error(`sanitize_failed:${label}:${violations.join(",")}`);
  }
}

export function redactValue(value) {
  return sanitizeString(String(value || ""));
}
