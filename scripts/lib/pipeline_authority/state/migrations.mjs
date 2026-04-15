import { AUTHORITY_SCHEMA_VERSIONS } from '../config/schema-versions.mjs';

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        resource_scope TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        target_market_date TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE TABLE IF NOT EXISTS authority_state (
        artifact_name TEXT PRIMARY KEY,
        authority_seq INTEGER NOT NULL,
        last_run_id TEXT,
        artifact_hash TEXT,
        target_market_date TEXT,
        schema_version TEXT,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS leases (
        resource TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        fencing_token INTEGER NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS retry_state (
        step_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        terminal_reason TEXT,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (step_id, run_id)
      )`,
      `CREATE TABLE IF NOT EXISTS step_results (
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (run_id, step_id)
      )`,
      `CREATE TABLE IF NOT EXISTS gate_results (
        run_id TEXT NOT NULL,
        gate_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        recorded_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (run_id, gate_id)
      )`,
      `CREATE TABLE IF NOT EXISTS universe_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        asset_count INTEGER NOT NULL,
        manifest_hash TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        source_ref TEXT,
        active INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS projections (
        projection_name TEXT PRIMARY KEY,
        source_run_id TEXT,
        source_artifact_path TEXT,
        projected_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE TABLE IF NOT EXISTS overrides (
        override_id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        reason TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      )`,
    ],
  },
];

export function applyAuthorityMigrations(db, now = new Date().toISOString()) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const currentVersion = Number(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0);
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    for (const statement of migration.statements) db.exec(statement);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, now);
  }
}

export function assertAuthoritySchemaReady(db) {
  const version = Number(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0);
  if (version < AUTHORITY_SCHEMA_VERSIONS.state_db) {
    throw new Error(`authority_schema_not_ready:${version}`);
  }
}
