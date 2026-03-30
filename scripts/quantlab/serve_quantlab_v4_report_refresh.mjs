#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts/quantlab/build_quantlab_v4_daily_report.mjs');
const REPORT_PATH = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-latest.json');
const HOST = process.env.QUANTLAB_V4_REPORT_API_HOST || '127.0.0.1';
const PORT = Number(process.env.QUANTLAB_V4_REPORT_API_PORT || 8791);

let activeRefresh = null;
let lastRefreshAt = null;
let lastRefreshError = '';

function sendJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

function readLatestReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

function runRefresh(trigger = 'manual') {
  if (activeRefresh) return activeRefresh;
  activeRefresh = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BUILD_SCRIPT], {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      lastRefreshError = String(error?.message || error);
      activeRefresh = null;
      reject(error);
    });
    child.on('close', (code) => {
      const stdoutTail = stdout.trim().split(/\r?\n/).filter(Boolean).slice(-20);
      const stderrTail = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-20);
      if (code !== 0) {
        lastRefreshError = stderrTail.at(-1) || stdoutTail.at(-1) || `refresh failed with exit code ${code}`;
        activeRefresh = null;
        reject(new Error(lastRefreshError));
        return;
      }
      try {
        const report = readLatestReport();
        lastRefreshAt = new Date().toISOString();
        lastRefreshError = '';
        activeRefresh = null;
        resolve({
          ok: true,
          trigger,
          refreshedAt: lastRefreshAt,
          stdoutTail,
          stderrTail,
          report,
        });
      } catch (error) {
        lastRefreshError = String(error?.message || error);
        activeRefresh = null;
        reject(error);
      }
    });
  });
  return activeRefresh;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { ok: false, error: 'missing_url' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    let latestReport = null;
    try {
      latestReport = readLatestReport();
    } catch {
      latestReport = null;
    }
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      busy: Boolean(activeRefresh),
      lastRefreshAt,
      lastRefreshError,
      latestReportGeneratedAt: latestReport?.generatedAt || null,
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/quantlab/v4/latest') {
    try {
      sendJson(res, 200, { ok: true, report: readLatestReport() });
    } catch (error) {
      sendJson(res, 404, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/quantlab/v4/refresh') {
    try {
      const payload = await runRefresh('manual_button');
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: String(error?.message || error),
        lastRefreshError,
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.log(`quantlab_v4_refresh_api listening on http://${HOST}:${PORT}`);
});
