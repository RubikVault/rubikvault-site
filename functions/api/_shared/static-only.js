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

/**
 * Module-specific transformations for field name mismatches
 * Some legacy frontends expect different field names than the snapshots provide
 */
function applyModuleTransformations(moduleName, parsed) {
  // Clone to avoid mutation
  const result = JSON.parse(JSON.stringify(parsed));
  
  // S&P 500 Sectors: Frontend expects "sectors" but snapshot has "items"
  if (moduleName === "sp500-sectors" && result.data?.items && !result.data?.sectors) {
    result.data.sectors = result.data.items.map(item => ({
      ...item,
      // Map changePercent to r1d (1 day return) - use ?? instead of || to handle 0 correctly
      r1d: item.changePercent ?? item.r1d ?? null,
      r1w: item.r1w ?? null,
      r1m: item.r1m ?? null,
      r1y: item.r1y ?? null
    }));
    console.log(`[Transform] sp500-sectors: Mapped items → sectors with r1d field (${result.data.sectors.length} items)`);
  }

  // Sector Rotation: Same issue
  if (moduleName === "sector-rotation" && result.data?.items && !result.data?.sectors) {
    result.data.sectors = result.data.items.map(item => ({
      ...item,
      // Use ?? to correctly handle 0 values
      r1d: item.changePercent ?? item.r1d ?? null,
      r1w: item.r1w ?? null,
      r1m: item.r1m ?? null,
      r1y: item.r1y ?? null
    }));
    console.log(`[Transform] sector-rotation: Mapped items → sectors with r1d field (${result.data.sectors.length} items)`);
  }
  
  return result;
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
        
        // Apply module-specific transformations (field name mappings, etc.)
        // THIS RUNS FOR ALL FORMATS (v3.0, v3 legacy, and flat legacy)
        parsed = applyModuleTransformations(moduleName, parsed);
        
        // Ensure 'ok' field is set for legacy frontend compatibility
        if (parsed.ok === undefined || parsed.ok === null) {
          parsed.ok = true; // Default to true if data was successfully loaded
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
