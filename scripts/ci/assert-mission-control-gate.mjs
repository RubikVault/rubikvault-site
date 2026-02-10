import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SUMMARY_PATH = "public/data/ops/summary.latest.json";
const POLICY_PATH = "policies/mission-control-severity.json";

function normalizeCode(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const noPrefix = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  return noPrefix.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
}

async function readJson(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  const text = await fs.readFile(absPath, "utf8");
  return JSON.parse(text);
}

async function main() {
  const severityPolicyRaw = await readJson(POLICY_PATH);
  const strict = ["1", "true", "yes", "on"].includes(String(process.env.MC_GATE_STRICT || "").toLowerCase());
  const blockingSet = new Set(
    (Array.isArray(severityPolicyRaw?.blocking_codes) ? severityPolicyRaw.blocking_codes : [])
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const summary = await readJson(SUMMARY_PATH);
  const reasons = Array.isArray(summary?.overall?.reasons) ? summary.overall.reasons : [];
  const hits = reasons
    .map((reason) => ({ reason, code: normalizeCode(reason) }))
    .filter((entry) => entry.code && blockingSet.has(entry.code));

  const status = String(summary?.overall?.status || "").toUpperCase();
  if (hits.length > 0 || status === "ERROR" || status === "CRITICAL") {
    const lines = [];
    lines.push(`summary.overall.status=${status || "MISSING"}`);
    if (hits.length > 0) {
      lines.push("Blocking codes:");
      for (const hit of hits) lines.push(`- ${hit.code} (${hit.reason})`);
    }
    if (strict) {
      process.stderr.write("Mission-control blocking gate failed.\n");
      process.stderr.write(lines.join("\n") + "\n");
      process.exit(1);
    }
    process.stdout.write("::warning::Mission-control blocking findings detected (non-strict mode)\n");
    process.stdout.write(lines.join("\n") + "\n");
    process.exit(0);
  }

  process.stdout.write(`OK: mission-control blocking gate passed (status=${status || "UNKNOWN"})\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});
