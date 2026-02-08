import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function loadSchema(schemaPath) {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

export function validateDocument({ schemaPath, doc, label = null }) {
  const schema = loadSchema(schemaPath);
  const validate = ajv.compile(schema);
  const ok = validate(doc);
  return {
    ok: Boolean(ok),
    label: label || path.basename(schemaPath),
    errors: validate.errors || []
  };
}

export function validateV6Bundle({ repoRoot, bundle }) {
  const schemaDir = path.join(repoRoot, 'schemas/forecast/v6');
  const checks = [];

  if (bundle.bars_manifest) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'bars.schema.json'),
      doc: bundle.bars_manifest,
      label: 'bars_manifest'
    }));
  }

  if (bundle.candidates) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'candidates.schema.json'),
      doc: bundle.candidates,
      label: 'candidates'
    }));
  }

  if (bundle.features) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'features.schema.v6.json'),
      doc: bundle.features,
      label: 'features'
    }));
  }

  if (bundle.predictions) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'predictions.schema.v6.json'),
      doc: bundle.predictions,
      label: 'predictions'
    }));
  }

  if (bundle.outcomes) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'outcomes.schema.v6.json'),
      doc: bundle.outcomes,
      label: 'outcomes'
    }));
  }

  if (bundle.model_card) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'model_card.schema.v6.json'),
      doc: bundle.model_card,
      label: 'model_card'
    }));
  }

  if (bundle.diagnostics_summary) {
    checks.push(validateDocument({
      schemaPath: path.join(schemaDir, 'diagnostics.schema.v6.json'),
      doc: bundle.diagnostics_summary,
      label: 'diagnostics_summary'
    }));
  }

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    failed
  };
}

export default { validateDocument, validateV6Bundle };
