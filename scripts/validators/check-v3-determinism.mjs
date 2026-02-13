#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { stableStringify } from '../lib/v3/stable-io.mjs';

async function main() {
  const fixture = JSON.parse(await fs.readFile('tests/fixtures/determinism-pulse-input.json', 'utf8'));
  const expected = (await fs.readFile('tests/fixtures/determinism-pulse-input.sha256', 'utf8')).trim();

  const first = crypto.createHash('sha256').update(stableStringify(fixture)).digest('hex');
  const second = crypto.createHash('sha256').update(stableStringify(fixture)).digest('hex');

  if (first !== second) {
    throw new Error(`DETERMINISM_FAILED:non-repeatable:${first}:${second}`);
  }
  if (first !== expected) {
    throw new Error(`DETERMINISM_FAILED:expected:${expected}:actual:${first}`);
  }

  console.log(`DETERMINISM_OK:${first}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
