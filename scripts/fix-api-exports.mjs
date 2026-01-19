#!/usr/bin/env node
/**
 * Bulk-fix API endpoints: Workers format → Pages Functions format
 * 
 * Changes:
 * FROM: export default { fetch: serveStaticJson };
 * TO:   export async function onRequestGet(context) { return serveStaticJson(context.request, ...); }
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API_DIR = 'functions/api';
const DRY_RUN = process.env.DRY_RUN === '1';

// Files to skip (not API endpoints or special cases)
const SKIP_FILES = new Set([
  '_middleware.js',
  '_shared.js',
  '_env.js',
  '_circuit.js',
  '_debug-trace.js',
  '_diag.js'
]);

async function fixFile(filePath, fileName) {
  const content = await readFile(filePath, 'utf-8');
  
  // Check if it needs fixing
  if (!content.includes('export default { fetch:')) {
    return { status: 'skip', reason: 'already_fixed' };
  }
  
  // Pattern 1: export default { fetch: serveStaticJson };
  if (content.match(/export\s+default\s+{\s*fetch:\s*serveStaticJson\s*};?/)) {
    const fixed = content.replace(
      /import\s+{\s*serveStaticJson\s*}\s+from\s+["']\.\/(_shared\/static-only\.js|_shared\.js)["'];?\s*\n\s*export\s+default\s+{\s*fetch:\s*serveStaticJson\s*};?/,
      `import { serveStaticJson } from "./_shared/static-only.js";\n\nexport async function onRequestGet(context) {\n  return serveStaticJson(context.request, "${fileName.replace('.js', '')}", null, context);\n}`
    );
    
    if (fixed !== content) {
      if (!DRY_RUN) {
        await writeFile(filePath, fixed, 'utf-8');
      }
      return { status: 'fixed', type: 'serveStaticJson' };
    }
  }
  
  // Pattern 2: Other export default { fetch: ... }
  if (content.match(/export\s+default\s+{\s*fetch:\s*\w+\s*};?/)) {
    return { status: 'skip', reason: 'custom_handler_needs_manual_fix' };
  }
  
  return { status: 'skip', reason: 'no_pattern_match' };
}

async function main() {
  console.log('🔧 Fixing API endpoint exports...\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}\n`);
  
  const files = await readdir(API_DIR);
  const jsFiles = files.filter(f => f.endsWith('.js') && !SKIP_FILES.has(f));
  
  const results = {
    fixed: [],
    skipped: [],
    errors: []
  };
  
  for (const file of jsFiles) {
    const filePath = join(API_DIR, file);
    try {
      const result = await fixFile(filePath, file);
      
      if (result.status === 'fixed') {
        results.fixed.push(file);
        console.log(`✅ ${file} - Fixed (${result.type})`);
      } else {
        results.skipped.push({ file, reason: result.reason });
        console.log(`⏭️  ${file} - ${result.reason}`);
      }
    } catch (err) {
      results.errors.push({ file, error: err.message });
      console.error(`❌ ${file} - ERROR: ${err.message}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Fixed:   ${results.fixed.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Errors:  ${results.errors.length}`);
  console.log(`\nTotal files processed: ${jsFiles.length}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - No files were modified');
    console.log('   Run without DRY_RUN=1 to apply changes');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
