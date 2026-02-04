import { isPrivilegedDebug, redact } from "./observability.js";

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
  const isSuccess = Object.values(proofChain).every(v => v === 'PASS' || v === 'SKIP');
  const todayUtc = new Date().toISOString().slice(0, 10);

  const kvBackend = sourceInfo?.kv_backend || null;
  let suggestedAction = failureInfo.hint || 'Data is healthy';
  if (kvBackend === 'MISSING') {
    suggestedAction = 'KV backend is unavailable. Ensure Cloudflare Pages KV binding RV_KV is configured and enabled for this environment.';
  }

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
    schema_version: snapshot?.schema_version || null,
    debug: true,
    module: moduleName,
    served_from: sourceInfo.served_from,
    kv_status: sourceInfo.kv_status,
    kv_backend: kvBackend,
    asset_status: sourceInfo.asset_status,
    manifest_ref: sourceInfo.manifest_ref,
    build_id: sourceInfo.build_id,
    kv_latency_ms: sourceInfo.kv_latency_ms,
    asset_latency_ms: sourceInfo.asset_latency_ms,
    timestamp: new Date().toISOString(),

    // Proof Chain
    proof_chain: proofChain,
    proof_summary: isSuccess ? 'ALL_PASS' : 'FAILED',

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
    suggested_action: suggestedAction,

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
    } : null,

    // Envelope fields (required for compliance)
    ok: isSuccess,
    error: isSuccess ? null : {
      code: failureInfo.class === 'ASSET_FETCH_FAILED' ? 'NOT_FOUND' : 'PROOF_FAILED',
      message: failureInfo.hint || 'Proof chain validation failed'
    },
    data: null,
    meta: {
      status: isSuccess ? 'ok' : 'error',
      provider: snapshot?.metadata?.source || 'unknown',
      data_date: todayUtc,
      generated_at: new Date().toISOString()
    }
  };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function readKvWithTimeout(kv, key, ms) {
  const started = Date.now();
  try {
    const value = await withTimeout(kv.get(key, { type: "json" }), ms);
    return { value, hit: value !== null && value !== undefined, latency_ms: Date.now() - started, error: null };
  } catch (error) {
    return { value: null, hit: false, latency_ms: Date.now() - started, error };
  }
}

function getManifestRef(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  return manifest.manifest_ref || manifest.build_id || manifest.active_build_id || manifest.published_at || null;
}

function getBuildId(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  return manifest.build_id || manifest.active_build_id || null;
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
 * Main API handler
 */
export async function serveStaticJson(req, envOrModule, ignored, ctxOrContext) {
  const url = new URL(req.url);
  const moduleOverride = typeof envOrModule === "string" ? envOrModule : null;
  const env = moduleOverride ? ctxOrContext?.env : envOrModule;
  const ctx = moduleOverride ? ctxOrContext : ctxOrContext;
  const moduleName = moduleOverride || url.pathname.replace(/^\/api\//, "").replace(/\/$/, "") || "bundle";
  const isDebug = url.searchParams.has("debug") || url.searchParams.get("debug") === "1";
  const isPrivileged = isPrivilegedDebug(req, env);
  const isOwnerEndpoint = OWNER_ENDPOINTS.has(moduleName);

  // Manifest-first (asset)
  let manifest = null;
  let manifestEntry = null;
  let manifestRef = null;
  let buildId = null;
  try {
    const manifestUrl = new URL('/data/manifest.json', url.origin);
    const manifestResponse = await fetch(manifestUrl.toString());
    if (manifestResponse.ok) {
      manifest = await manifestResponse.json();
      manifestEntry = manifest?.modules?.[moduleName] || null;
      manifestRef = getManifestRef(manifest);
      buildId = getBuildId(manifest);
    }
  } catch (e) {
    // optional
  }

  const kvEnabled = manifestEntry?.cache?.kv_enabled === true;
  const kv = env?.RV_KV || null;
  const hasKV = kv && typeof kv.get === "function";
  const kvBackend = hasKV ? 'BOUND' : 'MISSING';

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

  // Optional KV read-only (500ms)
  let kvResult = { value: null, hit: false, latency_ms: null, error: null };
  let kvStatus = "DISABLED";
  let kvPayload = null;

  if (kvEnabled) {
    if (!hasKV) {
      kvStatus = "ERROR";
    } else {
      kvStatus = "MISS";
      const key = `/data/snapshots/${moduleName}/latest.json`;
      kvResult = await readKvWithTimeout(kv, key, 500);
      if (kvResult.hit) {
        kvStatus = "HIT";
        kvPayload = kvResult.value;
      } else if (kvResult.error) {
        kvStatus = "ERROR";
      }
    }
  }

  // Try multiple paths
  const pathsToTry = [
    { path: `/data/snapshots/${moduleName}/latest.json`, type: "v3_directory" },
    { path: `/data/snapshots/${moduleName}.json`, type: "v3_flat" },
    { path: `/data/${moduleName}.json`, type: "legacy" }
  ];

  let snapshot = null;
  let servedFrom = null;
  let sourceInfo = {
    found: false,
    type: null,
    path: null,
    lastError: null,
    served_from: null,
    kv_status: kvStatus,
    kv_backend: kvBackend,
    asset_status: "MISS",
    manifest_ref: manifestRef,
    build_id: buildId,
    kv_latency_ms: kvResult.latency_ms,
    asset_latency_ms: null
  };

  // Serve order: KV HIT → serve from KV
  if (kvStatus === "HIT" && kvPayload) {
    snapshot = kvPayload;
    servedFrom = "KV";
    sourceInfo.found = true;
    sourceInfo.type = "KV";
    sourceInfo.path = "RV_KV";
    sourceInfo.served_from = "KV";
    sourceInfo.asset_status = "MISS";
  }

  // KV MISS/ERROR → serve asset snapshot
  const assetStarted = Date.now();
  if (!snapshot) {
    sourceInfo.served_from = "ASSET";
    sourceInfo.asset_status = "MISS";
    for (const { path, type } of pathsToTry) {
      try {
        const fetchUrl = new URL(path, url.origin);
        const response = await fetch(fetchUrl.toString());

        if (response.ok) {
          const text = await response.text();
          snapshot = JSON.parse(text);
          servedFrom = "ASSET";
          sourceInfo = {
            found: true,
            type,
            path,
            lastError: null,
            served_from: "ASSET",
            kv_status: kvStatus,
            kv_backend: kvBackend,
            asset_status: "HIT",
            manifest_ref: manifestRef,
            build_id: buildId,
            kv_latency_ms: kvResult.latency_ms,
            asset_latency_ms: Date.now() - assetStarted
          };
          break;
        }
      } catch (err) {
        sourceInfo.lastError = err.message;
        sourceInfo.asset_status = "ERROR";
      }
    }
    if (snapshot && !sourceInfo.asset_latency_ms) {
      sourceInfo.asset_latency_ms = Date.now() - assetStarted;
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
    const payload = isPrivileged ? debugResponse : redact(debugResponse);
    return new Response(JSON.stringify(payload, null, 2), {
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
    const kvForMaintenance = kvEnabled ? (hasKV ? kvStatus : "ERROR") : "DISABLED";
    sourceInfo.served_from = "MAINTENANCE";
    if (isOwnerEndpoint) {
      const payload = buildOwnerFallback(moduleName);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RV-Source": "MAINTENANCE",
          "X-RV-KV": kvForMaintenance
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
          code: "SERVICE_UNAVAILABLE",
          message: "Data temporarily unavailable"
        },
        ok: false,
        meta: {
          status: "error",
          provider: "internal",
          data_date: new Date().toISOString().slice(0, 10),
          generated_at: new Date().toISOString()
        }
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-RV-Source": "MAINTENANCE",
          "X-RV-KV": kvForMaintenance
        }
      }
    );
  }

  // Transform v3.0 to legacy
  const isV3 = snapshot.schema_version === "3.0" || snapshot.schemaVersion === "v3";
  const wantsLegacy = url.searchParams.get('legacy') === '1' || url.searchParams.get('format') === 'legacy';
  let transformed = false;

  if (isV3 && wantsLegacy) {
    snapshot = transformV3ToLegacy(snapshot);
    transformed = true;
  } else if (isV3) {
    if (!snapshot.metadata) snapshot.metadata = {};
    if (!snapshot.metadata.served_from) snapshot.metadata.served_from = sourceInfo.served_from;
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
