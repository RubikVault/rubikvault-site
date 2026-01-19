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
  
  // Try v3.0 structure first: /data/snapshots/MODULE/latest.json
  const v3Path = `/data/snapshots/${moduleName}/latest.json`;
  // Fallback to legacy: /data/MODULE.json
  const legacyPath = `/data/${moduleName}.json`;
  
  let response;
  let source = "v3";
  let transformed = false;
  
  // Try v3.0 first
  try {
    const v3Url = new URL(v3Path, url.origin);
    response = await fetch(v3Url.toString());
    
    if (response.ok) {
      const text = await response.text();
      let parsed = JSON.parse(text);
      
      // Transform v3.0 to legacy format
      if (parsed.schema_version === "3.0") {
        parsed = transformV3ToLegacy(parsed);
        transformed = true;
      }
      
      const headers = {
        "Content-Type": "application/json",
        "X-RV-Source": "v3",
        "X-RV-Transformed": transformed ? "true" : "false",
        "Cache-Control": "public, max-age=60"
      };
      
      // Debug mode: wrap with metadata
      if (isDebug) {
        const debugResponse = {
          debug: true,
          source: "v3",
          file_path: v3Path,
          transformed,
          snapshot: parsed
        };
        return new Response(JSON.stringify(debugResponse, null, 2), { headers });
      }
      
      return new Response(JSON.stringify(parsed), { headers });
    }
  } catch (err) {
    // v3.0 not found or error, try legacy
    console.log(`v3.0 fetch failed for ${moduleName}, trying legacy:`, err.message);
  }
  
  // Fallback to legacy
  try {
    const legacyUrl = new URL(legacyPath, url.origin);
    response = await fetch(legacyUrl.toString());
    
    if (response.ok) {
      const text = await response.text();
      const parsed = JSON.parse(text);
      
      const headers = {
        "Content-Type": "application/json",
        "X-RV-Source": "legacy",
        "X-RV-Transformed": "false",
        "Cache-Control": "public, max-age=60"
      };
      
      if (isDebug) {
        const debugResponse = {
          debug: true,
          source: "legacy",
          file_path: legacyPath,
          transformed: false,
          snapshot: parsed
        };
        return new Response(JSON.stringify(debugResponse, null, 2), { headers });
      }
      
      return new Response(text, { headers });
    }
  } catch (err) {
    console.log(`Legacy fetch failed for ${moduleName}:`, err.message);
  }
  
  // Both failed
  return new Response(
    JSON.stringify({ 
      ok: false, 
      error: "SNAPSHOT_NOT_FOUND", 
      tried_paths: [v3Path, legacyPath],
      message: `Neither v3.0 nor legacy snapshot found for ${moduleName}`
    }),
    { 
      status: 404, 
      headers: { "Content-Type": "application/json" } 
    }
  );
}
