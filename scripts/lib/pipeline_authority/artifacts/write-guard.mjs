import path from 'node:path';
import { incrementAuthorityMetric } from '../state/metrics.mjs';

const AUTHORITATIVE_ARTIFACTS = [
  {
    id: 'release_state',
    suffix: path.join('public', 'data', 'ops', 'release-state-latest.json'),
    allowedCallers: [
      'scripts/ops/run-pipeline-master-supervisor.mjs',
      'scripts/lib/pipeline_authority/',
    ],
  },
  {
    id: 'pipeline_runtime',
    suffix: path.join('public', 'data', 'pipeline', 'runtime', 'latest.json'),
    allowedCallers: [
      'scripts/ops/build-pipeline-runtime-report.mjs',
      'scripts/lib/pipeline_authority/',
    ],
  },
  {
    id: 'pipeline_epoch',
    suffix: path.join('public', 'data', 'pipeline', 'epoch.json'),
    allowedCallers: [
      'scripts/ops/build-pipeline-epoch.mjs',
      'scripts/lib/pipeline_authority/',
    ],
  },
  {
    id: 'final_integrity_seal',
    suffix: path.join('public', 'data', 'ops', 'final-integrity-seal-latest.json'),
    allowedCallers: [
      'scripts/ops/final-integrity-seal.mjs',
      'scripts/lib/pipeline_authority/',
    ],
  },
];

function findAuthoritativeArtifact(filePath) {
  const resolved = path.resolve(filePath);
  return AUTHORITATIVE_ARTIFACTS.find((artifact) => resolved.endsWith(artifact.suffix)) || null;
}

export function assertAuthorizedAuthoritativeWrite(filePath, stack = null) {
  const artifact = findAuthoritativeArtifact(filePath);
  if (!artifact) return null;
  const stackText = String(stack || new Error().stack || '');
  const authorized = artifact.allowedCallers.some((needle) => stackText.includes(needle));
  if (!authorized) {
    incrementAuthorityMetric('unauthorized_write_total', {
      artifact: artifact.id,
      file_path: path.resolve(filePath),
    });
    throw new Error(`UNAUTHORIZED_WRITE:${artifact.id}:${path.basename(filePath)}`);
  }
  return artifact;
}
