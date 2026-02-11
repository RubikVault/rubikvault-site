import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();

function parseArgs(argv) {
  const out = { mode: "eod-latest" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") {
      out.mode = String(argv[i + 1] || out.mode);
      i += 1;
    }
  }
  return out;
}

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

async function atomicWriteJson(relPath, payload) {
  const absPath = path.join(REPO_ROOT, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp-${Date.now()}-${process.pid}-${process.hrtime.bigint()}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, absPath);
}

function pushError(errors, code, message, severity = "blocking") {
  errors.push({ code, message, severity });
}

function buildPreflightErrors(mode) {
  const errors = [];

  if (mode === "eod-latest") {
    const hasTiingo = Boolean(String(process.env.TIINGO_API_KEY || "").trim());
    const hasTiingoAlias = Boolean(String(process.env.TIIANGO_API_KEY || "").trim());
    const hasEodhd = Boolean(String(process.env.EODHD_API_KEY || "").trim());
    if (!hasTiingo && !hasTiingoAlias && !hasEodhd) {
      pushError(
        errors,
        "NO_API_KEY",
        "Neither TIINGO_API_KEY nor EODHD_API_KEY is configured.",
        "blocking"
      );
    }
    if (hasTiingoAlias && !hasTiingo) {
      pushError(
        errors,
        "INVALID_CONFIG",
        "Using deprecated TIIANGO_API_KEY alias without TIINGO_API_KEY. Migrate to TIINGO_API_KEY.",
        "degrading"
      );
    }
    if (!String(process.env.RV_UNIVERSE || "").trim()) {
      pushError(
        errors,
        "INVALID_CONFIG",
        "RV_UNIVERSE is not configured for the EOD workflow.",
        "blocking"
      );
    }
  } else if (mode === "ops-daily") {
    const hasCfToken = Boolean(String(process.env.CF_API_TOKEN || "").trim());
    const hasCfApiKeyAlias = Boolean(String(process.env.CF_API_KEY || "").trim());
    if (!String(process.env.CF_ACCOUNT_ID || "").trim()) {
      pushError(errors, "KV_UNAVAILABLE", "CF_ACCOUNT_ID is missing for KV/API access.", "blocking");
    }
    if (!hasCfToken && !hasCfApiKeyAlias) {
      pushError(
        errors,
        "KV_UNAVAILABLE",
        "CF_API_TOKEN is missing for KV/API access (fallback alias: CF_API_KEY).",
        "blocking"
      );
    }
    if (hasCfApiKeyAlias && !hasCfToken) {
      pushError(
        errors,
        "INVALID_CONFIG",
        "Using deprecated CF_API_KEY alias without CF_API_TOKEN. Migrate to CF_API_TOKEN.",
        "degrading"
      );
    }
  } else {
    pushError(errors, "INVALID_CONFIG", `Unknown preflight mode: ${mode}`, "blocking");
  }

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = isoNow();
  const errors = buildPreflightErrors(args.mode);
  const blocking = errors.filter((entry) => entry.severity === "blocking");
  const degrading = errors.filter((entry) => entry.severity === "degrading");
  const meta = buildMeta(now);

  const pulsePayload = {
    schema_version: "ops.pulse.v1",
    meta,
    pipelineOk: blocking.length === 0,
    lastRunAt: now,
    asOfTradingDay: lastTradingDayIso(new Date()),
    errors
  };

  await atomicWriteJson("public/data/ops/pulse.json", pulsePayload);

  for (const entry of degrading) {
    process.stderr.write(`WARN ${entry.code}: ${entry.message}\n`);
  }

  if (blocking.length > 0) {
    for (const entry of blocking) {
      process.stderr.write(`BLOCKING ${entry.code}: ${entry.message}\n`);
    }
    process.stderr.write("Preflight failed with blocking errors.\n");
    process.exit(1);
  }

  process.stdout.write("OK: preflight passed\n");
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});
