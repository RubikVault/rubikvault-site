#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const REQUIRED = [
  {
    label: 'market-prices snapshot',
    relPath: 'public/data/snapshots/market-prices/latest.json',
    validators: [
      (doc) => Array.isArray(doc?.data) || 'expected `data` array'
    ]
  },
  {
    label: 'forecast latest',
    relPath: 'public/data/forecast/latest.json',
    validators: [
      (doc) => Array.isArray(doc?.data?.forecasts) || 'expected `data.forecasts` array'
    ]
  },
  {
    label: 'forecast status',
    relPath: 'public/data/forecast/system/status.json',
    validators: [
      (doc) => typeof doc?.status === 'string' || 'expected `status` string'
    ]
  }
];

function hasSchemaField(doc) {
  return Boolean(doc?.schema_version || doc?.schemaVersion || doc?.schema);
}

function hasGeneratedAt(doc) {
  return Boolean(doc?.generated_at || doc?.generatedAt || doc?.meta?.generated_at || doc?.meta?.generatedAt);
}

function validateArtifact(spec) {
  const absPath = path.join(root, spec.relPath);
  const issues = [];

  if (!fs.existsSync(absPath)) {
    issues.push(`missing file: ${spec.relPath}`);
    return { ok: false, issues };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    issues.push(`not a file: ${spec.relPath}`);
    return { ok: false, issues };
  }
  if (stat.size <= 0) {
    issues.push(`empty file: ${spec.relPath}`);
    return { ok: false, issues };
  }

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    issues.push(`invalid JSON: ${spec.relPath} (${err.message})`);
    return { ok: false, issues };
  }

  if (!hasSchemaField(doc)) {
    issues.push(`missing schema field in ${spec.relPath} (expected one of: schema_version, schemaVersion, schema)`);
  }

  if (!hasGeneratedAt(doc)) {
    issues.push(`missing generated_at in ${spec.relPath} (expected one of: generated_at, generatedAt, meta.generated_at)`);
  }

  for (const validate of spec.validators) {
    const res = validate(doc);
    if (res !== true) {
      issues.push(`${spec.relPath}: ${res}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

const failures = [];
for (const spec of REQUIRED) {
  const result = validateArtifact(spec);
  if (result.ok) {
    console.log(`✅ ${spec.label}: ${spec.relPath}`);
  } else {
    console.log(`❌ ${spec.label}: ${spec.relPath}`);
    for (const issue of result.issues) {
      failures.push(issue);
      console.log(`   - ${issue}`);
    }
  }
}

if (failures.length > 0) {
  console.error('\nArtifact verification failed. Attempted critical paths:');
  for (const spec of REQUIRED) {
    console.error(`- ${spec.relPath}`);
  }
  process.exit(1);
}

console.log('\n✅ Critical artifact presence/schema checks passed.');
