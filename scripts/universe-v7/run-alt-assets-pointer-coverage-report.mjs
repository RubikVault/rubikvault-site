#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function main() {
  const py = 'quantlab/.venv/bin/python';
  const args = ['scripts/quantlab/report_alt_assets_pointer_coverage_q1.py'];
  console.log('[AltAssets] >>> Pointer coverage report (registry/history_pack)');
  const r = spawnSync(py, args, { stdio: 'inherit', shell: false });
  if ((r.status ?? 1) !== 0) {
    console.error(`[AltAssets] pointer coverage report failed code=${r.status}`);
    process.exit(r.status ?? 1);
  }
  console.log('[AltAssets] <<< Pointer coverage report done');
}

main();
