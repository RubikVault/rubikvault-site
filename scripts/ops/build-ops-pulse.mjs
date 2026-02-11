import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SUMMARY_PATH = "public/data/ops/summary.latest.json";
const PULSE_PATH = "public/data/ops/pulse.json";
const SEVERITY_POLICY_PATH = "policies/mission-control-severity.json";

function isoNow() {
  return new Date().toISOString();
}

function lastTradingDayIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function buildMeta(now) {
  const commit = String(process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || "").trim() || null;
  const shortCommit = commit ? commit.slice(0, 8) : "unknown";
  const stamp = now.replace(/[-:]/g, "").slice(0, 13);
  const sequence = String(process.env.GITHUB_RUN_NUMBER || "runtime");
  return {
    build_id: `${shortCommit}-${stamp}-${sequence}`,
    commit,
    generatedAt: now
  };
}

function normalizeCode(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const noPrefix = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  return noPrefix.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
}

function severitySets(severityPolicyRaw) {
  const blocking = new Set(
    (Array.isArray(severityPolicyRaw?.blocking_codes) ? severityPolicyRaw.blocking_codes : [])
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const degrading = new Set(
    (Array.isArray(severityPolicyRaw?.degrading_codes) ? severityPolicyRaw.degrading_codes : [])
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean)
  );
  return { blocking, degrading };
}

async function readJson(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  try {
    return JSON.parse(await fs.readFile(absPath, "utf8"));
  } catch {
    return null;
  }
}

async function atomicWriteJson(relPath, payload) {
  const absPath = path.join(REPO_ROOT, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp-${Date.now()}-${process.pid}-${process.hrtime.bigint()}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, absPath);
}

async function main() {
  const now = isoNow();

  // --- Phase 3B: Prefer shared build-meta.json for cohesion ---
  const buildMetaDoc = await readJson('public/data/ops/build-meta.json');
  const meta = (buildMetaDoc?.meta?.build_id && buildMetaDoc?.meta?.commit !== undefined)
    ? { build_id: buildMetaDoc.meta.build_id, commit: buildMetaDoc.meta.commit, generatedAt: now }
    : buildMeta(now);

  const summary = await readJson(SUMMARY_PATH);
  const severityPolicyRaw = await readJson(SEVERITY_POLICY_PATH);
  const { blocking, degrading } = severitySets(severityPolicyRaw);
  const errors = [];

  if (!summary || typeof summary !== "object") {
    errors.push({
      code: "INVALID_CONFIG",
      message: `Missing or invalid ${SUMMARY_PATH}`,
      severity: "blocking"
    });
  }

  const reasonList = Array.isArray(summary?.overall?.reasons) ? summary.overall.reasons : [];
  for (const reason of reasonList) {
    const code = normalizeCode(reason);
    if (!code) continue;
    if (blocking.has(code)) {
      errors.push({ code, message: String(reason), severity: "blocking" });
      continue;
    }
    if (degrading.has(code)) {
      errors.push({ code, message: String(reason), severity: "degrading" });
      continue;
    }
    errors.push({ code, message: String(reason), severity: "degrading" });
  }

  const overallStatus = String(summary?.overall?.status || "").toUpperCase();
  if (overallStatus === "ERROR" || overallStatus === "CRITICAL") {
    errors.push({
      code: "INVALID_CONFIG",
      message: `summary.overall.status=${overallStatus}`,
      severity: "blocking"
    });
  }

  const blockingErrors = errors.filter((entry) => entry.severity === "blocking");
  const asOfTradingDay = summary?.overall?.expected_trading_day || lastTradingDayIso(new Date());
  const pulse = {
    schema_version: "ops.pulse.v1",
    meta,
    pipelineOk: blockingErrors.length === 0,
    lastRunAt: now,
    asOfTradingDay,
    errors
  };

  await atomicWriteJson(PULSE_PATH, pulse);
  process.stdout.write(`OK: pulse written (${PULSE_PATH}) pipelineOk=${pulse.pipelineOk}\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});
