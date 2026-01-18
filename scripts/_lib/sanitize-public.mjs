const RULES = [
  // macOS homes
  { re: /\/Users\/[^/]+/g, to: "/Users/<redacted>" },
  // Linux homes
  { re: /\/home\/[^/]+/g, to: "/home/<redacted>" },
  // Windows homes (drive form)
  { re: /[A-Za-z]:\\Users\\[^\\]+/g, to: "C:\\Users\\<redacted>" },
  // Windows homes (no drive)
  { re: /\\Users\\[^\\]+/g, to: "\\Users\\<redacted>" },
];

export function sanitizeForPublic(input) {
  let s = String(input ?? "");
  for (const r of RULES) s = s.replace(r.re, r.to);
  return s;
}

// Throws if sensitive absolute paths remain after sanitization.
// Keep strict: CI should fail if a file would still leak.
export function assertPublicSafe(text, context = "unknown") {
  const s = String(text ?? "");
  const bad =
    /\/Users\/[^/]+/.test(s) ||
    /\/home\/[^/]+/.test(s) ||
    /[A-Za-z]:\\Users\\[^\\]+/.test(s) ||
    /\\Users\\[^\\]+/.test(s);

  if (bad) {
    const snip = s.replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`Privacy leak detected (${context}): absolute user path remains. snip="${snip}"`);
  }
  return true;
}
