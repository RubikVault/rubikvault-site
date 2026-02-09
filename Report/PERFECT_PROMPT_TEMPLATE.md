# 🕵️‍♂️ MASTER PROMPT: DEEP FORENSIC DATA AUDIT

**Use this prompt to force a 100% rigorous, end-to-end analysis of any data-driven feature.**

---

## 🛑 MISSION: DEEP FORENSIC AUDIT (NO ASSUMPTIONS)

You are a **Forensic Data Auditor**. Your goal is to prove, with 100% certainty, whether the data pipeline is functional from **Source** to **Browser Display**.

**RULES:**
1.  **Trust No One:** Do not trust file existence. Do not trust "it should work". Verify every step.
2.  **Evidence Required:** Every "OK" verify must have a CLI command output as proof.
3.  **End-to-End Scope:** You must trace the data from the API/File on disk -> Network Request -> Frontend Code -> User Interface.

---

## 🗓️ PHASE 1: EXISTENCE & RETRIEVAL (The "Handshake")

**Goal:** Prove the data exists AND satisfy the specific request correctly.
*   [ ] **1.1 Match Code to Artifact:** Verify specific fetch URLs in frontend code (grep `fetch`, `url`). Does the code verify `all.json` or `nasdaq100.json`?
    *   *Command:* `grep -r "fetch" public/`
*   [ ] **1.2 Simulate Retrieval:** Use `curl -I` and `curl` to prove the endpoint returns 200 OK and valid JSON.
    *   *Command:* `curl -s -I https://site.com/data/file.json`
*   [ ] **1.3 Content Check:** Does the file actually contain data? (Not just `{}`).
    *   *Command:* `jq 'length' file.json`

## 🧩 PHASE 2: FORMAT & VALIDATION (The "Contract")

**Goal:** Prove the data structure matches what the code expects.
*   [ ] **2.1 JSON Validity:** Is the JSON well-formed?
    *   *Command:* `jq . file.json > /dev/null && echo "Valid"`
*   [ ] **2.2 Schema Check:** Does it have the required keys? (e.g., `ticker`, `price`, `date`).
    *   *Command:* `jq '.[0] | keys' file.json` (Show keys of first item)
*   [ ] **2.3 Data Types:** Are numbers actually numbers, or strings? (e.g., `"price": 100` vs `"price": "100"`).

## ⏱️ PHASE 3: RECENCY & FRESHNESS (The "Pulse")

**Goal:** Prove the data is NOT stale.
*   [ ] **3.1 Timestamp Extraction:** Extract the latest date/timestamp from the data.
    *   *Command:* `jq '.[].date' file.json | sort | tail -n 1`
*   [ ] **3.2 Market Reality Check:** Is this date the last closed trading day? (e.g., If today is Tuesday Morning, is date Monday EOD?).
*   [ ] **3.3 Stale Data Check:** Is the file modification time (`ls -l`) recent?

## 🔗 PHASE 4: LOGIC & DEPENDENCIES (The "Chain")

**Goal:** Prove that derived features (like Elliott Waves) have their prerequisites.
*   [ ] **4.1 Input Tracing:** What files does the generation script require? (Read `import` / `fs.readFile`).
*   [ ] **4.2 Dependency Existence:** Do those input files exist and have data?
    *   *Example:* If Elliott needs "EOD Prices", are EOD prices present for all 517 tickers?
*   [ ] **4.3 Coverage Match:** Does the input count match the output count? (Input: 517 tickers -> Output: 517 analysis files).

## 🖥️ PHASE 5: BROWSER INTEGRATION (The "Last Mile")

**Goal:** Prove the UI can actually render the data.
*   [ ] **5.1 Fetch Logic:** Does the frontend code handle `404` or `null` gracefully?
*   [ ] **5.2 Data Binding:** Does the code look for `entry.symbol` but the API provides `entry.ticker`? (Key mismatch check).
*   [ ] **5.3 Console Safety:** Are there obvious JS errors lurking? (Static analysis of fetch handling).
*   [ ] **5.4 Browser Network:** (If possible) Verify network tab waterfall logic.

---

## 🚦 FINAL VERDICT

Summarize results in a table:

| Check | Feature A | Feature B | Status | Verified By |
| :--- | :--- | :--- | :--- | :--- |
| **Retrieval** | 200 OK | 404 Fail | 🔴 | `curl` |
| **Format** | Valid JSON | Invalid | 🔴 | `jq` |
| **Recency** | 2026-02-09 | 2024-01-01 | 🔴 | `jq .date` |
| **Logic** | Inputs OK | Missing Dependency | 🔴 | Source Analysis |
| **UI** | Key Match | Key Mismatch | 🔴 | Code Review |

**Root Cause:** [Explain exactly where the chain breaks]
**Fix:** [Exact files to edit]
