#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeJsonAtomic } from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/ops/launchd-allowlist.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/ops/launchd-reconcile-latest.json');
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library/LaunchAgents');
const UID_VALUE = String(process.getuid?.() || process.env.UID || '');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runLaunchctl(args) {
  const result = spawnSync('launchctl', args, { encoding: 'utf8', timeout: 15000 });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function listLoadedRubikVaultLabels() {
  const result = runLaunchctl(['list']);
  if (!result.ok) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/).pop())
    .filter((label) => String(label || '').startsWith('com.rubikvault.'));
}

function plistPathForLabel(label) {
  return path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
}

function bootoutLabel(label) {
  const plistPath = plistPathForLabel(label);
  const domain = UID_VALUE ? `gui/${UID_VALUE}` : null;
  const attempts = [
    domain ? ['bootout', `${domain}/${label}`] : null,
    domain ? ['bootout', domain, plistPath] : null,
  ].filter(Boolean);
  for (const args of attempts) {
    const result = runLaunchctl(args);
    if (result.ok) return result;
  }
  return { ok: false, status: 1, stdout: '', stderr: `bootout_failed:${label}` };
}

function installMasterIfMissing(masterLabel) {
  const templatePath = path.join(ROOT, 'scripts/launchd', `${masterLabel}.plist.template`);
  const destination = plistPathForLabel(masterLabel);
  if (!fs.existsSync(templatePath)) {
    return { ok: false, action: 'missing_template', label: masterLabel };
  }
  fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  fs.copyFileSync(templatePath, destination);
  const domain = UID_VALUE ? `gui/${UID_VALUE}` : null;
  if (!domain) return { ok: false, action: 'missing_domain', label: masterLabel };
  runLaunchctl(['bootout', domain, destination]);
  const bootstrap = runLaunchctl(['bootstrap', domain, destination]);
  runLaunchctl(['enable', `${domain}/${masterLabel}`]);
  return { ok: bootstrap.ok, action: 'installed', label: masterLabel, destination, stderr: bootstrap.stderr || null };
}

function main() {
  const mode = process.argv.includes('--enforce') ? 'enforce' : 'report';
  const skipInstallMissing = process.argv.includes('--skip-install-missing');
  const allowlistDoc = readJson(ALLOWLIST_PATH) || { allowed_labels: [] };
  const allowedLabels = new Set(Array.isArray(allowlistDoc.allowed_labels) ? allowlistDoc.allowed_labels : []);
  const loadedLabels = listLoadedRubikVaultLabels();
  const disallowed = loadedLabels.filter((label) => !allowedLabels.has(label));
  const actions = [];
  if (mode === 'enforce') {
    for (const label of disallowed) {
      actions.push({ label, ...bootoutLabel(label) });
    }
    for (const label of allowedLabels) {
      if (!skipInstallMissing && !loadedLabels.includes(label)) {
        actions.push(installMasterIfMissing(label));
      }
    }
  }
  const refreshedLabels = listLoadedRubikVaultLabels();
  const remainingDisallowed = refreshedLabels.filter((label) => !allowedLabels.has(label));
  const payload = {
    schema: 'rv.launchd_reconcile.v1',
    generated_at: new Date().toISOString(),
    mode,
    skip_install_missing: skipInstallMissing,
    allowlist_path: path.relative(ROOT, ALLOWLIST_PATH),
    allowed_labels: [...allowedLabels],
    loaded_labels: refreshedLabels,
    disallowed_labels: remainingDisallowed,
    allowed_launchd_only: remainingDisallowed.length === 0,
    actions,
  };
  writeJsonAtomic(OUTPUT_PATH, payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(payload.allowed_launchd_only ? 0 : 3);
}

main();
