#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const auditDirArg = getArg('--audit-dir');

if (!auditDirArg) {
  process.stderr.write('Usage: node scripts/nas/build-system-partition-audit-summary.mjs --audit-dir <dir>\n');
  process.exit(2);
}

const auditDir = path.resolve(auditDirArg);
const rawDir = path.join(auditDir, 'raw');
const summaryJsonPath = path.join(auditDir, 'summary.json');
const summaryMdPath = path.join(auditDir, 'summary.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseDfTable(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 6) return null;
      return {
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        avail: parts[3],
        use_percent: parts[4],
        mount: parts[5],
      };
    })
    .filter(Boolean);
}

function parseSimpleSizeList(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9]+)\s+(.+)$/);
      if (!match) return null;
      return {
        size_kb: Number(match[1]),
        path: match[2],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.size_kb - a.size_kb);
}

function parsePathTabList(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [size, ...rest] = line.split('\t');
      if (!rest.length || !Number.isFinite(Number(size))) return null;
      return {
        size_bytes: Number(size),
        path: rest.join('\t'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.size_bytes - a.size_bytes);
}

function parseProcessList(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const meta = await readJson(path.join(auditDir, 'meta.json'));
const [
  dfhRaw,
  dfiRaw,
  rootSizesRaw,
  largestFilesRaw,
  updateProcessesRaw,
  varLogRaw,
  tmpRaw,
  coreRaw,
] = await Promise.all([
  readText(path.join(rawDir, 'df-h.txt')),
  readText(path.join(rawDir, 'df-i.txt')),
  readText(path.join(rawDir, 'rootfs-dir-sizes-kb.txt')),
  readText(path.join(rawDir, 'largest-root-files.txt')),
  readText(path.join(rawDir, 'active-update-processes.txt')),
  readText(path.join(rawDir, 'var-log-candidates.txt')),
  readText(path.join(rawDir, 'tmp-candidates.txt')),
  readText(path.join(rawDir, 'core-dump-candidates.txt')),
]);

const dfh = parseDfTable(dfhRaw);
const dfi = parseDfTable(dfiRaw);
const rootFs = dfh.find((row) => row.mount === '/') || null;
const volume1 = dfh.find((row) => row.mount === '/volume1') || null;
const rootFsInodes = dfi.find((row) => row.mount === '/') || null;
const volume1Inodes = dfi.find((row) => row.mount === '/volume1') || null;
const rootSizes = parseSimpleSizeList(rootSizesRaw);
const largestRootFiles = parsePathTabList(largestFilesRaw);
const varLogCandidates = parsePathTabList(varLogRaw);
const tmpCandidates = parsePathTabList(tmpRaw);
const coreDumpCandidates = parsePathTabList(coreRaw);
const updateProcesses = parseProcessList(updateProcessesRaw).filter((line) => line !== 'none');

const summary = {
  schema_version: 'nas.system-partition.audit.summary.v1',
  generated_at: new Date().toISOString(),
  audit_dir: auditDir,
  status: meta?.status || 'unknown',
  blocked_reason: meta?.blocked_reason || null,
  ssh_verified: meta?.status === 'ok',
  remote_report_dir: meta?.remote_report_dir || null,
  root_fs: rootFs,
  volume1,
  root_fs_inodes: rootFsInodes,
  volume1_inodes: volume1Inodes,
  rootfs_dir_sizes_kb: rootSizes,
  largest_root_files: largestRootFiles.slice(0, 50),
  cleanup_candidates: {
    var_log: varLogCandidates.slice(0, 50),
    tmp: tmpCandidates.slice(0, 50),
    core_dumps: coreDumpCandidates.slice(0, 50),
  },
  active_update_processes: updateProcesses,
  scheduler_safe_to_modify: meta?.status === 'ok'
    ? (updateProcesses.length === 0 && !!rootFs && rootFs.mount === '/' && rootFs.use_percent !== '100%')
    : false,
};

const lines = [
  '# NAS System Partition Audit',
  '',
  `Generated at: ${summary.generated_at}`,
  `Status: ${summary.status}`,
  summary.blocked_reason ? `Blocked reason: ${summary.blocked_reason}` : null,
  summary.remote_report_dir ? `Remote report dir: ${summary.remote_report_dir}` : null,
  '',
  '## Filesystems',
  '',
  '| Mount | Size | Used | Avail | Use% |',
  '|---|---|---|---|---|',
  rootFs ? `| / | ${rootFs.size} | ${rootFs.used} | ${rootFs.avail} | ${rootFs.use_percent} |` : '| / | n/a | n/a | n/a | n/a |',
  volume1 ? `| /volume1 | ${volume1.size} | ${volume1.used} | ${volume1.avail} | ${volume1.use_percent} |` : '| /volume1 | n/a | n/a | n/a | n/a |',
  '',
  '## Inodes',
  '',
  '| Mount | Inodes | Used | Free | Use% |',
  '|---|---|---|---|---|',
  rootFsInodes ? `| / | ${rootFsInodes.size} | ${rootFsInodes.used} | ${rootFsInodes.avail} | ${rootFsInodes.use_percent} |` : '| / | n/a | n/a | n/a | n/a |',
  volume1Inodes ? `| /volume1 | ${volume1Inodes.size} | ${volume1Inodes.used} | ${volume1Inodes.avail} | ${volume1Inodes.use_percent} |` : '| /volume1 | n/a | n/a | n/a | n/a |',
  '',
  '## Root-FS Directory Sizes (KB)',
  '',
  ...rootSizes.slice(0, 10).map((row) => `- ${row.path}: ${row.size_kb} KB`),
  '',
  '## Largest Root-FS Files',
  '',
  ...largestRootFiles.slice(0, 10).map((row) => `- ${row.path}: ${row.size_bytes} bytes`),
  '',
  '## Cleanup Candidates',
  '',
  `- /var/log candidates: ${varLogCandidates.length}`,
  `- /tmp + /var/tmp candidates: ${tmpCandidates.length}`,
  `- core/crash candidates: ${coreDumpCandidates.length}`,
  '',
  '## Active Update Processes',
  '',
  ...(updateProcesses.length ? updateProcesses.map((line) => `- ${line}`) : ['- none']),
  '',
  `Scheduler safe to modify: ${summary.scheduler_safe_to_modify ? 'yes' : 'no'}`,
].filter(Boolean);

await fs.mkdir(auditDir, { recursive: true });
await fs.writeFile(summaryJsonPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
await fs.writeFile(summaryMdPath, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${summaryJsonPath}\n${summaryMdPath}\n`);
