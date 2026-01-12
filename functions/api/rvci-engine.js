export async function onRequestGet() {
  const payload = {
    ok: true,
    feature: "rvci-engine",
    mode: "MINIMAL",
    data: { rows: [] },
    meta: {
      status: "LIVE",
      reason: "",
      ts: new Date().toISOString(),
      schemaVersion: 1,
      traceId: Math.random().toString(36).slice(2, 10),
      writeMode: "NONE",
      circuitOpen: false,
      warnings: [],
      savedAt: null,
      ageMinutes: null,
      source: null,
      emptyReason: null
    },
    error: { code: "", message: "", details: {} }
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
