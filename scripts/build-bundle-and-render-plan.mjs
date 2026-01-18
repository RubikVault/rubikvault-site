import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sanitizeForPublic, assertPublicSafe } from "./_lib/sanitize-public.mjs";

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, "public", "features", "feature-registry.json");
const OUT_BUNDLE = path.join(ROOT, "public", "data", "bundle.json");
const OUT_RENDER = path.join(ROOT, "public", "data", "render-plan.json");
const MAX_PUBLIC_BYTES = 200 * 1024;

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeIfChanged(filePath, obj) {
  const sanitized = sanitizeForPublic(obj);
  assertPublicSafe(sanitized, path.basename(filePath));
  const next = JSON.stringify(sanitized, null, 2) + "\n";
  const byteSize = Buffer.byteLength(next);
  if (byteSize > MAX_PUBLIC_BYTES) {
    throw new Error(`public_snapshot_too_large:${path.basename(filePath)}:${byteSize}`);
  }
  const nextHash = sha256(next);
  let prevHash = null;
  try {
    const prev = fs.readFileSync(filePath, "utf8");
    prevHash = sha256(prev);
  } catch {}
  if (prevHash === nextHash) {
    return { changed: false, bytes: Buffer.byteLength(next) };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, bytes: Buffer.byteLength(next) };
}

function nowIso() {
  return new Date().toISOString();
}

function main() {
  if (!fs.existsSync(REGISTRY)) {
    console.error(JSON.stringify({
      ok: false,
      error: `Missing registry at ${REGISTRY}`,
    }));
    process.exit(1);
  }

  const reg = readJson(REGISTRY);
  const features = Array.isArray(reg.features) ? reg.features : [];

  // Deterministic order: by id
  const blocks = features
    .filter(f => f && typeof f.id === "string" && f.id.trim().length > 0)
    .map(f => ({
      id: f.id,
      name: f.name ?? f.id,
      critical: Boolean(f.critical),
      deprecated: Boolean(f._deprecated),
      schemaVersion: f.schemaVersion ?? "v1",
      staleAfterMinutes: Number.isFinite(f.staleAfterMinutes) ? f.staleAfterMinutes : 1440,
      mirrorPath: f.mirrorPath ?? null,
      requiredFields: Array.isArray(f.requiredFields) ? f.requiredFields : [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (features.length && blocks.length === 0) {
    console.error(JSON.stringify({
      ok: false,
      error: "Registry has features but blocks are empty",
    }));
    process.exit(1);
  }

  const generatedAt = nowIso();

  const bundle = {
    schemaVersion: 1,
    generatedAt,
    source: "registry",
    blocks,
  };

  // Render-plan: keep minimal + stable; UI can decide layout.
  const renderPlan = {
    schemaVersion: 1,
    generatedAt,
    source: "registry",
    blocks: blocks.map(b => ({
      id: b.id,
      name: b.name,
      // Convention: feature module file name (does NOT force usage; just a hint)
      module: `/features/rv-${b.id}.js`,
      snapshot: `/data/snapshots/${b.id}.json`,
      mirror: b.mirrorPath,
      critical: b.critical,
    })),
  };

  const wb = writeIfChanged(OUT_BUNDLE, bundle);
  const wr = writeIfChanged(OUT_RENDER, renderPlan);

  console.log(JSON.stringify({
    ok: true,
    registry: path.relative(ROOT, REGISTRY),
    blocks: blocks.length,
    wrote: {
      [path.relative(ROOT, OUT_BUNDLE)]: wb,
      [path.relative(ROOT, OUT_RENDER)]: wr,
    }
  }, null, 2));
}

main();
