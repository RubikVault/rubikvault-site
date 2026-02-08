import path from 'node:path';
import { writeJsonAtomic } from './io.mjs';

function collectFeatureColumns(featureRows) {
  const columns = new Set();
  for (const row of featureRows) {
    for (const key of Object.keys(row?.features || {})) columns.add(key);
  }
  return [...columns].sort();
}

export function enforceFeaturePolicy({ repoRoot, asofDate, featureRows, featurePolicy }) {
  const columns = collectFeatureColumns(featureRows);
  const forbidden = new Set((featurePolicy?.forbidden_features || []).map((v) => String(v).trim()));
  const violations = columns.filter((name) => forbidden.has(name));

  if (!violations.length) {
    return {
      ok: true,
      violations: [],
      columns
    };
  }

  const reason = featurePolicy?.on_violation?.reason || 'FEATURE_POLICY_VIOLATION';
  const diagnosticPath = path.join(
    repoRoot,
    'mirrors/forecast/ledgers/diagnostics/policy_violations/feature_policy',
    `${asofDate}.json`
  );

  writeJsonAtomic(diagnosticPath, {
    schema: 'feature_policy_violation_v6',
    asof_date: asofDate,
    reason,
    forbidden_features: [...forbidden],
    observed_columns: columns,
    violations
  });

  return {
    ok: false,
    reason,
    violations,
    columns,
    diagnostic_path: path.relative(repoRoot, diagnosticPath)
  };
}

export default { enforceFeaturePolicy };
