const host = process.env.HOST || "http://127.0.0.1:8788";
const token = process.env.RV_DEBUG_TOKEN || "";
const url = `${host.replace(/\/$/, "")}/api/debug-bundle?limit=50`;

const headers = token ? { "x-rv-debug-token": token } : {};

const res = await fetch(url, { headers });
if (!res.ok) {
  console.error("FAIL: debug-bundle fetch", res.status);
  process.exit(1);
}

const payload = await res.json();
const summary = payload?.summary || {};
const blocksDown = new Set(summary.blocksDown || []);
const endpointsDown = summary.endpointsDown || [];

const hasCongressDown = blocksDown.has("congress-trading");
const hasMarketHealthDown = blocksDown.has("market-health");
const endpointsFail = Array.isArray(endpointsDown) ? endpointsDown.length : 0;

console.log("Debug bundle summary:");
console.log(JSON.stringify({ blocksDown: Array.from(blocksDown), endpointsDown }, null, 2));

if (hasCongressDown) {
  console.error("FAIL: congress-trading flagged as down");
  process.exit(1);
}
if (hasMarketHealthDown) {
  console.error("FAIL: market-health flagged as down");
  process.exit(1);
}
if (endpointsFail > 0) {
  console.error("FAIL: endpointsDown not empty");
  process.exit(1);
}

console.log("OK: debug-bundle smoke checks passed");
