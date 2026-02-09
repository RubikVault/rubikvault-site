# UNIVERSE COVERAGE ANALYSIS (2026-02-09)

## 📊 Feature Status Summary

| Feature | Universe Count | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Stock Analyzer** | **517** | ✅ **OK** | Full universe. Includes KO, BRK.B. |
| **Scientific Analyzer** | **517** | ✅ **OK** | Full universe. Includes KO, BRK.B. |
| **Forecast System** | **517** | ⚠️ **STALE** | Showing backup data (`stale` status). Includes KO, BRK.B. |
| **Elliott Waves** | **0** | 🔴 **FAIL** | Feature is empty. Missing `marketphase/` artifacts. |

---

## 🔍 Detailed Findings

### 1. Stock Analyzer & Elliott Waves (FIXED)
-   **Previous State**: Used `nasdaq100.json` (100 stocks).
-   **Current State**: Updated to use `all.json` (517 stocks).
-   **Correction**: My initial analysis (2026-02-09) incorrectly stated these were "OK" based on backend data artifacts. The **Frontend/API code** was historically hardcoded to `nasdaq100.json`.
-   **Status**: ✅ **FIXED** (Code updated to user `all.json`).

### 2. Forecast System (STALE)
-   **Source**: `public/data/forecast/latest.json` (Data) + `status.json` (State).
-   **Count**: 517 stocks.
-   **State**: The system status is `stale`, falling back to `last_good` data because the last daily run failed (Circuit Open due to missing price data).
-   **Policy Update**: `policies/forecast.v3.json` now correctly points to `all.json`.
-   **Verdict**: Valid but outdated.

### 3. Scientific Analyzer (OK)
-   **Source**: `public/data/snapshots/stock-analysis.json`.
-   **Count**: 517 stocks.
-   **Verdict**: Always used `all.json`, so it was correct.

### 4. Elliott Waves Data (BROKEN)
-   **Source**: `public/data/marketphase/index.json`.
-   **Count**: 0 (File missing).
-   **Verdict**: Still needs data generation (see Step 2 of Fix Proposal).

---

## 🛠️ PROVEN FIX PROPOSAL (Do Not Implement Yet)

To restore 100% coverage across all features, the data pipeline must be re-run in the correct order now that the base universe files are restored.

### Step 1: Fix EOD Data (The Root Blocker)
The EOD generation failed because `nasdaq100.json` was missing. It is now present.
-   **Action**: Run `npm run rv:eod:nasdaq100`.
-   **Verification**: Check if `public/data/eod` contains new files.

### Step 2: Regenerate Elliott Waves (Dependant)
Once EOD data exists:
-   **Action**: Run `node scripts/marketphase-generate.mjs`.
-   **Verification**: Check if `public/data/marketphase/index.json` exists and has ~100+ entries.

### Step 3: Update Forecast (Fix Stale State)
Once EOD data exists:
-   **Action**: Run `node scripts/forecast/run_daily.mjs`.
-   **Verification**: Check `status.json` for `status: ok` (instead of `stale` or `circuit_open`).

### Step 4: Consistency Check
-   **Action**: Run `jq` counts on all 3 artifacts to ensure they match (517).
