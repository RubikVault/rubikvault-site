import Ajv2020 from "ajv/dist/2020.js";
import fs from 'node:fs/promises';
import path from 'node:path';

import { fileURLToPath } from "node:url";
const root = new URL('../../', import.meta.url);
const policyPath = new URL('../../policies/ops_health.json', import.meta.url);
const schemaPath = new URL('../../schemas/policies/ops_health.schema.json', import.meta.url);


const rootDir = fileURLToPath(new URL(".", root));
const policyFile = fileURLToPath(policyPath);
const schemaFile = fileURLToPath(schemaPath);
async function readJson(url) {
  const raw = await fs.readFile(url, 'utf8');
  return JSON.parse(raw);
}

const [policy, schema] = await Promise.all([readJson(policyPath), readJson(schemaPath)]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const validate = ajv.compile(schema);
const ok = validate(policy);

if (!ok) {
  console.error('ops_health policy validation failed');
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}

console.log(`OK ops_health policy: ${path.relative(rootDir, policyFile)}`);
console.log(`OK ops_health schema: ${path.relative(rootDir, schemaFile)}`);
