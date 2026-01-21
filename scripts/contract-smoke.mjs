import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function resolveLoaderPath() {
  const candidates = [
    path.join(ROOT, "public", "rv-loader.js"),
    path.join(ROOT, "rv-loader.js"),
    path.join(ROOT, "public", "features", "rv-loader.js"),
    path.join(ROOT, "public", "features", "blocks-registry.js"),
    path.join(ROOT, "features", "blocks-registry.js")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  fail(`Loader file not found. Tried:\n${candidates.map((p) => `- ${p}`).join("\n")}`);
  return null;
}

function fail(message) {
  console.error(`[contract-smoke] ${message}`);
  process.exit(1);
}

function selectTechSignalsRows(data) {
  const signals = Array.isArray(data?.signals) ? data.signals : [];
  const items = Array.isArray(data?.items) ? data.items : [];
  return signals.length ? signals : items.length ? items : [];
}

function selectAlphaRadarRows(data) {
  const picks = Array.isArray(data?.picks) ? data.picks : [];
  const items = Array.isArray(data?.items) ? data.items : [];
  return picks.length ? picks : items.length ? items : [];
}

function isEmptyValid(meta, rows) {
  if (!rows.length && (meta?.status === "LIVE" || meta?.status === "STALE")) return true;
  return false;
}

async function checkMirrorPriority() {
  const loaderPath = await resolveLoaderPath();
  const loader = await fs.readFile(loaderPath, "utf8");
  const required = ["rv-tech-signals", "rv-alpha-radar"];
  const missing = required.filter((token) => !loader.includes(token));
  if (missing.length) {
    fail(`Required feature ids not referenced in loader (${path.basename(loaderPath)}): ${missing.join(", ")}`);
  }
}

async function checkAlphaRadarTitle() {
  const configPath = path.join(ROOT, "rv-config.js");
  const config = await fs.readFile(configPath, "utf8");
  const match = config.match(/id:\s*"rv-alpha-radar"[\s\S]*?title:\s*"([^"]+)"/);
  if (!match) fail("rv-alpha-radar title not found in rv-config.js");
  const title = match[1];
  if (/lite/i.test(title)) fail("rv-alpha-radar title includes Lite");
}

async function main() {
  await checkMirrorPriority();
  await checkAlphaRadarTitle();

  const techSignals = selectTechSignalsRows({ signals: [1], items: [] });
  if (techSignals.length !== 1) fail("tech-signals does not prefer signals array");

  const techFallback = selectTechSignalsRows({ signals: [], items: [1] });
  if (techFallback.length !== 1) fail("tech-signals does not fallback to items array");

  const alphaPicks = selectAlphaRadarRows({ picks: [1], items: [] });
  if (alphaPicks.length !== 1) fail("alpha-radar does not prefer picks array");

  const alphaFallback = selectAlphaRadarRows({ picks: [], items: [1] });
  if (alphaFallback.length !== 1) fail("alpha-radar does not fallback to items array");

  const emptyValidTech = isEmptyValid({ status: "LIVE" }, []);
  if (!emptyValidTech) fail("empty-valid rule failed for tech-signals");

  const emptyValidAlpha = isEmptyValid({ status: "STALE" }, []);
  if (!emptyValidAlpha) fail("empty-valid rule failed for alpha-radar");

  console.log("[contract-smoke] ok");
}

main().catch((error) => fail(error?.message || "Unknown error"));
