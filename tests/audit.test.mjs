import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const SCRIPTS = {
  registry: path.join(ROOT, "scripts", "audit", "build-feature-registry.mjs"),
  stubs: path.join(ROOT, "scripts", "audit", "generate-stub-mirrors.mjs"),
  artifacts: path.join(ROOT, "scripts", "audit", "build-artifacts.mjs"),
  audit: path.join(ROOT, "scripts", "audit-site.mjs")
};

function run(script, args, cwd) {
  return execFileSync("node", [script, ...args], { cwd, encoding: "utf8" });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rv-audit-"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function testRegistryBuild() {
  const dir = tmpDir();
  const publicDir = path.join(dir, "public");
  const mirrorsDir = path.join(publicDir, "mirrors");
  const featuresDir = path.join(dir, "features");
  fs.mkdirSync(mirrorsDir, { recursive: true });
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.writeFileSync(
    path.join(publicDir, "index.html"),
    '<section data-rv-feature="rv-market-health"></section>\n<section data-rv-feature="rv-top-movers"></section>'
  );
  writeJson(path.join(mirrorsDir, "market-health.json"), {
    meta: { status: "OK", updatedAt: new Date().toISOString() },
    data: { items: [{ id: 1 }] }
  });
  run(SCRIPTS.registry, ["--mode", "discover"], dir);
  const registry = readJson(path.join(featuresDir, "feature-registry.json"));
  assert.ok(Array.isArray(registry.features), "registry.features should be array");
  const ids = registry.features.map((f) => f.id);
  assert.ok(ids.includes("market-health"));
  assert.ok(ids.includes("top-movers"));
}

function testStubGeneration() {
  const dir = tmpDir();
  const featuresDir = path.join(dir, "features");
  fs.mkdirSync(featuresDir, { recursive: true });
  writeJson(path.join(featuresDir, "feature-registry.json"), {
    registryVersion: "1.0",
    generatedAt: new Date().toISOString(),
    features: [{ id: "alpha", mirrorPath: "mirrors/alpha.json", schemaVersion: "v1" }]
  });
  run(SCRIPTS.stubs, [], dir);
  const stub = readJson(path.join(dir, "public", "mirrors", "alpha.json"));
  assert.equal(stub.meta.status, "STUB");
}

function testArtifactsBuild() {
  const dir = tmpDir();
  const featuresDir = path.join(dir, "features");
  const mirrorsDir = path.join(dir, "public", "mirrors");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.mkdirSync(mirrorsDir, { recursive: true });
  writeJson(path.join(featuresDir, "feature-registry.json"), {
    registryVersion: "1.0",
    generatedAt: new Date().toISOString(),
    features: [{ id: "beta", mirrorPath: "mirrors/beta.json", schemaVersion: "v1" }]
  });
  writeJson(path.join(mirrorsDir, "beta.json"), {
    meta: { status: "OK", updatedAt: new Date().toISOString(), schemaVersion: "v1" },
    data: { items: [{ id: 1 }] }
  });
  run(SCRIPTS.artifacts, [], dir);
  assert.ok(fs.existsSync(path.join(mirrorsDir, "manifest.json")));
  assert.ok(fs.existsSync(path.join(mirrorsDir, "_health.json")));
  const manifest = readJson(path.join(mirrorsDir, "manifest.json"));
  assert.ok(manifest.blocks.some((b) => b.id === "beta"));
}

function testAuditMissingField() {
  const dir = tmpDir();
  const featuresDir = path.join(dir, "features");
  const mirrorsDir = path.join(dir, "public", "mirrors");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.mkdirSync(mirrorsDir, { recursive: true });
  writeJson(path.join(featuresDir, "feature-registry.json"), {
    registryVersion: "1.0",
    generatedAt: new Date().toISOString(),
    features: [
      {
        id: "gamma",
        mirrorPath: "mirrors/gamma.json",
        requiredFields: ["meta.status", "meta.updatedAt"]
      }
    ]
  });
  writeJson(path.join(mirrorsDir, "gamma.json"), {
    meta: { updatedAt: new Date().toISOString() },
    data: { items: [{ id: 1 }] }
  });
  const output = run(SCRIPTS.audit, ["--mode", "local", "--base", "public", "--format", "json", "--fail-on", "none"], dir);
  const report = JSON.parse(output);
  const gamma = report.blocks.find((b) => b.blockId === "gamma");
  assert.ok(gamma, "gamma block should exist");
  const missing = gamma.fields.find((f) => f.path === "/meta/status");
  assert.ok(missing, "missing field entry should exist");
  const codes = (missing.reasons || []).map((r) => r.reasonCode);
  assert.ok(codes.includes("FIELD_MISSING"));
}

function testAuditJsonParseError() {
  const dir = tmpDir();
  const featuresDir = path.join(dir, "features");
  const mirrorsDir = path.join(dir, "public", "mirrors");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.mkdirSync(mirrorsDir, { recursive: true });
  writeJson(path.join(featuresDir, "feature-registry.json"), {
    registryVersion: "1.0",
    generatedAt: new Date().toISOString(),
    features: [{ id: "delta", mirrorPath: "mirrors/delta.json" }]
  });
  fs.writeFileSync(path.join(mirrorsDir, "delta.json"), "{ invalid json");
  const output = run(SCRIPTS.audit, ["--mode", "local", "--base", "public", "--format", "json", "--fail-on", "none"], dir);
  const report = JSON.parse(output);
  const delta = report.blocks.find((b) => b.blockId === "delta");
  assert.ok(delta, "delta block should exist");
  const codes = (delta.blockErrors || []).map((r) => r.reasonCode);
  assert.ok(codes.includes("JSON_PARSE_ERROR"));
}

function testMirrorMetaNormalization() {
  const dir = tmpDir();
  const featuresDir = path.join(dir, "features");
  const mirrorsDir = path.join(dir, "public", "mirrors");
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.mkdirSync(mirrorsDir, { recursive: true });
  writeJson(path.join(featuresDir, "feature-registry.json"), {
    registryVersion: "1.0",
    generatedAt: new Date().toISOString(),
    features: [{ id: "omega", mirrorPath: "mirrors/omega.json", schemaVersion: "v1" }]
  });
  writeJson(path.join(mirrorsDir, "omega.json"), {
    schemaVersion: "1.0",
    mirrorId: "omega",
    updatedAt: new Date().toISOString(),
    items: [],
    meta: null
  });
  run(SCRIPTS.artifacts, [], dir);
  const mirror = readJson(path.join(mirrorsDir, "omega.json"));
  assert.ok(mirror.meta, "meta should be present");
  assert.ok(typeof mirror.meta.status === "string" && mirror.meta.status.length > 0, "meta.status required");
  assert.ok(mirror.meta.updatedAt, "meta.updatedAt required");
  assert.notEqual(mirror.meta.status, "OK", "empty items must not be OK");
}

try {
  testRegistryBuild();
  testStubGeneration();
  testArtifactsBuild();
  testAuditMissingField();
  testAuditJsonParseError();
  testMirrorMetaNormalization();
  process.stdout.write("audit tests: OK\n");
} catch (error) {
  process.stderr.write(`audit tests: FAIL\n${error.stack}\n`);
  process.exit(1);
}
