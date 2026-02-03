# OPS Findings + Fix Plan (LIVE_URL: https://638a1962.rubikvault-site.pages.dev)

## Live Evidence Excerpts (captured via curl)
### 1) /api/mission-control/summary?debug=1 (excerpt)
```
HTTP/2 200
content-type: application/json; charset=utf-8
...
{"schema_version":"3.0","meta":{"asOf":"2026-02-03T15:23:48.783Z","baselineAsOf":"2026-02-01T12:02:23.525Z","liveAsOf":"2026-02-03T15:23:48.783Z","status":"ok","reason":"CONTRACT_OK",...},
"metadata":{"served_from":"RUNTIME",...},
"data":{
  "health":{
    "prices":{"status":"OK","reason":"CONTRACT_OK","checked_path":"data.latest_bar","required_fields":["date","close","volume"],"per_ticker":{"UBER":{...}}},
    "freshness":{"status":"INFO","reason":"NOT_EXPECTED","age_hours":257.8,"asOf":"2026-01-23T21:36:09.857Z"},
    "pipeline":{"status":"INFO","reason":"NOT_EXPECTED","counts":{"expected":100,"fetched":100,"validated":100,"computed":2,"static_ready":2}}
  },
  "runtime":{"env":"preview","schedulerExpected":false,"pipelineExpected":false,"hostname":"638a1962.rubikvault-site.pages.dev","pricesStaticRequired":false},
  "truthChains":{"prices":{...},"indicators":{...}},
  "pipeline":{"counts":{"expected":100,"fetched":100,"validated":100,"computed":2,"static_ready":2}}
}}
```

### 2) /ops/ (HTML excerpt)
```
HTTP/2 200
content-type: text/html; charset=utf-8
...
<title>Ops — RubikVault</title>
```

### 3) /data/build-info.json (excerpt)
```
HTTP/2 200
content-type: application/json
{
  "git_sha": "af4f14d40886fc1c6aa2668ccc11c51697575871",
  "build_time_utc": "2026-02-01T16:26:52.966Z",
  "env": {
    "node": "v25.2.1",
    "ci": false,
    "github_actions": false,
    "cf_pages": false,
    "cf_pages_commit_sha": null,
    "github_sha": null,
    "branch": "main"
  }
}
```

---

## WRONG fields (per SSOT) — none proven
No field was proven **WRONG** under an explicit SSOT that applies to current OPS payloads. All evaluated SSOT-backed fields either match their defined path/semantics or fall under **P0 SSOT gaps** (below). Any perceived “wrongness” must be resolved by formal SSOT definition first.

---

## P0 Blockers (SSOT missing or conflicting)
### P0-1: Envelope meta.status semantics conflict
- **Symptom (live):** `meta.status = "ok"` in summary response (see Live Evidence Excerpt #1).
- **SSOT conflict:** `docs/ops/contract.md:34-51` specifies `meta.status` must be `LIVE|STALE|ERROR|EMPTY`. Implementation uses lower-case `ok/error/degraded` (see `functions/api/mission-control/summary.js:1540-1545`).
- **Root cause:** contract doc outdated or not applicable to Ops summary envelope.
- **Minimal fix location:** either update `docs/ops/contract.md` to match summary envelope or change summary to emit legacy tokens. (Instruction only; no code changes in this audit.)
- **Regression check:** `curl .../api/mission-control/summary | jq -r '.meta.status'` must match chosen SSOT.

### P0-2: OpsBaseline & budgets/provider fields lack SSOT definitions
- **Symptom (live):** fields like `data.opsBaseline.*`, `data.opsComputed.*`, and `data.budgets.*` exist and are rendered, but no canonical schema/semantics doc describes them.
- **Evidence:** summary payload includes these fields (`functions/api/mission-control/summary.js:1367-1431,1641-1674`), UI renders them (`public/ops/index.html:632-683,705-729,760-783`).
- **Root cause:** missing SSOT documentation for these field groups (only partial mentions in `docs/ops/contract.md:66-70`).
- **Minimal fix location:** add explicit SSOT doc entries (e.g., `docs/ops/ops-shapes.ssot.md`) for opsBaseline/budgets/providers with required types/units.
- **Regression check:** verifiers/tests can assert presence + type of these fields if SSOT is defined.

### P0-3: Build-info env flags semantics undefined
- **Symptom (live):** `build-info.json.env.cf_pages=false` in a Pages deployment (see Live Evidence Excerpt #3), but no SSOT defines required meaning for env flags.
- **Evidence:** build-info generation script (`scripts/ops/build-build-info.mjs:7-38`) and UI uses `/data/build-info.json` (`public/ops/index.html:868-883`).
- **Root cause:** SSOT not defined for build-info env flags.
- **Minimal fix location:** document expected values and sources; adjust build-info generator if needed.
- **Regression check:** CI validation script can assert expected flags when defined.

---

## Special: RUNTIME_MODE semantics (resolved)
- **Implementation proof:** `functions/api/mission-control/summary.js:744-763` sets preview mode based on hostname endswith `.pages.dev` and sets `runtime.env` via `pickProfile`.
- **Live proof:** `data.runtime.env = "preview"` and hostname is `638a1962.rubikvault-site.pages.dev` (Live Evidence Excerpt #1).
- **Conclusion:** runtime mode uses **deployment/hostname semantics**, not capability-only. Therefore, `PREVIEW` on this Pages preview URL is **CORRECT**.

---

## Minimal Fix Plan (instruction-only, no changes applied)
1) **Resolve meta.status SSOT conflict**: pick one authoritative schema (either update `docs/ops/contract.md` to `ok/degraded/error` or change summary to `LIVE/STALE/ERROR/EMPTY`).
2) **Define SSOT for opsBaseline/budgets/providers/build-info** in `docs/ops/ops-shapes.ssot.md` (field types + units + required/optional).
3) **Add a verifier** that checks only SSOT-defined fields to avoid false negatives.

---

## Evidence References (line-precise)
- OPS summary assembly (payload fields): `functions/api/mission-control/summary.js:1591-1678`
- Runtime env semantics: `functions/api/mission-control/summary.js:744-763,1618-1626`
- Prices health contract check: `functions/api/mission-control/summary.js:492-535,590-607`
- OPS UI uses summary fields: `public/ops/index.html:617-783`
- OPS UI fetches summary: `public/ops/index.html:1082-1125`
- OPS UI build-info fetch: `public/ops/index.html:868-883`
- SSOT (bars + truthChains): `docs/ops/ops-shapes.ssot.md:7-58`
- Legacy envelope contract: `docs/ops/contract.md:34-51`
