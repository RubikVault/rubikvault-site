import Ajv from 'ajv';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../../', import.meta.url);
const policyPath = new URL('../../policies/ops_health.json', import.meta.url);
const schemaPath = new URL('../../schemas/policies/ops_health.schema.json', import.meta.url);

async function readJson(url) {
  const raw = await fs.readFile(url, 'utf8');
  return JSON.parse(raw);
}

const [policy, schema] = await Promise.all([readJson(policyPath), readJson(schemaPath)]);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile(schema);
const ok = validate(policy);

if (!ok) {
  console.error('ops_health policy validation failed');
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}

console.log(`OK ops_health policy: ${path.relative(new URL('.', root), policyPath.pathname)}`);
