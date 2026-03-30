#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const PROTECTED_PATHS = new Set([
  "public/stock.html",
  "public/_redirects",
]);

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function detectRange() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const baseRef = process.env.GITHUB_BASE_REF || "";
  const before = process.env.GITHUB_EVENT_BEFORE || "";

  if (eventName === "pull_request" || eventName === "pull_request_target") {
    if (!baseRef) {
      throw new Error("GITHUB_BASE_REF is required for pull_request checks.");
    }
    return `origin/${baseRef}...HEAD`;
  }

  if (before && !/^0+$/.test(before)) {
    return `${before}...HEAD`;
  }

  return "HEAD~1...HEAD";
}

function getChangedFiles(range) {
  const output = runGit(["diff", "--name-only", range]);
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function hasAnalyzeRedirectChange(range) {
  const diff = runGit(["diff", "--unified=0", range, "--", "public/_redirects"]);
  return diff
    .split("\n")
    .some((line) => /^[+-](?![+-])/.test(line) && /\/analyze(?:-v4)?(?:\/\*|\s|$)/.test(line));
}

function main() {
  const range = detectRange();
  const changedFiles = getChangedFiles(range);
  const protectedTouched = changedFiles.filter((file) => PROTECTED_PATHS.has(file));
  const analyzeRedirectChanged = protectedTouched.includes("public/_redirects") && hasAnalyzeRedirectChange(range);
  const hardBlocked = protectedTouched.includes("public/stock.html") || analyzeRedirectChanged;

  if (!hardBlocked) {
    console.log(`[frozen-v2-guard] PASS: no frozen V2 owner changes in ${range}`);
    return;
  }

  const reasons = [];
  if (protectedTouched.includes("public/stock.html")) {
    reasons.push("`public/stock.html` is the frozen MAIN V2 owner.");
  }
  if (analyzeRedirectChanged) {
    reasons.push("`public/_redirects` changed `/analyze` or `/analyze-v4` ownership.");
  }

  console.error("[frozen-v2-guard] BLOCKED");
  console.error(`Range: ${range}`);
  console.error(`Changed files: ${changedFiles.join(", ") || "(none)"}`);
  for (const reason of reasons) {
    console.error(`- ${reason}`);
  }
  console.error("- MAIN must stay on frozen V2 at `/analyze`.");
  console.error("- Any V4 iteration must happen outside this owner path and be validated before promotion.");
  process.exit(1);
}

main();
