import fs from "node:fs/promises";
import path from "node:path";

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
    try {
      body = await fs.readFile(v3File, "utf8");
    } catch {
      // Fallback to old structure
      body = await fs.readFile(oldFile, "utf8");
      source = "legacy";
    }
    
    const headers = {
      "Content-Type": "application/json",
      "X-RV-Source": source,
      "X-RV-File": source === "v3" ? v3File : oldFile
    };
    
    // If debug mode, add metadata
    if (isDebug) {
      const parsed = JSON.parse(body);
      const debugResponse = {
        debug: true,
        source,
        file_path: source === "v3" ? `/data/snapshots${p}/latest.json` : `/data${p}.json`,
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
