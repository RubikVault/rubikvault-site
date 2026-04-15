import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CONTRACTS_PATH = path.join(path.resolve(new URL('.', import.meta.url).pathname), 'readiness-contracts.json');

function loadContracts() {
  return JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
}

function runContract(contract, { baseUrl, ticker = 'AAPL' } = {}) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}${contract.path.replace('{ticker}', encodeURIComponent(ticker))}`;
  const result = spawnSync('curl', [
    '-sS',
    '-X', contract.method || 'GET',
    '--max-time', String(Math.max(1, Math.ceil((contract.timeout_ms || 5000) / 1000))),
    '--connect-timeout', '2',
    url,
  ], {
    encoding: 'utf8',
    timeout: Math.max(1000, Number(contract.timeout_ms || 5000)) + 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const body = result.stdout || '';
  const ok = result.status === 0 && (contract.required_substrings || []).every((needle) => body.includes(needle));
  return {
    id: contract.id,
    ok,
    url,
    exit_code: result.status ?? 1,
    stderr: (result.stderr || '').trim() || null,
  };
}

export function runReadinessProfile(profileId, { baseUrl = 'http://127.0.0.1:8788', ticker = 'AAPL' } = {}) {
  const doc = loadContracts();
  const profile = doc.profiles?.[profileId];
  if (!Array.isArray(profile) || profile.length === 0) {
    return { ok: false, profile_id: profileId, checks: [], error: 'profile_not_found' };
  }
  const contractsById = new Map((doc.contracts || []).map((contract) => [contract.id, contract]));
  const checks = profile.map((id) => runContract(contractsById.get(id), { baseUrl, ticker }));
  return {
    ok: checks.every((check) => check.ok),
    profile_id: profileId,
    checks,
  };
}
