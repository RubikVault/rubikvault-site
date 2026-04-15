#!/usr/bin/env node

import { openAuthorityDb } from '../state/db.mjs';

const { db, config } = openAuthorityDb({ migrate: true });
db.close();
process.stdout.write(`${JSON.stringify({
  ok: true,
  state_db_path: config.stateDbPath,
  runtime_dir: config.runtimeDir,
})}\n`);
