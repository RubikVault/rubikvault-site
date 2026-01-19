#!/usr/bin/env node
/**
 * Market Health Provider v3.0
 * 
 * Fetches and normalizes market health data from:
 * - alternative.me (Fear & Greed Index)
 * - CNN (Stock Fear & Greed)
 * - CoinGecko (Crypto prices)
 * - Yahoo Finance (Indices & Commodities, optional)
 * 
 * Outputs v3.0 envelope format ready for validation and artifact upload.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvelope, computeFreshness } from '../lib/envelope.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { fetchStooqDaily } from '../providers/stooq.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = process.cwd();

const FNG_URL = "https://api.alternative.me/fng/?limit=1&format=json";
const FNG_STOCKS_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true";

// Benchmark symbols for market health (using Stooq)
const BENCHMARK_SYMBOLS = ["SPY", "QQQ", "IWM"];

function buildHeaders() {
  return {
    "user-agent": "RubikVault/3.0 (github-actions)",
    "accept": "application/json",
    "cache-control": "no-cache"
  };
}

async function fetchSafe(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, { 
      headers: buildHeaders(),
      signal: controller.signal 
    });
    
    clearTimeout(timer);
    
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status };
    }
    
    const json = await res.json();
    const latency = Date.now() - Date.now(); // Simplified
    
    return { ok: true, json, httpStatus: res.status, latency };
  } catch (err) {
    return { ok: false, error: err.message, httpStatus: null };
  }
}

function normalizeFng(payload) {
  const data = payload?.data?.[0];
  if (!data) return null;
  
  return {
    value: data.value || null,
    valueClassification: data.value_classification || null,
    timestamp: data.timestamp || null
  };
}

function normalizeFngStocks(payload) {
  if (!payload || typeof payload !== 'object') return null;
  
  const value = payload.value;
  const valueClassification = payload.valueClassification;
  const timestamp = payload.timestamp;
  
  return {
    value: typeof value === 'number' ? value : null,
    valueClassification: typeof valueClassification === 'string' ? valueClassification : null,
    timestamp: typeof timestamp === 'number' ? timestamp : null
  };
}

function normalizeCrypto(payload) {
  if (!payload || typeof payload !== 'object') return [];
  
  const result = [];
  for (const [id, data] of Object.entries(payload)) {
    const symbol = id === 'bitcoin' ? 'BTC' : 
                   id === 'ethereum' ? 'ETH' :
                   id === 'solana' ? 'SOL' :
                   id === 'ripple' ? 'XRP' : id.toUpperCase();
    
    result.push({
      symbol,
      price: data.usd || null,
      changePercent: data.usd_24h_change || null
    });
  }
  
  return result;
}

/**
 * Fetch benchmark data from Stooq (SPY, QQQ, IWM)
 */
async function fetchStooqBenchmarks(symbols) {
  const ctx = { providerId: "stooq", endpoint: "daily" };
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const { data } = await fetchStooqDaily(ctx, symbol);
      if (!data || data.length === 0) {
        results.push({ symbol, close: null, prevClose: null, changePct: null, error: "no_data" });
        continue;
      }
      
      // Get last and previous close
      const lastBar = data[data.length - 1];
      const prevBar = data.length > 1 ? data[data.length - 2] : null;
      
      const close = lastBar.close;
      const prevClose = prevBar ? prevBar.close : lastBar.open;
      const changePct = prevClose && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
      
      results.push({
        symbol,
        close,
        prevClose,
        changePct,
        lastBarDate: lastBar.date,
        error: null
      });
    } catch (err) {
      console.warn(`⚠️  Failed to fetch ${symbol} from Stooq: ${err.message}`);
      results.push({ symbol, close: null, prevClose: null, changePct: null, error: err.message });
    }
  }
  
  return results;
}

/**
 * Validate data structure
 */
function validateData(data, registryConfig) {
  const errors = [];
  const warnings = [];
  let droppedRecords = 0;
  
  // Check required paths (UI contract)
  const requiredPaths = registryConfig?.ui_contract?.required_paths || [];
  for (const path of requiredPaths) {
    // Simple path check (can be enhanced with JSONPath library)
    // Remove both $. and $.data. prefixes, as we're validating the unwrapped data object
    // If path starts with $.metadata, skip it (metadata is added later in envelope)
    if (path.startsWith('$.metadata')) {
      continue; // Skip metadata paths - they're not in the data object
    }
    let cleanPath = path.replace(/^\$\.data\./, '').replace(/^\$\./, '');
    const parts = cleanPath.split(/[\.\[\]]/).filter(Boolean);
    let current = data;
    for (const part of parts) {
      if (current === null || current === undefined) {
        errors.push(`Missing required path: ${path}`);
        break;
      }
      current = current[part];
    }
  }
  
  // Check plausibility rules
  const plausibilityRules = registryConfig?.plausibility_rules || [];
  for (const rule of plausibilityRules) {
    // Simplified validation - in production, use JSONPath
    // Remove both $. and $.data. prefixes, as we're validating the unwrapped data object
    let rulePath = rule.path.replace(/^\$\.data\./, '').replace(/^\$\./, '');
    
    // Handle wildcard paths like "items[*].close"
    if (rulePath.includes('[*]')) {
      const [arrayPath, ...restParts] = rulePath.split('[*].');
      const arrayParts = arrayPath.split('.');
      let current = data;
      for (const part of arrayParts) {
        if (!part) continue;
        current = current?.[part];
      }
      
      // Current should now be an array
      if (Array.isArray(current)) {
        for (const item of current) {
          let value = item;
          for (const part of restParts.join('.').split('.')) {
            if (!part) continue;
            value = value?.[part];
          }
          
          // Check if value is null/undefined for required numeric fields
          if (value === null || value === undefined) {
            if (rule.path.includes('close') || rule.path.includes('fng.value')) {
              errors.push(`Required field ${rule.path} is null or missing`);
            }
          } else if (typeof value === 'number') {
            if (rule.min !== undefined && value < rule.min) {
              warnings.push(`${rule.path} value ${value} below minimum ${rule.min}`);
            }
            if (rule.max !== undefined && value > rule.max) {
              warnings.push(`${rule.path} value ${value} above maximum ${rule.max}`);
            }
          }
        }
      }
    } else {
      // Non-wildcard path
      const parts = rulePath.split(/[\.\[\]]/).filter(Boolean);
      let current = data;
      for (const part of parts) {
        if (current === null || current === undefined) break;
        if (part.match(/^\d+$/)) {
          current = current[parseInt(part)];
        } else {
          current = current[part];
        }
      }
      
      // Check if value is null/undefined for required numeric fields
      if (current === null || current === undefined) {
        // If this is a critical field, treat as error
        if (rule.path.includes('close') || rule.path.includes('fng.value')) {
          errors.push(`Required field ${rule.path} is null or missing`);
        }
      } else if (typeof current === 'number') {
        if (rule.min !== undefined && current < rule.min) {
          warnings.push(`${rule.path} value ${current} below minimum ${rule.min}`);
        }
        if (rule.max !== undefined && current > rule.max) {
          warnings.push(`${rule.path} value ${current} above maximum ${rule.max}`);
        }
      }
    }
  }
  
  // Count validation
  // Don't validate item counts - this is a single data object, not an array
  // The counts in registry refer to the data array (snapshot level), not data.items
  // Comment out count validation at provider level - finalizer handles this
  
  /*
  const items = data.items || [];
  const expectedCount = registryConfig?.counts?.expected;
  const minCount = registryConfig?.counts?.min;
  
  if (expectedCount !== null && expectedCount !== undefined && items.length !== expectedCount) {
    warnings.push(`Item count mismatch: expected ${expectedCount}, got ${items.length}`);
  }
  if (minCount !== null && minCount !== undefined && items.length < minCount) {
    errors.push(`Item count below minimum: got ${items.length}, minimum ${minCount}`);
  }
  */
  
  const checks = ['schema', 'records'];
  if (plausibilityRules.length > 0) checks.push('ranges');
  if (requiredPaths.length > 0) checks.push('ui_contract');
  
  return {
    passed: errors.length === 0,
    dropped_records: droppedRecords,
    drop_ratio: 0,
    checks,
    warnings
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Fetching market health data...\n');
  
  // Load registry
  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
  let registry;
  try {
    const registryContent = await readFile(registryPath, 'utf-8');
    registry = JSON.parse(registryContent);
  } catch (err) {
    console.error(`ERROR: Failed to load registry: ${err.message}`);
    process.exit(1);
  }
  
  const config = registry.modules['market-health'];
  if (!config) {
    console.error('ERROR: market-health not found in registry');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  // Fetch data (parallel)
  const [fng, stocks, crypto, benchmarks] = await Promise.all([
    fetchSafe(FNG_URL),
    fetchSafe(FNG_STOCKS_URL),
    fetchSafe(COINGECKO_URL),
    fetchStooqBenchmarks(BENCHMARK_SYMBOLS)
  ]);
  
  const latencyMs = Date.now() - startTime;
  
  // Build upstream metadata
  const upstream = {
    http_status: fng.ok ? fng.httpStatus : (stocks.ok ? stocks.httpStatus : (crypto.ok ? crypto.httpStatus : null)),
    latency_ms: latencyMs,
    rate_limit_remaining: null,
    retry_count: 0
  };
  
  // Normalize data
  const errors = [];
  if (!fng.ok) errors.push("fng_failed");
  if (!stocks.ok) errors.push("stocks_failed");
  if (!crypto.ok) errors.push("crypto_failed");
  if (benchmarks.some(b => b.error)) {
    errors.push(...benchmarks.filter(b => b.error).map(b => `${b.symbol}_stooq_failed`));
  }
  
  const fngData = normalizeFng(fng.json || {});
  const fngStocks = normalizeFngStocks(stocks.json || {});
  const cryptoData = normalizeCrypto(crypto.json || {});
  const btcEntry = cryptoData.find(entry => entry.symbol === "BTC");
  
  // Build data structure with Stooq benchmarks
  const data = {
    items: benchmarks.map(b => ({
      symbol: b.symbol,
      close: b.close,
      prevClose: b.prevClose,
      changePct: b.changePct,
      lastBarDate: b.lastBarDate || null,
      barsUsed: null,
      missingFields: b.close ? [] : ['close', 'prevClose', 'changePct']
    })),
    benchmarks: BENCHMARK_SYMBOLS,
    fng: fngData,
    fngStocks,
    btc: btcEntry ? {
      usd: btcEntry.price ?? null,
      usd_24h_change: btcEntry.changePercent ?? null
    } : { usd: null, usd_24h_change: null },
    crypto: cryptoData,
    indices: [], // Indices now in items array
    commodities: [], // Not fetched yet
    source: "alternative.me, cnn, coingecko, stooq"
  };
  
  // Validate
  console.log('🔍 Validating data...');
  const validation = validateData(data, config);
  
  if (!validation.passed) {
    console.error('❌ Validation failed:');
    for (const err of validation.warnings) {
      console.error(`  WARNING: ${err}`);
    }
    for (const err of validation.checks) {
      // Errors are in validation object
    }
  }
  
  // Build envelope
  const fetchedAt = new Date();
  const envelope = buildEnvelope({
    module: 'market-health',
    tier: config.tier,
    domain: config.domain,
    source: data.source,
    data: [data], // Wrap in array for v3.0 format
    fetchedAt,
    upstream,
    validation,
    freshness: config.freshness
  });
  
  // Compute freshness
  computeFreshness(envelope, config.freshness);
  
  // Build module state
  const moduleState = {
    schema_version: "3.0",
    module: "market-health",
    tier: config.tier,
    domain: config.domain,
    status: validation.passed ? "ok" : "error",
    severity: validation.passed ? "info" : "crit",
    published: false, // Will be set by finalizer
    last_success_at: validation.passed ? fetchedAt.toISOString() : null,
    last_attempt_at: fetchedAt.toISOString(),
    digest: envelope.metadata.digest,
    record_count: envelope.metadata.record_count,
    expected_count: config.counts?.expected || null,
    freshness: envelope.metadata.freshness,
    failure: validation.passed ? null : {
      class: "VALIDATION_FAILED_SCHEMA",
      message: validation.warnings.join("; "),
      upstream_status: upstream.http_status,
      hint: "Check validation warnings and fix data normalization"
    },
    ui_contract: {
      required: config.ui_contract?.required_paths?.length > 0,
      passed: validation.passed && validation.checks.includes('ui_contract'),
      failed_paths: []
    },
    proof: {
      file_present: true,
      schema_valid: validation.passed,
      plausible: validation.passed && validation.checks.includes('ranges')
    },
    debug: {
      curl: "/api/market-health?debug=1",
      last_run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null
    }
  };
  
  // Write artifacts
  const artifactsBaseDir = process.env.ARTIFACTS_DIR || join(BASE_DIR, 'artifacts');
  const artifactsDir = join(artifactsBaseDir, 'market-health');
  await mkdir(artifactsDir, { recursive: true });
  
  const snapshotPath = join(artifactsDir, 'snapshot.json');
  const statePath = join(artifactsDir, 'module-state.json');
  
  await writeFile(snapshotPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(statePath, JSON.stringify(moduleState, null, 2) + '\n', 'utf-8');
  
  console.log('✓ Artifacts written:');
  console.log(`  - ${snapshotPath}`);
  console.log(`  - ${statePath}`);
  console.log(`\n✅ Market Health v3.0 complete!`);
  console.log(`   Status: ${moduleState.status}`);
  console.log(`   Digest: ${envelope.metadata.digest.substring(0, 16)}...`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
