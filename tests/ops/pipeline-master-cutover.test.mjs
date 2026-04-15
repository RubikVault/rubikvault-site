import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('master supervisor launchd template points to the authoritative master supervisor', () => {
  const template = fs.readFileSync(path.join(ROOT, 'scripts/launchd/com.rubikvault.pipeline.master.plist.template'), 'utf8');
  assert.match(template, /run-pipeline-master-supervisor\.mjs/);
});

test('dashboard supervisor installer uses pipeline master and no longer installs overlapping legacy watchers', () => {
  const installer = fs.readFileSync(path.join(ROOT, 'scripts/install_dashboard_green_supervisors_launchd.sh'), 'utf8');
  assert.match(installer, /install_pipeline_master_launchd\.sh/);
  assert.equal(installer.includes('install_dashboard_green_watch_launchd.sh'), false);
  assert.equal(installer.includes('install_night_supervisor_launchd.sh'), false);
});

test('launchd reconcile can purge legacy agents without bootstrapping a missing master', () => {
  const reconciler = fs.readFileSync(path.join(ROOT, 'scripts/ops/reconcile-rubikvault-launchd.mjs'), 'utf8');
  assert.match(reconciler, /--skip-install-missing/);
  assert.match(reconciler, /!skipInstallMissing && !loadedLabels\.includes\(label\)/);
  assert.match(reconciler, /skip_install_missing/);
});
