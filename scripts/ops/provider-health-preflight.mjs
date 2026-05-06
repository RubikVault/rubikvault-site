#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg('--env-file', process.env.RV_EODHD_ENV_FILE || '');
const outputPath = getArg('--output', process.env.RV_PROVIDER_HEALTH_REPORT_PATH || 'var/private/ops/provider-health-latest.json');
const minAvailableCalls = Number(getArg('--min-available-calls', process.env.RV_MARKET_REFRESH_MIN_EODHD_AVAILABLE_CALLS || '10000')) || 0;
const timeoutMs = Number(getArg('--timeout-ms', process.env.RV_PROVIDER_HEALTH_TIMEOUT_MS || '20000')) || 20000;
const noLive = args.includes('--no-live') || process.env.RV_PROVIDER_HEALTH_LIVE === '0';
const warnOnly = args.includes('--warn-only') || process.env.RV_PROVIDER_HEALTH_WARN_ONLY === '1';

function readEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

function isPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || ['changeme', 'placeholder', 'dein_key', 'your_key', 'test', 'dummy'].includes(normalized);
}

function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  if (status >= 400) return 'http_error';
  return null;
}

async function fetchJson(url, timeoutMsValue) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMsValue);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: response.status, failure_type: 'invalid_json', text_sample: text.slice(0, 160) };
    }
    return { ok: response.ok, status: response.status, json, failure_type: response.ok ? null : classifyHttpStatus(response.status) };
  } catch (error) {
    return {
      ok: false,
      status: null,
      failure_type: error?.name === 'AbortError' ? 'timeout' : 'worker_exception',
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const envValues = readEnvFile(envFile);
  const token =
    process.env.EODHD_API_TOKEN ||
    process.env.EODHD_API_KEY ||
    envValues.EODHD_API_TOKEN ||
    envValues.EODHD_API_KEY ||
    '';
  const report = {
    schema: 'rv.provider_health_preflight.v1',
    generated_at: new Date().toISOString(),
    provider: 'EODHD',
    ok: false,
    status: 'unknown',
    failure_type: null,
    min_available_calls: minAvailableCalls,
    env_file_present: Boolean(envFile && fs.existsSync(envFile)),
    live_probe: { skipped: noLive },
    budget: null,
  };

  if (isPlaceholder(token)) {
    report.status = 'blocked';
    report.failure_type = 'missing_api_key';
  } else if (noLive) {
    report.ok = true;
    report.status = 'env_only';
  } else {
    const url = `https://eodhd.com/api/user?api_token=${encodeURIComponent(token)}&fmt=json`;
    const probe = await fetchJson(url, timeoutMs);
    report.live_probe = { skipped: false, ok: probe.ok, status: probe.status, failure_type: probe.failure_type || null };
    if (!probe.ok) {
      report.status = 'blocked';
      report.failure_type = probe.failure_type || 'provider_unavailable';
      if (probe.error) report.live_probe.error = probe.error;
      if (probe.text_sample) report.live_probe.text_sample = probe.text_sample;
    } else {
      const doc = probe.json || {};
      const apiRequests = Number(doc.apiRequests || 0);
      const dailyRateLimit = Number(doc.dailyRateLimit || 0);
      const extraLimit = Number(doc.extraLimit || 0);
      const apiRequestsDate = String(doc.apiRequestsDate || '');
      const today = new Date().toISOString().slice(0, 10);
      const dailyRemaining = apiRequestsDate === today ? Math.max(0, dailyRateLimit - apiRequests) : dailyRateLimit;
      const available = Math.max(0, dailyRemaining + Math.max(0, extraLimit));
      report.budget = {
        apiRequests,
        apiRequestsDate,
        dailyRateLimit,
        extraLimit,
        dailyRemaining,
        available,
      };
      if (available < minAvailableCalls) {
        report.status = 'blocked';
        report.failure_type = 'daily_cap_below_floor';
      } else {
        report.ok = true;
        report.status = 'healthy';
      }
    }
  }

  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok && !warnOnly) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
