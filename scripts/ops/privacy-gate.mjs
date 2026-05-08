#!/usr/bin/env node
/**
 * Privacy gate for public deploy output.
 *
 * Fails if Cloudflare bundle contains ops, dashboard, report, pipeline, lesson,
 * diagnostics, local paths, secrets, or other repo-architecture artifacts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const FORBIDDEN_PATH_RULES = [
  { re: /(^|\/)data\/(reports|ops|pipeline|runtime|runblock|decisions)(\/|$)/, reason: 'private_data_dir' },
  { re: /(^|\/)data\/ui(\/|$)/, reason: 'private_ui_state' },
  { re: /(^|\/)(ops|internal|debug|mission-control)(\/|$)/, reason: 'private_route_dir' },
  { re: /(^|\/)(dashboard[^/]*\.html|dashboard_v[^/]*)(\/|$)/, reason: 'dashboard_artifact' },
  { re: /(^|\/)(internal-dashboard[^/]*|mission-control[^/]*|diagnose\.js|learning\.html|proof\.html|runblock[^/]*|quantlab-v4-daily[^/]*)(\/|$)/, reason: 'private_tool_artifact' },
  { re: /(^|\/)[^/]*(report|audit|runbook|lesson|pipeline|diagnostic|internal|mission-control|seal)[^/]*$/i, reason: 'private_name_hint' },
];

const FORBIDDEN_CONTENT_RULES = [
  { re: /\/Users\/[A-Za-z0-9._-]+/i, reason: 'local_user_path' },
  { re: /\/Volumes\/[^"'\s<>{}]+/i, reason: 'local_volume_path' },
  { re: /\bNAS_OPS_ROOT\b|\bTailscale\b|\btailscale\b/, reason: 'local_ops_topology' },
  { re: /\bCLOUDFLARE_API_TOKEN\b|\bEODHD_API_KEY\b|\bPRIVATE KEY\b|\bBEGIN [A-Z ]*PRIVATE KEY\b/, reason: 'secret_marker' },
  { re: /\blessons-learned\b|\brunbook\b|\bmission-control\b|\binternal-dashboard\b/i, reason: 'private_architecture_text' },
];

const TEXT_EXT_RE = /\.(html|js|css|json|txt|md|xml|svg|webmanifest|toml|yaml|yml)$/i;
const MAX_TEXT_SCAN_BYTES = 1024 * 1024;

function normalizeRel(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function classifyPath(relPath) {
  const normalized = normalizeRel(relPath);
  const low = normalized.toLowerCase();
  
  // Explicitly allow listed proof reports
  const allowlistedReports = [
    'data/reports/decision-core-buy-breadth-latest.json',
    'data/reports/stock-decision-core-ui-buy-breadth-latest.json',
    'data/reports/stock-decision-core-ui-random20-latest.json',
    'data/reports/decision-core-historical-replay-latest.json',
    'data/reports/decision-core-outcome-bootstrap-latest.json'
  ];
  if (allowlistedReports.some(allowed => low.endsWith(allowed))) {
    return { ok: true, reason: null };
  }

  const hit = FORBIDDEN_PATH_RULES.find((rule) => rule.re.test(low));
  return hit ? { ok: false, reason: hit.reason } : { ok: true, reason: null };
}

function classifyRepoPath(repoPath) {
  const normalized = normalizeRel(repoPath);
  if (normalized.startsWith('public/')) {
    const publicRel = normalized.slice('public/'.length);
    const check = classifyPath(publicRel);
    if (!check.ok) return check;
  }
  if (/^(mirrors|var\/private|dist\/pages-prod\/data\/(ops|reports|pipeline|ui|runtime|decisions|quantlab))(\/|$)/.test(normalized)) {
    return { ok: false, reason: 'private_repo_artifact' };
  }
  return { ok: true, reason: null };
}

function shouldScanText(filePath) {
  if (!TEXT_EXT_RE.test(filePath)) return false;
  try {
    return fs.statSync(filePath).size <= MAX_TEXT_SCAN_BYTES;
  } catch {
    return false;
  }
}

function walkFiles(rootDir) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(rootDir);
  return files;
}

export function scanDirectory(rootDir) {
  const findings = [];
  if (!fs.existsSync(rootDir)) {
    findings.push({ file: path.relative(REPO_ROOT, rootDir) || rootDir, reason: 'scan_root_missing' });
    return findings;
  }

  for (const full of walkFiles(rootDir)) {
    const rel = normalizeRel(path.relative(rootDir, full));
    const pathCheck = classifyPath(rel);
    if (!pathCheck.ok) {
      findings.push({ file: rel, reason: pathCheck.reason });
      continue;
    }
    if (!shouldScanText(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const contentHit = FORBIDDEN_CONTENT_RULES.find((rule) => rule.re.test(text));
    if (contentHit) findings.push({ file: rel, reason: contentHit.reason });
  }
  return findings;
}

function runSelfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-privacy-gate-'));
  try {
    const leak = path.join(tmp, 'data/reports/leak.json');
    fs.mkdirSync(path.dirname(leak), { recursive: true });
    fs.writeFileSync(leak, '{"private":true}\n', 'utf8');
    const safe = path.join(tmp, 'index.html');
    fs.writeFileSync(safe, '<!doctype html><title>RubikVault</title>\n', 'utf8');
    const findings = scanDirectory(tmp);
    return findings.some((finding) => finding.file === 'data/reports/leak.json');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function changedFiles(baseRef, headRef = 'HEAD') {
  const zero = /^0+$/.test(String(baseRef || ''));
  const args = zero || !baseRef
    ? ['diff', '--name-status', `${headRef}~1`, headRef]
    : ['diff', '--name-status', `${baseRef}...${headRef}`];
  let r = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0 && baseRef && !zero) {
    r = spawnSync('git', ['diff', '--name-status', baseRef, headRef], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  if (r.status !== 0) {
    throw new Error((r.stderr || '').trim() || `git diff failed for ${baseRef || 'HEAD~1'}..${headRef}`);
  }
  return (r.stdout || '').split('\n').filter(Boolean).flatMap((line) => {
    const parts = line.split('\t');
    const status = parts[0] || '';
    if (status === 'D') return [];
    if (status.startsWith('R') || status.startsWith('C')) return [parts[2]].filter(Boolean);
    return [parts[1]].filter(Boolean);
  });
}

function scanChangedFiles(baseRef, headRef) {
  const findings = [];
  for (const file of changedFiles(baseRef, headRef)) {
    const check = classifyRepoPath(file);
    if (!check.ok) findings.push({ file, reason: check.reason });
  }
  return findings;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    if (!runSelfTest()) {
      console.error('[privacy-gate] FAIL: self-test did not catch public/data/reports leak fixture.');
      process.exit(2);
    }
    console.log('[privacy-gate] self-test OK: reports leak fixture blocked.');
    return;
  }

  const changedIndex = argv.indexOf('--changed');
  if (changedIndex >= 0) {
    const baseRef = argv[changedIndex + 1] || process.env.BASE_SHA || process.env.GITHUB_BASE_SHA || '';
    const headRef = argv[changedIndex + 2] || process.env.HEAD_SHA || 'HEAD';
    const findings = scanChangedFiles(baseRef, headRef);
    if (findings.length > 0) {
      console.error(`[privacy-gate] FAIL: ${findings.length} private changed path(s)`);
      for (const finding of findings.slice(0, 50)) console.error(`  ${finding.reason}: ${finding.file}`);
      if (findings.length > 50) console.error(`  ... and ${findings.length - 50} more`);
      process.exit(1);
    }
    console.log('[privacy-gate] OK: changed paths');
    return;
  }

  const distIndex = argv.indexOf('--dist');
  const scanRoot = distIndex >= 0 && argv[distIndex + 1]
    ? path.resolve(argv[distIndex + 1])
    : path.join(REPO_ROOT, 'dist/pages-prod');

  const findings = scanDirectory(scanRoot);
  if (findings.length > 0) {
    console.error(`[privacy-gate] FAIL: ${findings.length} private artifact(s) in ${path.relative(REPO_ROOT, scanRoot) || scanRoot}`);
    for (const finding of findings.slice(0, 50)) {
      console.error(`  ${finding.reason}: ${finding.file}`);
    }
    if (findings.length > 50) console.error(`  ... and ${findings.length - 50} more`);
    process.exit(1);
  }
  console.log(`[privacy-gate] OK: ${path.relative(REPO_ROOT, scanRoot) || scanRoot}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
