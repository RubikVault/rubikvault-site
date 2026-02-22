import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeJsonGz(filePath, payload) {
  await ensureDir(filePath);
  const raw = Buffer.from(JSON.stringify(payload));
  const gz = zlib.gzipSync(raw);
  await fs.writeFile(filePath, gz);
}

export async function readJsonGz(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath);
    const text = zlib.gunzipSync(raw).toString('utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export async function writeNdjsonGz(filePath, rows) {
  await ensureDir(filePath);
  const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const out = createWriteStream(tmpPath);
  const gzip = zlib.createGzip();
  gzip.pipe(out);
  try {
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const line = `${JSON.stringify(row)}\n`;
        if (!gzip.write(line)) await once(gzip, 'drain');
      }
    }
    gzip.end();
    await finished(out);
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    gzip.destroy(error);
    out.destroy(error);
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export async function readNdjsonGz(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath);
    const text = zlib.gunzipSync(raw).toString('utf8');
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      out.push(JSON.parse(trimmed));
    }
    return out;
  } catch {
    return fallback;
  }
}
