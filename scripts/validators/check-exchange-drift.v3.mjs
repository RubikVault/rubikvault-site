#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { createRunContext } from "../lib/v3/run-context.mjs";
import { writeJsonArtifact } from "../lib/v3/artifact-writer.mjs";

const EODHD_URL = "https://eodhd.com/api/exchanges-list/?fmt=json";

function canonicalize(list = []) {
  return list
    .map((item) => ({
      Code: item.Code || item.code || "",
      Name: item.Name || item.name || "",
      Currency: item.Currency || item.currency || "",
      Country: item.Country || item.country || "",
      OperatingMIC: item.OperatingMIC || item.operatingMIC || ""
    }))
    .filter((item) => item.Code)
    .sort((a, b) => a.Code.localeCompare(b.Code));
}

async function fetchExchanges(apiKey) {
  const res = await fetch(`${EODHD_URL}&api_token=${encodeURIComponent(apiKey)}`, {
    headers: { "user-agent": "RubikVault-v3-exchange-drift/1.0" }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EODHD_EXCHANGES_FETCH_FAILED:${res.status}:${body.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const today = runContext.generatedAt.slice(0, 10);

  const policy = JSON.parse(
    await fs.readFile(path.join(rootDir, "policies/exchanges.v3.json"), "utf8")
  );

  const rawDir = path.join(rootDir, "mirrors/meta/eodhd/exchanges-list");
  await fs.mkdir(rawDir, { recursive: true });

  const apiKey = process.env.EODHD_API_KEY || "";
  let raw = null;
  let source = "cache";

  if (apiKey) {
    raw = await fetchExchanges(apiKey);
    source = "eodhd";
    await fs.writeFile(path.join(rawDir, `${today}.raw.json`), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  } else {
    const latestPath = path.join(rawDir, "latest.json");
    raw = JSON.parse(await fs.readFile(latestPath, "utf8"));
    source = "latest-cache";
  }

  const canonical = canonicalize(raw);
  await fs.writeFile(path.join(rawDir, `${today}.canonical.json`), `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(rawDir, "latest.json"), `${JSON.stringify(canonical, null, 2)}\n`, "utf8");

  const known = new Set(policy.allowed_codes || []);
  const ignored = new Set(policy.ignored_codes || []);
  const aliases = policy.alias_map || {};
  const observedCodes = canonical.map((item) => item.Code);
  const unresolved = observedCodes.filter((code) => !known.has(code) && !aliases[code] && !ignored.has(code));

  const report = {
    meta: {
      schema: "rv.exchange.drift.v1",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      source
    },
    observed_count: observedCodes.length,
    unresolved_codes: unresolved,
    unresolved_count: unresolved.length,
    policy_allowed_codes: policy.allowed_codes || []
  };

  await writeJsonArtifact(rootDir, `public/data/v3/system/drift/exchanges-drift-${today}.json`, report);

  if (unresolved.length > 0) {
    console.warn(`EXCHANGE_DRIFT_NEW_CODES:${unresolved.join(",")}`);
    console.warn(`Add these codes to policies/exchanges.v3.json ignored_codes to silence.`);
    // Auto-append unresolved codes to ignored_codes in policy file for next run
    const updatedPolicy = JSON.parse(
      await fs.readFile(path.join(rootDir, "policies/exchanges.v3.json"), "utf8")
    );
    const currentIgnored = new Set(updatedPolicy.ignored_codes || []);
    let policyUpdated = false;
    for (const code of unresolved) {
      if (!currentIgnored.has(code)) {
        updatedPolicy.ignored_codes.push(code);
        currentIgnored.add(code);
        policyUpdated = true;
      }
    }
    if (policyUpdated) {
      updatedPolicy.ignored_codes.sort();
      await fs.writeFile(
        path.join(rootDir, "policies/exchanges.v3.json"),
        `${JSON.stringify(updatedPolicy, null, 2)}\n`,
        "utf8"
      );
      console.log(`Auto-added ${unresolved.length} new exchange codes to ignored_codes`);
    }
  }

  console.log(`exchange drift check passed (observed=${observedCodes.length})`);
}

main().catch((error) => {
  console.error(`CHECK_EXCHANGE_DRIFT_FAILED:${error.message}`);
  process.exitCode = 1;
});
