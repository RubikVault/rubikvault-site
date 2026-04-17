import fs from 'node:fs';
import path from 'node:path';

function fsyncPathSync(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeBufferDurableAtomicSync(filePath, buffer, { mode = 0o644 } = {}) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  let wroteTmp = false;
  try {
    const fd = fs.openSync(tmp, 'wx', mode);
    try {
      fs.writeFileSync(fd, buffer);
      fs.fsyncSync(fd);
      wroteTmp = true;
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, resolved);
    fsyncPathSync(dir);
  } catch (error) {
    if (error?.code === 'EXDEV') {
      throw new Error(`DURABLE_ATOMIC_WRITE_CROSS_DEVICE_RENAME:${resolved}`);
    }
    if (wroteTmp || fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // best effort cleanup only
      }
    }
    throw error;
  }
}

export function writeTextDurableAtomicSync(filePath, text, options = {}) {
  writeBufferDurableAtomicSync(filePath, Buffer.from(String(text), 'utf8'), options);
}

export function writeJsonDurableAtomicSync(filePath, payload, { spaces = 2, validate = null } = {}) {
  if (typeof validate === 'function') validate(payload);
  writeTextDurableAtomicSync(filePath, `${JSON.stringify(payload, null, spaces)}\n`);
}

export function fsyncDirSync(dirPath) {
  fsyncPathSync(path.resolve(dirPath));
}
