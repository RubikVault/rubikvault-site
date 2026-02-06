/**
 * Atomic File Operations Helper
 * 
 * Implements atomic writes per RUNBLOCK requirements:
 * - Write to temp file + rename (no partial files on crash)
 * - Lock file management
 * - Checkpoint markers
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Atomic write: write to temp file then rename
 * @param {string} filePath - Target file path
 * @param {string|Buffer} content - Content to write
 */
export function atomicWrite(filePath, content) {
    const dir = path.dirname(filePath);
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(4).toString('hex')}.tmp`);

    // Ensure directory exists
    fs.mkdirSync(dir, { recursive: true });

    // Write to temp file
    fs.writeFileSync(tempPath, content);

    // Rename (atomic on POSIX)
    fs.renameSync(tempPath, filePath);
}

/**
 * Atomic JSON write
 * @param {string} filePath - Target file path
 * @param {object} data - Data to serialize
 */
export function atomicWriteJson(filePath, data) {
    atomicWrite(filePath, JSON.stringify(data, null, 2));
}

/**
 * Create a checkpoint marker file
 * @param {string} checkpointDir - Checkpoint directory
 * @param {string} symbol - Symbol name
 * @param {object} metadata - Optional metadata
 */
export function createCheckpoint(checkpointDir, symbol, metadata = {}) {
    const markerPath = path.join(checkpointDir, `${symbol}.done`);
    atomicWriteJson(markerPath, {
        symbol,
        created_at: new Date().toISOString(),
        ...metadata
    });
}

/**
 * Check if checkpoint exists
 * @param {string} checkpointDir - Checkpoint directory
 * @param {string} symbol - Symbol name
 * @returns {boolean}
 */
export function hasCheckpoint(checkpointDir, symbol) {
    const markerPath = path.join(checkpointDir, `${symbol}.done`);
    return fs.existsSync(markerPath);
}

/**
 * Read checkpoint metadata
 * @param {string} checkpointDir - Checkpoint directory
 * @param {string} symbol - Symbol name
 * @returns {object|null}
 */
export function readCheckpoint(checkpointDir, symbol) {
    const markerPath = path.join(checkpointDir, `${symbol}.done`);
    if (!fs.existsSync(markerPath)) return null;

    try {
        return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Clear checkpoints for a phase
 * @param {string} checkpointDir - Checkpoint directory
 */
export function clearCheckpoints(checkpointDir) {
    if (!fs.existsSync(checkpointDir)) return;

    const files = fs.readdirSync(checkpointDir);
    for (const file of files) {
        if (file.endsWith('.done')) {
            fs.unlinkSync(path.join(checkpointDir, file));
        }
    }
}

/**
 * Lock file manager
 */
export class LockManager {
    constructor(lockPath) {
        this.lockPath = lockPath;
        this.acquired = false;
    }

    /**
     * Check if lock is held by another process
     * @returns {{held: boolean, stale: boolean, info: object|null}}
     */
    check() {
        if (!fs.existsSync(this.lockPath)) {
            return { held: false, stale: false, info: null };
        }

        try {
            const info = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));

            // Check if process is alive
            try {
                process.kill(info.pid, 0);
                return { held: true, stale: false, info };
            } catch {
                // Process not alive
                return { held: true, stale: true, info };
            }
        } catch {
            // Invalid lock file
            return { held: true, stale: true, info: null };
        }
    }

    /**
     * Acquire the lock
     * @param {object} metadata - Lock metadata
     * @returns {{ok: boolean, reason?: string}}
     */
    acquire(metadata = {}) {
        const status = this.check();

        if (status.held && !status.stale) {
            return { ok: false, reason: 'ALREADY_RUNNING', info: status.info };
        }

        // Remove stale lock if present
        if (status.stale) {
            try {
                fs.unlinkSync(this.lockPath);
            } catch { /* ignore */ }
        }

        // Create lock
        const lockInfo = {
            pid: process.pid,
            started_at: new Date().toISOString(),
            host: process.env.HOSTNAME || 'localhost',
            ...metadata
        };

        atomicWriteJson(this.lockPath, lockInfo);
        this.acquired = true;

        // Register cleanup
        const cleanup = () => this.release();
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(130); });
        process.on('SIGTERM', () => { cleanup(); process.exit(143); });

        return { ok: true, stale_lock: status.stale };
    }

    /**
     * Release the lock
     */
    release() {
        if (this.acquired) {
            try {
                fs.unlinkSync(this.lockPath);
            } catch { /* ignore */ }
            this.acquired = false;
        }
    }
}

export default {
    atomicWrite,
    atomicWriteJson,
    createCheckpoint,
    hasCheckpoint,
    readCheckpoint,
    clearCheckpoints,
    LockManager
};
