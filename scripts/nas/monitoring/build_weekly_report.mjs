#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  average,
  buildHotWindows,
  fileExists,
  formatLocalTimestamp,
  formatNumber,
  isoWeekStamp,
  peak,
  readEventsFile,
  readHistory,
  readProcessLog,
  shortProcessLabel,
  trendLabel
} from './monitoring-lib.mjs';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function recentRows(rows, days) {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return rows.filter((row) => {
    const time = Date.parse(String(row.timestamp || ''));
    return Number.isFinite(time) && time >= cutoff;
  });
}

async function main() {
  const monitoringRoot = argValue('--monitoring-root') || '/volume1/monitoring';
  const outputPath = argValue('--output') || path.join(monitoringRoot, 'reports', 'weekly', `${isoWeekStamp()}.md`);
  const historyPath = path.join(monitoringRoot, 'data', 'history.csv');
  const eventsPath = path.join(monitoringRoot, 'data', 'events.log');
  const processPath = path.join(monitoringRoot, 'data', 'process.log');

  if (!(await fileExists(historyPath))) {
    throw new Error(`history not found: ${historyPath}`);
  }

  const { rows } = await readHistory(historyPath);
  const rows7 = recentRows(rows, 7);
  const rows30 = recentRows(rows, 30);
  const events = await readEventsFile(eventsPath);
  const processRows = await readProcessLog(processPath);
  const diskColumns = Object.keys(rows30[0] || {}).filter((key) => key.startsWith('disk_') && key.endsWith('_temp_c'));
  const hotWindows = buildHotWindows(events.slice(-400), processRows.slice(-1600), 5);

  const cpuValues7 = rows7.map((row) => Number(row.load15 || 0));
  const cpuValues30 = rows30.map((row) => Number(row.load15 || 0));
  const ramValues7 = rows7.map((row) => Number(row.ram_pct || 0));
  const ramValues30 = rows30.map((row) => Number(row.ram_pct || 0));
  const volumeValues7 = rows7.map((row) => Number(row.volume_used_pct || 0));
  const volumeValues30 = rows30.map((row) => Number(row.volume_used_pct || 0));

  const diskLines = diskColumns.length
    ? diskColumns.map((column) => {
      const values = rows30.map((row) => Number(row[column] || 0)).filter((value) => Number.isFinite(value) && value > 0);
      return `- ${column.replace(/^disk_/, '').replace(/_temp_c$/, '')}: avg ${formatNumber(average(values), 1)} C, peak ${formatNumber(peak(values), 1)} C, trend ${trendLabel(values)}`;
    }).join('\n')
    : '- keine Disk-Temperaturhistorie vorhanden';

  const warnCount = events.filter((event) => String(event.level).toUpperCase() === 'WARN').length;
  const critCount = events.filter((event) => String(event.level).toUpperCase() === 'CRIT').length;
  const correlatedProcesses = processRows
    .filter((row) => row.class === 'repo_job')
    .slice(-300)
    .reduce((acc, row) => {
      const label = shortProcessLabel(row.process);
      acc.set(label, (acc.get(label) || 0) + 1);
      return acc;
    }, new Map());

  const topRepoProcesses = Array.from(correlatedProcesses.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `- ${label}: ${count} Samples`)
    .join('\n') || '- keine Repo-/Job-Treffer im Prozesslog';

  const hotWindowLines = hotWindows.length
    ? hotWindows.map((row) => `- ${row.window}: ${row.message}${row.topProcesses.length ? ` | ${row.topProcesses.join(' | ')}` : ''}`).join('\n')
    : '- keine wiederkehrenden Hot-Windows erkannt';

  const lastSample = rows30[rows30.length - 1]?.timestamp || '';
  const markdown = `# Weekly Trend Report ${isoWeekStamp()}

## Zusammenfassung

- Letzte beruecksichtigte Probe: ${formatLocalTimestamp(lastSample)}
- CPU Trend: ${trendLabel(cpuValues7)}
- RAM Trend: ${trendLabel(ramValues7)}
- Volume Trend: ${trendLabel(volumeValues7)}

## CPU

- 7d avg load15: ${formatNumber(average(cpuValues7), 2)}
- 7d peak load15: ${formatNumber(peak(cpuValues7), 2)}
- 30d avg load15: ${formatNumber(average(cpuValues30), 2)}
- 30d peak load15: ${formatNumber(peak(cpuValues30), 2)}
- Trend: ${trendLabel(cpuValues7)}

## RAM

- 7d avg RAM %: ${formatNumber(average(ramValues7), 1)}
- 7d peak RAM %: ${formatNumber(peak(ramValues7), 1)}
- 30d avg RAM %: ${formatNumber(average(ramValues30), 1)}
- 30d peak RAM %: ${formatNumber(peak(ramValues30), 1)}
- Trend: ${trendLabel(ramValues7)}

## Disks

${diskLines}

## Storage

- 7d avg Volume %: ${formatNumber(average(volumeValues7), 1)}
- 7d peak Volume %: ${formatNumber(peak(volumeValues7), 1)}
- 30d avg Volume %: ${formatNumber(average(volumeValues30), 1)}
- 30d peak Volume %: ${formatNumber(peak(volumeValues30), 1)}
- Wachstum: ${trendLabel(volumeValues30)}

## Events

- Warnungen: ${warnCount}
- Kritische Events: ${critCount}
- Auffaellige Zeitfenster:
${hotWindowLines}

## Korrelation

- Hinweis: ${hotWindows[0] ? `wiederkehrende Lastspitzen ${hotWindows[0].window}` : 'keine wiederkehrenden Lastspitzen erkannt'}
- Hauefigste Repo-/Job-Prozesse:
${topRepoProcesses}
`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown, 'utf8');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
