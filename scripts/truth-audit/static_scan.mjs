import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, AUDIT_DIR, ensureAuditDirs } from './config.mjs';

const EXCLUDE_DIRS = ['node_modules', '.git', 'artifacts', 'dist', '.wrangler', '_local_trash', 'tmp', '.tmp', 'test-results'];
const EXTENSIONS = ['.js', '.mjs', '.ts', '.html', '.md', '.json'];
const TOKENS = [
  'latest_bar',
  'data.latest_bar',
  'truthChains',
  'data.truthChains',
  'network.winning',
  'winning_response',
  '/api/stock',
  '/api/mission-control/summary',
  '/debug/ui-path/',
  '/analyze/',
  '/ops/'
];

function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function scanFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const results = [];

        lines.forEach((line, index) => {
            TOKENS.forEach(token => {
                if (line.includes(token)) {
                    results.push({
                      token,
                      file: path.relative(ROOT, filePath),
                      line: index + 1,
                      col: line.indexOf(token),
                      lineText: line.trim(),
                      lineHash: sha256(line.trim())
                    });
                }
            });
        });
        return results;
    } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        return [];
    }
}

function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (EXCLUDE_DIRS.includes(file)) return;

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkDir(fullPath, callback);
        } else {
            if (EXTENSIONS.includes(path.extname(fullPath))) {
                callback(fullPath);
            }
        }
    });
}

function main() {
    const allRefs = [];
    ensureAuditDirs();
    walkDir(ROOT, (filePath) => {
      const refs = scanFile(filePath);
      allRefs.push(...refs);
    });

    const outFile = path.join(AUDIT_DIR, 'STATIC_REFERENCES.json');
    fs.writeFileSync(outFile, JSON.stringify(allRefs, null, 2));
    console.log(`Wrote ${allRefs.length} references to ${path.relative(ROOT, outFile)}`);
}

main();
