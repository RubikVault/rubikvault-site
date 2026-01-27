import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeJsonAtomic(filePath, obj) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(tmp, payload, 'utf-8');
  await fs.rename(tmp, filePath);
}
