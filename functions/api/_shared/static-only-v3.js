/**
 * Static JSON API Server v3.0 - Enhanced with Debug Mode
 * 
 * Features:
 * - v3.0 snapshot serving
 * - Backward compatibility transformation
 * - ?debug=1 full diagnostic mode
 * - Proof Chain evaluation
 * - Failure hints integration
 * - Module state inspection
 */

/**
 * Transform v3.0 snapshot to legacy format
 */
function transformV3ToLegacy(v3Snapshot) {
  const metadata = v3Snapshot.metadata || {};
  const dataArray = v3Snapshot.data || [];
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
    schemaVersion: "v1",
    error: v3Snapshot.error || null
  };
}

/**
 * Module-specific transformations
 */
function applyModuleTransformations(moduleName, parsed) {
  const result = JSON.parse(JSON.stringify(parsed));
  
  // S&P 500 Sectors & Sector Rotation: items → sectors
  if ((moduleName === "sp500-sectors" || moduleName === "sector-rotation") && 
      result.data?.items && !result.data?.sectors) {
    result.data.sectors = result.data.items.map(item => ({
      ...item,
      r1d: item.changePercent ?? item.r1d ?? null,
      r1w: item.r1w ?? null,
      r1m: item.r1m ?? null,
      r1y: item.r1y ?? null
    }));
  }
  
  return result;
}

const OWNER_ENDPOINTS = new Set([
  "mission-control/summary",
  "mission-control",
  "build-info",
  "debug-bundle",
  "ops"
]);

function buildOwnerFallback(moduleName) {
  const now = new Date().toISOString();
  return {
    schema_version: "3.0",
    metadata: {
      module: moduleName,
      served_from: "MAINTENANCE",
      reason: "ASSET_FETCH_FAILED"
    },
    ok: true,
    meta: {
      status: "degraded",
      provider: "internal",
      data_date: now.slice(0, 10),
      generated_at: now
    },
    data: {
      owner: {
        overall: { verdict: "WARN", reason: "ASSET_FETCH_FAILED" },
        topIssues: [
          {
            code: "ASSET_FETCH_FAILED",
            message: `${moduleName} unavailable`,
            action: `/api/${moduleName}`
          }
        ]
      },
      cards: {},
      health: {},
      runtime: { env: "preview", schedulerExpected: false }
    },
    error: null
  };
}

/**
 * Evaluate Proof Chain for a snapshot
 */
function evaluateProofChain(snapshot, moduleConfig, moduleName) {
  const proofChain = {
    FILE: 'UNKNOWN',
    SCHEMA: 'UNKNOWN',
    PLAUS: 'UNKNOWN',
    UI: 'UNKNOWN',
    FRESH: 'UNKNOWN',
    DELIVERY: 'PASS' // Assumed PASS if we got here
  };
  
  if (!snapshot) {
    proofChain.FILE = 'FAIL';
    return proofChain;
  }
  
  proofChain.FILE = 'PASS';
  
  // SCHEMA Check
  const isBuildInfo = moduleName === 'build-info';
  const dataOk = Array.isArray(snapshot.data) || (isBuildInfo && snapshot.data && typeof snapshot.data === 'object');
  if (snapshot.schema_version === '3.0' && snapshot.metadata && dataOk) {
    proofChain.SCHEMA = 'PASS';
  } else {
    proofChain.SCHEMA = 'FAIL';
  }
  
  // PLAUS Check
  if (snapshot.metadata?.validation?.passed) {
    proofChain.PLAUS = 'PASS';
  } else {
    proofChain.PLAUS = 'FAIL';
  }
  
  // UI Check
  const uiRequired = moduleConfig?.ui_contract?.policy === 'always' ||
                     (moduleConfig?.ui_contract?.policy === 'always_for_critical' && moduleConfig?.tier === 'critical');
  
  if (uiRequired) {
    if (snapshot.metadata?.validation?.passed) {
      proofChain.UI = 'PASS';
    } else {
      proofChain.UI = 'FAIL';
    }
  } else {
    proofChain.UI = 'SKIP';
  }
  
  // FRESH Check
  if (snapshot.metadata?.freshness) {
    const ageMinutes = snapshot.metadata.freshness.age_minutes;
    const expected = snapshot.metadata.freshness.expected_interval_minutes;
    const grace = snapshot.metadata.freshness.grace_minutes;
    
    if (ageMinutes <= expected) {
      proofChain.FRESH = 'PASS';
    } else if (ageMinutes <= expected + grace) {
      proofChain.FRESH = 'WARN';
    } else {
      proofChain.FRESH = 'FAIL';
    }
  }
  
  return proofChain;
}

/**
 * Determine failure class and hint
 */
function getFailureInfo(snapshot, proofChain) {
  if (proofChain.FILE === 'FAIL') {
    return {
      class: 'ASSET_FETCH_FAILED',
      hint: 'Check Cloudflare Pages deployment'
    };
  }
  
  if (proofChain.SCHEMA === 'FAIL') {
    return {
      class: 'VALIDATION_FAILED_SCHEMA',
      hint: 'Update provider to v3.0 schema'
    };
  }
  
  if (proofChain.PLAUS === 'FAIL') {
    return {
      class: 'PLAUSIBILITY_FAILED',
      hint: 'Check data source or adjust plausibility rules'
    };
  }
  
  if (proofChain.UI === 'FAIL') {
    return {
      class: 'UI_CONTRACT_FAILED',
      hint: 'Fix provider to include required UI fields'
    };
  }
  
  if (proofChain.FRESH === 'FAIL') {
    return {
      class: 'STALE_DATA',
      hint: 'Check scraper schedule and provider availability'
    };
  }
  
  return {
    class: null,
    hint: null
  };
}

/**
 * Build debug response
 */
async function buildDebugResponse(moduleName, snapshot, moduleConfig, sourceInfo, url) {
  const proofChain = evaluateProofChain(snapshot, moduleConfig, moduleName);
  const failureInfo = getFailureInfo(snapshot, proofChain);
  
  // Try to load module state
  let moduleState = null;
  try {
    const stateUrl = new URL(`/data/state/modules/${moduleName}.json`, url.origin);
    const stateResponse = await fetch(stateUrl.toString());
    if (stateResponse.ok) {
      moduleState = await stateResponse.json();
    }
  } catch (e) {
    // Module state optional for debug
  }
  
  // Try to load manifest
  let manifestEntry = null;
  try {
    const manifestUrl = new URL('/data/manifest.json', url.origin);
    const manifestResponse = await fetch(manifestUrl.toString());
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      manifestEntry = manifest.modules?.[moduleName] || null;
    }
  } catch (e) {
    // Manifest optional for debug
  }
  
  return {
    debug: true,
    module: moduleName,
    served_from: sourceInfo.type,
    timestamp: new Date().toISOString(),
    
    // Proof Chain
    proof_chain: proofChain,
    proof_summary: Object.values(proofChain).every(v => v === 'PASS' || v === 'SKIP') ? 'ALL_PASS' : 'FAILED',
    
    // Failure Info
    failure: failureInfo,
    
    // Source Info
    source: {
      file_path: sourceInfo.path,
      type: sourceInfo.type,
      file_present: sourceInfo.found,
      last_error: sourceInfo.lastError
    },
    
    // Module State (if available)
    module_state: moduleState ? {
      status: moduleState.status,
      severity: moduleState.severity,
      published: moduleState.published,
      last_success_at: moduleState.last_success_at,
      last_attempt_at: moduleState.last_attempt_at,
      failure_class: moduleState.failure?.class
    } : null,
    
    // Manifest Entry (if available)
    manifest: manifestEntry ? {
      tier: manifestEntry.tier,
      status: manifestEntry.status,
      published: manifestEntry.published,
      digest: manifestEntry.digest,
      age_minutes: manifestEntry.freshness?.age_minutes,
      preferred_source: manifestEntry.cache?.preferred_source
    } : null,
    
    // Module Config
    config: moduleConfig ? {
      tier: moduleConfig.tier,
      domain: moduleConfig.domain,
      expected_interval_minutes: moduleConfig.freshness?.expected_interval_minutes,
      ui_contract_policy: moduleConfig.ui_contract?.policy
    } : null,
    
    // Metadata
    metadata: snapshot?.metadata || null,
    
    // Suggested Action
    suggested_action: failureInfo.hint || 'Data is healthy',
    
    // Links
    links: {
      snapshot: `/data/snapshots/${moduleName}/latest.json`,
      state: `/data/state/modules/${moduleName}.json`,
      manifest: '/data/manifest.json',
      probe: `/api/probe/${moduleName}`
    },
    
    // Actual Data (truncated in debug)
    data_preview: snapshot?.data ? {
      record_count: snapshot.metadata?.record_count || 0,
      first_record: snapshot.data[0] || null
    } : null
  };
}

/**
 * Main API handler
 */
export async function serveStaticJson(req, env, ctx) {
  const url = new URL(req.url);
  const moduleName = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "") || "bundle";
  const isDebug = url.searchParams.has("debug") || url.searchParams.get("debug") === "1";
  const isOwnerEndpoint = OWNER_ENDPOINTS.has(moduleName);
  
  // Load module config
  let moduleConfig = null;
  try {
    const registryUrl = new URL('/data/registry/modules.json', url.origin);
    const registryResponse = await fetch(registryUrl.toString());
    if (registryResponse.ok) {
      const registry = await registryResponse.json();
      moduleConfig = registry.modules?.[moduleName] || null;
    }
  } catch (e) {
    console.warn('[API] Failed to load registry:', e.message);
  }
  
  const buildInfoOnly = moduleName === "build-info";
  // Try multiple paths (build-info is canonical snapshot only)
  const pathsToTry = buildInfoOnly ? [
    { path: `/data/snapshots/${moduleName}/latest.json`, type: "v3_directory" }
  ] : [
    { path: `/data/snapshots/${moduleName}/latest.json`, type: "v3_directory" },
    { path: `/data/snapshots/${moduleName}.json`, type: "v3_flat" },
    { path: `/data/${moduleName}.json`, type: "legacy" }
  ];
  
  let snapshot = null;
  let sourceInfo = { found: false, type: null, path: null, lastError: null };
  
  for (const { path, type } of pathsToTry) {
    try {
      const fetchUrl = new URL(path, url.origin);
      const response = await fetch(fetchUrl.toString());
      
      if (response.ok) {
        const text = await response.text();
        snapshot = JSON.parse(text);
        sourceInfo = { found: true, type, path, lastError: null };
        break;
      }
    } catch (err) {
      sourceInfo.lastError = err.message;
    }
  }
  
  // DEBUG MODE
  if (isDebug) {
    if (!snapshot && isOwnerEndpoint) {
      const payload = buildOwnerFallback(moduleName);
      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RV-Debug": "true",
          "X-RV-Source": "MAINTENANCE"
        }
      });
    }
    const debugResponse = await buildDebugResponse(moduleName, snapshot, moduleConfig, sourceInfo, url);
    return new Response(JSON.stringify(debugResponse, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-RV-Debug": "true"
      }
    });
  }
  
  // NORMAL MODE
  if (!snapshot) {
    // Return maintenance envelope
    if (isOwnerEndpoint) {
      const payload = buildOwnerFallback(moduleName);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RV-Source": "MAINTENANCE"
        }
      });
    }
    return new Response(
      JSON.stringify({
        schema_version: "3.0",
        metadata: {
          module: moduleName,
          served_from: "MAINTENANCE",
          reason: "ASSET_FETCH_FAILED"
        },
        data: [],
        error: {
          class: "ASSET_FETCH_FAILED",
          message: "Data temporarily unavailable",
          user_message: "Data is being updated. Please try again shortly."
        }
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RV-Source": "MAINTENANCE"
        }
      }
    );
  }
  
  // Transform v3.0 to legacy
  const isV3 = snapshot.schema_version === "3.0" || snapshot.schemaVersion === "v3";
  let transformed = false;
  
  if (isV3) {
    snapshot = transformV3ToLegacy(snapshot);
    transformed = true;
  }
  
  // Apply module-specific transformations
  snapshot = applyModuleTransformations(moduleName, snapshot);
  
  // Ensure ok field
  if (snapshot.ok === undefined || snapshot.ok === null) {
    snapshot.ok = true;
  }
  
  return new Response(JSON.stringify(snapshot), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "X-RV-Source": sourceInfo.type,
      "X-RV-Transformed": transformed ? "true" : "false"
    }
  });
}

export default { serveStaticJson };
