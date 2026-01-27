import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

function parseArgs(argv) {
  const out = { universe: 'nasdaq100', outDir: 'public/data' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--universe') {
      out.universe = argv[i + 1] || out.universe;
      i += 1;
    } else if (arg === '--out') {
      out.outDir = argv[i + 1] || out.outDir;
      i += 1;
    }
  }
  return out;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function fail(message) {
  throw new Error(message);
}

function assertManifest(doc) {
  if (!doc || typeof doc !== 'object') fail('manifest: not an object');
  if (doc.schema_version !== '1.0') fail('manifest: schema_version must be 1.0');
  if (doc.type !== 'eod.latest.manifest') fail('manifest: type must be eod.latest.manifest');
  if (typeof doc.generated_at !== 'string') fail('manifest: generated_at missing');
  if (typeof doc.universe !== 'string') fail('manifest: universe missing');
  if (!Number.isInteger(doc.total_symbols)) fail('manifest: total_symbols must be int');
  if (!Number.isInteger(doc.chunk_size)) fail('manifest: chunk_size must be int');
  if (!Array.isArray(doc.chunks)) fail('manifest: chunks must be array');
  if (!doc.errors_by_class || typeof doc.errors_by_class !== 'object') fail('manifest: errors_by_class must be object');
}

function assertPipeline(doc) {
  if (!doc || typeof doc !== 'object') fail('pipeline: not an object');
  if (doc.schema_version !== '1.0') fail('pipeline: schema_version must be 1.0');
  if (doc.type !== 'pipeline.truth') fail('pipeline: type must be pipeline.truth');
  if (typeof doc.generated_at !== 'string') fail('pipeline: generated_at missing');
  if (typeof doc.universe !== 'string') fail('pipeline: universe missing');
  if (!doc.refs || typeof doc.refs !== 'object') fail('pipeline: refs missing');
  if (!doc.counts || typeof doc.counts !== 'object') fail('pipeline: counts missing');
  if (!Number.isInteger(doc.counts.expected)) fail('pipeline: counts.expected must be int');
  if (!Number.isInteger(doc.counts.fetched)) fail('pipeline: counts.fetched must be int');
  if (!Number.isInteger(doc.counts.validated)) fail('pipeline: counts.validated must be int');
  if (!Number.isInteger(doc.counts.computed)) fail('pipeline: counts.computed must be int');
  if (!Number.isInteger(doc.counts.static_ready)) fail('pipeline: counts.static_ready must be int');
  if (!doc.degraded_summary || typeof doc.degraded_summary !== 'object') fail('pipeline: degraded_summary missing');
  if (!Number.isInteger(doc.degraded_summary.count)) fail('pipeline: degraded_summary.count must be int');
  if (!doc.degraded_summary.classes || typeof doc.degraded_summary.classes !== 'object') fail('pipeline: degraded_summary.classes must be object');
  if (!Array.isArray(doc.degraded_summary.sample)) fail('pipeline: degraded_summary.sample must be array');
  if (doc.degraded_summary.sample.length > 25) fail('pipeline: degraded_summary.sample max 25');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = path.resolve(REPO_ROOT, args.outDir);

  const universePath = path.join(dataRoot, 'universe', `${args.universe}.json`);
  const manifestPath = path.join(dataRoot, 'eod', 'manifest.latest.json');
  const pipelinePath = path.join(dataRoot, 'pipeline', `${args.universe}.latest.json`);

  const universe = await readJson(universePath);
  const expected = Array.isArray(universe) ? universe.length : 0;

  const manifest = await readJson(manifestPath);
  assertManifest(manifest);

  const pipeline = await readJson(pipelinePath);
  assertPipeline(pipeline);

  if (manifest.total_symbols !== expected) {
    fail(`manifest: total_symbols ${manifest.total_symbols} != universe length ${expected}`);
  }

  if (pipeline.counts.expected !== expected) {
    fail(`pipeline: counts.expected ${pipeline.counts.expected} != universe length ${expected}`);
  }

  process.stdout.write('OK: eod manifest + pipeline latest present and consistent\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
