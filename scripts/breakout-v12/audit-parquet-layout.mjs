#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    asOf: '',
    tailRoot: '',
    dailyDeltaRoot: '',
    bucketCount: 128,
    out: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--tail-root=')) args.tailRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--daily-delta-root=')) args.dailyDeltaRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--bucket-count=')) args.bucketCount = Number.parseInt(arg.split('=')[1] || '128', 10) || 128;
    else if (arg.startsWith('--out=')) args.out = arg.split('=')[1] || '';
  }
  return args;
}

function writeJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function deltaPath(root, asOf, bucket) {
  const dated = path.join(root, `date=${asOf}`, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
  if (fs.existsSync(dated)) return dated;
  return path.join(root, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  const buckets = [];
  for (let bucket = 0; bucket < args.bucketCount; bucket += 1) {
    const tailPath = path.join(args.tailRoot, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
    const dPath = deltaPath(args.dailyDeltaRoot, args.asOf, bucket);
    const rec = {
      bucket,
      tail_path: tailPath,
      delta_path: dPath,
      tail_exists: fs.existsSync(tailPath),
      delta_exists: fs.existsSync(dPath),
      tail_size_bytes: fs.existsSync(tailPath) ? fs.statSync(tailPath).size : 0,
      delta_size_bytes: fs.existsSync(dPath) ? fs.statSync(dPath).size : 0,
    };
    if (!rec.tail_exists) errors.push(`TAIL_BUCKET_MISSING:${bucket}`);
    if (!rec.delta_exists) errors.push(`DELTA_BUCKET_MISSING:${bucket}`);
    buckets.push(rec);
  }
  const payload = {
    schema_version: 'breakout_v12_parquet_layout_audit_v1',
    generated_at: new Date().toISOString(),
    as_of: args.asOf,
    ok: errors.length === 0,
    bucket_count: args.bucketCount,
    buckets,
    errors,
    rule: 'daily_local_pass_must_read_exact_bucket_files_only',
  };
  writeJson(args.out, payload);
  console.log(JSON.stringify(payload));
  return payload.ok ? 0 : 75;
}

process.exitCode = main();
