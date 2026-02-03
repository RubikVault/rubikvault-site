# RubikVault Audit Consolidation (3-File SSOT)

## 1) What we ingested (existing artifacts)
Most-recent artifacts chosen by mtime (tie → lexicographic) from the existing audit output set:

- ui_golden_path_md: docs/audit/01-golden-path-ui.md (mtime=2026-02-03T12:48:17)
- ui_golden_path_json: docs/audit/01-golden-path-ui.json (mtime=2026-02-03T12:48:17)
- ui_surface_json: docs/audit/01.5-ui-surface.json (mtime=2026-02-03T12:48:17)
- ui_surface_md: docs/audit/01.5-ui-surface.md (mtime=2026-02-03T12:48:17)
- artifact_registry: docs/audit/02-artifact-registry-run02.json (mtime=2026-02-03T12:52:21)
- ops_golden_path: docs/audit/03-ops-golden-path-run02.md (mtime=2026-02-03T12:52:50)
- ops_mismatch: docs/audit/03-ops-mismatch-run02.json (mtime=2026-02-03T12:53:20)
- ssot_violations: docs/audit/04-ssot-violations.json (mtime=2026-02-03T12:53:43)
- cleanup_candidates: docs/audit/05-cleanup-candidates.json (mtime=2026-02-03T12:54:00)
- dependency_impact: docs/audit/05.5-dependency-impact.json (mtime=2026-02-03T12:54:15)
- report_validity: docs/audit/07-report-validity.json (mtime=2026-02-03T12:54:38)
- prior_summary: docs/audit/ZZ-summary.md (mtime=2026-02-03T12:55:38)
- runtime_ui: evidence/06-ui-runtime-baseline.json (mtime=2026-02-03T12:51:32)
- runtime_ops: evidence/06-ops-runtime-baseline.json (mtime=2026-02-03T12:51:32)

## 2) PROVEN: UI Golden Path (what UI actually uses)
- **UI entry + price fetch**: `/analyze/<T>` triggers `/api/stock?ticker=<T>`.
  - Evidence: `public/index.html:1448-1467`.
- **UI uses price fields**: UI renders `data.latest_bar` (`close`, `volume`, `date`).
  - Evidence: `public/index.html:931-934`.

## 3) PROVEN: API handler(s) and true data source(s)
- **Handler** for `/api/stock`: `functions/api/stock.js` builds `data.latest_bar` from EOD bars.
  - Evidence: `functions/api/stock.js:855-865`.
- **Underlying reads** inside `/api/stock`: references snapshot modules (`market-prices`, `market-stats`, `market-score`) and universe record lookup.
  - Evidence: `functions/api/stock.js:762-786`.

## 4) PROVEN: OPS Golden Path (what OPS reads)
- **OPS entry** fetches `/api/mission-control/summary`.
  - Evidence: `public/ops/index.html:1082-1097`.
- **OPS summary reads pipeline artifacts** under `/data/pipeline/*`.
  - Evidence: `functions/api/mission-control/summary.js:1201-1215`.
- **OPS summary reads market-prices snapshot** (`/data/snapshots/market-prices/latest.json`).
  - Evidence: `functions/api/mission-control/summary.js:1327-1333`.

## 5) THE MISMATCH (single sentence + evidence)
**Primary root cause: A_WRONG_INPUT_PATH** — OPS uses the market-prices **mini** snapshot as a truth signal while UI prices are rendered from `/api/stock` → `data.latest_bar`.
- Evidence (UI SSOT): `public/index.html:1448-1467`, `public/index.html:931-934`, `functions/api/stock.js:855-865`.
- Evidence (OPS path): `functions/api/mission-control/summary.js:1327-1345`.
- Evidence (mini snapshot): `public/data/snapshots/market-prices/latest.json:35-38`.

## 6) Exact answer: “Which paths are correct in UI vs wrongly tracked in OPS?”
| Category | Path | Evidence |
|---|---|---|
| UI correct path | `/api/stock?ticker=<T>` → `functions/api/stock.js` → `data.latest_bar` | `public/index.html:1448-1467`, `public/index.html:931-934`, `functions/api/stock.js:855-865` |
| OPS tracked path | `/api/mission-control/summary` → reads `/data/snapshots/market-prices/latest.json` | `public/ops/index.html:1082-1097`, `functions/api/mission-control/summary.js:1327-1333` |
| Divergence point | OPS price truth uses market-prices snapshot (mini) instead of `/api/stock` contract | `functions/api/mission-control/summary.js:1327-1345`, `public/data/snapshots/market-prices/latest.json:35-38` |

## 7) Cleanup candidates (ONLY if proven safe)
**NONE** — No RED candidates proven with runtime telemetry + dependency impact (see `docs/audit/05-cleanup-candidates.json`).

## 8) Runtime proof status
Runtime probes **ran** against preview base: `https://d86f7e35.rubikvault-site.pages.dev`.
- `/api/stock?ticker=UBER` returned HTTP 200 and JSON envelope keys (data/meta/ok/etc). Evidence: `evidence/C_EVIDENCE.tar.gz:runtime_api_stock_UBER.txt` and `...:runtime_api_stock_UBER_jq.txt`.
- `/api/mission-control/summary?debug=1` returned HTTP 200 with `meta.status=error` and `meta.reason=CONTRACT_FAIL`. Evidence: `evidence/C_EVIDENCE.tar.gz:runtime_ops_summary.txt` and `...:runtime_ops_summary_jq.txt`.
- `/ops/` and `/` reachable (HTTP 200). Evidence: `evidence/C_EVIDENCE.tar.gz:runtime_ops_html_headers.txt`, `...:runtime_ui_root_headers.txt`.

## 9) Remaining GAPS (what is not yet proven)
- **Runtime path verification of `data.latest_bar` presence** was not explicitly asserted in runtime probes (only envelope keys + meta status). To close: `curl -sS "https://d86f7e35.rubikvault-site.pages.dev/api/stock?ticker=UBER" | jq -e '.data.latest_bar.date and .data.latest_bar.close and .data.latest_bar.volume'`.
- **UI-path trace alignment** to the current preview origin is not re-validated in this consolidation (uses previous artifacts). To close: probe `/debug/ui-path/UBER.ui-path.trace.json` from the same base and verify `network.winning.path` is relative.
