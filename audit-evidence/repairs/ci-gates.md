=== DIAGNOSIS: ci-gates ===

## Workflow File
.github/workflows/ci-gates.yml

## Script Paths
        run: node scripts/ci/verify-artifacts.mjs
        run: node scripts/ci/assert-mission-control-gate.mjs
        run: node scripts/ci/check-elliott-parity.mjs
        run: bash scripts/ci/forbid-kv-writes-in-api.sh
        run: node scripts/eod/check-eod-artifacts.mjs
        run: bash scripts/ops/validate-truth.sh
✅ EXISTS: scripts/ci/verify-artifacts.mjs
✅ EXISTS: scripts/ci/assert-mission-control-gate.mjs
✅ EXISTS: scripts/ci/check-elliott-parity.mjs
✅ EXISTS: scripts/ci/forbid-kv-writes-in-api.sh
✅ EXISTS: scripts/eod/check-eod-artifacts.mjs
✅ EXISTS: scripts/ops/validate-truth.sh

## Node Version
          node-version: "20"
          node-version: "20"

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
Repository Policy Checks	Check Forbidden Patterns	2026-02-08T22:29:50.0472992Z [36;1m  echo "Status:     ❌ FAIL"[0m
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7455851Z ✅ Drops above absolute threshold (5) should fail
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7458947Z ✅ computeValidationMetadata fails when threshold exceeded
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7459954Z ✅ computeValidationMetadata fails when other validation fails
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7464566Z ✅ Invalid inputs throw errors
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.7470584Z ❌ Failed: 0
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8981358Z ✅ Network error → retry succeeds
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8985247Z ✅ Retry limit reached → ok=false with error
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.8997151Z ✅ Network error exhausts retries → ok=false
JSON Schema Validation	Run unit tests	2026-02-08T22:29:57.9011163Z ❌ Failed: 0
JSON Schema Validation	Run contract tests	2026-02-08T22:29:58.9836629Z > npm run validate:symbols && npm run test:envelope && npm run test:scheduler && node scripts/contract-smoke.js && npm run test:truth-chain && npm run test:missing-mirror && node tests/build-info-artifact.test.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.3497919Z ✅ errorEnvelope
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6192737Z WARN: health latest snapshot check skipped (missing public/data/snapshots/health/latest.json)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6197519Z WARN: tech-signals contract check skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.6198667Z WARN: SNAPSHOT>=MIRROR tech-signals guard skipped (missing mirror or snapshot artifact)
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9724881Z > test:missing-mirror
JSON Schema Validation	Run contract tests	2026-02-08T22:29:59.9725302Z > node scripts/ops/verify-missing-mirror-semantic.mjs
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0025183Z WARN: semantic equivalence check skipped (generated artifacts missing): /home/runner/work/rubikvault-site/rubikvault-site/public/data/marketphase/missing.json, /home/runner/work/rubikvault-site/rubikvault-site/public/data/pipeline/missing.json
JSON Schema Validation	Run contract tests	2026-02-08T22:30:00.0365686Z SKIP: build-info artifact missing in generated-only checkout
JSON Schema Validation	Validate Against JSON Schemas	2026-02-08T22:30:00.6900273Z ##[error]Process completed with exit code 1.
