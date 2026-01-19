import fs from "node:fs/promises";
import path from "node:path";

/**
 * Transform v3.0 snapshot to legacy format for backward compatibility
 * v3.0: { schema_version, metadata, data: [dataObject], error }
 * Legacy: { ok, data: dataObject, meta: { status, updatedAt, source } }
 */
function transformV3ToLegacy(v3Snapshot) {
  const metadata = v3Snapshot.metadata || {};
  const dataArray = v3Snapshot.data || [];
  
  // Extract first data object from array (v3.0 wraps data in array)
  const dataObject = dataArray[0] || {};
  
  return {
    ok: true,
    data: dataObject,
    meta: {
      status: metadata.validation?.passed ? "OK" : "PARTIAL",
      updatedAt: metadata.published_at || metadata.fetched_at || new Date().toISOString(),
      source: metadata.source || "unknown",
      fetchedAt: metadata.fetched_at,
      digest: metadata.digest,
      validation: metadata.validation
    },
    schemaVersion: "v1", // Legacy format identifier
    error: v3Snapshot.error || null
  };
}

export async function serveStaticJson(req) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/bundle";
  const isDebug = url.searchParams.has("debug");
  
  // Try v3.0 structure first: snapshots/MODULE/latest.json
  const v3File = path.join(process.cwd(), "public", "data", "snapshots", p.replace(/^\//, ""), "latest.json");
  // Fallback to old structure: MODULE.json
  const oldFile = path.join(process.cwd(), "public", "data", `${p}.json`);

  try {
    // Try v3.0 first
    let body;
    let source = "v3";
    let parsed;
    
    try {
      body = await fs.readFile(v3File, "utf8");
      parsed = JSON.parse(body);
      
      // Transform v3.0 to legacy format for backward compatibility
      if (parsed.schema_version === "3.0") {
        parsed = transformV3ToLegacy(parsed);
        body = JSON.stringify(parsed);
      }
    } catch {
      // Fallback to old structure
      body = await fs.readFile(oldFile, "utf8");
      parsed = JSON.parse(body);
      source = "legacy";
    }
    
    const headers = {
      "Content-Type": "application/json",
      "X-RV-Source": source,
      "X-RV-File": source === "v3" ? v3File : oldFile,
      "X-RV-Transformed": source === "v3" ? "true" : "false"
    };
    
    // If debug mode, add metadata
    if (isDebug) {
      const debugResponse = {
        debug: true,
        source,
        file_path: source === "v3" ? `/data/snapshots${p}/latest.json` : `/data${p}.json`,
        transformed: source === "v3",
        snapshot: parsed
      };
      return new Response(JSON.stringify(debugResponse, null, 2), { headers });
    }
    
    return new Response(body, { headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: "SNAPSHOT_NOT_FOUND", 
        tried_paths: [
          `/data/snapshots${p}/latest.json`,
          `/data${p}.json`
        ],
        message: err.message
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
}
