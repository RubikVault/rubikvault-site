/**
 * Static JSON server for Cloudflare Pages Functions
 * CRITICAL: Uses fetch() not fs - Cloudflare Workers Runtime!
 * Supports v3.0 snapshot structure with backward compatibility transformation
 */

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
  const moduleName = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "") || "bundle";
  const isDebug = url.searchParams.has("debug");
  
  // Try MULTIPLE paths for maximum compatibility:
  const pathsToTry = [
    { path: `/data/snapshots/${moduleName}/latest.json`, type: "v3_directory" },
    { path: `/data/snapshots/${moduleName}.json`, type: "v3_flat" },        // NEW: Flat in snapshots/
    { path: `/data/${moduleName}.json`, type: "legacy" }
  ];
  
  let lastError = null;
  
  // Try each path in order
  for (const { path, type } of pathsToTry) {
    try {
      const fetchUrl = new URL(path, url.origin);
      const response = await fetch(fetchUrl.toString());
      
      if (response.ok) {
        const text = await response.text();
        let parsed = JSON.parse(text);
        
        const isV3 = parsed.schema_version === "3.0" || parsed.schemaVersion === "v3";
        let transformed = false;
        
        // Transform v3.0 to legacy format for backward compatibility
        if (parsed.schema_version === "3.0") {
          parsed = transformV3ToLegacy(parsed);
          transformed = true;
        }
        
        const headers = {
          "Content-Type": "application/json",
          "X-RV-Source": type,
          "X-RV-Transformed": transformed ? "true" : "false",
          "Cache-Control": "public, max-age=60"
        };
        
        // Debug mode: wrap with metadata
        if (isDebug) {
          const debugResponse = {
            debug: true,
            source: type,
            file_path: path,
            transformed,
            snapshot: parsed
          };
          return new Response(JSON.stringify(debugResponse, null, 2), { headers });
        }
        
        return new Response(JSON.stringify(parsed), { headers });
      }
    } catch (err) {
      lastError = err;
      console.log(`${type} fetch failed for ${moduleName} at ${path}:`, err.message);
    }
  }
  
  // ALL PATHS FAILED - Return 404 with helpful error
  const triedPaths = pathsToTry.map(p => p.path);
  return new Response(
    JSON.stringify({ 
      ok: false, 
      error: "SNAPSHOT_NOT_FOUND", 
      tried_paths: triedPaths,
      message: `No snapshot found for ${moduleName}. Tried ${triedPaths.length} locations.`,
      last_error: lastError?.message || null
    }),
    { 
      status: 404, 
      headers: { "Content-Type": "application/json" } 
    }
  );
}
