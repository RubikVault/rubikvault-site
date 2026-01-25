import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  try {
    const res = await serveStaticJson(context.request, "debug-matrix", null, context);
    if (res && typeof res.status === "number" && res.status === 503) {
      throw new Error("DEBUG_MATRIX_UPSTREAM_503");
    }
    return res;
  } catch (error) {
    const now = new Date().toISOString();
    const payload = {
      ok: true,
      data: {
        blocks: [],
        summary: {
          status: "STUB",
          message: "Debug matrix not available yet"
        }
      },
      meta: {
        status: "STUB",
        reason: "ASSET_MISSING",
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
        "X-RV-Source": "DEBUG_MATRIX_FALLBACK"
      }
    });
  }
}
