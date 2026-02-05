import fs from 'fs';
import path from 'path';

// Simplified Rollback Script
// Usage: node rollback.mjs --commit <SHA> (Not fully implemented without git powers in script)
// This script essentially resets the "latest.json" and "current.json" to a safe state if specified,
// or just logs the request.

console.log("⏪ Rollback Initiated");
console.log("This is a placeholder for the automated rollback logic.");
console.log("Manual Step: `git checkout <SHA> -- public/data/forecast`");
process.exit(0);
