# Repository Audit Final Answer

## 1. Verified Facts

*   **Repository Visibility**: Public.
    *   *Source*: Verified via `git remote -v` and external check.
*   **Deployment Target**: Cloudflare Pages.
    *   *Evidence*: `wrangler.toml` (lines 1-6) defines `pages_build_output_dir = "public"`.
*   **Current Universe**: 101 Tickers (NASDAQ-100).
    *   *Evidence*: `public/data/universe/nasdaq100.json` (lines 1-402, 101 entries).
*   **Data Write Pattern**:
    *   `eod-latest.yml` (lines 87-92) executes `git add public/data/eod` and `git commit`.
    *   `scripts/eod/build-eod-latest.mjs` (lines 1-520) writes 14-day history batch files to local filesystem.
*   **Existing Schedules**:
    *   `eod-latest.yml`: Daily Mon-Fri at 22:10 UTC (line 5).
    *   `ops-daily.yml`: Daily at 07:05 UTC (line 5).
*   **Provider Usage**:
    *   **Tiingo** is the primary EOD provider.
    *   *Evidence*: `eod-latest.yml` (lines 61-64) exports `TIINGO_API_KEY`.
*   **Repository Size**:
    *   `.git` folder: **36MB**.
    *   `public/data` folder: **1.8MB**.
    *   *Measurement*: timestamped 2026-02-02.

## 2. Assumptions & Estimates

*   **Assumption (Projected Volume)**:
    *   Per ticker data (compressed JSON batch): ~2KB.
    *   Universe: 5,000 tickers.
    *   Daily data generation: 5,000 * 2KB = **10MB/day**.
*   **Estimate (Repo Growth)**:
    *   Monthly growth (22 trading days): 22 * 10MB = **220MB/month**.
    *   Time to soft-limit (1GB): ~4.5 months.
    *   Time to hard-limit (5GB): ~22 months (assuming no history rewriting/GC).
*   **Estimates (Execution Time)**:
    *   Single ticker EOD fetch: ~0.5s network time.
    *   5,000 tickers serial fetch: ~42 minutes.
    *   With overhead and retries: **~60 minutes/run**.
*   **Assumption (Provider Limit)**:
    *   Tiingo Free Tier hard limit is 500 unique symbols/month.
    *   5,000 tickers is **10x the free limit**.

## 3. Risks

*   **CRITICAL (Storage)**: Committing daily EOD files for 5,000 tickers to Git will degrade repository performance within weeks and hit GitHub size limits within months, eventually causing push/pull failures.
*   **CRITICAL (Quota)**: The current free Tiingo plan cannot support the requested volume. API requests will fail with 403 Forbidden after the first 500 tickers.
*   **HIGH (Deployment)**: Cloudflare Pages has a limit of 20,000 files per deployment. If we switch to individual JSON files per ticker (5,000 tickers * 3 files = 15,000 files), we are dangerously close to the limit.
*   **MEDIUM (Compute)**: 60 minutes runtime approaches the GitHub Actions free tier job timeout (often 6h, but practically problematic for free runners with interruptions). Runs consume ~1300 minutes/month, taking >60% of the 2,000 monthly free minutes.

## 4. Recommended Plan to Scale to 5,000 Tickers

1.  **Architecture Change (Storage)**:
    *   **Action**: Stop writing data to the Git repository.
    *   **Target**: Write EOD and Market Phase data directly to **Cloudflare KV** or **R2**.
    *   **Reason**: Decouples data volume from code history; unlimited scalability for data size relative to repo limits.

2.  **Architecture Change (Compute)**:
    *   **Action**: Shard the fetch job using GitHub Actions Matrix.
    *   **Target**: 5 parallel jobs processing 1,000 tickers each.
    *   **Reason**: Reduces wall-clock time from ~60m to ~12m; isolates failures to specific shards.

3.  **External Change (Provider)**:
    *   **Action**: Upgrade data provider plan.
    *   **Target**: Tiingo Starter (~$10/mo) or EODHD (~€20/mo).
    *   **Reason**: Unavoidable hard limit on free tier.

4.  **Operational Change (Frequency)**:
    *   **Action**: Split run tiers.
    *   **Target**: "Core 100" run daily; "Full 5000" run weekly (if cost/time is a concern).

## 5. Concrete Next Commits

### Step A: Disable Git Commits for Data (Immediate Safety)
*   **File**: `.github/workflows/eod-latest.yml`
*   **Edit**: Remove the "Commit + push" step (lines 82-103).
*   **Edit**: Add a step to upload artifacts (temporary) or write to KV.

### Step B: Implement KV Writer
*   **File**: `scripts/eod/build-eod-latest.mjs`
*   **Edit**: Replace `fs.writeFile` calls with a `writeToKv(key, value)` helper.
*   **Edit**: Add logic to read `CLOUDFLARE_API_TOKEN` and `KV_NAMESPACE_ID` from env.

### Step C: Shard Universe & Workflow
*   **File**: `public/data/universe/nasdaq100.json` (New file: `universe-full.json`)
*   **Edit**: Create the full 5,000 ticker list.
*   **File**: `.github/workflows/eod-latest.yml`
*   **Edit**: Update `strategy`:
    ```yaml
    strategy:
      matrix:
        shard: [1, 2, 3, 4, 5]
    ```
*   **Edit**: Pass `--shard ${{ matrix.shard }}/5` to the script execution command.

### Step D: Cleanup
*   **Command**: `git filter-repo --path public/data/eod --invert-paths` (Run locally one-time).
*   **Reason**: Remove historical bloat from the `.git` directory to reclaim space.
