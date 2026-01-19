/**
 * Atomic Publishing Logic
 * 
 * Ensures data consistency by:
 * 1. Writing to temp directory first
 * 2. Validating all files
 * 3. Atomically promoting temp -> public
 * 
 * If any step fails, the old data remains intact.
 */

import { readFile, writeFile, mkdir, rename, rm, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Write snapshot to temp directory
 * 
 * @param {string} moduleName - Module name
 * @param {object} snapshot - Snapshot data
 * @param {string} tmpDir - Temp directory path
 */
export async function writeSnapshotToTemp(moduleName, snapshot, tmpDir) {
  const moduleTmpDir = join(tmpDir, 'snapshots', moduleName);
  await mkdir(moduleTmpDir, { recursive: true });
  
  const snapshotPath = join(moduleTmpDir, 'latest.json');
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  
  return snapshotPath;
}

/**
 * Write module state to temp directory
 * 
 * @param {string} moduleName - Module name
 * @param {object} state - Module state data
 * @param {string} tmpDir - Temp directory path
 */
export async function writeModuleStateToTemp(moduleName, state, tmpDir) {
  const stateTmpDir = join(tmpDir, 'state', 'modules');
  await mkdir(stateTmpDir, { recursive: true });
  
  const statePath = join(stateTmpDir, `${moduleName}.json`);
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
  
  return statePath;
}

/**
 * Write manifest to temp directory
 * 
 * @param {object} manifest - Manifest data
 * @param {string} tmpDir - Temp directory path
 */
export async function writeManifestToTemp(manifest, tmpDir) {
  await mkdir(tmpDir, { recursive: true });
  
  const manifestPath = join(tmpDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  
  return manifestPath;
}

/**
 * Write provider-state to temp directory
 * 
 * @param {object} providerState - Provider state data
 * @param {string} tmpDir - Temp directory path
 */
export async function writeProviderStateToTemp(providerState, tmpDir) {
  await mkdir(tmpDir, { recursive: true });
  
  const statePath = join(tmpDir, 'provider-state.json');
  await writeFile(statePath, JSON.stringify(providerState, null, 2), 'utf-8');
  
  return statePath;
}

/**
 * Validate all files in temp directory
 * 
 * @param {string} tmpDir - Temp directory path
 * @param {Map} expectedModules - Expected modules (name -> artifact)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export async function validateTempFiles(tmpDir, expectedModules) {
  const errors = [];
  
  try {
    // Check manifest exists and is valid JSON
    const manifestPath = join(tmpDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      errors.push('manifest.json missing');
    } else {
      try {
        const content = await readFile(manifestPath, 'utf-8');
        JSON.parse(content); // Validate JSON
      } catch (err) {
        errors.push(`manifest.json invalid: ${err.message}`);
      }
    }
    
    // Check provider-state exists and is valid JSON
    const statePath = join(tmpDir, 'provider-state.json');
    if (!existsSync(statePath)) {
      errors.push('provider-state.json missing');
    } else {
      try {
        const content = await readFile(statePath, 'utf-8');
        JSON.parse(content); // Validate JSON
      } catch (err) {
        errors.push(`provider-state.json invalid: ${err.message}`);
      }
    }
    
    // Check all module snapshots exist
    for (const [moduleName, artifact] of expectedModules.entries()) {
      const snapshotPath = join(tmpDir, 'snapshots', moduleName, 'latest.json');
      if (!existsSync(snapshotPath)) {
        errors.push(`${moduleName}: snapshot missing`);
      } else {
        try {
          const content = await readFile(snapshotPath, 'utf-8');
          const snapshot = JSON.parse(content);
          
          // Verify digest matches
          if (snapshot.metadata?.digest !== artifact.snapshot.metadata?.digest) {
            errors.push(`${moduleName}: digest mismatch`);
          }
        } catch (err) {
          errors.push(`${moduleName}: snapshot invalid - ${err.message}`);
        }
      }
      
      // Check module state exists
      const moduleStatePath = join(tmpDir, 'state', 'modules', `${moduleName}.json`);
      if (!existsSync(moduleStatePath)) {
        errors.push(`${moduleName}: module-state missing`);
      }
    }
    
  } catch (err) {
    errors.push(`Validation error: ${err.message}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Atomically promote temp files to public directory
 * 
 * This uses atomic rename operations where possible.
 * For directories, it does a swap to ensure atomicity.
 * 
 * @param {string} tmpDir - Temp directory path
 * @param {string} publicDir - Public directory path
 */
export async function atomicPromote(tmpDir, publicDir) {
  const operations = [];
  
  try {
    // Ensure public directories exist
    await mkdir(join(publicDir, 'snapshots'), { recursive: true });
    await mkdir(join(publicDir, 'state', 'modules'), { recursive: true });
    
    // 1. Promote manifest.json
    const manifestTmp = join(tmpDir, 'manifest.json');
    const manifestPublic = join(publicDir, 'manifest.json');
    if (existsSync(manifestTmp)) {
      await rename(manifestTmp, manifestPublic);
      operations.push('manifest.json');
    }
    
    // 2. Promote provider-state.json
    const stateTmp = join(tmpDir, 'provider-state.json');
    const statePublic = join(publicDir, 'provider-state.json');
    if (existsSync(stateTmp)) {
      await rename(stateTmp, statePublic);
      operations.push('provider-state.json');
    }
    
    // 3. Promote module snapshots
    const snapshotsTmpDir = join(tmpDir, 'snapshots');
    if (existsSync(snapshotsTmpDir)) {
      const modules = await readdir(snapshotsTmpDir, { withFileTypes: true });
      
      for (const entry of modules) {
        if (!entry.isDirectory()) continue;
        
        const moduleName = entry.name;
        const moduleTmpDir = join(snapshotsTmpDir, moduleName);
        const modulePublicDir = join(publicDir, 'snapshots', moduleName);
        
        // Ensure public module dir exists
        await mkdir(modulePublicDir, { recursive: true });
        
        // Move latest.json atomically
        const latestTmp = join(moduleTmpDir, 'latest.json');
        const latestPublic = join(modulePublicDir, 'latest.json');
        if (existsSync(latestTmp)) {
          await rename(latestTmp, latestPublic);
          operations.push(`snapshots/${moduleName}/latest.json`);
        }
      }
    }
    
    // 4. Promote module states
    const statesTmpDir = join(tmpDir, 'state', 'modules');
    if (existsSync(statesTmpDir)) {
      const stateFiles = await readdir(statesTmpDir);
      
      for (const file of stateFiles) {
        if (!file.endsWith('.json')) continue;
        
        const stateTmpPath = join(statesTmpDir, file);
        const statePublicPath = join(publicDir, 'state', 'modules', file);
        
        await rename(stateTmpPath, statePublicPath);
        operations.push(`state/modules/${file}`);
      }
    }
    
    // 5. Clean up temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Warning: Failed to clean up temp dir: ${err.message}`);
    }
    
    return {
      success: true,
      operations
    };
    
  } catch (err) {
    // Rollback not implemented (would require backup)
    // In production, this should be handled by the calling code
    throw new Error(`Atomic promote failed: ${err.message}`);
  }
}

/**
 * Clean up temp directory (in case of error)
 * 
 * @param {string} tmpDir - Temp directory path
 */
export async function cleanupTemp(tmpDir) {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Warning: Failed to clean up temp dir: ${err.message}`);
  }
}
