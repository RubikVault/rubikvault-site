# Decisions

## 2026-01-04: Envelope meta never null
Context: Some endpoints returned `meta: null`, violating the Envelope Contract.
Decision: Enforce non-null `meta` on all `/api/*` responses.
Consequences: Responses must always include required meta fields.

## 2026-01-04: KV truthiness is bindingPresent + opsWorking
Context: Debug token gating caused `hasKV=false` even when KV binding existed.
Decision: Separate `bindingPresent` from `opsWorking`; debug token never flips binding presence.
Consequences: Debug bundle truthfully reports infra even when redacted.

## 2026-01-04: Smoke curl(56) fix policy
Context: Smoke script streamed bodies and triggered `curl: (56)`.
Decision: Use `-o /dev/null` for header checks and sample only small body bytes.
Consequences: Deterministic smoke runs and clearer failures.

## 2026-01-04: Sentiment header forced to single JSON content-type
Context: `/api/sentiment-barometer` returned duplicate content-type values.
Decision: Use `headers.set("Content-Type", "application/json; charset=utf-8")` for JSON responses.
Consequences: Only one JSON content-type line in responses.

## 2026-01-04: Logo alias policy for /assets/logo.png
Context: `/assets/logo.png` sometimes served HTML fallback.
Decision: Ensure `public/assets/logo.png` exists as a real PNG alias.
Consequences: Stable image content-type for the logo path.

## 2026-01-04: Preview vs Prod drift is expected
Context: Preview environments often lack bindings or secrets.
Decision: Treat drift as normal; diagnose explicitly (do not misreport as upstream failure).
Consequences: Clearer ops outputs and fewer false alarms.

## 2026-01-04: Git-native workflow
Context: One-person team with AI coding and human review.
Decision: Keep work in repo; avoid base64 transports; user pushes.
Consequences: Predictable diffs and reviewable commits.

## 2026-01-04: Deterministic numbering by renderer order
Context: Feature numbering has drifted when hardcoded.
Decision: Numbering must derive from renderer order, not hardcoded titles.
Consequences: Stable ordering and fewer UI mismatches.
