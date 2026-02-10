const PROD_BASE = process.env.RV_PARITY_PROD_BASE || "https://rubikvault.com";
const PREVIEW_BASE = process.env.RV_PARITY_PREVIEW_BASE || "";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, body: JSON.parse(text) };
  } catch {
    throw new Error(`Non-JSON response from ${url} (HTTP ${res.status})`);
  }
}

function assertContract(label, doc) {
  const meta = doc?.meta || {};
  if (typeof meta.mode !== "string" || !meta.mode) {
    throw new Error(`${label}: meta.mode missing`);
  }
  if (typeof meta.universeSource !== "string" || !meta.universeSource) {
    throw new Error(`${label}: meta.universeSource missing`);
  }
  const universeCount = Number(meta.universeCount);
  const returnedCount = Number(meta.returnedCount);
  if (!Number.isFinite(universeCount) || universeCount <= 0) {
    throw new Error(`${label}: meta.universeCount invalid`);
  }
  if (!Number.isFinite(returnedCount) || returnedCount < 0) {
    throw new Error(`${label}: meta.returnedCount invalid`);
  }
  if (returnedCount > universeCount) {
    throw new Error(`${label}: returnedCount > universeCount`);
  }
  if (returnedCount < universeCount) {
    if (meta.filtered !== true || !String(meta.filterReason || "").trim()) {
      throw new Error(`${label}: filtered semantics violated (missing filtered=true or filterReason)`);
    }
  }
}

async function main() {
  if (!PREVIEW_BASE) {
    console.log("::warning::RV_PARITY_PREVIEW_BASE not set; skipping preview/prod elliott parity gate");
    process.exit(0);
  }

  const prodUrl = `${PROD_BASE.replace(/\/$/, "")}/api/elliott-scanner`;
  const previewUrl = `${PREVIEW_BASE.replace(/\/$/, "")}/api/elliott-scanner`;

  const [prod, preview] = await Promise.all([fetchJson(prodUrl), fetchJson(previewUrl)]);
  if (!prod.ok) throw new Error(`PROD elliott failed: HTTP ${prod.status}`);
  if (!preview.ok) throw new Error(`PREVIEW elliott failed: HTTP ${preview.status}`);

  assertContract("PROD", prod.body);
  assertContract("PREVIEW", preview.body);

  const prodMeta = prod.body.meta || {};
  const previewMeta = preview.body.meta || {};
  if (prodMeta.mode !== previewMeta.mode) {
    throw new Error(`Mode mismatch: prod=${prodMeta.mode} preview=${previewMeta.mode}`);
  }
  if (prodMeta.universeSource !== previewMeta.universeSource) {
    throw new Error(`Universe source mismatch: prod=${prodMeta.universeSource} preview=${previewMeta.universeSource}`);
  }

  console.log(
    `OK: elliott parity passed mode=${prodMeta.mode} universeSource=${prodMeta.universeSource} ` +
    `prodCount=${prodMeta.returnedCount} previewCount=${previewMeta.returnedCount}`
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error?.message || String(error)}`);
  process.exit(1);
});
