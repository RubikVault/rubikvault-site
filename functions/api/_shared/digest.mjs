export async function sha256Hex(inputString) {
  if (typeof inputString !== "string") {
    throw new Error("DIGEST_INPUT_NOT_STRING");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("WEBCRYPTO_SUBTLE_MISSING");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(inputString);
  const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digestBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
