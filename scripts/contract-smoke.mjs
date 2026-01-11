import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const loaderPath = path.join(ROOT, "public", "rv-loader.js");
  const loader = await fs.readFile(loaderPath, "utf8");
  const mirrorLine = loader.split("\n").find((line) => line.includes("MIRROR_PREFERRED_IDS"));
  if (!mirrorLine) fail("MIRROR_PREFERRED_IDS set not found in loader");
  const listMatch = mirrorLine.match(/\[(.*)\]/);
  if (!listMatch) fail("MIRROR_PREFERRED_IDS list not found in loader");
  const list = listMatch[1]
    .split(",")
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  if (!list.includes("tech-signals")) fail("tech-signals missing from MIRROR_PREFERRED_IDS");
  if (!list.includes("alpha-radar")) fail("alpha-radar missing from MIRROR_PREFERRED_IDS");
}

async function checkAlphaRadarTitle() {
  const configPath = path.join(ROOT, "public", "rv-config.js");
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
