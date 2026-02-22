#!/usr/bin/env node
/**
 * P8: Registry↔Mirror Audit.
 * Default mode: report-only.
 * Strict mode: fail on critical contract issues (missing mirror, parse error, LIVE_BUT_EMPTY).
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "../..");
const registryPath = path.join(REPO_ROOT, "public/feature-registry.json");
const mirrorRoot = path.join(REPO_ROOT, "mirrors");

const MIRROR_ALIASES = new Map([
  ["rv-news-headlines", "news"],
  ["rv-sentiment-barometer", "sentiment"],
  ["rv-metrics-dashboard", "metrics"]
]);

function parseArgs(argv) {
  const out = { strict: false, maxCritical: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "");
    if (token === "--strict") {
      out.strict = true;
      continue;
    }
    if (token === "--max-critical") {
      out.maxCritical = Number(argv[i + 1] || 0);
      i += 1;
    }
  }
  return out;
}

function findMirrorCandidates(feature) {
  const out = new Set();
  const id = String(feature?.id || "").trim();
  const api = String(feature?.api || "").trim();
  const stripped = id.replace(/^rv-/, "");
  if (id) out.add(id);
  if (stripped) out.add(stripped);
  if (MIRROR_ALIASES.has(id)) out.add(MIRROR_ALIASES.get(id));
  if (api.startsWith("/api/")) out.add(api.slice(5));
  return [...out].filter(Boolean);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function countRows(payload) {
  const dataNode = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nested = dataNode?.data && typeof dataNode.data === "object" ? dataNode.data : {};
  const stocksA = dataNode?.stocks && typeof dataNode.stocks === "object" ? dataNode.stocks : {};
  const stocksB = nested?.stocks && typeof nested.stocks === "object" ? nested.stocks : {};
  const arrays = [
    ...toArray(dataNode.items),
    ...toArray(nested.items),
    ...toArray(dataNode.signals),
    ...toArray(nested.signals),
    ...toArray(dataNode.trades),
    ...toArray(nested.trades),
    ...toArray(dataNode.quotes),
    ...toArray(nested.quotes),
    ...toArray(dataNode.metrics),
    ...toArray(nested.metrics),
    ...toArray(dataNode.rows),
    ...toArray(nested.rows),
    ...toArray(dataNode.picks),
    ...toArray(dataNode?.picks?.top),
    ...toArray(stocksA.volumeLeaders),
    ...toArray(stocksA.gainers),
    ...toArray(stocksB.volumeLeaders),
    ...toArray(stocksB.gainers)
  ];
  return arrays.length;
}

function countDefinitions(payload) {
  const dataNode = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const defs = dataNode?.definitions && typeof dataNode.definitions === "object"
    ? dataNode.definitions
    : payload?.definitions && typeof payload.definitions === "object"
      ? payload.definitions
      : {};
  return Object.keys(defs).length;
}

function getStatus(payload) {
  const dataNode = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const dq = payload?.dataQuality || dataNode?.dataQuality || {};
  return String(dq?.status || "").trim().toUpperCase() || null;
}

const args = parseArgs(process.argv.slice(2));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

const report = {
  schema: "rv_registry_mirror_audit_v2",
  generated_at: new Date().toISOString(),
  strict: args.strict,
  checked: 0,
  ok: 0,
  partial: 0,
  empty: 0,
  missing: 0,
  ui_only_skipped: 0,
  critical: 0,
  issues: []
};

for (const feature of registry) {
  if (!feature?.enabled) continue;
  report.checked += 1;

  const api = String(feature?.api || "").trim();
  if (!api) {
    report.ui_only_skipped += 1;
    continue;
  }

  const candidates = findMirrorCandidates(feature);
  const mirrorPath = candidates
    .map((name) => path.join(mirrorRoot, `${name}.json`))
    .find((candidatePath) => fs.existsSync(candidatePath));

  if (!mirrorPath) {
    report.missing += 1;
    report.critical += 1;
    report.issues.push({
      severity: "critical",
      id: feature.id,
      title: feature.title || null,
      api,
      problem: "MIRROR_MISSING",
      mirror_candidates: candidates
    });
    continue;
  }

  try {
    const mirror = JSON.parse(fs.readFileSync(mirrorPath, "utf8"));
    const payload = mirror?.payload || mirror?.raw || mirror || {};
    const rowCount = countRows(payload);
    const definitionCount = countDefinitions(payload);
    const status = getStatus(payload);

    if (status === "LIVE" && rowCount === 0) {
      report.critical += 1;
      report.issues.push({
        severity: "critical",
        id: feature.id,
        title: feature.title || null,
        problem: "LIVE_BUT_EMPTY",
        status,
        mirror: path.relative(REPO_ROOT, mirrorPath),
        definitions: definitionCount
      });
      continue;
    }

    if (rowCount > 0) {
      report.ok += 1;
      continue;
    }

    if (definitionCount > 0) {
      report.partial += 1;
      report.issues.push({
        severity: "warning",
        id: feature.id,
        title: feature.title || null,
        problem: "DEFINITIONS_ONLY",
        status,
        mirror: path.relative(REPO_ROOT, mirrorPath),
        definitions: definitionCount
      });
      continue;
    }

    report.empty += 1;
    report.issues.push({
      severity: "warning",
      id: feature.id,
      title: feature.title || null,
      problem: "EMPTY_PAYLOAD",
      status,
      mirror: path.relative(REPO_ROOT, mirrorPath)
    });
  } catch (err) {
    report.critical += 1;
    report.issues.push({
      severity: "critical",
      id: feature.id,
      title: feature.title || null,
      problem: "PARSE_ERROR",
      error: String(err?.message || err),
      mirror: path.relative(REPO_ROOT, mirrorPath)
    });
  }
}

const reportPath = path.join(REPO_ROOT, "public/data/universe/v7/reports/registry_mirror_audit.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  `Registry↔Mirror Audit: ok=${report.ok}, partial=${report.partial}, empty=${report.empty}, missing=${report.missing}, critical=${report.critical}, checked=${report.checked}`
);

if (args.strict && report.critical > args.maxCritical) {
  console.error(`Registry↔Mirror Audit STRICT FAIL: critical=${report.critical}, max_allowed=${args.maxCritical}`);
  process.exit(1);
}
