import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeIfChanged(filePath, obj) {
  const next = JSON.stringify(obj, null, 2) + "\n";
  if (fs.existsSync(filePath)) {
    const prev = fs.readFileSync(filePath, "utf-8");
    if (sha256(prev) === sha256(next)) return { changed: false, bytes: Buffer.byteLength(next, "utf-8") };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, "utf-8");
  return { changed: true, bytes: Buffer.byteLength(next, "utf-8") };
}

function nowIso() {
  return new Date().toISOString();
}

function pickRegistryPath() {
  const cands = [
    "public/features/feature-registry.json",
    "features/feature-registry.json",
    "public/feature-registry.json",
  ];
  for (const p of cands) if (fs.existsSync(p)) return p;
  return null;
}

function safeArray(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.blocks)) return x.blocks;
  return [];
}

function loadRegistry(regPath) {
  const reg = readJson(regPath);
  const blocks = safeArray(reg);
  // normalize minimal shape
  return blocks.map((b, idx) => ({
    id: String(b.id ?? b.blockId ?? b.key ?? `block-${idx + 1}`),
    title: String(b.title ?? b.name ?? b.id ?? `Block ${idx + 1}`),
    category: String(b.category ?? b.group ?? "misc"),
    enabled: (b.enabled === undefined ? true : !!b.enabled),
    snapshotPath: String(b.snapshotPath ?? `/data/snapshots/${String(b.id ?? b.blockId ?? b.key ?? `block-${idx + 1}`)}.json`),
  })).filter(b => b.id && b.enabled);
}

function baseMeta({ runId }) {
  const ts = nowIso();
  return {
    status: "OK",
    reason: "OK",
    generatedAt: ts,
    asOf: ts,
    source: "static",
    ttlSeconds: 3600,
    stale: false,
    freshness: { status: "fresh", ageMinutes: 0 },
    validation: {
      schema: { ok: true, errors: [] },
      ranges: { ok: true, errors: [] },
      integrity: { ok: true, errors: [] },
    },
    schedule: {
      rule: "ci",
      nextPlannedFetchAt: ts,
      expectedNextRunWindowMinutes: 1440,
      ttlSeconds: 3600,
    },
    runId: runId || ts,
  };
}

function main() {
  const regPath = pickRegistryPath();
  if (!regPath) {
    console.error("ERR: feature registry not found (expected public/features/feature-registry.json or features/feature-registry.json)");
    process.exit(2);
  }

  const runId = process.env.RV_RUN_ID || nowIso();
  const blocks = loadRegistry(regPath);

  const bundle = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    source: "static",
    blocks: blocks.map(b => ({
      id: b.id,
      title: b.title,
      category: b.category,
      snapshotPath: b.snapshotPath,
    })),
  };

  const renderPlan = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    source: "static",
    blocks: blocks.map((b, i) => ({
      order: i + 1,
      id: b.id,
      title: b.title,
      snapshotPath: b.snapshotPath,
    })),
  };

  // v3-style wrappers (public-safe)
  const bundleOut = {
    schemaVersion: "v3",
    blockId: "bundle",
    generatedAt: nowIso(),
    dataAt: nowIso(),
    meta: baseMeta({ runId }),
    data: bundle,
  };

  const planOut = {
    schemaVersion: "v3",
    blockId: "render-plan",
    generatedAt: nowIso(),
    dataAt: nowIso(),
    meta: baseMeta({ runId }),
    data: renderPlan,
  };

  const r1 = writeIfChanged("public/data/bundle.json", bundleOut.data);
  const r2 = writeIfChanged("public/data/render-plan.json", planOut.data);

  console.log(JSON.stringify({
    ok: true,
    registry: regPath,
    blocks: blocks.length,
    wrote: {
      "public/data/bundle.json": r1,
      "public/data/render-plan.json": r2,
    }
  }, null, 2));
}

main();
