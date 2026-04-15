import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';

export async function* iterateGzipNdjson(absPath) {
  if (!fs.existsSync(absPath)) return;
  const rl = readline.createInterface({
    input: fs.createReadStream(absPath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch {
      // ignore malformed lines
    }
  }
}

export async function readGzipNdjson(absPath) {
  const rows = [];
  for await (const row of iterateGzipNdjson(absPath)) {
    rows.push(row);
  }
  return rows;
}
