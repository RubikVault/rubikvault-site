import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_BASE = 'public/data/forecast/system';
const MIRROR_LOG_BASE = 'mirrors/forecast/system/logs';

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getPhaseStatusPath(repoRoot, phase) {
  return path.join(repoRoot, PUBLIC_BASE, `forecast-${String(phase || '').trim()}-status.json`);
}

export function getPhaseLogPath(repoRoot, phase, tradingDate = null) {
  const datePart = String(tradingDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return path.join(repoRoot, MIRROR_LOG_BASE, `${String(phase || '').trim()}-${datePart}.log`);
}

export function writeForecastPhaseStatus(repoRoot, phase, status = {}) {
  const filePath = getPhaseStatusPath(repoRoot, phase);
  ensureDir(filePath);
  const payload = {
    schema: 'forecast_phase_status_v1',
    phase: String(phase || '').trim(),
    status: status.status || 'unknown',
    reason: status.reason || null,
    trading_date: status.trading_date || null,
    generated_at: new Date().toISOString(),
    counts: status.counts || {},
    meta: {
      ...(status.meta || {}),
      log_path: status.meta?.log_path || null,
    },
  };
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  return payload;
}
