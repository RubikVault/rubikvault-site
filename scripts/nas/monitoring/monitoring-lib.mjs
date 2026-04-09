import fs from 'node:fs/promises';
import path from 'node:path';

const FIXED_HISTORY_HEADERS = [
  'timestamp',
  'hostname',
  'uptime_seconds',
  'uptime_pretty',
  'load1',
  'load5',
  'load15',
  'cpu_cores',
  'cpu_status',
  'ram_total_mb',
  'ram_used_mb',
  'ram_pct',
  'ram_status',
  'volume_path',
  'volume_used_pct',
  'volume_status',
  'raid_status',
  'overall_status',
  'summary'
];

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

export function parseKv(text) {
  const result = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

export function parseTsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const fields = line.split('\t');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = fields[index] ?? '';
    });
    return row;
  });
}

export function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function formatCsv(rows, headers) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  const source = String(text || '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (char === '\r') continue;
    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'disk';
}

export function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function shortProcessLabel(value) {
  const clean = String(value || '')
    .replace(/^repo_job :: /, '')
    .replace(/^system :: /, '')
    .trim();
  if (!clean) return 'n/a';
  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

export function parseIso(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

export function formatLocalTimestamp(value) {
  const time = parseIso(value);
  if (time == null) return String(value || 'n/a');
  return new Date(time).toLocaleString('de-DE');
}

export function formatNumber(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return num.toFixed(digits);
}

export async function loadSnapshot(snapshotDir) {
  const kv = parseKv(await readText(path.join(snapshotDir, 'snapshot.env')));
  const disks = parseTsv(await readText(path.join(snapshotDir, 'disks.tsv'))).map((row) => ({
    name: row.name,
    device: row.device,
    temperature_c: toNumber(row.temperature_c),
    smart_health: row.smart_health || 'unknown',
    reallocated_sectors: toNumber(row.reallocated_sectors) ?? 0,
    pending_sectors: toNumber(row.pending_sectors) ?? 0,
    status: row.status || 'OK'
  }));
  const logs = parseTsv(await readText(path.join(snapshotDir, 'logs.tsv'))).map((row) => ({
    timestamp: row.timestamp || '',
    level: row.level || 'INFO',
    message: row.message || ''
  }));
  const topCpu = parseTsv(await readText(path.join(snapshotDir, 'top_cpu.tsv'))).map((row) => ({
    pid: row.pid || '',
    cpu: toNumber(row.cpu),
    ram: toNumber(row.ram),
    class: row.class || 'system',
    command: row.command || ''
  }));
  const topRam = parseTsv(await readText(path.join(snapshotDir, 'top_ram.tsv'))).map((row) => ({
    pid: row.pid || '',
    cpu: toNumber(row.cpu),
    ram: toNumber(row.ram),
    class: row.class || 'system',
    command: row.command || ''
  }));
  const processSamples = parseTsv(await readText(path.join(snapshotDir, 'process_samples.tsv'))).map((row) => ({
    pid: row.pid || '',
    cpu: toNumber(row.cpu),
    ram: toNumber(row.ram),
    class: row.class || 'system',
    command: row.command || ''
  }));

  return {
    generated_at: kv.generated_at || new Date().toISOString(),
    source: kv.source || 'watch',
    hostname: kv.hostname || '',
    uptime_seconds: toNumber(kv.uptime_seconds) ?? 0,
    uptime_pretty: kv.uptime_pretty || '',
    system: {
      load_1: toNumber(kv.load1) ?? 0,
      load_5: toNumber(kv.load5) ?? 0,
      load_15: toNumber(kv.load15) ?? 0,
      cpu_cores: toNumber(kv.cpu_cores) ?? 1,
      cpu_status: kv.cpu_status || 'OK'
    },
    ram: {
      total_mb: toNumber(kv.ram_total_mb) ?? 0,
      used_mb: toNumber(kv.ram_used_mb) ?? 0,
      used_pct: toNumber(kv.ram_pct) ?? 0,
      status: kv.ram_status || 'OK'
    },
    storage: {
      volume_path: kv.volume_path || '/volume1',
      used_pct: toNumber(kv.volume_used_pct) ?? 0,
      status: kv.volume_status || 'OK'
    },
    raid: {
      status: kv.raid_status || 'OK',
      detail: kv.raid_summary || 'mdstat clean'
    },
    overall_status: kv.overall_status || 'OK',
    summary: kv.summary || 'System stabil',
    logs,
    disks,
    processes: {
      top_cpu: topCpu,
      top_ram: topRam,
      samples: processSamples
    },
    repo_recommendation: kv.repo_recommendation || ''
  };
}

export async function readHistory(historyPath) {
  if (!(await fileExists(historyPath))) {
    return { headers: [], rows: [] };
  }
  const matrix = parseCsv(await readText(historyPath));
  if (!matrix.length) {
    return { headers: [], rows: [] };
  }
  const headers = matrix[0];
  const rows = matrix.slice(1).filter((row) => row.length).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
  return { headers, rows };
}

export function buildHistoryRecord(snapshot) {
  const record = {
    timestamp: snapshot.generated_at,
    hostname: snapshot.hostname,
    uptime_seconds: String(snapshot.uptime_seconds ?? ''),
    uptime_pretty: snapshot.uptime_pretty,
    load1: String(snapshot.system.load_1 ?? ''),
    load5: String(snapshot.system.load_5 ?? ''),
    load15: String(snapshot.system.load_15 ?? ''),
    cpu_cores: String(snapshot.system.cpu_cores ?? ''),
    cpu_status: snapshot.system.cpu_status,
    ram_total_mb: String(snapshot.ram.total_mb ?? ''),
    ram_used_mb: String(snapshot.ram.used_mb ?? ''),
    ram_pct: String(snapshot.ram.used_pct ?? ''),
    ram_status: snapshot.ram.status,
    volume_path: snapshot.storage.volume_path,
    volume_used_pct: String(snapshot.storage.used_pct ?? ''),
    volume_status: snapshot.storage.status,
    raid_status: snapshot.raid.status,
    overall_status: snapshot.overall_status,
    summary: snapshot.summary
  };

  for (const disk of snapshot.disks) {
    record[`disk_${slugify(disk.name)}_temp_c`] = disk.temperature_c == null ? '' : String(disk.temperature_c);
  }
  return record;
}

export function pruneHistoryRows(rows, retentionDays) {
  const maxAgeMs = Number(retentionDays || 90) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return rows.filter((row) => {
    const time = parseIso(row.timestamp);
    if (time == null) return false;
    return now - time <= maxAgeMs;
  });
}

export async function updateHistoryCsv(historyPath, snapshot, retentionDays) {
  const existing = await readHistory(historyPath);
  const dynamicHeaders = new Set(existing.headers.filter((header) => header.startsWith('disk_') && header.endsWith('_temp_c')));
  for (const disk of snapshot.disks) {
    dynamicHeaders.add(`disk_${slugify(disk.name)}_temp_c`);
  }

  const headers = [...FIXED_HISTORY_HEADERS, ...Array.from(dynamicHeaders).sort()];
  const rows = pruneHistoryRows([...existing.rows, buildHistoryRecord(snapshot)], retentionDays);
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, formatCsv(rows, headers), 'utf8');
  return { headers, rows };
}

export async function readEventsFile(eventsPath) {
  const lines = String(await readText(eventsPath)).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(' | ');
    return {
      timestamp: parts[0] || '',
      level: parts[1] || 'INFO',
      message: parts.slice(2).join(' | ') || ''
    };
  });
}

export async function readProcessLog(processPath) {
  const lines = String(await readText(processPath)).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const parts = line.split(' | ');
    const process = parts[1] || '';
    return {
      timestamp: parts[0] || '',
      process,
      cpu: toNumber(parts[2]),
      ram: toNumber(parts[3]),
      class: process.startsWith('repo_job ::') ? 'repo_job' : 'system',
      command: shortProcessLabel(process)
    };
  });
}

export async function listReports(monitoringRoot) {
  const collect = async (dirPath, kind) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => ({
          kind,
          file: entry.name,
          label: kind === 'weekly' ? `Weekly ${entry.name.replace(/\.md$/, '')}` : `Daily ${entry.name.replace(/\.md$/, '')}`,
          href: `./reports/${kind}/${entry.name}`
        }));
    } catch {
      return [];
    }
  };

  const daily = await collect(path.join(monitoringRoot, 'reports', 'daily'), 'daily');
  const weekly = await collect(path.join(monitoringRoot, 'reports', 'weekly'), 'weekly');
  return [...daily.sort((a, b) => b.file.localeCompare(a.file)).slice(0, 10), ...weekly.sort((a, b) => b.file.localeCompare(a.file)).slice(0, 6)];
}

export function buildRepoCorrelation(snapshot, hotWindows = []) {
  const repoNow = snapshot.processes.samples
    .filter((row) => row.class === 'repo_job')
    .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
    .slice(0, 5)
    .map((row) => ({
      pid: row.pid,
      cpu: row.cpu,
      ram: row.ram,
      command: row.command
    }));

  let recommendation = 'Keine auffaellige Repo-/Job-Last im aktuellen Snapshot.';
  if (repoNow.length && snapshot.overall_status !== 'OK') {
    recommendation = `Repo-/Job-Last pruefen: ${repoNow.map((row) => shortProcessLabel(row.command)).join(' | ')}`;
  } else if (hotWindows.length) {
    recommendation = `Wiederkehrende Hotspots: ${hotWindows.map((row) => row.window).join(', ')}`;
  } else if (snapshot.repo_recommendation) {
    recommendation = snapshot.repo_recommendation;
  }

  return {
    repo_processes_now: repoNow,
    recommendation
  };
}

export function buildHotWindows(events, processRows, maxItems = 3) {
  const relevantEvents = events.filter((event) => ['WARN', 'CRIT'].includes(String(event.level || '').toUpperCase()));
  const repoProcesses = processRows.filter((row) => row.class === 'repo_job');
  const bucket = new Map();

  for (const event of relevantEvents) {
    const time = parseIso(event.timestamp);
    if (time == null) continue;
    const date = new Date(time);
    const hour = String(date.getHours()).padStart(2, '0');
    const nextHour = String((date.getHours() + 1) % 24).padStart(2, '0');
    const key = `${hour}:00-${nextHour}:00`;
    const matches = repoProcesses.filter((row) => {
      const processTime = parseIso(row.timestamp);
      if (processTime == null) return false;
      return Math.abs(processTime - time) <= 5 * 60 * 1000;
    });
    const entry = bucket.get(key) || { window: key, eventCount: 0, repoProcessCount: 0, processes: new Map() };
    entry.eventCount += 1;
    entry.repoProcessCount += matches.length;
    for (const row of matches) {
      const label = shortProcessLabel(row.process);
      entry.processes.set(label, (entry.processes.get(label) || 0) + 1);
    }
    bucket.set(key, entry);
  }

  return Array.from(bucket.values())
    .map((entry) => ({
      window: entry.window,
      eventCount: entry.eventCount,
      repoProcessCount: entry.repoProcessCount,
      topProcesses: Array.from(entry.processes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label),
      message: `${entry.eventCount} Warn/CRIT Events, ${entry.repoProcessCount} Repo-/Job-Treffer`
    }))
    .sort((a, b) => {
      const scoreA = a.eventCount * 10 + a.repoProcessCount;
      const scoreB = b.eventCount * 10 + b.repoProcessCount;
      return scoreB - scoreA;
    })
    .slice(0, maxItems);
}

export function buildDailyObject(snapshot, hotWindows = []) {
  return {
    generated_at: snapshot.generated_at,
    overall_status: snapshot.overall_status,
    summary: snapshot.summary,
    system: {
      hostname: snapshot.hostname,
      uptime_seconds: snapshot.uptime_seconds,
      uptime_pretty: snapshot.uptime_pretty,
      load_1: snapshot.system.load_1,
      load_5: snapshot.system.load_5,
      load_15: snapshot.system.load_15,
      cpu_cores: snapshot.system.cpu_cores,
      cpu_status: snapshot.system.cpu_status
    },
    ram: snapshot.ram,
    storage: {
      path: snapshot.storage.volume_path,
      used_pct: snapshot.storage.used_pct,
      status: snapshot.storage.status
    },
    raid: snapshot.raid,
    disks: snapshot.disks,
    logs: snapshot.logs,
    processes: {
      top_cpu: snapshot.processes.top_cpu,
      top_ram: snapshot.processes.top_ram
    },
    repo_correlation: buildRepoCorrelation(snapshot, hotWindows)
  };
}

export function buildDashboardPayload({ daily, historyRows, events, processRows, reports = [] }) {
  const thinnedHistory = (() => {
    const maxPoints = 720;
    if (historyRows.length <= maxPoints) return historyRows;
    const step = Math.ceil(historyRows.length / maxPoints);
    return historyRows.filter((_, index) => index % step === 0 || index === historyRows.length - 1);
  })();
  return {
    generatedAt: daily?.generated_at || new Date().toISOString(),
    daily,
    history: thinnedHistory,
    events: events.slice(-30).reverse(),
    hotWindows: buildHotWindows(events.slice(-200), processRows.slice(-600), 4),
    reports
  };
}

export function buildDailyMarkdown(daily, dashboardPayload) {
  const diskRows = daily.disks.length
    ? daily.disks.map((disk) => `| ${disk.name} | ${disk.temperature_c ?? 'n/a'} | ${disk.smart_health} | ${disk.reallocated_sectors} | ${disk.pending_sectors} | ${disk.status} |`).join('\n')
    : '| keine Disk-Daten | n/a | n/a | n/a | n/a | WARN |';
  const logLines = daily.logs.length
    ? daily.logs.map((log) => `- ${formatLocalTimestamp(log.timestamp)} | ${log.level} | ${log.message}`).join('\n')
    : '- keine kritischen Log-Eintraege gefunden';
  const topCpu = daily.processes.top_cpu.length
    ? daily.processes.top_cpu.map((row) => `| ${row.pid} | ${formatNumber(row.cpu, 1)} | ${formatNumber(row.ram, 1)} | ${row.class} | ${shortProcessLabel(row.command)} |`).join('\n')
    : '| n/a | n/a | n/a | n/a | keine Daten |';
  const topRam = daily.processes.top_ram.length
    ? daily.processes.top_ram.map((row) => `| ${row.pid} | ${formatNumber(row.cpu, 1)} | ${formatNumber(row.ram, 1)} | ${row.class} | ${shortProcessLabel(row.command)} |`).join('\n')
    : '| n/a | n/a | n/a | n/a | keine Daten |';
  const events = dashboardPayload.events.length
    ? dashboardPayload.events.slice(0, 12).map((event) => `- ${formatLocalTimestamp(event.timestamp)} | ${event.level} | ${event.message}`).join('\n')
    : '- keine Event-Timeline vorhanden';
  const hotWindows = dashboardPayload.hotWindows.length
    ? dashboardPayload.hotWindows.map((row) => `- ${row.window}: ${row.message}${row.topProcesses.length ? ` | ${row.topProcesses.join(' | ')}` : ''}`).join('\n')
    : '- keine wiederkehrenden Repo-/Job-Zeitfenster erkannt';

  return `# Daily Health Report ${String(daily.generated_at).slice(0, 10)}

## Zusammenfassung

- Status: **${daily.overall_status}**
- Bewertung: ${daily.summary}
- Repo-/Job-Hinweis: ${daily.repo_correlation.recommendation}

## System

| Feld | Wert |
| --- | --- |
| Timestamp | ${formatLocalTimestamp(daily.generated_at)} |
| Hostname | ${daily.system.hostname} |
| Uptime | ${daily.system.uptime_pretty} |
| CPU Load (1/5/15) | ${formatNumber(daily.system.load_1, 2)} / ${formatNumber(daily.system.load_5, 2)} / ${formatNumber(daily.system.load_15, 2)} |
| CPU Bewertung | ${daily.system.cpu_status} |

## RAM

| Feld | Wert |
| --- | --- |
| Total | ${formatNumber(daily.ram.total_mb, 0)} MB |
| Used | ${formatNumber(daily.ram.used_mb, 0)} MB |
| Used % | ${formatNumber(daily.ram.used_pct, 1)} % |
| Bewertung | ${daily.ram.status} |

## Storage

| Feld | Wert |
| --- | --- |
| Volume | ${daily.storage.path} |
| Used % | ${formatNumber(daily.storage.used_pct, 1)} % |
| Bewertung | ${daily.storage.status} |

## RAID

| Feld | Wert |
| --- | --- |
| Status | ${daily.raid.status} |
| Detail | ${daily.raid.detail} |

## Disks

| Disk | Temp C | SMART | Reallocated | Pending | Bewertung |
| --- | --- | --- | --- | --- | --- |
${diskRows}

## Logs

${logLines}

## Top 5 CPU Prozesse

| PID | CPU % | RAM % | Typ | Prozess |
| --- | --- | --- | --- | --- |
${topCpu}

## Top 5 RAM Prozesse

| PID | CPU % | RAM % | Typ | Prozess |
| --- | --- | --- | --- | --- |
${topRam}

## Event Timeline

${events}

## Zu diesen Zeiten Repo-/Jobs pruefen

${hotWindows}
`;
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function writeDataJs(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `window.MONITORING_DATA = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
}

export function average(values) {
  const filtered = values.map(Number).filter((value) => Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function peak(values) {
  const filtered = values.map(Number).filter((value) => Number.isFinite(value));
  if (!filtered.length) return null;
  return Math.max(...filtered);
}

export function trendLabel(values) {
  const filtered = values.map(Number).filter((value) => Number.isFinite(value));
  if (filtered.length < 4) return 'stabil';
  const pivot = Math.floor(filtered.length / 2);
  const first = average(filtered.slice(0, pivot));
  const second = average(filtered.slice(pivot));
  if (first == null || second == null) return 'stabil';
  if (second - first > Math.max(2, first * 0.08)) return 'steigend';
  if (first - second > Math.max(2, first * 0.08)) return 'fallend';
  return 'stabil';
}

export function isoWeekStamp(date = new Date()) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
