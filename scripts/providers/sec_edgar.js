import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://data.sec.gov";

export async function fetchSecRecentFilings(ctx, { cik = "0000320193" } = {}) {
  const apiKey = process.env.SEC_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("MISSING_SECRET", "missing_sec_api_key", {
      httpStatus: null,
      snippet: "missing SEC_API_KEY",
      urlHost: "data.sec.gov"
    });
  }

  const url = `${BASE_URL}/submissions/CIK${cik}.json`;

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, ctx, {
      headers: {
        "User-Agent": "RVSeeder/1.0",
        "Accept": "application/json"
      },
      timeoutMs: 20000
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "sec_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "data.sec.gov"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "sec_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "data.sec.gov"
    });
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType && !contentType.includes("application/json")) {
    console.warn("sec content-type not json; parsed successfully");
  }

  const recent = payload?.filings?.recent;
  const items = [];
  if (recent && Array.isArray(recent.accessionNumber)) {
    for (let i = 0; i < Math.min(recent.accessionNumber.length, 10); i += 1) {
      items.push({
        accessionNumber: recent.accessionNumber[i],
        form: recent.form?.[i] || null,
        filedAt: recent.filingDate?.[i] || null
      });
    }
  }

  const dataAt = items
    .map((row) => row.filedAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return { data: items, dataAt };
}
