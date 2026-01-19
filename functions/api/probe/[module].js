/**
 * Probe Endpoint - On-Demand Delivery Verification
 * 
 * URL: /api/probe/{module}
 * 
 * Purpose:
 * - Verify that module data is accessible
 * - Test delivery chain (ASSET → KV → Maintenance)
 * - Validate UI contract fields
 * - Return proof that value is visible
 * 
 * Usage:
 * - Mission Control UI triggers probe
 * - Returns: latency, status, proof chain, UI field check
 * - Does NOT write anything (0€ compliant)
 */

import { serveStaticJson } from '../_shared/static-only.js';

/**
 * Extract critical UI fields from data
 */
function extractUIFields(data, requiredPaths) {
  if (!requiredPaths || requiredPaths.length === 0) {
    return { available: true, fields: {} };
  }
  
  const fields = {};
  let allPresent = true;
  
  for (const path of requiredPaths) {
    // Simple path evaluation ($.data[0].field)
    try {
      const parts = path.replace(/^\$\./, '').split(/[\.\[\]]+/).filter(Boolean);
      let value = data;
      
      for (const part of parts) {
        if (value === null || value === undefined) {
          value = null;
          break;
        }
        
        if (part === '*') {
          // Wildcard - just take first item
          if (Array.isArray(value)) {
            value = value[0];
          }
        } else if (!isNaN(part)) {
          // Array index
          value = value[parseInt(part, 10)];
        } else {
          // Object key
          value = value[part];
        }
      }
      
      fields[path] = value;
      
      if (value === null || value === undefined || 
          (typeof value === 'number' && isNaN(value)) ||
          (typeof value === 'string' && value.trim() === '')) {
        allPresent = false;
      }
    } catch (e) {
      fields[path] = null;
      allPresent = false;
    }
  }
  
  return {
    available: allPresent,
    fields
  };
}

/**
 * Main probe handler
 */
export async function onRequestGet(context) {
  const { request, params, env } = context;
  const module = params.module;
  const startTime = Date.now();
  
  // Load module config
  let moduleConfig = null;
  try {
    const registryUrl = new URL('/data/registry/modules.json', request.url);
    const registryResponse = await fetch(registryUrl.toString());
    if (registryResponse.ok) {
      const registry = await registryResponse.json();
      moduleConfig = registry.modules?.[module] || null;
    }
  } catch (e) {
    // Continue without config
  }
  
  // Fetch the actual API endpoint
  let apiResponse = null;
  let apiStatus = 'UNKNOWN';
  let apiData = null;
  let apiError = null;
  
  try {
    const apiUrl = new URL(`/api/${module}`, request.url);
    apiResponse = await fetch(apiUrl.toString());
    apiStatus = apiResponse.ok ? 'SUCCESS' : 'ERROR';
    
    if (apiResponse.ok) {
      const text = await apiResponse.text();
      apiData = JSON.parse(text);
    } else {
      apiError = `HTTP ${apiResponse.status}`;
    }
  } catch (e) {
    apiStatus = 'FETCH_FAILED';
    apiError = e.message;
  }
  
  const latencyMs = Date.now() - startTime;
  
  // Extract UI fields
  let uiCheck = { available: false, fields: {} };
  if (apiData && moduleConfig) {
    const requiredPaths = moduleConfig.ui_contract?.required_paths || [];
    uiCheck = extractUIFields(apiData, requiredPaths);
  }
  
  // Determine overall status
  let overallStatus = 'UNKNOWN';
  let proofStatus = 'UNKNOWN';
  
  if (apiStatus === 'SUCCESS') {
    if (apiData?.ok === true && uiCheck.available) {
      overallStatus = 'PASS';
      proofStatus = 'VALUE_VISIBLE';
    } else if (apiData?.ok === true && !uiCheck.available) {
      overallStatus = 'PARTIAL';
      proofStatus = 'DATA_PRESENT_BUT_UI_INCOMPLETE';
    } else {
      overallStatus = 'FAIL';
      proofStatus = 'DATA_INVALID';
    }
  } else {
    overallStatus = 'FAIL';
    proofStatus = 'DELIVERY_FAILED';
  }
  
  // Build probe result
  const probeResult = {
    schema_version: '3.0',
    probe: {
      module,
      timestamp: new Date().toISOString(),
      latency_ms: latencyMs
    },
    delivery: {
      status: apiStatus,
      http_status: apiResponse?.status || null,
      error: apiError
    },
    proof: {
      overall_status: overallStatus,
      proof_status: proofStatus,
      value_visible: uiCheck.available
    },
    ui_contract: {
      required_paths: moduleConfig?.ui_contract?.required_paths || [],
      fields_present: uiCheck.available,
      fields: uiCheck.fields
    },
    metadata: apiData?.meta || apiData?.metadata || null,
    served_from: apiResponse?.headers?.get('X-RV-Source') || 'UNKNOWN',
    links: {
      api: `/api/${module}`,
      debug: `/api/${module}?debug=1`,
      snapshot: `/data/snapshots/${module}/latest.json`
    }
  };
  
  // Return probe result
  return new Response(JSON.stringify(probeResult, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-RV-Probe': 'true'
    },
    status: overallStatus === 'PASS' ? 200 : 503
  });
}
