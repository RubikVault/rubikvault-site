import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sha256Text(text) {
  return sha256Buffer(Buffer.from(text, "utf8"));
}

export async function sha256File(filePath) {
  const data = await fs.readFile(filePath);
  return sha256Buffer(data);
}

export function gzipDeterministic(inputBuffer) {
  return zlib.gzipSync(inputBuffer, {
    level: 9,
    mtime: 0,
    filename: ""
  });
}

export async function writeGzipAtomic(filePath, inputBuffer) {
  const compressed = gzipDeterministic(inputBuffer);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, compressed);
  await fs.rename(tmp, filePath);
  return {
    bytes: compressed.byteLength,
    sha256: sha256Buffer(compressed)
  };
}

export function gunzipToString(buffer) {
  return zlib.gunzipSync(buffer).toString("utf8");
}
