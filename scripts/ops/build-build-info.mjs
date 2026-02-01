#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, 'public', 'data', 'build-info.json');

function safeExec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

const envSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null;
const gitSha = envSha || safeExec('git rev-parse HEAD');
const branch = safeExec('git rev-parse --abbrev-ref HEAD');
const now = new Date().toISOString();

const payload = {
  git_sha: gitSha || null,
  build_time_utc: now,
  env: {
    node: process.version,
    ci: Boolean(process.env.CI),
    github_actions: Boolean(process.env.GITHUB_ACTIONS),
    cf_pages: Boolean(process.env.CF_PAGES),
    cf_pages_commit_sha: process.env.CF_PAGES_COMMIT_SHA || null,
    github_sha: process.env.GITHUB_SHA || null,
    branch
  }
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
process.stdout.write(`OK: build-info written ${OUT_PATH}\n`);
