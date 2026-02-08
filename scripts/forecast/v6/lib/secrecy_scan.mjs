#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readJson } from './io.mjs';

function normalize(relPath) {
  return relPath.replace(/\\/g, '/');
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAnyGlob(relPath, globs) {
  const norm = normalize(relPath);
  return globs.some((g) => globToRegExp(g).test(norm));
}

function listGitFiles() {
  const tracked = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set([...tracked, ...untracked])].sort();
}

function forbiddenMatch(relPath, forbidPatterns) {
  const base = path.basename(relPath).toLowerCase();
  if (base.endsWith('.pkl')) {
    return { matched: true, pattern: '*.pkl', hard_block: true };
  }

  for (const pattern of forbidPatterns) {
    const regex = globToRegExp(pattern.toLowerCase());
    if (regex.test(base) || regex.test(relPath.toLowerCase())) {
      return { matched: true, pattern, hard_block: false };
    }
  }
  return { matched: false, pattern: null, hard_block: false };
}

export function runSecrecyScan({ repoRoot = process.cwd(), mode = 'CI' } = {}) {
  const policyPath = path.join(repoRoot, 'policies/forecast/v6/secrecy_policy.v6.json');
  const policy = readJson(policyPath, null);
  if (!policy) {
    throw new Error(`SECRECY_POLICY_MISSING: ${policyPath}`);
  }

  const forbidPatterns = policy.forbid_patterns || [];
  const allowlist = policy.allowlist_exceptions || [];

  const files = listGitFiles();
  const findings = [];

  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;

    const match = forbiddenMatch(normalize(rel), forbidPatterns);
    if (!match.matched) continue;

    const isAllowed = matchesAnyGlob(normalize(rel), allowlist);
    const shouldBlock = match.hard_block || !isAllowed;

    if (shouldBlock) {
      findings.push({ file: normalize(rel), pattern: match.pattern });
    }
  }

  const result = {
    schema: 'forecast_secrecy_scan_v6',
    mode,
    scanned_files: files.length,
    findings,
    pass: findings.length === 0
  };

  const outPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/policy_violations', `secrecy_scan_${mode.toLowerCase()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = (modeArg ? modeArg.split('=')[1] : 'CI').toUpperCase();

  try {
    const result = runSecrecyScan({ mode });
    if (!result.pass) {
      console.error(`SECRECY_SCAN_FAILED: ${result.findings.length} forbidden files detected`);
      for (const finding of result.findings.slice(0, 50)) {
        console.error(` - ${finding.file} (${finding.pattern})`);
      }
      process.exit(1);
    }
    console.log(`SECRECY_SCAN_OK: scanned=${result.scanned_files}`);
  } catch (err) {
    console.error(`SECRECY_SCAN_ERROR: ${err.message}`);
    process.exit(1);
  }
}

export default { runSecrecyScan };
