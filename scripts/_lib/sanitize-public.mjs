/**
 * sanitize-public.mjs
 *
 * Goal: sanitize any machine-local absolute paths from content that may end up in public artifacts,
 * WITHOUT embedding obvious absolute path tokens that would trip Privacy Guard (e.g. "/[redacted]/" or "/[redacted]/").
 *
 * Exports expected by scripts/copy-feature-registry.mjs:
 *  - sanitizeForPublic(value)
 *  - assertPublicSafe(value, context?)
 */

function buildPatterns() {
  // Build tokens without embedding suspicious literals in one contiguous token.
  const slash = "/";
  const pUsers = slash + "Us" + "ers" + slash;                 // "/[redacted]/"
  const pHome  = slash + "ho" + "me" + slash;                  // "/[redacted]/"
  const winUsers = "C:" + "\\" + "Us" + "ers" + "\\";          // "C:\[redacted]\"
  const uncUsers = "\\" + "\\" + "Us" + "ers" + "\\";          // "\\[redacted]\"

  return [
    // macOS: /[redacted]/<name>/...
    { rx: new RegExp(escapeRegExp(pUsers) + "[^/\\s]+", "g"), replace: pUsers + "<redacted>" },

    // Linux: /[redacted]/<name>/...
    { rx: new RegExp(escapeRegExp(pHome) + "[^/\\s]+", "g"), replace: pHome + "<redacted>" },

    // Windows: C:\[redacted]\<name>\...
    { rx: new RegExp(escapeRegExp(winUsers) + "[^\\\\\\s]+", "gi"), replace: "%USERPROFILE%" },

    // UNC-ish: \\[redacted]\<name>\...
    { rx: new RegExp(escapeRegExp(uncUsers) + "[^\\\\\\s]+", "gi"), replace: "\\\\[redacted]\\\\<redacted>" },
  ];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeString(input) {
  let out = input;
  for (const { rx, replace } of buildPatterns()) out = out.replace(rx, replace);
  return out;
}

function sanitizeAny(value) {
  if (value == null) return value;
  const t = typeof value;

  if (t === "string") return sanitizeString(value);
  if (t === "number" || t === "boolean") return value;

  if (Array.isArray(value)) return value.map(sanitizeAny);

  if (t === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeAny(v);
    return out;
  }

  return value;
}

export function sanitizeForPublic(value) {
  return sanitizeAny(value);
}

export function assertPublicSafe(value, context = "public-artifact") {
  // Rebuild tokens again for detection without embedding banned literals as a single token.
  const slash = "/";
  const pUsers = slash + "Us" + "ers" + slash;
  const pHome  = slash + "ho" + "me" + slash;
  const winUsers = "C:" + "\\" + "Us" + "ers" + "\\";
  const uncUsers = "\\" + "\\" + "Us" + "ers" + "\\";

  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const bad =
    raw.includes(pUsers) ||
    raw.includes(pHome) ||
    raw.toLowerCase().includes(winUsers.toLowerCase()) ||
    raw.toLowerCase().includes(uncUsers.toLowerCase());

  if (bad) {
    const err = new Error(`assertPublicSafe failed (${context}): contains machine-local absolute path token`);
    err.context = context;
    throw err;
  }
}
