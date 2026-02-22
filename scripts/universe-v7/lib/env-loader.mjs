import fs from 'node:fs/promises';
import { pathExists } from './common.mjs';

function scoreValue(value) {
  const v = String(value || '').trim();
  if (!v) return -1000;
  let score = 0;
  score += Math.min(40, v.length);
  if (/[0-9]/.test(v)) score += 25;
  if (/[.]/.test(v)) score += 10;
  if (/^[A-Za-z0-9._-]+$/.test(v)) score += 5;
  if (/(DEIN|YOUR|PLACEHOLDER|CHANGE_ME|API_KEY|TOKEN)$/i.test(v)) score -= 60;
  return score;
}

function stripRtfNoise(raw) {
  return String(raw || '')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\\'/g, '')
    .replace(/\r/g, '\n');
}

function parsePairsFromText(raw) {
  const out = new Map();
  const text = String(raw || '');

  function setMaybeBetter(key, val) {
    const current = out.get(key);
    if (!current) {
      out.set(key, val);
      return;
    }
    if (scoreValue(val) > scoreValue(current)) {
      out.set(key, val);
    }
  }

  for (const line of text.split(/\n+/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const idx = clean.indexOf('=');
    if (idx <= 0) continue;
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (/^[A-Z0-9_]+$/.test(key) && val) setMaybeBetter(key, val);
  }

  if (out.size > 0) return out;

  const matches = text.matchAll(/([A-Z][A-Z0-9_]{2,})=([^\s{}\\]+)/g);
  for (const m of matches) {
    const key = String(m[1] || '').trim();
    const val = String(m[2] || '').trim();
    if (key && val) setMaybeBetter(key, val);
  }

  if (out.size === 0) {
    const tokenOnly = text.trim();
    if (/^[A-Za-z0-9._-]{16,}$/.test(tokenOnly)) {
      out.set('EODHD_API_TOKEN', tokenOnly);
    }
  }
  return out;
}

export async function loadEnvFile(filePath) {
  if (!(await pathExists(filePath))) return { loaded: false, vars: {}, reason: 'missing_file' };

  const raw = await fs.readFile(filePath, 'utf8');
  const text = raw.includes('{\\rtf') ? stripRtfNoise(raw) : raw;
  const parsed = parsePairsFromText(text);
  const vars = {};
  for (const [k, v] of parsed.entries()) vars[k] = v;

  if (vars.EODHD_API_TOKEN && !vars.EODHD_API_KEY) {
    vars.EODHD_API_KEY = vars.EODHD_API_TOKEN;
  }

  for (const [k, v] of Object.entries(vars)) {
    if (!v) continue;
    const current = String(process.env[k] || '');
    if (!current) {
      process.env[k] = v;
      continue;
    }
    if (scoreValue(v) > scoreValue(current)) {
      process.env[k] = v;
    }
  }

  return { loaded: true, vars, reason: null };
}
