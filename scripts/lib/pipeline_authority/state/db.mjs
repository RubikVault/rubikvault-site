import { DatabaseSync } from 'node:sqlite';
import { resolveRuntimeConfig } from '../config/runtime-config.mjs';
import { applyAuthorityMigrations, assertAuthoritySchemaReady } from './migrations.mjs';

export function openAuthorityDb({ migrate = false } = {}) {
  const config = resolveRuntimeConfig({ ensureRuntimeDirs: true });
  const db = new DatabaseSync(config.stateDbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA wal_autocheckpoint = ${config.sqliteWalAutoCheckpointPages};
    PRAGMA busy_timeout = ${config.sqliteBusyTimeoutMs};
  `);
  if (migrate) applyAuthorityMigrations(db);
  else assertAuthoritySchemaReady(db);
  return { db, config };
}

export function withImmediateTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn(db);
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
