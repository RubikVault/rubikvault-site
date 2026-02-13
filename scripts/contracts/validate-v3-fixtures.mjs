#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();

async function loadJson(rel) {
  return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8'));
}

function validateOrThrow(validate, doc, name) {
  if (!validate(doc)) {
    throw new Error(`FIXTURE_SCHEMA_FAIL:${name}:${JSON.stringify(validate.errors)}`);
  }
}

async function main() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const pairs = [
    ['policies/schemas/rv.health.v3.json', 'tests/fixtures/v3/health.json'],
    ['policies/schemas/rv.manifest.v3.json', 'tests/fixtures/v3/manifest.json'],
    ['policies/schemas/rv.eod.v3.json', 'tests/fixtures/v3/eod.json'],
    ['policies/schemas/rv.fx.v1.json', 'tests/fixtures/v3/fx.json'],
    ['policies/schemas/rv.actions.v3.json', 'tests/fixtures/v3/actions.json'],
    ['policies/schemas/rv.series.v3.json', 'tests/fixtures/v3/series.json'],
    ['policies/schemas/rv.pulse.v3.json', 'tests/fixtures/v3/pulse.json'],
    ['policies/schemas/rv.news.v2.json', 'tests/fixtures/v3/news.json'],
    ['policies/schemas/rv.fundamentals.v1.json', 'tests/fixtures/v3/fundamentals.json'],
    ['policies/schemas/rv.calendar.v1.json', 'tests/fixtures/v3/calendar.json']
  ];

  for (const [schemaPath, fixturePath] of pairs) {
    const schema = await loadJson(schemaPath);
    const fixture = await loadJson(fixturePath);
    const validate = ajv.compile(schema);
    validateOrThrow(validate, fixture, fixturePath);
  }

  console.log('V3_FIXTURE_CONTRACTS_OK');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
