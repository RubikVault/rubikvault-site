#!/usr/bin/env node

import path from 'node:path';
import {
  buildHotWindows,
  buildDailyMarkdown,
  buildDailyObject,
  buildDashboardPayload,
  fileExists,
  listReports,
  loadSnapshot,
  readEventsFile,
  readProcessLog,
  updateHistoryCsv,
  writeDataJs,
  writeJson
} from './monitoring-lib.mjs';
import fs from 'node:fs/promises';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function main() {
  const monitoringRoot = argValue('--monitoring-root') || '/volume1/monitoring';
  const snapshotDir = argValue('--snapshot-dir');
  const markdownPath = argValue('--markdown-path');
  const autoDailyReportIfMissing = hasFlag('--auto-daily-report-if-missing');
  const autoDailyReportAfterHour = Number(argValue('--auto-daily-report-after-hour') || 0);
  const retentionDays = Number(argValue('--history-retention-days') || process.env.HISTORY_RETENTION_DAYS || 90);

  if (!snapshotDir) {
    throw new Error('missing --snapshot-dir');
  }
  if (!(await fileExists(snapshotDir))) {
    throw new Error(`snapshot dir not found: ${snapshotDir}`);
  }

  const snapshot = await loadSnapshot(snapshotDir);
  const dataDir = path.join(monitoringRoot, 'data');
  const dashboardDir = path.join(monitoringRoot, 'dashboard');
  const historyPath = path.join(dataDir, 'history.csv');
  const dailyPath = path.join(dataDir, 'daily.json');
  const eventsPath = path.join(dataDir, 'events.log');
  const processPath = path.join(dataDir, 'process.log');
  let effectiveMarkdownPath = markdownPath;

  if (!effectiveMarkdownPath && autoDailyReportIfMissing) {
    const reportHour = Number(String(snapshot.generated_at).slice(11, 13) || '0');
    if (reportHour >= autoDailyReportAfterHour) {
      const autoPath = path.join(monitoringRoot, 'reports', 'daily', `${String(snapshot.generated_at).slice(0, 10)}.md`);
      if (!(await fileExists(autoPath))) {
        effectiveMarkdownPath = autoPath;
      }
    }
  }

  const { rows } = await updateHistoryCsv(historyPath, snapshot, retentionDays);
  const events = await readEventsFile(eventsPath);
  const processRows = await readProcessLog(processPath);
  const reports = await listReports(monitoringRoot);
  if (effectiveMarkdownPath) {
    const file = path.basename(effectiveMarkdownPath);
    if (!reports.some((entry) => entry.kind === 'daily' && entry.file === file)) {
      reports.unshift({
        kind: 'daily',
        file,
        label: `Daily ${file.replace(/\.md$/, '')}`,
        href: `./reports/daily/${file}`
      });
    }
  }
  const hotWindows = buildHotWindows(events.slice(-200), processRows.slice(-600), 4);
  const enrichedDaily = buildDailyObject(snapshot, hotWindows);
  const dashboardPayload = buildDashboardPayload({ daily: enrichedDaily, historyRows: rows, events, processRows, reports });

  await writeJson(dailyPath, enrichedDaily);
  await writeDataJs(path.join(dashboardDir, 'data.js'), dashboardPayload);

  if (effectiveMarkdownPath) {
    await fs.mkdir(path.dirname(effectiveMarkdownPath), { recursive: true });
    await fs.writeFile(effectiveMarkdownPath, buildDailyMarkdown(enrichedDaily, dashboardPayload), 'utf8');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
