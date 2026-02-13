import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

function safeExec(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function utcTimestamp(now = new Date()) {
  const iso = now.toISOString();
  return iso.replace(/[-:]/g, "").replace(".", "_");
}

export function resolveCommitSha() {
  return (
    process.env.GITHUB_SHA ||
    process.env.COMMIT_SHA ||
    safeExec("git rev-parse HEAD") ||
    "unknown"
  );
}

export function resolvePolicyCommitSha() {
  const sha = safeExec("git rev-parse HEAD:policies");
  return sha || resolveCommitSha();
}

export function resolveRunId(now = new Date()) {
  const commit = resolveCommitSha();
  const short = commit.slice(0, 8) || "unknown";
  const stamp = utcTimestamp(now).slice(0, 13);
  const seq =
    process.env.GITHUB_RUN_NUMBER ||
    process.env.CF_PAGES_BUILD_NUMBER ||
    String(Math.floor(now.getTime() / 1000));
  return `${short}-${stamp}-${seq}`;
}

export function resolveRepoRoot() {
  const gitRoot = safeExec("git rev-parse --show-toplevel");
  if (gitRoot) return gitRoot;
  return process.cwd();
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

export async function loadCalendar(exchange = "US", year = new Date().getUTCFullYear()) {
  const root = resolveRepoRoot();
  const file = path.join(root, "policies", "calendars", exchange, `${year}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

export function resolveTradingDateFromCalendar(now, calendarDoc) {
  const date = new Date(now);
  const holidays = new Set(calendarDoc.holidays || []);
  const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

  const toDate = (d) => d.toISOString().slice(0, 10);
  while (isWeekend(date) || holidays.has(toDate(date))) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return toDate(date);
}

export function createRunContext(partial = {}) {
  const now = partial.now || new Date();
  const commit = partial.commit || resolveCommitSha();
  const policyCommit = partial.policyCommit || resolvePolicyCommitSha();
  const runId = partial.runId || resolveRunId(now);

  return {
    runId,
    commit,
    policyCommit,
    generatedAt: now.toISOString(),
    rootDir: partial.rootDir || resolveRepoRoot(),
    env: {
      githubRef: process.env.GITHUB_REF || "",
      githubRunId: process.env.GITHUB_RUN_ID || "",
      githubRunNumber: process.env.GITHUB_RUN_NUMBER || ""
    }
  };
}
