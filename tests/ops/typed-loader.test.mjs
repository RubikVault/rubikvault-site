import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadJsonArtifact, TYPED_ARTIFACT_STATUS } from '../../scripts/lib/pipeline_authority/artifacts/typed-loader.mjs';
import { resolveReleaseTargetMarketDate } from '../../scripts/ops/pipeline-artifact-contract.mjs';

test('typed loader classifies missing and empty artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-typed-loader-'));
  const missing = loadJsonArtifact(path.join(root, 'missing.json'));
  assert.equal(missing.status, TYPED_ARTIFACT_STATUS.MISSING);

  const emptyPath = path.join(root, 'empty.json');
  fs.writeFileSync(emptyPath, '\n');
  const empty = loadJsonArtifact(emptyPath);
  assert.equal(empty.status, TYPED_ARTIFACT_STATUS.EMPTY);
});

test('typed loader enforces schema versions and legacy release target dates are ignored', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-typed-loader-'));
  const artifactPath = path.join(root, 'artifact.json');
  fs.writeFileSync(artifactPath, `${JSON.stringify({ schema: 'rv_release_state_v1', target_date: '2026-04-09' })}\n`);
  const result = loadJsonArtifact(artifactPath, { expectedSchemas: ['rv_release_state_v3'] });
  assert.equal(result.status, TYPED_ARTIFACT_STATUS.SCHEMA_VERSION_MISMATCH);
  assert.equal(resolveReleaseTargetMarketDate(result.value), null);
});
