import { promises as fs } from "node:fs";
import path from "node:path";
import { buildEnvelope, createValidator, loadSnapshotEnvelopeSchema } from "./lib/envelope-builder.mjs";

const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const SNAPSHOTS_DIR = path.join(PUBLIC_DATA, "snapshots");

const NON_SYSTEMIC_REASONS = new Set(["MISSING_SECRET", "UNAUTHORIZED", "NO_DATA", "PAYLOAD_TOO_LARGE"]);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, obj) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function downgradeStatus(status, reason) {
  const s = String(status || "").toUpperCase();
  const r = String(reason || "").toUpperCase();
  if (s === "ERROR" && NON_SYSTEMIC_REASONS.has(r)) return "PARTIAL";
  return s || "ERROR";
}

function mapStatusToSystemHealth(status) {
  // legacy system-health.json uses OK/FAIL
  if (status === "ERROR") return "FAIL";
  return "OK";
}

function buildLegacySystemHealthFromSnapshots(allSnapshots, generatedAt) {
  const snapshots = [];
  let ok = 0;
  let fail = 0;

  for (const snap of allSnapshots) {
    const blockId = snap?.blockId || snap?.meta?.blockId || snap?.metadata?.module || "unknown";
    const reason = snap?.meta?.reason || snap?.meta?.status || snap?.metadata?.validation?.reason || "OK";
    const statusV3 = downgradeStatus(snap?.meta?.status, snap?.meta?.reason);
    const status = mapStatusToSystemHealth(statusV3);
    snapshots.push({ blockId, status, reason: String(reason || "OK") });
    if (status === "OK") ok += 1;
    else fail += 1;
  }

  return {
    generatedAt,
    buildStatus: fail > 0 ? "PARTIAL" : "OK",
    reasons: [],
    summary: { total: snapshots.length, ok, fail },
    lastGoodAsOf: {},
    snapshots
  };
}

function buildV3HealthFromSeedManifest(existingHealth, seedManifest, generatedAt) {
  const blocksRaw = Array.isArray(seedManifest?.blocks) ? seedManifest.blocks : [];
  const blocks = blocksRaw.map((b) => {
    const status = downgradeStatus(b?.status, b?.reason);
    return { ...b, status };
  });

  const counts = { LIVE: 0, PARTIAL: 0, ERROR: 0 };
  const reasons = {};
  for (const b of blocks) {
    const st = String(b?.status || "ERROR").toUpperCase();
    const rs = String(b?.reason || "UNKNOWN");
    if (st === "LIVE") counts.LIVE += 1;
    else if (st === "PARTIAL") counts.PARTIAL += 1;
    else counts.ERROR += 1;
    reasons[rs] = (reasons[rs] || 0) + 1;
  }

  const overallStatus = counts.ERROR > 0 ? "PARTIAL" : "LIVE";
  const overallReason = counts.ERROR > 0 ? "BLOCK_ERRORS" : null;

  const base = existingHealth && typeof existingHealth === "object" ? { ...existingHealth } : {};
  base.schemaVersion = base.schemaVersion || "v3";
  base.blockId = "health";
  base.generatedAt = generatedAt;
  base.dataAt = seedManifest?.generatedAt || generatedAt;

  base.meta = {
    ...(base.meta && typeof base.meta === "object" ? base.meta : {}),
    status: overallStatus,
    reason: overallReason,
    generatedAt,
    asOf: base.dataAt,
    source: "health",
    ttlSeconds: 3600,
    stale: false,
    itemsCount: 1,
    stalenessSec: 0,
    freshness: { status: "fresh", ageMinutes: 0 },
    schedule: {
      rule: "daily",
      nextPlannedFetchAt: generatedAt,
      expectedNextRunWindowMinutes: 1440,
      ttlSeconds: 3600
    },
    runId: generatedAt,
    notes: {
      lastGoodUsed: 0,
      lastGoodFilled: 0
    },
    validation: base.meta?.validation || {
      schema: { ok: true, errors: [] },
      ranges: { ok: true, errors: [] },
      integrity: { ok: true, errors: [] }
    }
  };

  base.data = {
    ...(base.data && typeof base.data === "object" ? base.data : {}),
    items: [
      {
        id: "health_status",
        label: "health",
        value: overallStatus,
        unit: "",
        derivedFromLastGood: false,
        derivationReason: null,
        stale: false,
        staleReason: null
      }
    ],
    blocks,
    summary: {
      ...counts,
      total: blocks.length,
      okPct: blocks.length ? (counts.LIVE + counts.PARTIAL) / blocks.length : 0,
      reasons
    }
  };

  return base;
}

async function listSnapshotJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name));
}

async function main() {
  const generatedAt = nowIso();

  const healthPath = path.join(SNAPSHOTS_DIR, "health.json");
  const healthDirLatestPath = path.join(SNAPSHOTS_DIR, "health", "latest.json");
  const healthLatestPath = path.join(PUBLIC_DATA, "blocks", "health.latest.json");
  const systemHealthPath = path.join(PUBLIC_DATA, "system-health.json");
  const seedManifestPath = path.join(PUBLIC_DATA, "seed-manifest.json");

  const seedManifest = await readJson(seedManifestPath);

  let existingHealth = null;
  try {
    existingHealth = await readJson(healthPath);
  } catch {
    existingHealth = null;
  }

  const refreshedHealth = buildV3HealthFromSeedManifest(existingHealth, seedManifest, generatedAt);
  await writeJson(healthPath, refreshedHealth);
  await writeJson(healthLatestPath, refreshedHealth);

  const healthBlocks = Array.isArray(refreshedHealth?.data?.blocks) ? refreshedHealth.data.blocks : [];
  const schema = loadSnapshotEnvelopeSchema();
  const { validate } = createValidator(schema);
  const envelope = buildEnvelope(schema, {
    module: "health",
    tier: "critical",
    domain: "system",
    source: "health-refresh",
    fetched_at: generatedAt,
    published_at: generatedAt,
    data: healthBlocks,
    record_count: healthBlocks.length,
    expected_count: healthBlocks.length,
    validation: { passed: true },
    freshness: {
      policy: "daily",
      expected_interval_minutes: 1440,
      age_minutes: 0,
      next_expected_at: generatedAt
    }
  });

  if (!validate(envelope)) {
    console.error("Health snapshot envelope validation failed");
    console.error(validate.errors);
    throw new Error("health latest.json failed schema validation");
  }

  await writeJson(healthDirLatestPath, envelope);

  const snapshotFiles = await listSnapshotJsonFiles(SNAPSHOTS_DIR);
  const allSnapshots = [];
  for (const file of snapshotFiles) {
    try {
      const snap = await readJson(file);
      if (!snap || typeof snap !== "object") continue;
      allSnapshots.push(snap);
    } catch {
      // ignore
    }
  }

  const legacySystemHealth = buildLegacySystemHealthFromSnapshots(allSnapshots, generatedAt);
  await writeJson(systemHealthPath, legacySystemHealth);

  console.log(`[health-refresh] updated ${path.relative(ROOT, healthPath)}`);
  console.log(`[health-refresh] updated ${path.relative(ROOT, healthLatestPath)}`);
  console.log(`[health-refresh] updated ${path.relative(ROOT, systemHealthPath)} (n=${legacySystemHealth.summary.total})`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
