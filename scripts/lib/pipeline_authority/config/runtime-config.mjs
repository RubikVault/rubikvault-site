import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
export const REPO_ROOT = path.resolve(CONFIG_DIR, '../../../..');
const DEFAULT_RUNTIME_DIR = path.join(REPO_ROOT, 'var', 'pipeline');

export function resolveRuntimeConfig({ ensureRuntimeDirs = false } = {}) {
  const runtimeDir = path.resolve(process.env.RV_RUNTIME_DIR || DEFAULT_RUNTIME_DIR);
  const keysDir = path.join(runtimeDir, 'keys');
  const config = {
    authorityMode: process.env.RV_AUTHORITY_MODE || 'local_only',
    repoRoot: REPO_ROOT,
    runtimeDir,
    stateDbPath: path.join(runtimeDir, 'state.db'),
    runsDir: path.join(runtimeDir, 'runs'),
    backupsDir: path.join(runtimeDir, 'backups'),
    legacyShadowDir: path.join(runtimeDir, 'legacy_shadow'),
    trashDir: path.join(runtimeDir, 'trash'),
    metricsDir: path.join(runtimeDir, 'metrics'),
    metricsPath: path.join(runtimeDir, 'metrics', 'authority-metrics-latest.json'),
    keysDir,
    finalSealPrivateKeyPath: path.join(keysDir, 'final-seal-ed25519.private.pem'),
    finalSealPublicKeyPath: path.join(keysDir, 'final-seal-ed25519.public.pem'),
    sqliteBusyTimeoutMs: Math.max(1000, Number(process.env.RV_SQLITE_BUSY_TIMEOUT_MS || 5000)),
    sqliteWalAutoCheckpointPages: Math.max(100, Number(process.env.RV_SQLITE_WAL_AUTOCHECKPOINT || 1000)),
    authorityHostId: process.env.RV_AUTHORITY_HOST_ID || os.hostname(),
  };
  if (config.authorityMode !== 'local_only') {
    throw new Error(`unsupported_authority_mode:${config.authorityMode}`);
  }
  if (ensureRuntimeDirs) {
    for (const dir of [
      config.runtimeDir,
      config.runsDir,
      config.backupsDir,
      config.legacyShadowDir,
      config.trashDir,
      config.metricsDir,
      config.keysDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return config;
}
