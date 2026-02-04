/**
 * Forecast System v3.0 — Ledger Writer
 * 
 * Append-only ledger management with monthly partitioning.
 * Writes NDJSON.GZ format to mirrors/forecast/ledger/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { canonicalJSON } from '../lib/digest.js';

const LEDGER_BASE = 'mirrors/forecast/ledger';

// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get ledger partition path
 * @param {string} repoRoot - Repository root
 * @param {string} ledgerType - 'forecasts' | 'outcomes' | 'promotions'
 * @param {string} date - Date for partitioning (YYYY-MM-DD)
 * @returns {string} Path to partition file
 */
export function getLedgerPath(repoRoot, ledgerType, date) {
    const [year, month] = date.split('-');
    return path.join(repoRoot, LEDGER_BASE, ledgerType, year, `${month}.ndjson.gz`);
}

/**
 * Ensure directory exists
 * @param {string} filePath - Path to file
 */
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all records from a ledger partition
 * @param {string} ledgerPath - Path to .ndjson.gz file
 * @returns {object[]} Array of records
 */
export function readLedger(ledgerPath) {
    if (!fs.existsSync(ledgerPath)) {
        return [];
    }

    const compressed = fs.readFileSync(ledgerPath);
    const content = zlib.gunzipSync(compressed).toString('utf8');

    return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
}

/**
 * Read ledger records for date range
 * @param {string} repoRoot - Repository root
 * @param {string} ledgerType - Ledger type
 * @param {string} startDate - Start date (inclusive)
 * @param {string} endDate - End date (inclusive)
 * @returns {object[]} Array of records
 */
export function readLedgerRange(repoRoot, ledgerType, startDate, endDate) {
    const records = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Iterate through months
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const partitionPath = getLedgerPath(repoRoot, ledgerType, `${year}-${month}-01`);

        const monthRecords = readLedger(partitionPath);
        for (const record of monthRecords) {
            const recordDate = record.trading_date || record.forecast_trading_date || record.as_of?.slice(0, 10);
            if (recordDate && recordDate >= startDate && recordDate <= endDate) {
                records.push(record);
            }
        }

        current.setMonth(current.getMonth() + 1);
    }

    return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write Operations (Append-Only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append records to ledger (append-only)
 * @param {string} repoRoot - Repository root
 * @param {string} ledgerType - 'forecasts' | 'outcomes' | 'promotions'
 * @param {object[]} records - Records to append
 * @param {string} partitionDate - Date for partitioning
 */
export function appendToLedger(repoRoot, ledgerType, records, partitionDate) {
    if (!records || records.length === 0) return;

    const ledgerPath = getLedgerPath(repoRoot, ledgerType, partitionDate);
    ensureDir(ledgerPath);

    // Read existing records
    const existingRecords = readLedger(ledgerPath);

    // Check for duplicates (by ID)
    const existingIds = new Set(existingRecords.map(r => r.forecast_id || r.outcome_id || r.promotion_id));
    const newRecords = records.filter(r => {
        const id = r.forecast_id || r.outcome_id || r.promotion_id;
        return !existingIds.has(id);
    });

    if (newRecords.length === 0) {
        console.log(`[Ledger] No new records to append for ${partitionDate}`);
        return;
    }

    // Append new records
    const allRecords = [...existingRecords, ...newRecords];
    const ndjson = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
    const compressed = zlib.gzipSync(Buffer.from(ndjson, 'utf8'));

    fs.writeFileSync(ledgerPath, compressed);
    console.log(`[Ledger] Appended ${newRecords.length} records to ${ledgerPath}`);
}

/**
 * Write forecast records
 * @param {string} repoRoot - Repository root
 * @param {object[]} forecasts - Forecast records
 */
export function writeForecastRecords(repoRoot, forecasts) {
    // Group by partition (trading_date month)
    const byPartition = {};
    for (const forecast of forecasts) {
        const partitionDate = forecast.trading_date;
        if (!byPartition[partitionDate]) {
            byPartition[partitionDate] = [];
        }
        byPartition[partitionDate].push(forecast);
    }

    // Write each partition
    for (const [date, records] of Object.entries(byPartition)) {
        appendToLedger(repoRoot, 'forecasts', records, date);
    }
}

/**
 * Write outcome records
 * @param {string} repoRoot - Repository root
 * @param {object[]} outcomes - Outcome records
 */
export function writeOutcomeRecords(repoRoot, outcomes) {
    // Group by partition (outcome_trading_date month)
    const byPartition = {};
    for (const outcome of outcomes) {
        const partitionDate = outcome.outcome_trading_date;
        if (!byPartition[partitionDate]) {
            byPartition[partitionDate] = [];
        }
        byPartition[partitionDate].push(outcome);
    }

    // Write each partition
    for (const [date, records] of Object.entries(byPartition)) {
        appendToLedger(repoRoot, 'outcomes', records, date);
    }
}

/**
 * Write promotion record
 * @param {string} repoRoot - Repository root
 * @param {object} promotion - Promotion record
 */
export function writePromotionRecord(repoRoot, promotion) {
    const partitionDate = promotion.as_of.slice(0, 10);
    appendToLedger(repoRoot, 'promotions', [promotion], partitionDate);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify ledger integrity (no mutations of old partitions)
 * @param {string} repoRoot - Repository root
 * @param {string} ledgerType - Ledger type
 * @param {object} knownHashes - Map of partition -> expected hash
 * @returns {{ok: boolean, errors: string[]}}
 */
export function verifyLedgerIntegrity(repoRoot, ledgerType, knownHashes = {}) {
    const errors = [];
    const baseDir = path.join(repoRoot, LEDGER_BASE, ledgerType);

    if (!fs.existsSync(baseDir)) {
        return { ok: true, errors: [] };
    }

    // Walk through all partition files
    const years = fs.readdirSync(baseDir).filter(f => /^\d{4}$/.test(f));

    for (const year of years) {
        const yearDir = path.join(baseDir, year);
        const months = fs.readdirSync(yearDir).filter(f => f.endsWith('.ndjson.gz'));

        for (const monthFile of months) {
            const partitionPath = path.join(yearDir, monthFile);
            const partitionKey = `${year}/${monthFile}`;

            if (knownHashes[partitionKey]) {
                // Verify hash hasn't changed
                const content = fs.readFileSync(partitionPath);
                const hash = require('crypto').createHash('sha256').update(content).digest('hex');

                if (hash !== knownHashes[partitionKey]) {
                    errors.push(`Partition ${partitionKey} was mutated! Expected ${knownHashes[partitionKey]}, got ${hash}`);
                }
            }
        }
    }

    return {
        ok: errors.length === 0,
        errors
    };
}

export default {
    getLedgerPath,
    readLedger,
    readLedgerRange,
    appendToLedger,
    writeForecastRecords,
    writeOutcomeRecords,
    writePromotionRecord,
    verifyLedgerIntegrity
};
