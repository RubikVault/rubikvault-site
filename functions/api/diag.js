import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  try {
    const res = await serveStaticJson(context.request, "diag", null, context);
    if (res && typeof res.status === "number" && res.status === 503) {
      throw new Error("DIAG_UPSTREAM_503");
    }
    return res;
  } catch (error) {
    const now = new Date().toISOString();
    const payload = {
      ok: true,
      data: {
        summary: {
          status: "STUB",
          reason: "DIAG_ASSET_MISSING",
          message: "Diagnostic snapshot is not available yet"
        },
        snapshots: []
      },
      meta: {
        status: "STUB",
        reason: "DIAG_ASSET_MISSING",
        updatedAt: now,
        source: "stub",
        fetchedAt: now,
        digest: null,
        validation: {
          passed: true
        }
      },
      schemaVersion: "v1",
      error: null
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-RV-Source": "DIAG_FALLBACK"
      }
    });
  }
}
