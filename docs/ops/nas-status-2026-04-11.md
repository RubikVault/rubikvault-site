# NAS Status 2026-04-11

## Snapshot

- Checked from Mac via SSH at `2026-04-11 13:55 CEST`.
- NAS reachable again on `192.168.188.21:2222`.
- RAM upgrade is present:
  - `Mem total: 9796 MB`
  - `Mem available: 8479 MB`
  - `Swap total: 7927 MB`
- Root filesystem is no longer full:
  - `/dev/md0 2.3G total / 1.5G used / 708M free / 69%`
  - inode usage on `/`: `31%`

## What Changed Today

- Compared Mac repo against NAS repo at `/volume1/homes/neoboy/Dev/rubikvault-site`.
- The runtime-relevant code differences were concentrated in:
  - `run-hist-probs-turbo.mjs`
  - `scripts/build-best-setups-v4.mjs`
  - `scripts/learning/run-daily-learning-cycle.mjs`
- The local learning runner was intentionally not copied to NAS because it currently hardcodes the Mac path:
  - `const ROOT = '/Users/michaelpuchowezki/Dev/rubikvault-site';`

## Files Copied From Mac To NAS

- Backups created on NAS with stamp `20260411T135630`:
  - `run-hist-probs-turbo.mjs.bak.20260411T135630`
  - `scripts/build-best-setups-v4.mjs.bak.20260411T135630`
- Copied from Mac to NAS:
  - `run-hist-probs-turbo.mjs`
  - `scripts/build-best-setups-v4.mjs`
  - `scripts/lib/hist-probs/error-ledger.mjs`
  - `scripts/lib/hist-probs/checkpoint-store.mjs`
  - `scripts/lib/hist-probs/state-snapshot.mjs`
  - `scripts/lib/io/gzip-ndjson.mjs`

## Manual Re-Tests

### `best_setups_v4`

- Result: success
- Command:
  - `ALLOW_REMOTE_BAR_FETCH=0 BEST_SETUPS_DISABLE_NETWORK=1 NODE_OPTIONS="--max-old-space-size=1536" node scripts/build-best-setups-v4.mjs`
- Why it previously looked red:
  - NAS primary quantlab publish directories were empty:
    - `public/data/quantlab/stock-insights/stocks`
    - `public/data/quantlab/stock-insights/etfs`
  - NAS fallback shard directory was populated:
    - `public/data/quantlab/reports/shards/assets` with `13972` shard files
- What fixed it:
  - The current Mac version adds a fallback from the empty primary directories to `public/data/quantlab/reports/shards/assets`.
- Evidence:
  - `public/data/reports/best-setups-build-latest.json`
  - `public/data/snapshots/best-setups-v4.json`
- Build result:
  - `ok: true`
  - `rows_emitted_total: 8`
  - `fallback_used_by_class.stocks: true`
  - `fallback_used_by_class.etfs: true`
  - `duration_ms: 99707`

### `hist_probs` full-scope turbo rerun

- Result: in progress at time of documentation
- Command:
  - `HIST_PROBS_WORKERS=1 HIST_PROBS_SKIP_EXISTING=0 NODE_OPTIONS="--max-old-space-size=1536" node run-hist-probs-turbo.mjs`
- Why it previously looked red:
  - NAS probe history had repeated timeout/nonzero outcomes.
- What changed:
  - NAS now has more RAM.
  - The current Mac `run-hist-probs-turbo.mjs` and its helper modules were copied to NAS.
- First hard finding:
  - The first rerun failed immediately because NAS was missing these helper modules:
    - `scripts/lib/hist-probs/error-ledger.mjs`
    - `scripts/lib/hist-probs/checkpoint-store.mjs`
    - `scripts/lib/hist-probs/state-snapshot.mjs`
    - `scripts/lib/io/gzip-ndjson.mjs`
  - After copying them, the full-scope run started correctly.
- Live evidence during rerun:
  - process present on NAS: `node run-hist-probs-turbo.mjs`
  - sample observed progress:
    - `52410 required tickers`
    - `18516 excluded with <60 bars`
    - `77 inactive >20T`
    - `15000/52410 done` after the early runtime phase
- Current risk:
  - output is still extremely noisy because many tickers log `insufficient history (0 bars)`, which makes the NAS probe path harder to observe and may still hurt completion time.

## Still Clearly Blocked

- `q1_delta_ingest_smoke`
  - still blocked by Python dependency/runtime on NAS
  - prior evidence: `FATAL: pyarrow required: No module named 'pyarrow'`
- `quantlab_v4_daily_report`
  - still blocked by missing dependency/path on NAS
- `quantlab_boundary_audit`
  - still blocked by `missing_quantlab_path`
- `daily_learning_cycle`
  - current Mac runner is not NAS-portable because of the hardcoded Mac root path
- `runtime_control_probe`
  - unchanged today
- `ui_contract_probe`
  - unchanged today

## Net Effect

- The old blocker `root_fs_100_percent` is no longer true on actual NAS state.
- `best_setups_v4` is no longer a clean `NO`; there is now a real NAS success path when the current Mac fallback logic is present.
- `hist_probs` full-scope turbo is no longer failing at the old immediate code-gap boundary; it now runs on NAS with the updated code path, but still needs final completion evidence.
