import fs from "node:fs/promises";
import path from "node:path";
import { consumeBudget } from "./budget-guard.mjs";
import { writeTextAtomic } from "./stable-io.mjs";

const EODHD_BASE = "https://eodhd.com/api";
const TIINGO_BASE = "https://api.tiingo.com/tiingo";

async function appendUsageLedger(rootDir, event) {
  const ledgerPath = path.join(rootDir, "mirrors", "ops", "usage-ledger.v3.ndjson");
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  try {
    await fs.appendFile(ledgerPath, line, "utf8");
  } catch {
    const existing = await fs.readFile(ledgerPath, "utf8").catch(() => "");
    await writeTextAtomic(ledgerPath, `${existing}${line}`);
  }
}

async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP_${res.status}:${body.slice(0, 240)}`);
      }
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }
  }
  throw lastError || new Error("provider_fetch_failed");
}

export function createProviderClients({ rootDir, runContext, providersPolicy, budgetPolicy }) {
  const eodhdKey = process.env.EODHD_API_KEY || "";
  const tiingoKey = process.env.TIINGO_API_KEY || "";

  const assertEndpointAllowed = (providerKey, endpointKey) => {
    const providerCfg = providersPolicy.providers?.[providerKey];
    const allowed = providerCfg?.allowed_endpoints || [];
    const blocked = providerCfg?.blocked_endpoints || [];

    if (blocked.includes(endpointKey)) {
      throw new Error(`PROVIDER_ENDPOINT_BLOCKED:${providerKey}:${endpointKey}`);
    }
    if (!allowed.includes(endpointKey)) {
      throw new Error(`PROVIDER_ENDPOINT_NOT_ALLOWED:${providerKey}:${endpointKey}`);
    }
  };

  const call = async ({ provider, endpoint, url, authHeader, authQuery, dpName, method = "GET" }) => {
    const startedAt = new Date().toISOString();
    const data = await fetchJsonWithRetry(url, {
      method,
      headers: {
        ...(authHeader || {}),
        "user-agent": "RubikVault-v3-data-plane/1.0"
      }
    });

    await consumeBudget(rootDir, dpName, 1, runContext);
    await appendUsageLedger(rootDir, {
      at: startedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      dp: dpName,
      provider,
      endpoint,
      auth_query: authQuery || null,
      calls: 1
    });

    return data;
  };

  const eodhd = {
    async eod({ symbol, from, to, dpName = "dp1_eod" }) {
      assertEndpointAllowed("eodhd", "eod");
      if (!eodhdKey) throw new Error("MISSING_SECRET:EODHD_API_KEY");
      const url = `${EODHD_BASE}/eod/${encodeURIComponent(symbol)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&fmt=json&api_token=${encodeURIComponent(eodhdKey)}`;
      return call({ provider: "eodhd", endpoint: "eod", url, authQuery: "api_token", dpName });
    },
    async splits({ symbol, dpName = "dp2_actions" }) {
      assertEndpointAllowed("eodhd", "splits");
      if (!eodhdKey) throw new Error("MISSING_SECRET:EODHD_API_KEY");
      const url = `${EODHD_BASE}/splits/${encodeURIComponent(symbol)}?fmt=json&api_token=${encodeURIComponent(eodhdKey)}`;
      return call({ provider: "eodhd", endpoint: "splits", url, authQuery: "api_token", dpName });
    },
    async dividends({ symbol, dpName = "dp2_actions" }) {
      assertEndpointAllowed("eodhd", "dividends");
      if (!eodhdKey) throw new Error("MISSING_SECRET:EODHD_API_KEY");
      const url = `${EODHD_BASE}/div/${encodeURIComponent(symbol)}?fmt=json&api_token=${encodeURIComponent(eodhdKey)}`;
      return call({ provider: "eodhd", endpoint: "dividends", url, authQuery: "api_token", dpName });
    },
    async exchanges({ dpName = "dp0_universe" }) {
      assertEndpointAllowed("eodhd", "exchanges-list");
      if (!eodhdKey) throw new Error("MISSING_SECRET:EODHD_API_KEY");
      const url = `${EODHD_BASE}/exchanges-list/?fmt=json&api_token=${encodeURIComponent(eodhdKey)}`;
      return call({ provider: "eodhd", endpoint: "exchanges-list", url, authQuery: "api_token", dpName });
    },
    async news({ symbol, limit = 10, dpName = "dp5_news" }) {
      assertEndpointAllowed("eodhd", "news");
      if (!eodhdKey) throw new Error("MISSING_SECRET:EODHD_API_KEY");
      const url = `${EODHD_BASE}/news?s=${encodeURIComponent(symbol)}&limit=${encodeURIComponent(String(limit))}&api_token=${encodeURIComponent(eodhdKey)}&fmt=json`;
      return call({ provider: "eodhd", endpoint: "news", url, authQuery: "api_token", dpName });
    }
  };

  const tiingo = {
    async fundamentalsMeta({ ticker, dpName = "dp7_fundamentals_bridge" }) {
      assertEndpointAllowed("tiingo", "fundamentals-metadata");
      if (!tiingoKey) throw new Error("MISSING_SECRET:TIINGO_API_KEY");
      const url = `${TIINGO_BASE}/daily/${encodeURIComponent(ticker)}?token=${encodeURIComponent(tiingoKey)}`;
      return call({ provider: "tiingo", endpoint: "fundamentals-metadata", url, authQuery: "token", dpName });
    },
    async dailyFallback({ ticker, startDate, endDate, dpName = "dp1_eod" }) {
      assertEndpointAllowed("tiingo", "daily");
      if (!tiingoKey) throw new Error("MISSING_SECRET:TIINGO_API_KEY");
      const url = `${TIINGO_BASE}/daily/${encodeURIComponent(ticker)}/prices?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&token=${encodeURIComponent(tiingoKey)}`;
      return call({ provider: "tiingo", endpoint: "daily", url, authQuery: "token", dpName });
    }
  };

  return {
    eodhd,
    tiingo,
    providersPolicy,
    budgetPolicy
  };
}
