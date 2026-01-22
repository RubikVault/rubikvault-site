#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const registryPath = path.join(process.cwd(), 'public', 'data', 'registry', 'providers.v1.json');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function spawnValidator(overridePath) {
  const env = { ...process.env, RV_PROVIDERS_REGISTRY_PATH: overridePath };
  const result = spawnSync('node', ['scripts/validate/providers-registry.v1.mjs'], {
    env,
    cwd: process.cwd(),
    encoding: 'utf-8'
  });
  return result;
}

function writeTempRegistry(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-prov-reg-'));
  const filePath = path.join(dir, 'providers.v1.json');
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2));
  return filePath;
}

function loadBaseDoc() {
  const raw = fs.readFileSync(registryPath, 'utf-8');
  return JSON.parse(raw);
}

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push(async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(`   ${error.message}`);
      failed += 1;
    }
  });
}

test('registry passes with two declared providers', async () => {
  const doc = loadBaseDoc();
  if (!Array.isArray(doc.providers) || doc.providers.length < 2) {
    throw new Error('base registry missing providers');
  }
  const tempPath = writeTempRegistry(doc);
  const result = spawnValidator(tempPath);
  if (result.status !== 0) {
    throw new Error(`validator failed: ${result.stderr || result.stdout}`);
  }
});

test('missing auth_env_var fails fast', async () => {
  const doc = loadBaseDoc();
  doc.providers[0] = { ...doc.providers[0] };
  delete doc.providers[0].auth_env_var;
  const tempPath = writeTempRegistry(doc);
  const result = spawnValidator(tempPath);
  if (result.status === 0 || !result.stderr.includes('auth_env_var')) {
    throw new Error('expected auth_env_var error');
  }
});

test('duplicate provider id fails', async () => {
  const doc = loadBaseDoc();
  const clone = { ...doc.providers[0], id: doc.providers[0].id };
  doc.providers.push(clone);
  const tempPath = writeTempRegistry(doc);
  const result = spawnValidator(tempPath);
  if (result.status === 0 || !result.stderr.includes('duplicate provider id')) {
    throw new Error('expected duplicate id error');
  }
});

test('non-numeric cooldown field fails', async () => {
  const doc = loadBaseDoc();
  doc.providers[0] = { ...doc.providers[0], cooldown_minutes_default: 'fast' };
  const tempPath = writeTempRegistry(doc);
  const result = spawnValidator(tempPath);
  if (result.status === 0 || !result.stderr.includes('cooldown_minutes_default')) {
    throw new Error('expected numeric cooldown error');
  }
});

(async () => {
  for (const fn of tests) {
    await fn();
  }
  console.log(`\nTests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
