# Lessons Learned

> **Pflichtlektüre für jede KI und jeden Entwickler, der in diesem Repo arbeitet.**
>
> Alle Erkenntnisse aus echten Fehlern, Bugs und Infrastruktur-Vorfällen werden hier gebündelt.
> Egal welche KI oder welcher Mensch etwas gebaut hat — die Lektion gehört hierher.
> Ziel: Kein Fehler wird zweimal gemacht.

---

## Wie dieser Abschnitt gepflegt wird

- **Wer:** Jede KI (Claude, GPT, etc.) und jeder Entwickler, der einen Bug findet, einen Incident löst oder eine nicht-offensichtliche Design-Entscheidung trifft.
- **Wann:** Sofort nach dem Fix, nicht retrospektiv.
- **Format:** Datum · Kategorie · Was schief lief · Warum · Fix · Wie es in Zukunft verhindert wird.
- **Verweise:** Dieses Dokument wird in `AI_CONTEXT.md`, `AI_README.md`, `docs/ops/decisions.md`, `PIPELINE.md` und allen Supervisor-/Ops-Skripten referenziert.

---

## Lessons

---

### 2026-04-29 · NAS · Breakout V12 daily must be incremental, never full-history

**What:** The initial Breakout V12 NAS step could run the full V1.2 feature pipeline when enabled. That path scans broad materialized history parquet, filters a large asset set, computes rolling features, and materializes the result, which is unsafe for the DS720+ nightly profile.

**Why:** Daily signal freshness was wired to a research/backfill-style compute path instead of a bounded daily path. Batching alone would not fix the semantic risk because local rolling features and cross-sectional ranks have different chunking rules.

**Fix:** The NAS supervisor now calls a safe Breakout wrapper. Default nightly behavior attempts only the incremental Breakout V12 path and degrades with `latest_unchanged=true` on missing state, missing delta, dependency failure, memory guard, or validation failure. Legacy full compute is manual-only via `RV_BREAKOUT_V12_LEGACY_FULL_COMPUTE=1`.

**Prevention:** Daily Breakout V12 must read exact `daily_delta/date=T/bucket=N.parquet` plus exact `state/tail-bars/bucket=N.parquet` files. Full-history scans, global history filters, bucket-glob filters inside the local pass, and direct latest writes are forbidden in the NAS nightly path.

---

### 2026-04-24 · Deploy · NAS Wrangler credentials need both a token secret and the real account ID

**What:** The NAS deploy lane had `CLOUDFLARE_API_TOKEN` set, but `wrangler pages deploy` still failed because `CLOUDFLARE_ACCOUNT_ID` was also set to a `cfut_...` token value. Wrangler then routed Pages calls to `/accounts/cfut_...`, which Cloudflare rejected as an invalid object identifier.

**Why:** Cloudflare shows several token-related identifiers in the UI. A token secret can verify successfully while the separately configured account ID is still wrong. Token IDs, token names, copied UI metadata, and account IDs are different values.

**Fix:** Treat deploy credentials as invalid until both parts validate from the same NAS environment that runs the supervisor: `CLOUDFLARE_API_TOKEN` must verify, and `CLOUDFLARE_ACCOUNT_ID` must be the 32-character account ID for the Pages project. Secrets must not be committed or printed in logs.

**Prevention:** After changing Cloudflare credentials, run a non-printing validation before the release lane: source `scripts/nas/nas-env.sh`, confirm only presence/length/prefix, verify the token, and verify the Pages project under the configured account ID. Do not proceed if the account ID looks like a `cfut_...` token value.

---

### 2026-04-24 · NAS · Synology scheduling is DSM Task Scheduler, not user crontab

**What:** Installing the nightly NAS pipeline through `crontab` failed because the Synology user shell had no `crontab` binary. The NAS schedules DSM tasks through `/usr/syno/bin/synoschedtask` and `/usr/syno/etc/synoschedule.d/root/*.task`, which then sync into `/etc/crontab`.

**Why:** Synology DSM does not behave like a generic Linux host for user cron management. A repo-level automation wrapper can be correct but still never run unless DSM Task Scheduler owns the durable trigger.

**Fix:** Added `scripts/nas/run-nightly-full-pipeline.sh` as the stable entrypoint and installed DSM task `30` to run it at `03:10` local time with a Tuesday-Saturday guard, after the expected EODHD daily budget reset.

**Prevention:** For NAS production scheduling, verify both the task file and `/etc/crontab` after `synoschedtask --sync`. Do not assume `crontab -l` is available or authoritative on DSM.

---

### 2026-04-24 · Deploy · Cloudflare Pages rejects files > 25 MiB — excludes are only mitigation

**What:** `wrangler pages deploy` failed with `"Pages only supports files up to 25 MiB in size"`. Two files exceeded the limit: `data/ops/stock-analyzer-operability-latest.json` (57 MB) and `data/eod/history/pack-manifest.global.json` (40 MB). Both had grown past the limit as the universe expanded.

**Why:** The global pack manifest was not in the rsync exclude list in `build-deploy-bundle.mjs`. The stock-analyzer operability report writes the full per-asset audit (85k rows). Neither file is served by the Pages runtime — the runtime uses only `pack-manifest.us-eu.json`.

**Fix:** The initial mitigation added both files to `RSYNC_EXCLUDES`. The current structural fix is documented in `docs/ops/deploy-bundle-policy.md`: global manifests and deep summaries are redirected to `NAS_OPS_ROOT/pipeline-artifacts/`, the operability step publishes only a small summary, and the deploy bundle has a hard 25 MiB per-file guard.

**Prevention:** Do not rely on excludes as the primary design. New large outputs must define whether they are public runtime data or internal pipeline artifacts before they are written, then use env-var redirects plus bundle excludes and the size guard as enforcement.

---

### 2026-04-24 · Pipeline · Mac launchd supervisors consumed the full 100k EODHD daily budget before the NAS pipeline could run

**What:** Multiple Mac launchd agents (`com.rubikvault.stock-analyzer.overnight-autopilot`, `com.rubikvault.pipeline.master`, `com.rubikvault.quantlab.self-heal`, `com.rubikvault.quantlab.catchup.supervisor`) were running simultaneously. They triggered `refresh_v7_history_from_eodhd.py` with `--concurrency 12` and scope `--from-date 2026-04-09 --to-date 2026-04-23` on all 84k assets. The entire 100k daily EODHD quota was exhausted before the NAS supervisor's `market_data_refresh` step could run.

**Why — compounding causes:**
1. Mac launchd kept the old pipeline alive via `KeepAlive: true` plists.
2. `refresh_v7_history_from_eodhd.py` with `--concurrency 12` made calls at >100 calls/minute.
3. No global EODHD call budget guard: multiple processes competed for the same quota without coordination.
4. The Mac pipeline restarted itself 5 times after API limit was hit (each restart consumed additional budget from the `extraLimit`).

**Fix:** Unloaded all Mac launchd agents that touch EODHD. NAS is now the sole pipeline owner. Only one process may call EODHD at a time (the NAS supervisor's `market_data_refresh` step).

**Prevention:**
- `launchctl unload` any agent touching EODHD before doing a targeted NAS refresh.
- Run `launchctl list | grep rubikvault` to audit which agents are loaded.
- The `rv-nas-night-supervisor.sh` is the ONLY authorized EODHD consumer going forward.
- Never run `--concurrency > 4` on a full-universe fetch when the daily budget is the constraint.

---

### 2026-04-24 · Data Provider · refresh_v7_history_from_eodhd.py must flush incrementally

**What:** The refresh script originally used a batch-write pattern: it accumulated all API results in memory via `pack_updates` dict, then wrote all packs to disk only after every asset had been fetched. When killed mid-run (by API limit → 402, by `kill`, or by timeout), fetched data could be lost even though EODHD calls had already been spent.

**Why:** This is an intentional design for pack integrity (atomic pack updates). But it means 8,000 assets' worth of EODHD calls (= 8,000 API quota units burned) produced nothing on disk when the Mac run was killed.

**Fix:** `refresh_v7_history_from_eodhd.py` now supports `--flush-every` and writes successful pack updates periodically, writes progress/report JSON, handles stop signals, and can create missing pack files from fetched rows instead of dropping them as `pack_missing`.

**Prevention:**
- Always use `--max-retries 0` when budget is constrained and 402 errors are expected.
- Keep `--flush-every` small enough for long full-history runs (100-250 assets on the NAS).
- Never kill a refresh run with `kill -9` mid-flight; use SIGTERM so the script can flush and write state.
- The NAS supervisor runs with `--max-retries 1` by default; tune to `0` on budget-sensitive days.

---

### 2026-04-24 · Data Provider · Global EODHD locking must use one lock primitive

**What:** The NAS supervisor uses shell `flock` for provider-sensitive steps, while the Python history refresh used a JSON create/unlink lock at the same path. Those are not equivalent: a shell `flock` can acquire a file that already exists, while a JSON lock can unlink the file and break coordination with processes holding the old inode.

**Why:** A lock path is not a lock protocol. Mixing `flock` and ad hoc `O_EXCL` file creation lets separate runners believe they both own the same provider budget.

**Fix:** `refresh_v7_history_from_eodhd.py` now acquires the global EODHD lock with advisory `flock` and keeps the file descriptor open for the full run. The per-job lock remains a separate JSON lock under the state root.

**Prevention:** Every EODHD consumer on the NAS must use the same `$NAS_LOCK_ROOT/eodhd.lock` `flock` protocol. If a new script needs provider access, wrap it in the same lock instead of inventing another lock file format.

---

### 2026-04-24 · Universe · Missing history packs may still have registry rows without pack pointers

**What:** The global SSOT contained 86k assets, but the refresh runner initially only selected the 84k registry rows that already had `pointers.history_pack`. The 1,927 missing-pack assets were real SSOT/registry assets, not necessarily absent symbols, but they had no pack pointer and therefore could not be fetched by the normal pack update path.

**Why:** The backfill code assumed every refreshable registry row already had a history pack path. That is false for first-time pack creation and makes missing packs structurally unrecoverable.

**Fix:** `refresh_v7_history_from_eodhd.py` now synthesizes deterministic `history/<exchange>/<bucket>/backfill_missing_<hash>.ndjson.gz` pack paths when a registry row has no pack pointer. A successful fetch creates the pack file, and the history touch apply step writes the real pointer/hash back into the registry.

**Prevention:** Backfill allowlists must be generated from the SSOT scope, not only from the existing pack manifest. Missing-pack assets must be first-class refresh targets until the manifest count matches the SSOT count or the provider returns a documented no-data reason.

---

### 2026-04-24 · Data Provider · 100k EODHD API calls consumed overnight without closing the seal-critical gaps

**What:** Both NAS and Mac ran targeted refresh overnight. 100,000 out of 100,000 EODHD API calls were consumed. The final-integrity-seal still failed: all core modules (market_data_refresh, hist_probs, snapshot, etc.) remained at 2026-04-17 instead of the expected 2026-04-23.

**Why — four compounding causes:**

1. **Scope >> budget**: The Mac autopilot used `--stock-top-n 90000 --etf-top-n 30000` = 120,000 targets. With a 100k daily call budget and 1 EODHD call per asset, the last ~20k assets in the queue never got processed. The queue was not sorted by asset criticality, so SPY and other regime-drivers could be in positions 50k+.

2. **No budget-awareness in the runner**: `run_parallel_targeted_v7_refresh.py` and `refresh_v7_history_from_eodhd.py` have no concept of the remaining API budget. They run until done or until the limit is externally exhausted. There is no early-exit or scope-reduction when the budget is low.

3. **Seal target date advanced daily**: By April 24 morning, `final-integrity-seal.mjs` expected `target_market_date = 2026-04-23`. Even if targeted_refresh had fully completed with April 22 data overnight (which it did not), the seal would still fail because it now expects the next session's date. A 1-day lag in data creates a perpetual fail state unless the pipeline runs the same day as the trading session.

4. **Two parallel refresh runs competing**: Mac targeted_refresh (4 workers) and NAS hist_probs (4 workers) ran concurrently. Both potentially hit the same EODHD API key. Even if the NAS hist_probs computes from local bars (no EODHD), earlier NAS pipeline steps (q1_delta_ingest) may have used EODHD calls. Parallel consumers drain a shared budget faster without coordination.

**Fix (partial — preflight already applied):** `refresh_v7_history_from_eodhd.py` now preflights EODHD before fan-out and exits immediately as `provider_blocked` if auth/billing fails. This prevents hours of empty retries, but does not address budget-awareness or scope prioritization.

**Fix (needed — tonight's run):** Run targeted_refresh with the minimal pre-computed stale allowlist (4,106 Stage-A assets) instead of the full 120k universe. Estimated cost: ~4,000–8,000 EODHD calls (1–2 calls per asset, date-range fetch). This is well within the 100k daily budget. Process US assets first (SPY, then top market-cap stocks) before EU/Asia.

**Prevention:**
- Before any overnight refresh run, calculate: `targeted_assets × calls_per_asset ≤ daily_budget`. Hard-fail early if math doesn't work.
- Sort the allowlist by pipeline criticality: regime-driver assets (SPY, QQQ, etc.) first, then US top-N by market cap, then EU, then Asia.
- Never run two parallel processes that share an EODHD API key simultaneously.
- Add a `--max-api-calls` guard to the refresh runners so they exit cleanly at budget exhaustion instead of hard-stopping mid-run.

---

### 2026-04-24 · Data Provider · Mac pack history was not ahead of NAS — verify sync assumptions before transfer

**What:** Comparison of directory modification timestamps suggested Mac had April-22 pack files that NAS was missing (Mac US/s: Apr 22, NAS US/s: Apr 7). An rsync with `--ignore-existing` for all non-US exchanges transferred 0 files — NAS already had every pack file Mac had.

**Why:** The `ls -la` directory mtime reflects the last time a FILE IN THAT DIRECTORY was created or deleted, not the newest data inside subdirectories. NAS had the same pack files via a different ingest path (the NAS overnight run had also generated pack files from its own refresh). The `rglob`-based comparison over SSH timed out and incorrectly showed all NAS exchanges as "missing".

**Fix:** The US rsync did add 57MB of Mac-unique US pack files to NAS. The non-US exchanges already matched.

**Prevention:** Before assuming one host is "ahead" of another on pack data, verify with `rsync --dry-run --ignore-existing --stats` — the `Number of files transferred` line is authoritative. Never trust directory modification dates alone for pack store comparison.

---

### 2026-04-24 · NAS · `runtime_preflight` produced a false red on Synology because the FD floor was hardcoded to `8192`

**What:** `release-full` stopped in `runtime_preflight` even after wrangler started correctly, `/api/diag` became healthy, and the local runtime owner matched the repo process tree.

**Why:** `scripts/ops/runtime-preflight.mjs` enforced a fixed `MIN_FD_LIMIT = 8192`. On the Synology NAS, the non-root shell stayed at `4096` even after `ulimit -n 8192`, so the preflight stayed red for host-policy reasons, not because the runtime was actually broken.

**Fix:** `runtime-preflight.mjs` now accepts a configurable minimum FD floor (`RV_RUNTIME_PREFLIGHT_MIN_FD_LIMIT` / `--min-fd-limit`). The NAS supervisor sets that floor to `4096`, while the default stays `8192` for other environments.

**Prevention:** Runtime-preflight thresholds must be host-profiled. Do not encode a laptop/macOS descriptor ceiling as a universal production readiness gate when the target host has a lower but still working operating limit.

---

### 2026-04-24 · NAS · automated `release-full` must stay artifact-only on Synology and must not hard-block on live Wrangler proofs

**What:** The NAS `release-full` lane tried to run `runtime_preflight` and `ui_field_truth_report` before sealing the release, even though the stock-analyzer full audit already supports `artifact_only` mode and the SSOT says that mode is the automated default.

**Why:** The supervisor still wired the NAS lane like a live-runtime validation flow (`wrangler` + canaries), while `final-integrity-seal.mjs` also blocked on `runtime_preflight` and `ui_field_truth_report` unconditionally. On Synology this created a policy contradiction: the audit could be release-eligible from artifacts, but the seal still failed on local runtime proof that the NAS does not need for automated publish.

**Fix:** NAS `release-full` now runs `stock_analyzer_universe_audit` with `--live-sample-size 0` and skips the live-runtime-only steps in the lane. `final-integrity-seal.mjs` now treats `live_endpoint_mode = artifact_only` as sufficient for automated sealing and does not require `runtime_preflight` / `ui_field_truth_report` in that mode.

**Prevention:** When a step contract explicitly defines `artifact_only` as the automated mode, every downstream gate must honor that contract. Do not reintroduce live-runtime blockers later in the lane unless the lane is explicitly a live-canary or operator validation workflow.

---

### 2026-04-24 · Data Provider · `refresh_v7_history_from_eodhd.py` burned hours on empty retries when EODHD was already returning `402 Payment Required`

**What:** Both NAS and Mac targeted refresh runs stayed alive for hours, printed little useful progress, and produced `0 assets_fetched_with_data` for the processed slice while the history/store remained stale.

**Why:** The refresh runner only discovered the provider failure inside per-asset fetches. For mixed non-US scopes, `HTTP 402` from EODHD meant the run could never repair the stale Asia/EU/LatAm packs, but the process still walked the allowlist and looked like a slow network issue instead of a hard external blocker.

**Fix:** `scripts/quantlab/refresh_v7_history_from_eodhd.py` now performs an explicit EODHD auth preflight before the fetch fan-out whenever the allowlist contains non-US assets. If the provider returns `401/402/403/429`, the job exits immediately as `provider_blocked`, writes an empty `history_touch_report`, and records the blocker in the report/state JSON instead of spending hours on futile retries.

**Prevention:** Global or mixed-region refresh jobs must always preflight the upstream provider before fan-out. If a provider-side auth/billing/rate-limit block makes the requested geography impossible, fail fast and classify it as an external blocker instead of hiding it inside long-running worker noise.

---

### 2026-04-24 · NAS · release canaries timed out because `runtime_preflight` and `ui_field_truth_report` used laptop-scale timeouts

**What:** `runtime_preflight` and the downstream UI truth checks failed with `timeout_after_8000ms` / `timeout_after_12000ms` against `http://127.0.0.1:8788`, even though the NAS runtime was able to boot and return a healthy `/api/diag`.

**Why:** The release lane reused short local-dev timeouts. On the NAS, the first AAPL/SPY summary calls after a cold wrangler start were slower than the 8-12 second budget, so the pipeline treated cold-start latency as runtime failure.

**Fix:** The NAS supervisor now runs `runtime_preflight`, `stock_analyzer_universe_audit`, and `ui_field_truth_report` with a `30000 ms` timeout budget.

**Prevention:** Release-lane canaries must use the same timeout class as full-universe audit flows, not the lighter interactive defaults used on a warm laptop runtime.

---

### 2026-04-24 · NAS · `stock_analyzer_universe_audit` fell through to the 384 MB default heap and OOMed in `build-global-scope`

**What:** `release-full` aborted in `stock_analyzer_universe_audit` with a Node OOM before the audit even reached the contract checks. The failing subcommand was `node scripts/universe-v7/build-global-scope.mjs --asset-classes 'STOCK,ETF,INDEX'`.

**Why:** `rv-nas-night-supervisor.sh` had no dedicated heap class for `stock_analyzer_universe_audit`, so the step inherited the `384 MB` default. That is enough for tiny utility steps, but not for rebuilding global scope and then auditing the full universe.

**Fix:** The NAS supervisor now gives `stock_analyzer_universe_audit` a dedicated `1536 MB` heap profile and passes the same `--concurrency 12 --timeout-ms 30000` audit settings already used in the validated recovery path.

**Prevention:** Any release step that rebuilds global scope or walks the full stock-analyzer universe must never fall through to the generic light profile. Give every full-universe step an explicit heap and timeout policy.

---

### 2026-04-24 · NAS · `v1_audit` needs the same 1536 MB class as other full-universe report builders

**What:** The resumed NAS data-plane reached `v1_audit`, then crashed with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.

**Why:** The supervisor still grouped `v1_audit` with light/medium reporting steps at `512 MB`, even though the QuantLab V1 daily audit is a full-universe report builder like `snapshot` and `learning_daily`.

**Fix:** `v1_audit` and its immediate downstream `cutover_readiness` now live in the `1536 MB` heap class on NAS.

**Prevention:** Report builders that aggregate across the full live universe must share the same memory policy as the other full-universe synthesis steps. If they emit global coverage, they are not “small reports”.

---

### 2026-04-24 · NAS · reproducing supervisor failures from a naked `ssh neonas` shell gives misleading results

**What:** Manual NAS checks initially suggested unrelated failures because `node` was missing from PATH in the plain non-interactive SSH shell.

**Why:** The real supervisor environment sources `scripts/nas/nas-env.sh` and `scripts/nas/node-env.sh`. A naked `ssh neonas 'node ...'` shell does not reproduce that environment, so diagnostics diverge from the actual pipeline step.

**Fix:** All manual NAS reproductions must run from repo root with `source ./scripts/nas/nas-env.sh` and `source ./scripts/nas/node-env.sh` before invoking Node-based pipeline steps.

**Prevention:** When debugging NAS automation, reproduce the supervisor environment first, then run the step command. Never trust failures from a shell that has not loaded the same env bootstrap as the supervisor.

---

### 2026-04-24 · Data Provider · EODHD ownership must be NAS-only, locked, and incremental

**What:** The April 23 catch-up was blocked because Mac launchd/autopilot jobs and NAS supervisors could consume the same EODHD key in parallel. One Mac job used a full global per-symbol refresh, another targeted job requested `--stock-top-n 90000 --etf-top-n 30000`, and NAS recovery paths could also start market refresh work. The 100k daily EODHD budget was exhausted while the NAS packs still had no April 23 bars.

**Why:** There was no single EODHD owner, no global quota lock across runners, no hard budget guard before fan-out, and the per-symbol full-universe strategy was mathematically mis-sized for a daily refresh. A global universe of about 84k-86k assets leaves almost no margin against a 100k daily budget, and 120k targeted scope can never fit. Jobs that only write at the end can also lose already-paid API work if a supervisor timeout or manual kill lands before persistence.

**Fix:** The NAS market refresh is now the only intended EODHD path. It uses a shared EODHD file lock, budget limits, stop-signal handling, bounded fan-out, incremental pack flushes, and progress/report JSON. Daily full-universe EOD now uses EODHD's bulk last-day endpoint per exchange instead of per-symbol calls; the provider charges the entire exchange request as a fixed bulk call, so the April 23 catch-up can update tens of thousands of assets without burning one call per asset. The dangerous targeted defaults were reduced to `5000` stocks and `1500` ETFs, with an oversized-scope guard unless `RV_ALLOW_OVERSIZED_EODHD_SCOPE=1` is explicitly set.

**Prevention:**
- Mac launchd/autopilot jobs must not fetch EODHD data; durable daily automation belongs on the NAS runner.
- Every EODHD consumer must use the same global lock and must check budget before and during the run.
- Full-universe daily EOD refresh must prefer exchange bulk-by-date where the provider supports it; per-symbol global refresh is a recovery-only path.
- Any refresh that consumes provider budget must persist successful rows incrementally and write progress state before long downstream work.
- Large targeted scopes must prove `selected_assets * expected_calls <= available_budget` before they start.

---

### 2026-04-24 · Data Provider · Optional fundamentals must not drain quota during a market-data catch-up

**What:** During the April 23 NAS catch-up, `build_fundamentals` started after the seal-critical market refresh and Q1 delta had completed. EODHD/FMP returned no usable fundamentals for the prioritized scope, so the step was spending provider calls on an optional enrichment path while the data-plane still needed to advance.

**Why:** Fundamentals freshness is warning-only by release policy, but the supervisor treated it like a normal provider fetch step. In a quota incident, optional enrichment must not compete with seal-critical market-history, hist-probs, forecast, and snapshot work.

**Fix:** `scripts/build-fundamentals.mjs` now supports `--metadata-only` / `RV_FUNDAMENTALS_METADATA_ONLY=1`, which refreshes `_scope.json` and `_index.json` without external provider calls. The NAS supervisor can run `build_fundamentals` in this mode when provider budget or rate limits are already degraded.

**Prevention:** During EODHD quota recovery, run optional provider enrichment in metadata-only mode until the seal-critical modules are green. If fundamentals provider fetches are re-enabled, they must sit behind the shared EODHD lock and a budget guard.

---

### 2026-04-23 · NAS · `forecast_daily` OOM with 512 MB heap in Lane A

**What:** Lane A advanced past `q1_delta_ingest`, `build_fundamentals`, `quantlab_daily_report`, and `scientific_summary`, then failed in `forecast_daily` after about 15 seconds with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.

**Why:** `rv-nas-night-supervisor.sh` treated `forecast_daily` like a generic medium Node step and injected `NODE_OPTIONS=--max-old-space-size=512`. That cap was lower than the already documented probe/runtime requirement for the forecast runner. The NAS open-probe command for `forecast_daily` already used `1536 MB`, and the compute audit had sample evidence around `~642 MB` RSS.

**Fix:** Give `forecast_daily` its own heap policy in the NAS supervisor: default `1536 MB`, overrideable via `RV_FORECAST_DAILY_HEAP_MB`.

**Prevention:** Do not reuse generic medium-step heap caps for data-heavy Node runners just because they share the same admission guard tier. Heap policy must follow measured runner behavior, and probe/runtime configs for the same step must not silently diverge.

---

### 2026-04-23 · NAS · `forecast_daily` can fail on internal RSS budget before Node heap is exhausted

**What:** After raising the Node heap for `forecast_daily`, the same step still failed in Lane A after about 13 minutes with `rss_budget_exceeded:generate_after_history:1376MB>1024MB`.

**Why:** `scripts/forecast/run_daily.mjs` enforces its own `FORECAST_RSS_BUDGET_MB` guard and defaults to `1024`, independent of `NODE_OPTIONS=--max-old-space-size=...`. The NAS supervisor raised heap but did not raise the forecast runner's own RSS budget or timeout.

**Fix:** The NAS supervisor now starts `forecast_daily` with `FORECAST_RSS_BUDGET_MB=4096` by default and gives the step a dedicated timeout default of `21600` seconds, matching the longer overnight forecast policy already used elsewhere.

**Prevention:** For memory-guarded runners, tune all active guard layers together: Node heap, in-process RSS budget, and step timeout. Fixing only one layer gives a partial recovery and repeats the failure under a different guard.

---

### 2026-04-23 · NAS · full-universe `hist_probs` needs a dedicated high-memory profile

**What:** After `forecast_daily` succeeded, Lane A failed in `hist_probs` after about 8 minutes. The result showed `peak_rss_mb ~4543`, and stderr reported `Worker terminated due to reaching memory limit: JS heap out of memory`.

**Why:** The NAS supervisor still launched full-universe `hist_probs` with the small profile (`NODE_OPTIONS=--max-old-space-size=1536`). In `run-hist-probs-turbo.mjs`, worker-thread `resourceLimits.maxOldGenerationSizeMb` is derived from that same Node old-space limit, so the worker died long before the machine-level RAM guard was the problem.

**Fix:** The NAS supervisor now gives full-lane `hist_probs` a dedicated high-memory profile: default heap `6144 MB`, default hist-probs RSS budget `7168 MB`, and a reduced steady-state floor of `4096 MB` only after repeated stable nights.

**Prevention:** Do not reuse sample/open-probe hist-probs memory settings for the full global universe. For worker-thread jobs, the parent `NODE_OPTIONS` also sets the worker hard limit, so the launch heap must match the largest observed full-run batch.

---

### 2026-04-08 · Supervisor · `phaseStalled()` Rückgabewert verworfen

**Was:** Der QuantLab Catchup Supervisor loggete korrekt `[STALLED→RECOVER] Storage cleared`, schrieb aber den neuen State nie in die State-Datei. Folge: Jeder 5-Minuten-Tick las weiter `STALLED` aus der alten Datei und loggete erneut `RECOVER` — ein stiller Endlos-Loop über 4,5 Stunden (12:30–17:00 Uhr).

**Warum:** In der `switch`-Anweisung war `phaseStalled(state)` aufgerufen, aber der Rückgabewert nicht `next` zugewiesen:
```js
// Bug:
case 'STALLED':
  phaseStalled(state);
  return; // "never reached" — war aber tatsächlich der Code-Pfad

// Fix:
case 'STALLED':
  next = phaseStalled(state);
  break;
```

**Prävention:** Bei jeder State-Machine mit `switch/case`: alle `case`-Zweige müssen `next =` zuweisen. Nie `return` mitten in einem `switch` nutzen, das den State-Write-Pfad umgeht. Code-Review-Regel: `phaseX()` muss immer `next = phaseX()` sein.

---

### 2026-04-08 · Supervisor · `MAX_HOURS` zu kurz für Catchup-Runs

**Was:** Der `start_q1_operator_safe.sh` day-Modus hat `MAX_HOURS=3.5` hardcoded. Bei 24 Catchup-Dates (~20 min/Date = ~8h nötig) hat der Job sich nach 3,5h selbst beendet. Der Supervisor interpretierte den dead PID als Fehler, inkrementierte `restart_count`, und nach 3 Restarts trat STALLED ein. Das passierte 3× zwischen 17:05–19:42 Uhr.

**Warum:** `MAX_HOURS` wurde für normale Nachtläufe (2–4 Dates) dimensioniert, nicht für Catchup-Szenarien mit bis zu 25 Dates.

**Fix:** `MAX_HOURS` wird jetzt im Supervisor dynamisch berechnet:
```js
const maxHours = Math.min(12, Math.max(4, Math.ceil(asofDatesCount * 22 / 60) + 0.5));
// 24 Dates → 9.5h | 4 Dates → 4h | 1 Date → 4h
```

**Prävention:** Jeder Supervisor, der einen externen Job mit Timeout startet, muss den Timeout aus der erwarteten Arbeitslast ableiten — niemals hardcoden. Faustregel: `timeout = max(minimum, estimated_work * 1.3) + buffer`.

---

### 2026-04-08 · Supervisor · `--reset-to-phase` setzt `training_restart_count` nicht zurück

**Was:** `node run-quantlab-catchup-supervisor.mjs --reset-to-phase TRAINING_CATCHUP` hat `phase` auf `TRAINING_CATCHUP` gesetzt, aber `training_restart_count=3` beibehalten. Beim nächsten Zyklus wurde sofort wieder STALLED ausgelöst, weil `restart_count >= MAX_RESTARTS`.

**Warum:** Die `--reset-to-phase` Implementierung merged den neuen Phase-Wert in den vorhandenen State, ohne restart-bezogene Felder zu nullen.

**Fix (TODO):** `--reset-to-phase TRAINING_CATCHUP` muss `training_restart_count`, `training_pid`, `training_pid_start_time` und `stalled_reason` immer auf `null`/`0` zurücksetzen. Bis dahin: State-Datei direkt per Python patchen (wie heute gemacht).

**Prävention:** Alle Admin-CLI-Befehle die eine Phase explizit setzen, müssen alle phasen-assoziierten Felder atomisch mitsetzen.

---

### 2026-04-08 · Storage · APFS Local Snapshots halten gelöschte Dateien zurück

**Was:** Nach dem erfolgreichen Archivieren von 153 GB (24 q1step2bars Snapshots) auf die NAS zeigte `df` weiterhin nur 37 GB frei — weil macOS APFS automatisch lokale Time Machine Snapshots erstellt hatte, die die gelöschten Inodes noch referenzierten.

**Warum:** APFS Copy-on-Write: gelöschte Dateien werden nicht sofort freigegeben solange ein lokaler Snapshot sie referenziert. Time Machine erstellt standardmäßig stündliche APFS-Snapshots.

**Fix:** `tmutil listlocalsnapshotdates /` → `tmutil deletelocalsnapshots <date>` für alle Snapshots die zu den archivierten Dateien gehören. Danach sofort volle Speicherfreigabe.

**Prävention:** Nach jedem größeren Archiv-/Lösch-Vorgang (>10 GB): `tmutil listlocalsnapshotdates /` prüfen. Der Storage Governor sollte APFS-Snapshots als Teil des Freigabe-Flows berücksichtigen.

---

### 2026-04-08 · NAS · rsync schlägt fehl ohne `--rsync-path=/usr/bin/rsync`

**Was:** rsync-Transfers zur Synology NAS schlugen fehl mit "rsync: not found on remote", obwohl SSH-Auth funktionierte.

**Warum:** Synologys non-interaktive Shell (`/bin/sh`) hat `/usr/bin` nicht im PATH. rsync auf der NAS liegt unter `/usr/bin/rsync`, nicht im Standard-PATH.

**Fix:** Alle rsync-Calls zur NAS brauchen `--rsync-path=/usr/bin/rsync`.

**Prävention:** Immer in allen rsync-Calls zur Synology NAS: `--rsync-path=/usr/bin/rsync`. Ist jetzt in `run-storage-governor.mjs` fest verankert.

---

### 2026-04-08 · NAS · SSH von Node.js subprocess scheitert ohne explizite Identity-File

**Was:** `rsync -e ssh neonas:...` funktionierte im Terminal (SSH Agent aktiv), aber scheiterte als Node.js `spawnSync`-Subprozess.

**Warum:** Non-interaktive Node.js Subprozesse erben keinen SSH Agent (`SSH_AUTH_SOCK`). `~/.ssh/config` wird von OpenSSH gelesen, aber der Agent-Socket fehlt.

**Fix:** `ssh -G neonas` liest die effektive Config-Konfiguration aus (inkl. `IdentityFile`). Das Identity-File wird dann explizit übergeben: `rsync -e "ssh -i /path/to/key -p 2222 -o BatchMode=yes"`.

**Prävention:** Jeder SSH-basierte Subprozess aus Node.js muss explizite `-i key -p port` Flags setzen. Nie auf SSH Agent in non-interaktiven Prozessen verlassen.

---

### 2026-04-08 · Notifications · `osascript display notification` öffnet Script Editor beim Klick

**Was:** macOS Notifications aus `osascript display notification` waren mit Script Editor als aufrufende App verknüpft. Klick auf Notification öffnete leeres Script Editor Fenster.

**Warum:** Bekanntes macOS-Verhalten: `osascript` läuft im Kontext von Script Editor, nicht der aufrufenden App.

**Fix:** `terminal-notifier` installieren (`brew install terminal-notifier`). Mit `-group` Parameter verhindert man zusätzlich Notification-Stapel.

**Prävention:** Nie `osascript display notification` für Produktions-Notifications verwenden. Immer `terminal-notifier` mit `osascript`-Fallback.

---

### 2026-04-08 · Storage · `featureStore.version` hardcoded statt dynamisch

**Was:** Im Daily Report war `featureStore.version: 'v4_q1panel_fullchunk_daily'` als String-Literal hardcoded, obwohl der tatsächliche Store-Name aus dem Manifest gelesen werden könnte.

**Warum:** Schnelle Implementierung ohne Rückkoppelung ans Manifest.

**Fix:** `String(fullchunkManifest?.feature_store_version || 'v4_q1panel_fullchunk_daily')` — dynamisch, mit Fallback.

**Prävention:** Kein interner Konfigurationswert darf als String-Literal hardcoded sein, wenn er aus einem Manifest/SSOT gelesen werden kann.

---

---

### 2026-04-08 · Supervisor · Python venv Pfad falsch: `QUANT_ROOT/.venv` statt `REPO_ROOT/quantlab/.venv`

**Was:** Training startete und crashte sofort mit `FATAL: python not executable: /Users/.../QuantLabHot/rubikvault-quantlab/.venv/bin/python`. Das venv existiert dort nicht.

**Warum:** `const PYTHON = path.join(QUANT_ROOT, '.venv/bin/python')` — der Supervisor suchte das venv relativ zu `QUANT_ROOT` (QuantLabHot). Das Python-venv liegt aber in `REPO_ROOT/quantlab/.venv/`.

**Fix:** `const PYTHON = path.join(REPO_ROOT, 'quantlab/.venv/bin/python')` — relativ zum Repo-Root.

**Prävention:** Python-venv Pfade immer aus `REPO_ROOT` ableiten, nie aus `QUANT_ROOT`. Beim Erstellen neuer Supervisor-Skripte: `python --version` aus dem geplanten Pfad testen bevor der Skript deployed wird.

---

### 2026-04-09 · Feature Store · `build_feature_store_q1_panel.py` ignoriert `delta_*.parquet` Bars — Feature Store nie über 2026-03-11 hinaus

**Was:** Das Feature Store Build (`v4_q1panel_overnight`) lief durch, produzierte aber immer `panel_max_asof_date=2026-03-11` — egal wie frisch der Snapshot. Training schlug deshalb still fehl: es gab keine Features für asof_dates nach März 2026. Dashboard V7 blieb seit Wochen rot.

**Warum:** `build_feature_store_q1_panel.py` scannte nur `rglob("part_*.parquet")`. Tägliche Auto-Snapshots ab ca. 2026-03-12 speichern neue Bars aber als `delta_*.parquet` (inkrementelles Format). `part_*.parquet` existiert nur bis zum letzten Full-Snapshot (2026-03-11). Alle neueren Bar-Daten wurden schlicht ignoriert.

**Fix:**
```python
# Alle drei rglob("part_*.parquet")-Stellen in _build_bars_pack_file_index,
# inline scan-fallback, und _list_bars_files_for_classes:
all_bar_files = sorted(
    list(bars_root.rglob("part_*.parquet")) + list(bars_root.rglob("delta_*.parquet"))
)
for fp in all_bar_files:
    name = fp.name
    if name.startswith("part_"):
        pack_key = name[len("part_"):-len(".parquet")]
    elif name.startswith("delta_"):
        pack_key = name[len("delta_"):-len(".parquet")]
```
Zusätzlich: Stale `v7_bars_pack_file_index.*.json` Cache löschen.

**Prävention:** Jeder Script der Bar-Dateien per Glob sucht muss explizit für BEIDE Formate (`part_*` und `delta_*`) ausgelegt sein. Bei jedem neuen Snapshot-Format: zuerst `ls bars/ingest_date=<neuestem>/asset_class=stock/` prüfen welches Dateinamenmuster genutzt wird.

---

### 2026-04-09 · Supervisor · `terminal-notifier` hängt ohne SIGKILL — Supervisor blockiert 4+ Stunden

**Was:** Ein Supervisor-Prozess (PID 64137) blockierte 4+ Minuten auf `terminal-notifier`, obwohl `spawnSync` mit `timeout: 5000` aufgerufen wurde.

**Warum:** `spawnSync` mit `timeout` sendet bei Ablauf standardmäßig SIGTERM. `terminal-notifier` ignoriert SIGTERM auf macOS (wartet auf Notification-Center Callback). Der spawnSync-Aufruf blockierte dadurch zeitlich unbegrenzt.

**Fix:** `killSignal: 'SIGKILL'` und `stdio: 'ignore'` zum spawnSync-Aufruf hinzugefügt:
```js
spawnSync(tnPath, [...args], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
```

**Prävention:** Alle `spawnSync`-Aufrufe auf externe Notification-Tools (terminal-notifier, osascript) müssen `killSignal: 'SIGKILL'` und `stdio: 'ignore'` setzen.

---

### 2026-04-22 · NAS · Synology BusyBox unterstützt `ps -axo` nicht

**Was:** Der NAS-Q1-Konfliktguard erkannte laufende Q1-Writer nicht zuverlässig. Dadurch konnten open-probe/native-matrix Jobs parallel zum Q1-Rescue laufen und CPU/RAM/Swap belasten.

**Warum:** `nas-env.sh` nutzte `ps -axo`, aber Synology BusyBox unterstützt diese Option nicht. Der Fehler wurde geschluckt und die Prozessliste war leer.

**Fix:** Q1-Writer-Erkennung liest jetzt `/proc/[pid]/cmdline`; `ps -o args` ist nur noch Fallback. Verifiziert auf NAS: während `materialize_history_touch_delta_q1.py` läuft, meldet `nas_detect_q1_writer_conflict` korrekt `process_conflict`.

**Prävention:** NAS-Prozesschecks dürfen nicht auf macOS-/GNU-`ps` Flags basieren. Für Synology zuerst `/proc` verwenden, dann portable `ps -o args`.

---

### 2026-04-22 · NAS · Provider-Keys in `.env.local` sind ohne explizites Sourcing unsichtbar

**Was:** Der EODHD-Key lag auf der NAS in `$NAS_DEV_ROOT/.env.local`, war aber nicht in der Shell-Umgebung. Preflight und `refresh_v7_history_from_eodhd.py` hätten deshalb ohne Fix trotz vorhandener Secret-Datei keinen Provider-Key gesehen.

**Warum:** `preflight-env.sh` prüfte nur `${EODHD_API_KEY}` / `${EODHD_API_TOKEN}`. `refresh_v7_history_from_eodhd.py` hatte als Default einen Mac-Desktop-Pfad (`/Users/.../Desktop/EODHD.env`).

**Fix:** `nas-env.sh` lädt `$NAS_DEV_ROOT/.env.local`, exportiert `EODHD_API_KEY` / `EODHD_API_TOKEN`, ignoriert Placeholder/Leerwerte und loggt keine Secrets. `refresh_v7_history_from_eodhd.py` nutzt repo-lokales `.env.local` als Default; der NAS-Supervisor übergibt das Env-File explizit.

**Prävention:** Provider-Preflights müssen zwischen `missing_env_file`, `missing_provider_key` und `placeholder_provider_key` unterscheiden. Secrets nie in Logs schreiben.

---

### 2026-04-22 · NAS · rsync zur Synology braucht explizites Remote-Rsync

**Was:** SSH funktionierte, aber rsync brach mit `Permission denied, please try again` im Remote-Server-Modus ab.

**Warum:** Die Synology non-interaktive Umgebung startete nicht zuverlässig die richtige rsync-Binary. `rsync --version` auf der NAS zeigte `/usr/bin/rsync`.

**Fix:** Alle Mac→NAS rsync-Deploys verwenden `--rsync-path=/usr/bin/rsync`.

**Prävention:** Das ist Pflicht in allen Synology-rsync-Runbooks und Automationen.

---

### 2026-04-22 · NAS · `set -e` darf negative Lock-Checks nicht abbrechen

**Was:** `safe-code-sync.sh` endete auf der NAS mit Exit 1 ohne sinnvolle Ausgabe, obwohl keine Locks aktiv waren.

**Warum:** `nas_assert_global_lock_clear` rief `nas_lock_is_active` unter `set -e` auf. Ein sauber fehlender Lock gibt Returncode 1 zurück; `set -e` brach das Skript ab, bevor der Code den Zustand behandeln konnte.

**Fix:** Der Lock-Check deaktiviert `set -e` lokal um `nas_lock_is_active`, speichert den Returncode und behandelt `0` als Konflikt, `1` als frei, `2` als stale.

**Prävention:** Alle Guard-Funktionen, die negative Zustände als normale Information verwenden, müssen Returncodes unter `set -e` explizit abfangen.

---

### 2026-04-22 · Universe · Global Scope ist neuer Scope, US/EU bleibt Compatibility-Scope

**Was:** Für das Tagesziel `US + EU + ASIA`, `STOCK + ETF` reicht es nicht, die alte `stocks_etfs.us_eu.*` Allowlist zu überschreiben.

**Warum:** Viele Legacy-Pfade referenzieren `stocks_etfs.us_eu.*`. Ein stilles Überschreiben würde Rückwärtskompatibilität brechen und Statusvergleiche verfälschen.

**Fix:** Neuer Scope `assets.global.*` plus `pack-manifest.global.*`. `stocks_etfs.us_eu.*` bleibt unverändert als Compatibility-Scope. Verifiziert: global `86,180` Assets mit `19,376` Asia; Compatibility-Scope `42,218` IDs mit `0` Asia.

**Prävention:** Neue Universes immer als neue Scope-Artefakte einführen. Alte Scope-Namen nur ändern, wenn alle Konsumenten migriert sind.

---

### 2026-04-24 · Universe · History-Packs frisch reicht nicht, Registry muss nachgezogen werden

**Was:** `market_data_refresh` hatte die History-Packs für `2026-04-23` erfolgreich aktualisiert, aber `registry.ndjson.gz` und `registry.snapshot.json.gz` enthielten weiter alte `last_trade_date`-Werte wie `2026-04-10`. Dadurch klassifizierte das Decision Bundle zehntausende eigentlich aktualisierte Assets als `bars_stale`.

**Warum:** Der Refresh schreibt die Packdaten und `history_touch_report.json`, aktualisiert aber nicht automatisch die Registry-Metadaten, die Decision Bundle, Scope-Builder und UI-Audit als Feldwahrheit lesen.

**Fix:** Nach `market_data_refresh` läuft jetzt `scripts/ops/apply-history-touch-report-to-registry.mjs`. Der Schritt übernimmt belegte `last_date_after`- und `pack_sha256`-Werte aus `mirrors/universe-v7/reports/history_touch_report.json` in Registry und Snapshot und baut danach das globale Pack-Manifest neu.

**Prävention:** Jede Pipeline, die History-Packs ändert, muss im selben Lauf die Registry aus dem Touch-Report synchronisieren. Sonst ist die Datenebene frisch, aber die Control-/Decision-Ebene bleibt stale.

---

### 2026-04-24 · NAS · Final-Seal baut Decision Bundle und braucht keinen 384-MB-Heap

**Was:** Der `final_integrity_seal`-Step scheiterte mit `FATAL ERROR: Ineffective mark-compacts near heap limit`, obwohl auf der NAS mehr als 8 GB RAM frei waren.

**Warum:** Der Step war als `light` profiliert und bekam nur 384 MB Node-Heap, führt aber `build-full-universe-decisions.mjs` über mehr als 42k Assets aus.

**Fix:** `final_integrity_seal` nutzt im NAS-Supervisor wie Snapshot/Audit 1536 MB Heap.

**Prävention:** Schritte, die Full-Universe-Artefakte bauen oder validieren, dürfen nicht in das Default-384-MB-Profil fallen. Heap-Profile an Arbeitsmenge koppeln, nicht an Step-Namen wie "seal".

---

### 2026-04-24 · NAS · NAS-Supervisor muss den Legacy-Heartbeat weiter bedienen

**Was:** Nach erfolgreichem NAS-Release-Pfad blieb der Final Seal `DEGRADED`, weil `mirrors/ops/pipeline-master/supervisor-heartbeat.json` noch auf `2026-04-22` stand.

**Warum:** Der alte `pipeline-master` wurde bewusst deaktiviert, aber `final-integrity-seal.mjs` liest aus Kompatibilitätsgründen weiter dessen Heartbeat-Pfad.

**Fix:** `rv-nas-night-supervisor.sh` schreibt bei jedem Statusupdate einen kompatiblen `rv.supervisor_heartbeat.v1`-Heartbeat mit aktuellem NAS-Step, Zielmarkttag und `last_seen`.

**Prävention:** Beim Ablösen eines Orchestrators müssen alle Liveness-Konsumenten entweder migriert oder mit kompatiblen Artefakten versorgt werden. Sonst sieht die Datenebene grün aus, aber der Control-Plane-Seal degradiert.

---

### 2026-04-24 · NAS · Grüner Final Seal muss Release-State neu projizieren

**Was:** `final-integrity-seal-latest.json` war `OK`, aber `release-gate-check.mjs` blockte weiter mit `observer_stale`, weil `release-state-latest.json` noch vom alten Pipeline-Master stammte.

**Warum:** Der NAS-Supervisor ersetzte den Pipeline-Master, schrieb aber noch keine `rv_release_state_v3`-Projektion aus dem aktuellen Final Seal.

**Fix:** Neuer Schritt `scripts/ops/sync-release-state-from-final-seal.mjs`; der NAS-Supervisor führt ihn direkt nach `final-integrity-seal.mjs` aus. `release-state-latest.json` wird dadurch bei grünem Seal auf `RELEASE_READY` mit aktuellem Zielmarkttag gesetzt.

**Prävention:** Jeder grüne Final Seal muss im selben Orchestrator-Lauf die Release-State-Projektion aktualisieren, bevor `release-gate-check.mjs` läuft.

---

### 2026-04-24 · Dashboard · Systemstatus und Banner müssen den grünen Final Seal respektieren

**Was:** `final-integrity-seal-latest.json`, `release-state-latest.json`, `system-status-latest.json` und `dashboard-v7-status.json` waren für `2026-04-23` grün, aber `/dashboard_v7` zeigte oben weiter `CRITICAL: Data 19d stale`.

**Warum:** Der NAS `release-full`-Lane baute `system_status_report` vor `data_freshness_report` und vor dem aktuellen Final Seal. Dadurch las der Systemstatus veraltete runtime/UI-truth/control-plane Artefakte. Zusätzlich priorisierte der Dashboard-Banner einen generischen `worstStale`-Fallback über den grünen Final Seal.

**Fix:** Die Release-Lane baut `data_freshness_report` vor `system_status_report` und projiziert den Systemstatus nach dem Final Seal erneut. `build-system-status-report.mjs` behandelt durch einen grünen Final Seal für denselben Zieltag superseded runtime/UI/control-plane Observer als Advisory statt als Blocker. `dashboard_v7.html` lässt einen grünen Final Seal (`ui_green`, `release_ready`, `global_green`) den alten `worstStale`-Fallback überstimmen.

**Prävention:** Dashboard-Grün darf nicht aus alten Modell-Stale-Zählern berechnet werden, wenn die aktuelle Seal-Kette grün ist. Die Reihenfolge muss sein: Data-Freshness → Systemstatus → Epoch → Final Seal → Systemstatus-Projektion → Dashboard-Meta.

---

### 2026-04-24 · NAS · Wrangler braucht non-interactive Cloudflare-Token

**Was:** Der Release-Gate-Schritt erreichte den echten `wrangler pages deploy`, scheiterte aber in der non-interactive NAS-Umgebung mit fehlendem `CLOUDFLARE_API_TOKEN`.

**Warum:** Auf der NAS war kein Cloudflare/Wrangler-Token in `.env.local` oder der Shell-Umgebung vorhanden. Die alten Mac-/Wrangler-State-Verzeichnisse ersetzen diesen Token nicht.

**Fix:** `nas-env.sh` lädt künftig `CLOUDFLARE_API_TOKEN` oder `CF_API_TOKEN` aus `$NAS_DEV_ROOT/.env.local`, ohne Werte zu loggen.

**Prävention:** NAS-Deploys benötigen einen expliziten Cloudflare API Token als Secret in der NAS-Env. Ohne Token darf der Deploy nicht als grün markiert werden.

---

### 2026-04-24 · Universe · Stock-Analyzer-Green-Rate darf Zero-Bar-Ghosts nicht als Nenner nutzen

**Was:** Die Stock-Analyzer-Operability-Quote konnte optisch wie ~0,8% wirken, weil Registry-Ghost-Einträge ohne Kursdaten im Nenner landeten. Diese Einträge haben `registry_bars_count` 0 oder keinen Wert und können strukturell nie `All systems operational` werden.

**Warum:** `targetable_assets` wurde aus dem operability state nicht streng genug aus der Registry-Historie abgeleitet. Pack-/actual-Fallbacks und strukturelle Ausnahmefamilien konnten den Nenner verwischen.

**Fix:** `scripts/ops/build-stock-analyzer-operability.mjs` berechnet den Release-Nenner jetzt explizit als Assets mit `registry_bars_count >= 200`. Zero-/unknown-bars und `<200` Bars bleiben als strukturelle bzw. Warm-up-Ausnahmen sichtbar, zählen aber nicht gegen die 90%-Green-Policy. Dashboard-NAS-Telemetrie zeigt die targetable rate und die ausgeschlossenen Zero-/Warm-up-Zähler separat.

**Prävention:** Universe-Coverage-Reports müssen immer zwei Zahlen trennen: `total_registry_assets` als Beobachtung und `targetable_assets` als Release-Nenner. Eine UI-/Seal-Quote darf nie Ghost-/Warm-up-Assets ohne ausreichende Bars als operability failure zählen.

---

### 2026-04-24 · Deploy · Static Deploys brauchen harte Einzeldatei-Size-Gates

**Was:** `wrangler pages deploy` schlug mit `Pages only supports files up to 25 MiB` fehl. Drei Pipeline-Artefakte überschritten das Limit: `stock-analyzer-operability-latest.json` (~60 MB), `pack-manifest.global.json` (~40 MB), `marketphase_deep_summary.json` (~35 MB).

**Warum:** Interne Pipeline-, Audit- und Analyse-Artefakte lagen im Public-/Deploy-Pfad. `public/data/` war dadurch ein gemischter Ablageort fuer Runtime-Daten und Build-State, obwohl diese Dateien keine Runtime-CDN-Artefakte sind.

**Fix:** Vier Schichten:
1. **Output-Pfad-Trennung**: `RV_GLOBAL_MANIFEST_DIR` und `RV_MARKETPHASE_DEEP_SUMMARY_PATH` in `nas-env.sh` lenken grosse globale Manifeste und Deep-Summaries direkt in `NAS_OPS_ROOT/pipeline-artifacts/`.
2. **Summary-only Public Output**: Der Supervisor uebergibt `--summary-only` an `build-stock-analyzer-operability.mjs`, sodass nur die kleine Dashboard-Summary in `public/` aktualisiert wird.
3. **Deploy-Bundle-Excludes**: Bekannte grosse interne Pfade bleiben als Sicherheitsnetz in `RSYNC_EXCLUDES`.
4. **Harter Size-Guard**: `build-deploy-bundle.mjs` scannt nach dem Rsync alle Dateien im Bundle; jede Datei >25 MiB bricht mit Exit 3 und expliziter Fehlerliste ab, bevor Wrangler laeuft.

**Prävention:** `public/data/` ist ein kontrollierter Runtime-Vertrag und darf keine Full-Dumps enthalten. Jeder neue grosse Generator muss vorab Artefaktklasse, Output-Ziel und Public-Runtime-Vertrag definieren. Interne Pipeline-Artefakte gehoeren in `NAS_OPS_ROOT/pipeline-artifacts/`; `RSYNC_EXCLUDES` und der 25-MiB-Guard sind zusaetzliche Schutzschichten, nicht die Primaerloesung.

---

### 2026-04-24 · NAS · NAS-/Server-Deploys duerfen nicht von globalem npx abhaengen

**Was:** Der Release-Deploy konnte auf Server-/NAS-Umgebungen scheitern, weil `npx` fehlen oder in der non-interaktiven Deploy-Shell nicht im `PATH` liegen kann.

**Warum:** Das Deploy-Script nutzte einen globalen Tool-Aufruf statt das projektlokale Binary. Node und das lokal installierte Wrangler-Binary koennen vorhanden sein, waehrend der globale `npx`-Shim nicht erreichbar ist.

**Fix:** `release-gate-check.mjs` verwendet fuer `wrangler pages deploy` ausschliesslich `node_modules/.bin/wrangler` aus dem Repository. Wenn das lokale Binary fehlt, bricht der Deploy vor dem Hosting-Aufruf mit einer klaren Fehlermeldung ab.

**Prävention:** Deployment-Tools im Projektkontext aufloesen. Keine impliziten globalen CLI-Abhaengigkeiten fuer Release-Pfade einfuehren; neue Tool-Aufrufe muessen aus `node_modules/.bin/` oder einem explizit versionierten lokalen Pfad kommen.

## Verwandte Dokumente

- [decisions.md](decisions.md) — Architektur-Entscheidungen (Was und Warum)
- [nas-migration-journal.md](nas-migration-journal.md) — NAS-spezifische Incidents und Fortschritt
- [nas-runbook.md](nas-runbook.md) — NAS-Betrieb und Troubleshooting
- [contract.md](contract.md) — Systeminvarianten die nie verletzt werden dürfen
- [deploy-bundle-policy.md](deploy-bundle-policy.md) — Was in public/ liegt und was nicht; Enforcement-Schichten
